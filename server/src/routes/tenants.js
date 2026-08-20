const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取租户信息
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tenants WHERE id = ? AND id = ?',
      [req.params.id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ code: 404, message: '租户不存在' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取租户信息失败' });
  }
});

// 更新租户信息
router.put('/:id', async (req, res) => {
  try {
    const { name, owner_name, phone, address, business_type } = req.body;
    await pool.query(
      `UPDATE tenants SET name=?, owner_name=?, phone=?, address=?, business_type=?
       WHERE id=? AND id=?`,
      [name, owner_name, phone, address, business_type, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '租户信息更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

module.exports = router;
