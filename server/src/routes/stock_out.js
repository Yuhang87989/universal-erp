const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

const genOrderNo = async (tenantId) => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `CK${today}`;
  const [rows] = await pool.query(
    "SELECT order_no FROM stock_out_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].order_no.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

const typeMap = {
  sale: '销售出库', return_out: '退货出库', production_out: '生产领料',
  transfer_out: '调拨出库', adjust_out: '调整出库', scrap: '报损出库', other: '其他出库'
};

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, out_type, keyword, warehouse_id, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE soo.tenant_id = ?';
    const params = [req.tenantId];
    if (status) { where += ' AND soo.status = ?'; params.push(status); }
    if (out_type) { where += ' AND soo.out_type = ?'; params.push(out_type); }
    if (warehouse_id) { where += ' AND soo.warehouse_id = ?'; params.push(warehouse_id); }
    if (keyword) { where += ' AND (soo.order_no LIKE ? OR c.name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (startDate) { where += ' AND soo.created_at >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND soo.created_at <= ?'; params.push(endDate + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_out_orders soo LEFT JOIN customers c ON soo.customer_id = c.id ${where}`, params);
    const [orders] = await pool.query(
      `SELECT soo.*, w.name as warehouse_name, c.name as customer_name, u.real_name as operator_name, cf.real_name as confirmer_name
       FROM stock_out_orders soo
       LEFT JOIN warehouses w ON soo.warehouse_id = w.id
       LEFT JOIN customers c ON soo.customer_id = c.id
       LEFT JOIN users u ON soo.operator_id = u.id
       LEFT JOIN users cf ON soo.confirmer_id = cf.id
       ${where} ORDER BY soo.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    for (const o of orders) {
      const [items] = await pool.query(
        `SELECT soi.*, p.name as product_name, p.unit, p.barcode FROM stock_out_items soi
         JOIN products p ON soi.product_id = p.id WHERE soi.stock_out_id = ?`,
        [o.id]
      );
      o.items = items;
      o.item_count = items.length;
    }

    res.json({ code: 0, data: { list: orders, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    console.error('获取出库单列表失败:', err);
    res.status(500).json({ code: 500, message: '获取列表失败' });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const [[order]] = await pool.query(
      `SELECT soo.*, w.name as warehouse_name, c.name as customer_name, u.real_name as operator_name
       FROM stock_out_orders soo
       LEFT JOIN warehouses w ON soo.warehouse_id = w.id
       LEFT JOIN customers c ON soo.customer_id = c.id
       LEFT JOIN users u ON soo.operator_id = u.id
       WHERE soo.id = ? AND soo.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );
    if (!order) return res.status(404).json({ code: 404, message: '出库单不存在' });
    const [items] = await pool.query(
      `SELECT soi.*, p.name as product_name, p.unit, p.barcode FROM stock_out_items soi
       JOIN products p ON soi.product_id = p.id WHERE soi.stock_out_id = ?`,
      [order.id]
    );
    order.items = items;
    res.json({ code: 0, data: order });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取详情失败' });
  }
});

// 新建出库单（草稿）
router.post('/', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  try {
    const { warehouse_id, out_type, customer_id, items, remark } = req.body;
    if (!warehouse_id || !items?.length) return res.status(400).json({ code: 400, message: '请选择仓库并添加商品' });

    // 校验库存是否充足
    for (const item of items) {
      const [inv] = await pool.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?',
        [req.tenantId, item.product_id, warehouse_id]
      );
      const available = inv.length ? parseFloat(inv[0].quantity) : 0;
      if (available < parseFloat(item.quantity)) {
        const [prod] = await pool.query('SELECT name FROM products WHERE id = ?', [item.product_id]);
        return res.status(400).json({ code: 400, message: `商品「${prod[0]?.name || ''}」库存不足（可用${available}，需${item.quantity}）` });
      }
    }

    const orderNo = await genOrderNo(req.tenantId);
    let totalAmount = 0;
    for (const item of items) {
      const [inv] = await pool.query('SELECT avg_cost FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?', [req.tenantId, item.product_id, warehouse_id]);
      item._unit_cost = inv[0] ? parseFloat(inv[0].avg_cost || 0) : 0;
      totalAmount += (item.quantity || 0) * item._unit_cost;
    }

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.query(
        `INSERT INTO stock_out_orders (tenant_id, order_no, warehouse_id, out_type, customer_id, total_amount, status, operator_id, remark)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [req.tenantId, orderNo, warehouse_id, out_type || 'other', customer_id || null, totalAmount, req.user.id, remark || null]
      );
      for (const item of items) {
        await conn.query(
          'INSERT INTO stock_out_items (stock_out_id, product_id, quantity, unit_cost, remark) VALUES (?, ?, ?, ?, ?)',
          [result.insertId, item.product_id, item.quantity, item._unit_cost, item.remark || null]
        );
      }
      await conn.commit();
      res.json({ code: 0, message: '出库单创建成功', data: { id: result.insertId, order_no: orderNo } });
    } catch (e) {
      await conn.rollback(); throw e;
    } finally { conn.release(); }
  } catch (err) {
    console.error('创建出库单失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 确认出库（草稿→已确认，扣减库存+写流水）
router.post('/:id/confirm', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      'SELECT * FROM stock_out_orders WHERE id = ? AND tenant_id = ? AND status = "draft" FOR UPDATE',
      [req.params.id, req.tenantId]
    );
    if (!order) { await conn.rollback(); return res.status(400).json({ code: 400, message: '出库单不存在或已确认' }); }

    const [items] = await conn.query('SELECT * FROM stock_out_items WHERE stock_out_id = ?', [order.id]);

    for (const item of items) {
      const [inv] = await conn.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? FOR UPDATE',
        [req.tenantId, item.product_id, order.warehouse_id]
      );
      if (!inv.length || parseFloat(inv[0].quantity) < parseFloat(item.quantity)) {
        await conn.rollback();
        return res.status(400).json({ code: 400, message: `商品库存不足，无法出库` });
      }
      const beforeQty = parseFloat(inv[0].quantity);
      const avgCost = parseFloat(inv[0].avg_cost || 0);
      const outQty = parseFloat(item.quantity);
      const afterQty = beforeQty - outQty;
      await conn.query('UPDATE inventory SET quantity = ? WHERE id = ?', [afterQty, inv[0].id]);

      // 更新出库明细的实际成本
      await conn.query('UPDATE stock_out_items SET unit_cost = ? WHERE id = ?', [avgCost, item.id]);

      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stock_out', ?, ?, ?)`,
        [req.tenantId, item.product_id, order.warehouse_id, 'stock_out', -outQty, beforeQty, afterQty,
         avgCost, order.id, req.user.id, `${typeMap[order.out_type] || '出库'} - ${order.order_no}`]
      );
    }

    await conn.query(
      "UPDATE stock_out_orders SET status = 'confirmed', confirmer_id = ?, confirm_time = NOW() WHERE id = ?",
      [req.user.id, order.id]
    );
    await conn.commit();
    res.json({ code: 0, message: '出库确认成功，库存已扣减' });
  } catch (err) {
    await conn.rollback();
    console.error('确认出库失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 删除（仅草稿）
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      "SELECT * FROM stock_out_orders WHERE id = ? AND tenant_id = ? AND status = 'draft'",
      [req.params.id, req.tenantId]
    );
    if (!order) { await conn.rollback(); return res.status(400).json({ code: 400, message: '出库单不存在或无法删除' }); }
    await conn.query('DELETE FROM stock_out_items WHERE stock_out_id = ?', [order.id]);
    await conn.query('DELETE FROM stock_out_orders WHERE id = ?', [order.id]);
    await conn.commit();
    res.json({ code: 0, message: '出库单已删除' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

module.exports = router;
