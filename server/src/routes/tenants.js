const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取当前用户可访问的租户列表
router.get('/', async (req, res) => {
  try {
    // 查询用户的可切换租户
    const [users] = await pool.query(
      'SELECT switchable_tenants FROM users WHERE id = ?',
      [req.user.id]
    );
    let tenantIds = [req.tenantId]; // 至少有当前租户
    if (users[0] && users[0].switchable_tenants) {
      const st = users[0].switchable_tenants;
      // MySQL JSON 字段可能是字符串或数组
      if (typeof st === 'string') {
        try { tenantIds = JSON.parse(st); } catch { tenantIds = [req.tenantId]; }
      } else if (Array.isArray(st)) {
        tenantIds = st;
      }
    }

    const [tenants] = await pool.query(
      'SELECT id, name, owner_name, phone, business_type, business_desc FROM tenants WHERE id IN (?)',
      [tenantIds]
    );
    res.json({ code: 0, data: tenants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '获取租户列表失败' });
  }
});

// 切换租户
router.post('/switch', async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ code: 400, message: '请选择要切换的帐套' });
    }

    // 验证用户是否有权切换到该租户
    const [users] = await pool.query(
      'SELECT switchable_tenants FROM users WHERE id = ?',
      [req.user.id]
    );
    let allowedIds = [req.tenantId];
    if (users[0] && users[0].switchable_tenants) {
      const st = users[0].switchable_tenants;
      if (typeof st === 'string') {
        try { allowedIds = JSON.parse(st); } catch { allowedIds = [req.tenantId]; }
      } else if (Array.isArray(st)) {
        allowedIds = st;
      }
    }

    if (!allowedIds.includes(tenantId)) {
      return res.status(403).json({ code: 403, message: '无权切换到该帐套' });
    }

    // 获取目标租户信息
    const [tenants] = await pool.query(
      'SELECT id, name, owner_name, business_type FROM tenants WHERE id = ?',
      [tenantId]
    );
    if (!tenants.length) {
      return res.status(404).json({ code: 404, message: '目标帐套不存在' });
    }

    // 更新用户的当前 tenant_id
    await pool.query('UPDATE users SET tenant_id = ? WHERE id = ?', [tenantId, req.user.id]);

    // 生成新的 Token
    const newToken = jwt.sign(
      { userId: req.user.id, tenantId: tenantId, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      code: 0,
      data: {
        token: newToken,
        tenantId: tenantId,
        tenantName: tenants[0].name,
        user: {
          id: req.user.id,
          username: req.user.username,
          realName: req.user.real_name,
          role: req.user.role,
          tenantId: tenantId,
          tenantName: tenants[0].name
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '切换帐套失败' });
  }
});

// 获取单个租户信息
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tenants WHERE id = ? AND id = ?',
      [req.params.id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ code: 404, message: '租户不存在' });
    res.json({ code: 0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取租户信息失败' });
  }
});

// 更新租户信息
router.put('/:id', async (req, res) => {
  try {
    const { name, owner_name, phone, address, business_type, business_desc } = req.body;
    await pool.query(
      `UPDATE tenants SET name=?, owner_name=?, phone=?, address=?, business_type=?, business_desc=?
       WHERE id=? AND id=?`,
      [name, owner_name, phone, address, business_type, business_desc, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '租户信息更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

module.exports = router;
