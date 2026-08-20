const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取当前用户可访问的租户列表（当前角色为owner/manager的可看到所有帐套）
router.get('/', async (req, res) => {
  try {
    // owner可以看到所有帐套，其他角色只能看到自己的
    let query, params;
    if (req.user.role === 'owner') {
      query = 'SELECT id, name, owner_name, phone, business_type FROM tenants WHERE status = ? ORDER BY id';
      params = ['active'];
    } else {
      query = 'SELECT id, name, owner_name, phone, business_type FROM tenants WHERE id = ? AND status = ?';
      params = [req.tenantId, 'active'];
    }

    const [tenants] = await pool.query(query, params);
    res.json({ code: 0, data: tenants });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '获取租户列表失败' });
  }
});

// 切换帐套
router.post('/switch', async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) {
      return res.status(400).json({ code: 400, message: '请选择要切换的帐套' });
    }

    // 验证目标帐套存在且激活
    const [tenants] = await pool.query(
      'SELECT id, name, owner_name, business_type FROM tenants WHERE id = ? AND status = ?',
      [tenantId, 'active']
    );
    if (!tenants.length) {
      return res.status(404).json({ code: 404, message: '目标帐套不存在' });
    }

    // owner角色可以切换到任意帐套
    if (req.user.role !== 'owner' && req.tenantId !== tenantId) {
      return res.status(403).json({ code: 403, message: '无权切换到该帐套' });
    }

    // 更新用户的 tenant_id
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
      'SELECT * FROM tenants WHERE id = ?',
      [req.params.id]
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
    const { name, owner_name, phone, address, business_type } = req.body;
    await pool.query(
      `UPDATE tenants SET name=?, owner_name=?, phone=?, address=?, business_type=?
       WHERE id=?`,
      [name, owner_name, phone, address, business_type, req.params.id]
    );
    res.json({ code: 0, message: '租户信息更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

module.exports = router;
