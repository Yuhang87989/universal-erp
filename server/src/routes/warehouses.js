const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 仓库列表
router.get('/', async (req, res) => {
  try {
    const { keyword, status } = req.query;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];
    if (keyword) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    const [rows] = await pool.query(`SELECT * FROM warehouses ${where} ORDER BY is_default DESC, sort_order ASC, id ASC`, params);

    // 统计每个仓库的库存品种数和总价值
    for (const w of rows) {
      const [stats] = await pool.query(
        `SELECT COUNT(*) as sku_count, COALESCE(SUM(i.quantity * p.cost_price), 0) as total_value
         FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.tenant_id = ? AND i.warehouse_id = ?`,
        [req.tenantId, w.id]
      );
      w.sku_count = stats[0].sku_count;
      w.total_value = stats[0].total_value;
    }

    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('获取仓库列表失败:', err);
    res.status(500).json({ code: 500, message: '获取仓库列表失败' });
  }
});

// 新增仓库
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { code, name, address, manager, phone, is_default, remark } = req.body;
    if (!code || !name) return res.status(400).json({ code: 400, message: '仓库编码和名称不能为空' });

    await conn.beginTransaction();
    if (is_default) {
      await conn.query('UPDATE warehouses SET is_default = FALSE WHERE tenant_id = ?', [req.tenantId]);
    }
    const [result] = await conn.query(
      `INSERT INTO warehouses (tenant_id, code, name, address, manager, phone, is_default, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, code, name, address || null, manager || null, phone || null, is_default || false, remark || null]
    );
    await conn.commit();
    res.json({ code: 0, message: '仓库创建成功', data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ code: 400, message: '仓库编码已存在' });
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 修改仓库
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { code, name, address, manager, phone, is_default, status, remark } = req.body;
    await conn.beginTransaction();
    if (is_default) {
      await conn.query('UPDATE warehouses SET is_default = FALSE WHERE tenant_id = ? AND id != ?', [req.tenantId, req.params.id]);
    }
    await conn.query(
      `UPDATE warehouses SET code=?, name=?, address=?, manager=?, phone=?, is_default=?, status=?, remark=?
       WHERE id=? AND tenant_id=?`,
      [code, name, address || null, manager || null, phone || null, is_default || false, status || 'active', remark || null, req.params.id, req.tenantId]
    );
    await conn.commit();
    res.json({ code: 0, message: '仓库更新成功' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 删除仓库（需无库存）
router.delete('/:id', requireRole('owner'), async (req, res) => {
  try {
    const [inv] = await pool.query(
      'SELECT COUNT(*) as cnt FROM inventory WHERE tenant_id = ? AND warehouse_id = ? AND quantity > 0',
      [req.tenantId, req.params.id]
    );
    if (inv[0].cnt > 0) return res.status(400).json({ code: 400, message: '该仓库还有库存，无法删除' });
    await pool.query('DELETE FROM warehouses WHERE id = ? AND tenant_id = ? AND is_default = FALSE', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '仓库已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
