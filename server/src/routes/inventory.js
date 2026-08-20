const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取库存列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, lowStock } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE i.tenant_id = ?';
    const params = [req.tenantId];

    if (keyword) {
      where += ' AND (p.name LIKE ? OR p.barcode LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (lowStock === 'true') {
      where += ' AND i.quantity <= p.min_stock AND p.min_stock > 0';
    }

    where += " AND p.status != 'deleted'";

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM inventory i JOIN products p ON i.product_id = p.id ${where}`, params
    );

    const [items] = await pool.query(
      `SELECT i.*, p.name as product_name, p.unit, p.barcode, p.sell_price, p.cost_price, p.min_stock, c.name as category_name
       FROM inventory i
       JOIN products p ON i.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       ${where}
       ORDER BY p.name ASC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      code: 0,
      data: {
        list: items,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取库存列表失败' });
  }
});

// 库存调整（手动盘点）
router.post('/adjust', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { productId, newQuantity, remark } = req.body;

    // 获取当前库存
    const [inv] = await conn.query(
      'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ?',
      [req.tenantId, productId]
    );

    if (!inv.length) {
      throw new Error('库存记录不存在');
    }

    const beforeQty = parseFloat(inv[0].quantity);
    const afterQty = parseFloat(newQuantity);
    const changeQty = afterQty - beforeQty;

    if (changeQty === 0) {
      throw new Error('库存数量未变化');
    }

    // 更新库存
    await conn.query(
      'UPDATE inventory SET quantity = ? WHERE tenant_id = ? AND product_id = ?',
      [afterQty, req.tenantId, productId]
    );

    // 记录流水
    await conn.query(
      `INSERT INTO inventory_logs (tenant_id, product_id, change_type, quantity, before_quantity, after_quantity, remark, operator_id)
       VALUES (?, ?, 'check', ?, ?, ?, ?, ?)`,
      [req.tenantId, productId, changeQty, beforeQty, afterQty, remark || '手动盘点', req.user.id]
    );

    await conn.commit();
    res.json({ code: 0, message: `库存已调整：${beforeQty} → ${afterQty}` });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 获取库存变动流水
router.get('/logs', async (req, res) => {
  try {
    const { productId, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE l.tenant_id = ?';
    const params = [req.tenantId];

    if (productId) {
      where += ' AND l.product_id = ?';
      params.push(productId);
    }

    const [logs] = await pool.query(
      `SELECT l.*, p.name as product_name, u.real_name as operator_name
       FROM inventory_logs l
       JOIN products p ON l.product_id = p.id
       LEFT JOIN users u ON l.operator_id = u.id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({ code: 0, data: logs });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取流水失败' });
  }
});

module.exports = router;
