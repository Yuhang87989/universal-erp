const express = require('express');
const { exec } = require('child_process');
const { authenticate } = require('../middleware/auth');
const pool = require('../config/db');

const router = express.Router();
router.use(authenticate);

// 获取系统版本信息
router.get('/info', (req, res) => {
  const version = process.env.ERP_VERSION || '2.0.0';
  const buildTime = process.env.BUILD_TIME || new Date().toISOString();
  res.json({
    code: 0,
    data: {
      version,
      buildTime,
      nodeVersion: process.version,
      uptime: process.uptime(),
      platform: process.platform
    }
  });
});

// 检查更新（从GitHub获取最新commit）
router.get('/check', (req, res) => {
  exec('cd /opt/universal-erp && git log -1 --format="%H|%ci|%s"', (err, stdout) => {
    if (err) {
      return res.json({ code: 0, data: { current: 'unknown', latest: null, hasUpdate: false, error: err.message } });
    }
    const [hash, date, subject] = stdout.trim().split('|');
    // 简单检查：获取远程最新
    exec('cd /opt/universal-erp && git fetch origin main 2>&1 && git log origin/main -1 --format="%H|%ci|%s"', (err2, stdout2) => {
      if (err2) {
        return res.json({ code: 0, data: { current: { hash: hash.slice(0, 7), date, subject }, latest: null, hasUpdate: false, note: '无法连接远程' } });
      }
      const [lhash, ldate, lsubject] = stdout2.trim().split('|');
      res.json({
        code: 0,
        data: {
          current: { hash: hash.slice(0, 7), date, subject },
          latest: { hash: lhash.slice(0, 7), date: ldate, subject: lsubject },
          hasUpdate: hash !== lhash
        }
      });
    });
  });
});

// 执行更新（拉取最新代码、执行SQL、重启服务）
router.post('/update', (req, res) => {
  // 仅owner可操作
  if (req.user.role !== 'owner') {
    return res.status(403).json({ code: 403, message: '仅管理员可执行更新' });
  }
  exec('bash /opt/universal-erp/deploy/upgrade.sh 2>&1', { timeout: 300000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ code: 500, message: '更新失败', error: err.message, output: stdout + stderr });
    }
    res.json({ code: 0, message: '更新完成', output: stdout });
  });
});

// 数据库状态检查
router.get('/db-check', async (req, res) => {
  if (req.user.role !== 'owner') {
    return res.status(403).json({ code: 403, message: '仅管理员可查看' });
  }
  try {
    const checks = {};
    const tables = ['tenants', 'users', 'products', 'inventory', 'purchase_orders', 'sales_orders',
      'finance_records', 'accounting_books', 'accounting_accounts', 'vouchers', 'seals',
      'warehouses', 'payment_channels', 'tenant_settings', 'ai_chat_history'];
    for (const table of tables) {
      const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM ${table}`);
      checks[table] = rows[0].cnt;
    }
    // 检查每个租户的账套数
    const [books] = await pool.query(
      `SELECT t.id as tenant_id, t.name, COUNT(b.id) as book_count
       FROM tenants t LEFT JOIN accounting_books b ON t.id=b.tenant_id
       GROUP BY t.id ORDER BY t.id`
    );
    res.json({ code: 0, data: { tables: checks, tenants: books } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
