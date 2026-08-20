const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取客户列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, level } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (keyword) {
      where += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (level) {
      where += ' AND level = ?';
      params.push(level);
    }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM customers ${where}`, params);

    const [customers] = await pool.query(
      `SELECT * FROM customers ${where} ORDER BY total_spent DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      code: 0,
      data: { list: customers, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取客户列表失败' });
  }
});

// 新增客户
router.post('/', async (req, res) => {
  try {
    const { name, phone, gender, level, birthday, address, remark } = req.body;
    if (!name) throw new Error('客户名称不能为空');

    const [result] = await pool.query(
      'INSERT INTO customers (tenant_id, name, phone, gender, level, birthday, address, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, name, phone || null, gender || 'unknown', level || 'normal', birthday || null, address || null, remark || null]
    );

    res.json({ code: 0, message: '客户添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新客户
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, gender, level, birthday, address, remark } = req.body;
    await pool.query(
      'UPDATE customers SET name=?, phone=?, gender=?, level=?, birthday=?, address=?, remark=? WHERE id=? AND tenant_id=?',
      [name, phone, gender, level, birthday, address, remark, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '客户更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

module.exports = router;
