const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { getUserPermissions } = require('./permissions');

const router = express.Router();

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '请输入账号和密码' });
    }

    const [users] = await pool.query(
      'SELECT u.*, t.name as tenant_name FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.username = ?',
      [username]
    );

    if (!users.length) {
      return res.status(401).json({ code: 401, message: '账号或密码错误' });
    }

    const user = users[0];
    if (user.status !== 'active') {
      return res.status(403).json({ code: 403, message: '账号已被禁用' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ code: 401, message: '账号或密码错误' });
    }

    // 生成Token
    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // 获取权限
    const permissions = await getUserPermissions(user.id, user.role);

    // 更新最后登录时间
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    res.json({
      code: 0,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          realName: user.real_name,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: user.tenant_name,
          permissions
        }
      }
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 获取当前用户信息
router.get('/me', authenticate, async (req, res) => {
  try {
    const permissions = await getUserPermissions(req.user.id, req.user.role);
    res.json({
      code: 0,
      data: {
        id: req.user.id,
        username: req.user.username,
        realName: req.user.real_name,
        role: req.user.role,
        tenantId: req.user.tenant_id,
        tenantName: req.user.tenant_name,
        permissions
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 修改密码
router.put('/password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ code: 400, message: '请输入原密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ code: 400, message: '新密码至少6位' });
    }

    const [users] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(oldPassword, users[0].password_hash);
    if (!valid) {
      return res.status(400).json({ code: 400, message: '原密码错误' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

    res.json({ code: 0, message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

module.exports = router;
