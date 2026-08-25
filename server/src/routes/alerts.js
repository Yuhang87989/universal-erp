const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

const alertTypeMap = {
  low_stock: { label: '库存不足', color: 'red', icon: '⚠️' },
  over_stock: { label: '库存积压', color: 'orange', icon: '📦' },
  zero_stock: { label: '零库存', color: 'default', icon: '🚫' },
  negative: { label: '负库存', color: 'red', icon: '❗' },
  expiry: { label: '临期预警', color: 'orange', icon: '⏰' }
};

const levelMap = {
  info: { label: '提示', color: 'blue' },
  warning: { label: '警告', color: 'orange' },
  critical: { label: '严重', color: 'red' }
};

// 扫描并生成预警（可定时调用或手动触发）
router.post('/scan', requireRole('owner', 'manager'), async (req, res) => {
  try {
    // 1. 低库存预警
    const [lowStockItems] = await pool.query(
      `SELECT i.product_id, i.warehouse_id, i.quantity, p.name, p.min_stock, p.unit
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.tenant_id = ? AND p.min_stock > 0 AND i.quantity <= p.min_stock AND p.status = 'active'`,
      [req.tenantId]
    );

    let newCount = 0;
    for (const item of lowStockItems) {
      // 检查是否已有active预警
      const [existing] = await pool.query(
        "SELECT id FROM stock_alerts WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? AND alert_type = 'low_stock' AND status = 'active'",
        [req.tenantId, item.product_id, item.warehouse_id]
      );
      if (existing.length === 0) {
        const level = item.quantity <= 0 ? 'critical' : (item.quantity <= item.min_stock * 0.5 ? 'critical' : 'warning');
        await pool.query(
          `INSERT INTO stock_alerts (tenant_id, alert_type, product_id, warehouse_id, threshold_value, current_value, alert_level, status, message)
           VALUES (?, 'low_stock', ?, ?, ?, ?, ?, 'active', ?)`,
          [req.tenantId, item.product_id, item.warehouse_id, item.min_stock, item.quantity, level,
           `商品「${item.name}」库存${item.quantity}${item.unit}，低于预警值${item.min_stock}${item.unit}`]
        );
        newCount++;
      } else {
        // 更新当前值
        await pool.query(
          'UPDATE stock_alerts SET current_value = ? WHERE id = ?',
          [item.quantity, existing[0].id]
        );
      }
    }

    // 2. 零库存预警
    const [zeroStockItems] = await pool.query(
      `SELECT i.product_id, i.warehouse_id, p.name, p.unit
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.tenant_id = ? AND i.quantity = 0 AND p.status = 'active' AND p.min_stock > 0`,
      [req.tenantId]
    );
    for (const item of zeroStockItems) {
      const [existing] = await pool.query(
        "SELECT id FROM stock_alerts WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? AND alert_type = 'zero_stock' AND status = 'active'",
        [req.tenantId, item.product_id, item.warehouse_id]
      );
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO stock_alerts (tenant_id, alert_type, product_id, warehouse_id, current_value, alert_level, status, message)
           VALUES (?, 'zero_stock', ?, ?, 0, 'critical', 'active', ?)`,
          [req.tenantId, item.product_id, item.warehouse_id, `商品「${item.name}」已零库存`]
        );
        newCount++;
      }
    }

    // 3. 负库存异常（理论上不应出现）
    const [negItems] = await pool.query(
      `SELECT i.product_id, i.warehouse_id, i.quantity, p.name, p.unit
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.tenant_id = ? AND i.quantity < 0`,
      [req.tenantId]
    );
    for (const item of negItems) {
      const [existing] = await pool.query(
        "SELECT id FROM stock_alerts WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? AND alert_type = 'negative' AND status = 'active'",
        [req.tenantId, item.product_id, item.warehouse_id]
      );
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO stock_alerts (tenant_id, alert_type, product_id, warehouse_id, current_value, alert_level, status, message)
           VALUES (?, 'negative', ?, ?, ?, 'critical', 'active', ?)`,
          [req.tenantId, item.product_id, item.warehouse_id, item.quantity, `商品「${item.name}」库存为负数(${item.quantity}${item.unit})，数据异常`]
        );
        newCount++;
      }
    }

    // 自动解决已恢复的预警
    await pool.query(
      `UPDATE stock_alerts sa SET sa.status = 'resolved', sa.resolved_at = NOW()
       WHERE sa.tenant_id = ? AND sa.status = 'active' AND sa.alert_type = 'low_stock'
       AND EXISTS (
         SELECT 1 FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.product_id = sa.product_id AND i.warehouse_id = sa.warehouse_id
         AND i.quantity > p.min_stock
       )`,
      [req.tenantId]
    );

    const [[{ active_count }]] = await pool.query(
      "SELECT COUNT(*) as active_count FROM stock_alerts WHERE tenant_id = ? AND status = 'active'",
      [req.tenantId]
    );

    res.json({
      code: 0,
      message: `扫描完成，新增${newCount}条预警`,
      data: { new_alerts: newCount, active_alerts: active_count }
    });
  } catch (err) {
    console.error('预警扫描失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 预警列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status = 'active', alert_type, alert_level } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE sa.tenant_id = ?';
    const params = [req.tenantId];
    if (status) { where += ' AND sa.status = ?'; params.push(status); }
    if (alert_type) { where += ' AND sa.alert_type = ?'; params.push(alert_type); }
    if (alert_level) { where += ' AND sa.alert_level = ?'; params.push(alert_level); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_alerts sa ${where}`, params);
    const [rows] = await pool.query(
      `SELECT sa.*, p.name as product_name, p.unit, p.barcode, p.min_stock,
              w.name as warehouse_name
       FROM stock_alerts sa
       JOIN products p ON sa.product_id = p.id
       LEFT JOIN warehouses w ON sa.warehouse_id = w.id
       ${where} ORDER BY
         CASE sa.alert_level WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         sa.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 0, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 预警统计（Dashboard用）
router.get('/stats', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT alert_type, alert_level, COUNT(*) as cnt
       FROM stock_alerts WHERE tenant_id = ? AND status = 'active'
       GROUP BY alert_type, alert_level`,
      [req.tenantId]
    );
    const [total] = await pool.query(
      "SELECT COUNT(*) as total FROM stock_alerts WHERE tenant_id = ? AND status = 'active'",
      [req.tenantId]
    );
    res.json({ code: 0, data: { breakdown: rows, total: total[0].total } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 处理预警（忽略/解决）
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { status } = req.body; // resolved / ignored
    await pool.query(
      'UPDATE stock_alerts SET status = ?, resolved_at = NOW(), resolved_by = ? WHERE id = ? AND tenant_id = ?',
      [status, req.user.id, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '预警已处理' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
