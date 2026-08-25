const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { getUserPermissions } = require('./permissions');

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

    // 获取目标账套的权限
    const [targetUser] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    const permissions = await getUserPermissions(req.user.id, targetUser[0].role);

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
          role: targetUser[0].role,
          tenantId: tenantId,
          tenantName: tenants[0].name,
          permissions
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '切换帐套失败' });
  }
});

// 演示账套快速切换（直接用目标账套admin账号签发token）
router.post('/demo-switch', async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ code: 400, message: '请选择账套' });
    const [users] = await pool.query(
      'SELECT id, username, real_name, role FROM users WHERE tenant_id=? AND username=? LIMIT 1',
      [tenantId, 'admin']
    );
    if (!users.length) return res.status(404).json({ code: 404, message: '目标账套未找到admin账号' });
    const [tenants] = await pool.query('SELECT id, name FROM tenants WHERE id=?', [tenantId]);
    if (!tenants.length) return res.status(404).json({ code: 404, message: '账套不存在' });
    const u = users[0];
    const token = jwt.sign(
      { userId: u.id, tenantId: tenantId, role: u.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    const permissions = await getUserPermissions(u.id, u.role);
    res.json({
      code: 0, data: {
        token,
        tenantId: tenantId,
        tenantName: tenants[0].name,
        user: {
          id: u.id, username: u.username, realName: u.real_name,
          role: u.role, tenantId: tenantId, tenantName: tenants[0].name,
          permissions
        }
      }
    });
  } catch (err) {
    console.error('演示切换失败:', err);
    res.status(500).json({ code: 500, message: '切换失败' });
  }
});


// ========== 员工管理 ==========
// 获取当前账套员工列表
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, real_name, role, phone, status, created_at FROM users WHERE tenant_id = ? ORDER BY id',
      [req.user.tenant_id]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '获取员工列表失败' });
  }
});

// 添加员工
router.post('/users', async (req, res) => {
  try {
    const { username, password, realName, phone, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
    }
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (tenant_id, username, password_hash, real_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.tenant_id, username, hash, realName || null, phone || null, role || 'cashier']
    );
    res.json({ code: 0, data: { id: result.insertId }, message: '员工添加成功' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ code: 400, message: '该账号已存在' });
    }
    console.error(err);
    res.status(500).json({ code: 500, message: '添加员工失败' });
  }
});

// 更新员工
router.put('/users/:id', async (req, res) => {
  try {
    const { realName, phone, role, status, password } = req.body;
    const updates = [];
    const params = [];
    if (realName !== undefined) { updates.push('real_name=?'); params.push(realName); }
    if (phone !== undefined) { updates.push('phone=?'); params.push(phone); }
    if (role !== undefined) { updates.push('role=?'); params.push(role); }
    if (status !== undefined) { updates.push('status=?'); params.push(status); }
    if (password) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(password, 10);
      updates.push('password_hash=?');
      params.push(hash);
    }
    if (!updates.length) return res.json({ code: 0, message: '无更新' });
    params.push(req.params.id, req.user.tenant_id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id=? AND tenant_id=?`, params);
    res.json({ code: 0, message: '员工信息更新成功' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '更新员工失败' });
  }
});

// 删除员工
router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ code: 400, message: '不能删除自己' });
    }
    await pool.query('DELETE FROM users WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    res.json({ code: 0, message: '员工已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '删除员工失败' });
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
