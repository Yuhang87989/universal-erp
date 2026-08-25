const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取电商平台列表
router.get('/', async (req, res) => {
  try {
    const [platforms] = await pool.query(
      'SELECT * FROM ecommerce_platforms WHERE tenant_id = ? ORDER BY id',
      [req.tenantId]
    );
    res.json({ code: 0, data: platforms });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取电商平台列表失败' });
  }
});

// 新增平台
router.post('/', async (req, res) => {
  try {
    const { platform, shop_name, api_key, api_secret, commission_rate } = req.body;
    if (!platform || !shop_name) throw new Error('平台类型和店铺名称不能为空');

    const [result] = await pool.query(
      `INSERT INTO ecommerce_platforms (tenant_id, platform, shop_name, api_key, api_secret, commission_rate)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.tenantId, platform, shop_name, api_key || null, api_secret || null, commission_rate || 0]
    );
    res.json({ code: 0, message: '平台添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新平台
router.put('/:id', async (req, res) => {
  try {
    const { platform, shop_name, api_key, api_secret, commission_rate, status } = req.body;
    await pool.query(
      `UPDATE ecommerce_platforms SET platform=?, shop_name=?, api_key=?, api_secret=?, commission_rate=?, status=?
       WHERE id=? AND tenant_id=?`,
      [platform, shop_name, api_key, api_secret, commission_rate || 0, status, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '平台更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除平台
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ecommerce_platforms WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '平台已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

// ========== 电商订单（简易版，后续可扩展） ==========

// 获取电商订单汇总（按平台统计）
router.get('/summary', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT platform, COUNT(*) as order_count, COALESCE(SUM(actual_amount), 0) as total_amount
       FROM sales_orders WHERE tenant_id = ? AND order_type = 'online'
       GROUP BY platform`,
      [req.tenantId]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取汇总失败' });
  }
});

module.exports = router;
