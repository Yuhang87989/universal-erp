const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { getUserPermissions } = require('./permissions');
const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    let query, params;
    if (req.user.role === 'owner') {
      query = 'SELECT id, name, owner_name, phone, address, business_type, business_desc, credit_code, status FROM tenants WHERE status = ? ORDER BY id';
      params = ['active'];
    } else {
      query = 'SELECT id, name, owner_name, phone, address, business_type, business_desc, credit_code, status FROM tenants WHERE id = ? AND status = ?';
      params = [req.tenantId, 'active'];
    }
    const [tenants] = await pool.query(query, params);
    res.json({ code: 0, data: tenants });
  } catch (err) { console.error(err); res.status(500).json({ code: 500, message: '获取租户列表失败' }); }
});

router.get('/me', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tenants WHERE id = ?', [req.tenantId]);
    if (!rows.length) return res.status(404).json({ code: 404, message: '租户不存在' });
    res.json({ code: 0, data: rows[0] });
  } catch (err) { res.status(500).json({ code: 500, message: '获取租户信息失败' }); }
});

router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { name, ownerName, phone, address, businessType, businessDesc, creditCode, username, password } = req.body;
    if (!name) { await conn.rollback(); return res.status(400).json({ code: 400, message: '帐套名称不能为空' }); }

    // Map businessType to entity_type
    const entityTypeMap = { retail: 'individual', supply_coop: 'individual', market: 'individual', ecommerce: 'individual', other: 'other' };
    const entityType = entityTypeMap[businessType] || 'individual';

    // 1. Create tenant
    const [tResult] = await conn.query(
      'INSERT INTO tenants (name, owner_name, phone, address, business_type, status) VALUES (?,?,?,?,?,?)',
      [name, ownerName || null, phone || null, address || null, businessType || 'retail', 'active']
    );
    const tenantId = tResult.insertId;

    // 2. Create admin user
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password || 'admin123', 10);
    const [uResult] = await conn.query(
      'INSERT INTO users (tenant_id, username, password_hash, real_name, phone, role, status) VALUES (?,?,?,?,?,?,?)',
      [tenantId, username || 'admin', hash, ownerName || '管理员', phone || null, 'owner', 'active']
    );

    // 3. Create accounting_book (correct schema)
    const [bResult] = await conn.query(
      `INSERT INTO accounting_books (tenant_id, book_name, entity_name, credit_code, entity_type, currency, fiscal_year_start, accounting_standard, is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?,TRUE,?)`,
      [tenantId, name, name, creditCode || null, entityType, 'CNY', 1, 'small_enterprise', uResult.insertId]
    );
    const bookId = bResult.insertId;

    // 4. Create standard chart of accounts (correct schema: book_id, category, direction)
    const subjects = [
      ['1001','库存现金','asset','debit'],['1002','银行存款','asset','debit'],['1012','其他货币资金','asset','debit'],
      ['1122','应收账款','asset','debit'],['1221','其他应收款','asset','debit'],['1402','在途物资','asset','debit'],
      ['1403','原材料','asset','debit'],['1405','库存商品','asset','debit'],['1411','周转材料','asset','debit'],
      ['1601','固定资产','asset','debit'],['1602','累计折旧','asset','credit'],['1701','无形资产','asset','debit'],
      ['2001','短期借款','liability','credit'],['2202','应付账款','liability','credit'],['2211','应付职工薪酬','liability','credit'],
      ['2221','应交税费','liability','credit'],['2231','应付利息','liability','credit'],['2241','其他应付款','liability','credit'],
      ['2501','长期借款','liability','credit'],['4001','实收资本','equity','credit'],['4002','资本公积','equity','credit'],
      ['4101','盈余公积','equity','credit'],['4103','本年利润','equity','credit'],['4104','利润分配','equity','credit'],
      ['5001','生产成本','expense','debit'],['5101','制造费用','expense','debit'],
      ['6001','主营业务收入','revenue','credit'],['6051','其他业务收入','revenue','credit'],['6111','投资收益','revenue','credit'],
      ['6301','营业外收入','revenue','credit'],['6401','主营业务成本','expense','debit'],['6402','其他业务成本','expense','debit'],
      ['6403','税金及附加','expense','debit'],['6601','销售费用','expense','debit'],['6602','管理费用','expense','debit'],
      ['6603','财务费用','expense','debit'],['6711','营业外支出','expense','debit'],['6801','所得税费用','expense','debit']
    ];
    for (const [code, sname, cat, dir] of subjects) {
      await conn.query(
        'INSERT INTO accounting_accounts (book_id, code, name, category, direction, level, is_enabled, sort_order) VALUES (?,?,?,?,?,1,TRUE,0)',
        [bookId, code, sname, cat, dir]
      );
    }

    // 5. 默认资金账户（现金/微信/支付宝）——资金模块开箱即用
    await conn.query(
      `INSERT INTO fund_accounts (tenant_id, account_name, account_type, balance, is_enabled, is_default, sort_order)
       VALUES (?, '现金账户', 'cash', 0, 1, 1, 1),
              (?, '微信收款', 'wechat', 0, 1, 0, 2),
              (?, '支付宝收款', 'alipay', 0, 1, 0, 3)`,
      [tenantId, tenantId, tenantId]
    );

    // 6. 默认仓库——入库/库存模块开箱即用
    await conn.query(
      `INSERT INTO warehouses (tenant_id, code, name, is_default, remark) VALUES (?, 'WH001', '主仓库', 1, '默认仓库')`,
      [tenantId]
    );

    // 7. 自动凭证开关（全开）——销售/采购/资金/折旧自动生成凭证
    await conn.query(
      `INSERT INTO voucher_auto_settings (tenant_id, auto_sales, auto_purchase, auto_fund, auto_depreciation) VALUES (?,1,1,1,1)`,
      [tenantId]
    );

    await conn.commit();
    res.json({ code: 0, data: { tenantId, bookId, userId: uResult.insertId }, message: '帐套创建成功！管理员账号: ' + (username||'admin') + ' / ' + (password||'admin123') });
  } catch (err) {
    await conn.rollback();
    console.error('新建帐套失败:', err);
    res.status(500).json({ code: 500, message: '新建帐套失败: ' + err.message });
  } finally { conn.release(); }
});

router.post('/switch', async (req, res) => {
  try {
    const { tenantId } = req.body;
    if (!tenantId) return res.status(400).json({ code: 400, message: '请选择要切换的帐套' });
    const [tenants] = await pool.query('SELECT id, name, owner_name, business_type FROM tenants WHERE id = ? AND status = ?', [tenantId, 'active']);
    if (!tenants.length) return res.status(404).json({ code: 404, message: '目标帐套不存在' });
    if (req.user.role !== 'owner' && req.tenantId !== tenantId) return res.status(403).json({ code: 403, message: '无权切换到该帐套' });
    await pool.query('UPDATE users SET tenant_id = ? WHERE id = ?', [tenantId, req.user.id]);
    const newToken = jwt.sign({ userId: req.user.id, tenantId: tenantId, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const [targetUser] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    const permissions = await getUserPermissions(req.user.id, targetUser[0].role);
    res.json({ code: 0, data: { token: newToken, tenantId, tenantName: tenants[0].name, user: { id: req.user.id, username: req.user.username, realName: req.user.real_name, role: targetUser[0].role, tenantId, tenantName: tenants[0].name, business_type: tenants[0].business_type, permissions }}});
  } catch (err) { console.error(err); res.status(500).json({ code: 500, message: '切换帐套失败' }); }
});

router.post('/demo-switch', async (req, res) => {
  try {
    const { tenantId, password, username } = req.body;
    if (!tenantId) return res.status(400).json({ code: 400, message: '请选择账套' });
    const targetId = Number(tenantId);
    // 目标账套必须存在且启用
    const [tenants] = await pool.query('SELECT id, name, business_type FROM tenants WHERE id = ? AND status = ?', [targetId, 'active']);
    if (!tenants.length) return res.status(404).json({ code: 404, message: '目标账套不存在或已停用' });
    // 密码即通行证：切换账套=用目标账套的账号密码重新认证
    // 演示账套默认 admin/admin123 可进；账套改密码后必须输入新密码才能切换进入
    const loginName = username || 'admin';
    if (!password) return res.status(400).json({ code: 400, message: '请输入目标账套的密码' });
    const [users] = await pool.query('SELECT id, username, password_hash, real_name, role, status FROM users WHERE tenant_id = ? AND username = ? LIMIT 1', [targetId, loginName]);
    if (!users.length) return res.status(404).json({ code: 404, message: '目标账套未找到该账号' });
    const u = users[0];
    if (u.status !== 'active') return res.status(403).json({ code: 403, message: '该账号已被禁用' });
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(401).json({ code: 401, message: '密码错误，无法切换到该账套' });
    const tk = jwt.sign({ userId: u.id, tenantId: targetId, role: u.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
    const permissions = await getUserPermissions(u.id, u.role);
    res.json({ code: 0, data: { token: tk, tenantId: targetId, tenantName: tenants[0].name, user: { id: u.id, username: u.username, realName: u.real_name, role: u.role, tenantId: targetId, tenantName: tenants[0].name, business_type: tenants[0].business_type, permissions } } });
  } catch (err) { console.error('切换账套失败:', err); res.status(500).json({ code: 500, message: '切换失败' }); }
});

router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, real_name, role, phone, status, created_at FROM users WHERE tenant_id = ? ORDER BY id', [req.user.tenant_id]);
    res.json({ code: 0, data: rows });
  } catch (err) { console.error(err); res.status(500).json({ code: 500, message: '获取员工列表失败' }); }
});

router.post('/users', async (req, res) => {
  try {
    const { username, password, realName, phone, role } = req.body;
    if (!username || !password) return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users (tenant_id, username, password_hash, real_name, phone, role) VALUES (?, ?, ?, ?, ?, ?)', [req.user.tenant_id, username, hash, realName || null, phone || null, role || 'cashier']);
    res.json({ code: 0, data: { id: result.insertId }, message: '员工添加成功' });
  } catch (err) { if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ code: 400, message: '该账号已存在' }); console.error(err); res.status(500).json({ code: 500, message: '添加员工失败' }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { realName, phone, role, status, password } = req.body;
    const updates = [], params = [];
    if (realName !== undefined) { updates.push('real_name=?'); params.push(realName); }
    if (phone !== undefined) { updates.push('phone=?'); params.push(phone); }
    if (role !== undefined) { updates.push('role=?'); params.push(role); }
    if (status !== undefined) { updates.push('status=?'); params.push(status); }
    if (password) { const bcrypt = require('bcryptjs'); updates.push('password_hash=?'); params.push(await bcrypt.hash(password, 10)); }
    if (!updates.length) return res.json({ code: 0, message: '无更新' });
    params.push(req.params.id, req.user.tenant_id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id=? AND tenant_id=?`, params);
    res.json({ code: 0, message: '员工信息更新成功' });
  } catch (err) { console.error(err); res.status(500).json({ code: 500, message: '更新员工失败' }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ code: 400, message: '不能删除自己' });
    await pool.query('DELETE FROM users WHERE id=? AND tenant_id=?', [req.params.id, req.user.tenant_id]);
    res.json({ code: 0, message: '员工已删除' });
  } catch (err) { console.error(err); res.status(500).json({ code: 500, message: '删除员工失败' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tenants WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ code: 404, message: '租户不存在' });
    res.json({ code: 0, data: rows[0] });
  } catch (err) { res.status(500).json({ code: 500, message: '获取租户信息失败' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const fieldMap = {
      name: 'name', ownerName: 'owner_name', owner_name: 'owner_name',
      phone: 'phone', address: 'address',
      businessType: 'business_type', business_type: 'business_type',
      businessDesc: 'business_desc', business_desc: 'business_desc',
      creditCode: 'credit_code', credit_code: 'credit_code',
      logoUrl: 'logo_url', logo_url: 'logo_url',
    };
    const updates = [], params = [];
    for (const [key, value] of Object.entries(req.body)) {
      const col = fieldMap[key];
      if (col) { updates.push(`${col}=?`); params.push(value); }
    }
    if (!updates.length) return res.json({ code: 0, message: '无更新' });
    params.push(req.params.id);
    await pool.query(`UPDATE tenants SET ${updates.join(', ')} WHERE id=?`, params);
    res.json({ code: 0, message: '租户信息更新成功' });
  } catch (err) { console.error('更新租户失败:', err); res.status(400).json({ code: 400, message: err.message }); }
});

module.exports = router;
