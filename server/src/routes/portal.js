// ============================================================
// 认知训练门户 - 数据同步API（portal.js）
// 不依赖微信云函数/云数据库，数据存ERP的MySQL
// 设备码机制：H5首次打开自动生成UUID；可手动绑定IMEI/昵称
// ============================================================
const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ---------- 建表（启动时自动执行，不存在才创建） ----------
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_code VARCHAR(64) NOT NULL UNIQUE COMMENT '设备码UUID',
        imei VARCHAR(32) DEFAULT NULL COMMENT '手动绑定的IMEI',
        nickname VARCHAR(64) DEFAULT NULL COMMENT '设备/孩子昵称',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_imei (imei)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户设备表'
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_code VARCHAR(64) NOT NULL COMMENT '所属设备码',
        data_key VARCHAR(64) NOT NULL COMMENT '数据类型',
        data_json LONGTEXT NOT NULL COMMENT 'JSON内容',
        client_updated BIGINT NOT NULL COMMENT '客户端更新时间戳ms',
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_device_key (device_code, data_key),
        INDEX idx_device (device_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户同步数据'
    `);
    console.log('✅ 门户数据表就绪');
  } catch (e) {
    console.error('❌ 门户建表失败:', e.message);
  }
}
ensureTables();

// ---------- 工具 ----------
function isValidCode(code) {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(code);
}

// ---------- 设备注册/心跳 ----------
router.post('/device/register', async (req, res) => {
  const { device_code, imei, nickname } = req.body || {};
  if (!isValidCode(device_code)) {
    return res.status(400).json({ code: 400, message: '设备码无效' });
  }
  try {
    await pool.query(
      `INSERT INTO portal_devices (device_code, imei, nickname, last_seen)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_seen = NOW(),
         imei = COALESCE(VALUES(imei), imei),
         nickname = COALESCE(VALUES(nickname), nickname)`,
      [device_code, imei || null, nickname || null]
    );
    let migrated = false;
    if (imei) {
      const [rows] = await pool.query(
        'SELECT device_code FROM portal_devices WHERE imei = ? AND device_code != ? LIMIT 1',
        [imei, device_code]
      );
      if (rows.length > 0) {
        await pool.query(
          `INSERT INTO portal_data (device_code, data_key, data_json, client_updated)
           SELECT ?, data_key, data_json, client_updated FROM portal_data
           WHERE device_code = ?
           ON DUPLICATE KEY UPDATE
             data_json = IF(VALUES(client_updated) >= client_updated, VALUES(data_json), data_json),
             client_updated = GREATEST(VALUES(client_updated), client_updated)`,
          [device_code, rows[0].device_code]
        );
        migrated = true;
      }
    }
    const [dev] = await pool.query(
      'SELECT device_code, imei, nickname, created_at, last_seen FROM portal_devices WHERE device_code = ?',
      [device_code]
    );
    res.json({ code: 0, data: { device: dev[0], migrated } });
  } catch (e) {
    console.error('门户设备注册失败:', e);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ---------- 拉取全部数据 ----------
router.get('/sync', async (req, res) => {
  const { device_code } = req.query;
  if (!isValidCode(device_code)) {
    return res.status(400).json({ code: 400, message: '设备码无效' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT data_key, data_json, client_updated FROM portal_data WHERE device_code = ?',
      [device_code]
    );
    const items = {};
    for (const r of rows) {
      try { items[r.data_key] = { data: JSON.parse(r.data_json), updated: r.client_updated }; }
      catch (_) { /* 跳过坏数据 */ }
    }
    pool.query('UPDATE portal_devices SET last_seen = NOW() WHERE device_code = ?', [device_code]).catch(()=>{});
    res.json({ code: 0, data: { items, server_time: Date.now() } });
  } catch (e) {
    console.error('门户拉取失败:', e);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ---------- 推送数据（批量） ----------
router.post('/sync', async (req, res) => {
  const { device_code, items } = req.body || {};
  if (!isValidCode(device_code)) {
    return res.status(400).json({ code: 400, message: '设备码无效' });
  }
  if (!items || typeof items !== 'object') {
    return res.status(400).json({ code: 400, message: '数据格式错误' });
  }
  try {
    await pool.query(
      `INSERT IGNORE INTO portal_devices (device_code) VALUES (?)`,
      [device_code]
    );
    let accepted = 0, skipped = 0;
    for (const [key, val] of Object.entries(items)) {
      if (!key || key.length > 64 || !val || typeof val.updated !== 'number') { skipped++; continue; }
      let json;
      try { json = JSON.stringify(val.data); } catch (_) { skipped++; continue; }
      if (json.length > 2000000) { skipped++; continue; }
      const [ret] = await pool.query(
        `INSERT INTO portal_data (device_code, data_key, data_json, client_updated)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           data_json = IF(VALUES(client_updated) >= client_updated, VALUES(data_json), data_json),
           client_updated = GREATEST(VALUES(client_updated), client_updated)`,
        [device_code, key, json, val.updated]
      );
      if (ret.affectedRows >= 1) accepted++;
    }
    res.json({ code: 0, data: { accepted, skipped } });
  } catch (e) {
    console.error('门户推送失败:', e);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

module.exports = router;
