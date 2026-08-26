const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 生成入库单号
const genOrderNo = async (tenantId) => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `RK${today}`;
  const [rows] = await pool.query(
    "SELECT order_no FROM stock_in_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].order_no.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// 入库类型映射
const typeMap = {
  purchase: '采购入库', return: '退货入库', production_in: '生产入库',
  transfer_in: '调拨入库', adjust_in: '调整入库', other: '其他入库'
};

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, in_type, keyword, warehouse_id, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE sio.tenant_id = ?';
    const params = [req.tenantId];
    if (status) { where += ' AND sio.status = ?'; params.push(status); }
    if (in_type) { where += ' AND sio.in_type = ?'; params.push(in_type); }
    if (warehouse_id) { where += ' AND sio.warehouse_id = ?'; params.push(warehouse_id); }
    if (keyword) { where += ' AND (sio.order_no LIKE ? OR sup.name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (startDate) { where += ' AND sio.created_at >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND sio.created_at <= ?'; params.push(endDate + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_in_orders sio LEFT JOIN suppliers sup ON sio.supplier_id = sup.id ${where}`, params);
    const [orders] = await pool.query(
      `SELECT sio.*, w.name as warehouse_name, sup.name as supplier_name, u.real_name as operator_name, c.real_name as confirmer_name
       FROM stock_in_orders sio
       LEFT JOIN warehouses w ON sio.warehouse_id = w.id
       LEFT JOIN suppliers sup ON sio.supplier_id = sup.id
       LEFT JOIN users u ON sio.operator_id = u.id
       LEFT JOIN users c ON sio.confirmer_id = c.id
       ${where} ORDER BY sio.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    for (const o of orders) {
      const [items] = await pool.query(
        `SELECT sii.*, p.name as product_name, p.unit, p.barcode FROM stock_in_items sii
         JOIN products p ON sii.product_id = p.id WHERE sii.stock_in_id = ?`,
        [o.id]
      );
      o.items = items;
      o.item_count = items.length;
    }

    res.json({ code: 0, data: { list: orders, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    console.error('获取入库单列表失败:', err);
    res.status(500).json({ code: 500, message: '获取列表失败' });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const [[order]] = await pool.query(
      `SELECT sio.*, w.name as warehouse_name, sup.name as supplier_name, u.real_name as operator_name, c.real_name as confirmer_name
       FROM stock_in_orders sio
       LEFT JOIN warehouses w ON sio.warehouse_id = w.id
       LEFT JOIN suppliers sup ON sio.supplier_id = sup.id
       LEFT JOIN users u ON sio.operator_id = u.id
       LEFT JOIN users c ON sio.confirmer_id = c.id
       WHERE sio.id = ? AND sio.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );
    if (!order) return res.status(404).json({ code: 404, message: '入库单不存在' });
    const [items] = await pool.query(
      `SELECT sii.*, p.name as product_name, p.unit, p.barcode, p.cost_price as current_cost
       FROM stock_in_items sii JOIN products p ON sii.product_id = p.id WHERE sii.stock_in_id = ?`,
      [order.id]
    );
    order.items = items;
    res.json({ code: 0, data: order });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取详情失败' });
  }
});

// 新建入库单（草稿）
router.post('/', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  try {
    const { warehouse_id, in_type, supplier_id, items, remark } = req.body;
    if (!warehouse_id || !items?.length) return res.status(400).json({ code: 400, message: '请选择仓库并添加商品' });

    const orderNo = await genOrderNo(req.tenantId);
    let totalAmount = 0;
    items.forEach(i => { totalAmount += (i.quantity || 0) * (i.unit_cost || 0); });

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.query(
        `INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, supplier_id, total_amount, status, operator_id, remark)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [req.tenantId, orderNo, warehouse_id, in_type || 'other', supplier_id || null, totalAmount, req.user.id, remark || null]
      );
      for (const item of items) {
        await conn.query(
          'INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost, remark) VALUES (?, ?, ?, ?, ?)',
          [result.insertId, item.product_id, item.quantity, item.unit_cost || 0, item.remark || null]
        );
      }
      await conn.commit();
      res.json({ code: 0, message: '入库单创建成功', data: { id: result.insertId, order_no: orderNo } });
    } catch (e) {
      await conn.rollback(); throw e;
    } finally { conn.release(); }
  } catch (err) {
    console.error('创建入库单失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 确认入库（草稿→已确认，增加库存+写流水+更新成本价）
router.post('/:id/confirm', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      'SELECT * FROM stock_in_orders WHERE id = ? AND tenant_id = ? AND status = "draft" FOR UPDATE',
      [req.params.id, req.tenantId]
    );
    if (!order) { await conn.rollback(); return res.status(400).json({ code: 400, message: '入库单不存在或已确认' }); }

    const [items] = await conn.query('SELECT * FROM stock_in_items WHERE stock_in_id = ?', [order.id]);

    for (const item of items) {
      // 查当前库存（带avg_cost）
      const [inv] = await conn.query(
        'SELECT id, quantity, avg_cost FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?',
        [req.tenantId, item.product_id, order.warehouse_id]
      );
      const beforeQty = inv.length ? parseFloat(inv[0].quantity) : 0;
      const beforeAvg = inv.length ? parseFloat(inv[0].avg_cost || 0) : 0;
      const inQty = parseFloat(item.quantity);
      const inCost = parseFloat(item.unit_cost || 0);
      const afterQty = beforeQty + inQty;
      // 加权平均成本
      const afterAvg = afterQty > 0 ? (beforeQty * beforeAvg + inQty * inCost) / afterQty : inCost;

      if (inv.length) {
        await conn.query('UPDATE inventory SET quantity = ?, avg_cost = ? WHERE id = ?', [afterQty, afterAvg.toFixed(4), inv[0].id]);
      } else {
        await conn.query(
          'INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?)',
          [req.tenantId, item.product_id, order.warehouse_id, afterQty, afterAvg.toFixed(4)]
        );
      }

      // 写流水
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'stock_in', ?, ?, ?)`,
        [req.tenantId, item.product_id, order.warehouse_id, 'stock_in', inQty, beforeQty, afterQty,
         inCost, order.id, req.user.id, `${typeMap[order.in_type] || '入库'} - ${order.order_no}`]
      );

      // 更新商品成本价
      if (item.unit_cost > 0) {
        await conn.query('UPDATE products SET cost_price = ? WHERE id = ? AND tenant_id = ?', [afterAvg.toFixed(4), item.product_id, req.tenantId]);
      }
    }

    await conn.query(
      "UPDATE stock_in_orders SET status = 'confirmed', confirmer_id = ?, confirm_time = NOW() WHERE id = ?",
      [req.user.id, order.id]
    );

    await conn.commit();
    res.json({ code: 0, message: '入库确认成功，库存已更新' });
  } catch (err) {
    await conn.rollback();
    console.error('确认入库失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 删除（仅草稿）
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      "SELECT * FROM stock_in_orders WHERE id = ? AND tenant_id = ? AND status = 'draft'",
      [req.params.id, req.tenantId]
    );
    if (!order) { await conn.rollback(); return res.status(400).json({ code: 400, message: '入库单不存在或无法删除' }); }
    await conn.query('DELETE FROM stock_in_items WHERE stock_in_id = ?', [order.id]);
    await conn.query('DELETE FROM stock_in_orders WHERE id = ?', [order.id]);
    await conn.commit();
    res.json({ code: 0, message: '入库单已删除' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

module.exports = router;
