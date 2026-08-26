const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ========== 权限模块定义 ==========
const MODULES = [
  { key: 'dashboard', name: '工作台', group: '业务管理' },
  { key: 'purchase', name: '采购管理', group: '业务管理', children: [
    { key: 'purchase:order', name: '采购订单' },
    { key: 'purchase:suppliers', name: '供应商管理' },
  ]},
  { key: 'sales', name: '销售管理', group: '业务管理', children: [
    { key: 'sales:order', name: '销售订单' },
    { key: 'sales:pos', name: 'POS收银' },
  ]},
  { key: 'warehouse', name: '仓库管理', group: '仓库管理', children: [
    { key: 'warehouse:warehouses', name: '仓库设置' },
    { key: 'warehouse:inventory', name: '库存查询' },
    { key: 'warehouse:stock-in', name: '入库管理' },
    { key: 'warehouse:stock-out', name: '出库管理' },
    { key: 'warehouse:transfers', name: '库存调拨' },
    { key: 'warehouse:stocktake', name: '库存盘点' },
    { key: 'warehouse:alerts', name: '预警中心' },
  ]},
  { key: 'finance', name: '财务管理', group: '财务管理', children: [
    { key: 'finance:records', name: '收支管理' },
    { key: 'finance:vouchers', name: '记账凭证' },
    { key: 'finance:accounts', name: '会计科目' },
    { key: 'finance:trial-balance', name: '试算平衡' },
    { key: 'finance:seals', name: '印章管理' },
    { key: 'finance:payment', name: '支付渠道' },
    { key: 'finance:reports', name: '财务报表' },
    { key: 'finance:receivables', name: '应收应付' },
    { key: 'finance:period-close', name: '期末结转' },
  ]},
  { key: 'analytics', name: '数据分析', group: '数据分析', children: [
    { key: 'analytics:overview', name: '数据分析中心' },
    { key: 'analytics:reports', name: '数据报表' },
  ]},
  { key: 'ai', name: 'AI智能', group: 'AI智能', children: [
    { key: 'ai:chat', name: 'AI智能中心' },
  ]},
  { key: 'data', name: '基础数据', group: '基础数据', children: [
    { key: 'data:products', name: '商品管理' },
    { key: 'data:customers', name: '往来单位' },
    { key: 'data:ecommerce', name: '电商管理' },
  ]},
  { key: 'system', name: '系统', group: '系统', children: [
    { key: 'system:settings', name: '系统管理' },
  ]},
];

// 角色默认权限（owner=全部，其他角色按模块授权）
const ROLE_DEFAULTS = {
  owner: null, // null表示全部权限
  manager: [
    'dashboard', 'purchase', 'purchase:order', 'purchase:suppliers',
    'sales', 'sales:order', 'sales:pos',
    'warehouse', 'warehouse:warehouses', 'warehouse:inventory', 'warehouse:stock-in',
    'warehouse:stock-out', 'warehouse:transfers', 'warehouse:stocktake', 'warehouse:alerts',
    'finance', 'finance:records', 'finance:vouchers', 'finance:accounts',
    'finance:trial-balance', 'finance:seals', 'finance:payment',
    'finance:reports', 'finance:receivables', 'finance:period-close',
    'analytics', 'analytics:overview', 'analytics:reports',
    'ai', 'ai:chat',
    'data', 'data:products', 'data:customers', 'data:ecommerce',
  ],
  cashier: [
    'dashboard', 'sales', 'sales:order', 'sales:pos',
    'warehouse:inventory', 'finance:records', 'finance:payment',
  ],
  warehouse: [
    'dashboard', 'warehouse', 'warehouse:warehouses', 'warehouse:inventory',
    'warehouse:stock-in', 'warehouse:stock-out', 'warehouse:transfers',
    'warehouse:stocktake', 'warehouse:alerts',
    'data:products',
  ],
  // 会计
  accountant: [
    'dashboard', 'finance', 'finance:records', 'finance:vouchers',
    'finance:accounts', 'finance:trial-balance', 'finance:seals',
    'finance:reports', 'finance:receivables', 'finance:period-close',
    'analytics:reports', 'purchase:order', 'purchase:suppliers',
  ],
};

// 获取用户权限（如果permissions列为NULL则使用角色默认权限）
async function getUserPermissions(userId, role) {
  const [rows] = await pool.query('SELECT permissions FROM users WHERE id = ?', [userId]);
  if (!rows.length) return [];
  if (rows[0].permissions === null || rows[0].permissions === undefined) {
    // 使用角色默认权限
    if (role === 'owner') return null; // null = all
    return ROLE_DEFAULTS[role] || ['dashboard'];
  }
  // 解析JSON
  try {
    const perms = JSON.parse(rows[0].permissions);
    if (role === 'owner') return null; // owner始终全部
    return perms;
  } catch {
    return ROLE_DEFAULTS[role] || ['dashboard'];
  }
}

// 检查用户是否有某个模块的权限（父模块有权限则子模块也有权限）
function hasPermission(userPerms, moduleKey) {
  if (userPerms === null) return true; // owner全部权限
  if (!userPerms) return false;
  if (userPerms.includes(moduleKey)) return true;
  // 检查父模块
  const parentKey = moduleKey.split(':')[0];
  if (parentKey !== moduleKey && userPerms.includes(parentKey)) return true;
  return false;
}

// ========== API路由 ==========

// 获取所有模块定义
router.get('/modules', (req, res) => {
  res.json({ code: 0, data: MODULES });
});

// 获取当前用户权限
router.get('/me', async (req, res) => {
  try {
    const perms = await getUserPermissions(req.user.id, req.user.role);
    res.json({ code: 0, data: { role: req.user.role, permissions: perms } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取权限失败' });
  }
});

// 获取指定员工权限
router.get('/user/:userId', requireRole('owner'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, real_name, role, permissions FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.userId, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ code: 404, message: '员工不存在' });
    const perms = await getUserPermissions(rows[0].id, rows[0].role);
    res.json({ code: 0, data: { ...rows[0], effective_permissions: perms } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取权限失败' });
  }
});

// 更新员工权限
router.put('/user/:userId', requireRole('owner'), async (req, res) => {
  try {
    const { permissions, role } = req.body;
    const userId = req.params.userId;

    // 不能修改自己的角色
    if (parseInt(userId) === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({ code: 400, message: '不能修改自己的角色' });
    }

    const updates = [];
    const params = [];

    if (role) {
      updates.push('role = ?');
      params.push(role);
    }

    if (permissions !== undefined) {
      // owner不存储自定义权限（始终全部），其他角色存JSON
      const targetRole = role || req.user.role;
      if (targetRole === 'owner') {
        updates.push('permissions = ?');
        params.push(null);
      } else {
        updates.push('permissions = ?');
        params.push(JSON.stringify(permissions));
      }
    }

    if (!updates.length) return res.json({ code: 0, message: '无更新' });

    params.push(userId, req.tenantId);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );
    res.json({ code: 0, message: '权限更新成功' });
  } catch (err) {
    console.error('更新权限失败:', err);
    res.status(500).json({ code: 500, message: '更新权限失败: ' + err.message });
  }
});

// 重置为角色默认权限
router.post('/user/:userId/reset', requireRole('owner'), async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET permissions = NULL WHERE id = ? AND tenant_id = ?',
      [req.params.userId, req.tenantId]
    );
    res.json({ code: 0, message: '已重置为角色默认权限' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '重置失败' });
  }
});

// 导出辅助函数供其他路由使用
module.exports = router;
module.exports.MODULES = MODULES;
module.exports.ROLE_DEFAULTS = ROLE_DEFAULTS;
module.exports.getUserPermissions = getUserPermissions;
module.exports.hasPermission = hasPermission;
