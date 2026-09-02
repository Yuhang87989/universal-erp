const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// JWT 认证中间件
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 401, message: '未登录或Token已过期' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 查询用户信息
    const [users] = await pool.query(
      'SELECT u.id, u.tenant_id, u.username, u.real_name, u.role, u.status, u.switchable_tenants, t.name as tenant_name, t.business_type FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id WHERE u.id = ?',
      [decoded.userId]
    );

    if (!users.length || users[0].status !== 'active') {
      return res.status(401).json({ code: 401, message: '用户不存在或已禁用' });
    }

    req.user = users[0];
    req.tenantId = users[0].tenant_id;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 401, message: 'Token已过期，请重新登录' });
    }
    return res.status(401).json({ code: 401, message: '认证失败' });
  }
};

// 角色权限检查
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ code: 403, message: '无权限执行此操作' });
    }
    next();
  };
};

module.exports = { authenticate, requireRole };
