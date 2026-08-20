const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取供应商列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (keyword) {
      where += ' AND (name LIKE ? OR contact_name LIKE ? OR phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM suppliers ${where}`, params);

    const [suppliers] = await pool.query(
      `SELECT * FROM suppliers ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 统计每个供应商的采购单数和总金额
    for (const s of suppliers) {
      const [stats] = await pool.query(
        `SELECT COUNT(*) as totalOrders, COALESCE(SUM(total_amount), 0) as totalAmount FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?`,
        [s.id, req.tenantId]
      );
      s.totalOrders = stats[0].totalOrders;
      s.totalAmount = stats[0].totalAmount;
    }

    res.json({
      code: 0,
      data: { list: suppliers, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取供应商列表失败' });
  }
});

// 获取供应商详情
router.get('/:id', async (req, res) => {
  try {
    const [suppliers] = await pool.query(
      'SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!suppliers.length) return res.status(404).json({ code: 404, message: '供应商不存在' });

    const supplier = suppliers[0];

    // 获取近期采购单
    const [orders] = await pool.query(
      `SELECT id, order_no, order_date, total_amount, status FROM purchase_orders
       WHERE supplier_id = ? AND tenant_id = ? ORDER BY order_date DESC LIMIT 10`,
      [req.params.id, req.tenantId]
    );
    supplier.recentOrders = orders;

    res.json({ code: 0, data: supplier });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取供应商详情失败' });
  }
});

// 新增供应商
router.post('/', async (req, res) => {
  try {
    const { name, contactName, phone, address, bankName, bankAccount, notes } = req.body;
    if (!name) throw new Error('供应商名称不能为空');

    const [result] = await pool.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, address, bank_name, bank_account, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, name, contactName || null, phone || null, address || null, bankName || null, bankAccount || null, notes || null]
    );
    res.json({ code: 0, message: '供应商添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新供应商
router.put('/:id', async (req, res) => {
  try {
    const { name, contactName, phone, address, bankName, bankAccount, notes } = req.body;
    await pool.query(
      `UPDATE suppliers SET name=?, contact_name=?, phone=?, address=?, bank_name=?, bank_account=?, remark=?
       WHERE id=? AND tenant_id=?`,
      [name, contactName, phone, address, bankName, bankAccount, notes, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '供应商更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除供应商
router.delete('/:id', async (req, res) => {
  try {
    // 检查是否有关联的采购单
    const [orders] = await pool.query(
      'SELECT COUNT(*) as cnt FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (orders[0].cnt > 0) {
      return res.status(400).json({ code: 400, message: '该供应商存在关联采购单，无法删除' });
    }
    await pool.query('DELETE FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '供应商已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

module.exports = router;
