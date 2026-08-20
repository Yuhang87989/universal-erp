const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取采购单列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE po.tenant_id = ?';
    const params = [req.tenantId];

    if (status) { where += ' AND po.status = ?'; params.push(status); }
    if (startDate) { where += ' AND po.order_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND po.order_date <= ?'; params.push(endDate); }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM purchase_orders po ${where}`, params
    );

    const [orders] = await pool.query(
      `SELECT po.*, s.name as supplier_name, u.real_name as operator_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.operator_id = u.id
       ${where}
       ORDER BY po.order_date DESC, po.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      code: 0,
      data: {
        list: orders,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取采购单列表失败' });
  }
});

// 获取采购单详情
router.get('/:id', async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ? AND po.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );

    if (!orders.length) return res.status(404).json({ code: 404, message: '采购单不存在' });

    const [items] = await pool.query(
      `SELECT pi.*, p.name as product_name, p.unit
       FROM purchase_items pi
       JOIN products p ON pi.product_id = p.id
       WHERE pi.purchase_order_id = ?`,
      [req.params.id]
    );

    res.json({ code: 0, data: { ...orders[0], items } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取采购单详情失败' });
  }
});

// 生成采购单号
const generateOrderNo = async (tenantId) => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `PO${today}`;
  const [lastOrder] = await pool.query(
    "SELECT order_no FROM purchase_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = lastOrder.length ? parseInt(lastOrder[0].order_no.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// 创建采购单
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { supplierId, items, remark } = req.body;
    if (!items || !items.length) throw new Error('采购明细不能为空');

    const orderNo = await generateOrderNo(req.tenantId);
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * item.unitCost; });

    const [orderResult] = await conn.query(
      `INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, remark, operator_id, order_date)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, CURDATE())`,
      [req.tenantId, orderNo, supplierId || null, totalAmount, remark || null, req.user.id]
    );

    for (const item of items) {
      await conn.query(
        'INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [orderResult.insertId, item.productId, item.quantity, item.unitCost]
      );
    }

    await conn.commit();
    res.json({ code: 0, message: '采购单创建成功', data: { id: orderResult.insertId, orderNo } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 采购入库（确认收货）
router.post('/:id/receive', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orders] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!orders.length) throw new Error('采购单不存在');
    if (orders[0].status === 'received') throw new Error('该采购单已入库');

    const [items] = await conn.query(
      'SELECT * FROM purchase_items WHERE purchase_order_id = ?',
      [req.params.id]
    );

    for (const item of items) {
      // 更新库存
      const [inv] = await conn.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ?',
        [req.tenantId, item.product_id]
      );
      const beforeQty = inv.length ? parseFloat(inv[0].quantity) : 0;
      const afterQty = beforeQty + parseFloat(item.quantity);

      await conn.query(
        'INSERT INTO inventory (tenant_id, product_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = ?',
        [req.tenantId, item.product_id, afterQty, afterQty]
      );

      // 记录库存流水
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id)
         VALUES (?, ?, 'purchase', ?, ?, ?, ?, 'purchase_order', ?, ?)`,
        [req.tenantId, item.product_id, item.quantity, beforeQty, afterQty, item.unit_cost, req.params.id, req.user.id]
      );

      // 更新采购明细已收数量
      await conn.query(
        'UPDATE purchase_items SET received_quantity = quantity WHERE id = ?',
        [item.id]
      );
    }

    // 更新采购单状态
    await conn.query("UPDATE purchase_orders SET status = 'received' WHERE id = ?", [req.params.id]);

    await conn.commit();
    res.json({ code: 0, message: '入库成功' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
