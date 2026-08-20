const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 生成销售单号
const generateOrderNo = async (tenantId, type = 'S') => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `${type}${today}`;
  const [lastOrder] = await pool.query(
    "SELECT order_no FROM sales_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = lastOrder.length ? parseInt(lastOrder[0].order_no.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// 获取销售单列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, orderType, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE so.tenant_id = ?';
    const params = [req.tenantId];

    if (status) { where += ' AND so.status = ?'; params.push(status); }
    if (orderType) { where += ' AND so.order_type = ?'; params.push(orderType); }
    if (startDate) { where += ' AND so.order_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND so.order_date <= ?'; params.push(endDate); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM sales_orders so ${where}`, params);

    const [orders] = await pool.query(
      `SELECT so.*, c.name as customer_name, u.real_name as operator_name
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.id
       LEFT JOIN users u ON so.operator_id = u.id
       ${where}
       ORDER BY so.order_date DESC, so.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      code: 0,
      data: { list: orders, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取销售单列表失败' });
  }
});

// 创建销售单（POS收银/手动录入）
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { customerId, items, orderType = 'pos', paymentMethod = 'cash', discountAmount = 0, remark } = req.body;
    if (!items || !items.length) throw new Error('销售明细不能为空');

    const orderNo = await generateOrderNo(req.tenantId);
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * item.unitPrice; });
    const actualAmount = totalAmount - discountAmount;

    // 创建销售单
    const [orderResult] = await conn.query(
      `INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, remark, operator_id, order_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, NOW())`,
      [req.tenantId, orderNo, orderType, customerId || null, totalAmount, discountAmount, actualAmount, actualAmount, paymentMethod, remark || null, req.user.id]
    );

    // 添加明细 & 扣减库存
    for (const item of items) {
      await conn.query(
        'INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price, discount) VALUES (?, ?, ?, ?, ?)',
        [orderResult.insertId, item.productId, item.quantity, item.unitPrice, item.discount || 0]
      );

      // 扣减库存
      const [inv] = await conn.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ?',
        [req.tenantId, item.productId]
      );
      const beforeQty = inv.length ? parseFloat(inv[0].quantity) : 0;
      const afterQty = beforeQty - parseFloat(item.quantity);

      if (afterQty < 0) {
        throw new Error(`商品库存不足，无法销售`);
      }

      await conn.query(
        'UPDATE inventory SET quantity = ? WHERE tenant_id = ? AND product_id = ?',
        [afterQty, req.tenantId, item.productId]
      );

      // 记录库存流水
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, change_type, quantity, before_quantity, after_quantity, reference_type, reference_id, operator_id)
         VALUES (?, ?, 'sale', ?, ?, ?, 'sales_order', ?, ?)`,
        [req.tenantId, item.productId, -parseFloat(item.quantity), beforeQty, afterQty, orderResult.insertId, req.user.id]
      );
    }

    // 更新客户累计消费
    if (customerId) {
      await conn.query(
        'UPDATE customers SET total_spent = total_spent + ? WHERE id = ?',
        [actualAmount, customerId]
      );
    }

    await conn.commit();
    res.json({ code: 0, message: '销售单创建成功', data: { id: orderResult.insertId, orderNo, actualAmount } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
