const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取凭证自动生成设置
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT auto_sales, auto_purchase, auto_fund, auto_depreciation FROM voucher_auto_settings WHERE tenant_id = ?',
      [req.tenantId]
    );
    if (!rows.length) {
      return res.json({
        code: 0,
        data: { auto_sales: 1, auto_purchase: 1, auto_fund: 1, auto_depreciation: 1 }
      });
    }
    res.json({ code: 0, data: rows[0] });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 更新凭证自动生成设置
router.put('/', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { auto_sales, auto_purchase, auto_fund, auto_depreciation } = req.body;
    await pool.query(
      `INSERT INTO voucher_auto_settings (tenant_id, auto_sales, auto_purchase, auto_fund, auto_depreciation)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE auto_sales=VALUES(auto_sales), auto_purchase=VALUES(auto_purchase),
       auto_fund=VALUES(auto_fund), auto_depreciation=VALUES(auto_depreciation)`,
      [req.tenantId, auto_sales ? 1 : 0, auto_purchase ? 1 : 0, auto_fund ? 1 : 0, auto_depreciation ? 1 : 0]
    );
    res.json({ code: 0, message: '设置已保存' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
