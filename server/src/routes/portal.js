// ============================================================
// 认知训练门户 - 数据同步API（portal.js V2）
// 手机号+密码登录，一个手机号=一份成长档案
// 底层设备码自动生成，用户无需关心
// ============================================================
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const crypto = require('crypto');

// ---------- 建表 ----------
async function ensureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_phones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE COMMENT '手机号',
        password_hash VARCHAR(128) DEFAULT NULL COMMENT '密码哈希',
        device_code VARCHAR(64) NOT NULL UNIQUE COMMENT '绑定设备码',
        nickname VARCHAR(64) DEFAULT NULL COMMENT '昵称/孩子名',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户手机号账户'
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_code VARCHAR(64) NOT NULL UNIQUE,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户设备表'
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS portal_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_code VARCHAR(64) NOT NULL,
        data_key VARCHAR(64) NOT NULL,
        data_json LONGTEXT NOT NULL,
        client_updated BIGINT NOT NULL,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_device_key (device_code, data_key),
        INDEX idx_device (device_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='门户同步数据'
    `);
    console.log('✅ 门户数据表就绪（V2 手机号模式）');
  } catch (e) {
    console.error('❌ 门户建表失败:', e.message);
  }
}
ensureTables();

// ---------- 工具 ----------
function hashPwd(pwd) {
  return crypto.createHash('sha256').update(pwd + '_portal_salt_2026').digest('hex');
}
function genDeviceCode(phone) {
  // 手机号生成稳定设备码
  return 'ph-' + crypto.createHash('sha256').update(phone + '_dc_salt').digest('hex').slice(0, 24);
}
function isValidPhone(phone) {
  return typeof phone === 'string' && /^1[3-9]\d{9}$/.test(phone);
}

// ---------- 1. 手机号注册/登录 ----------
// POST /api/portal/phone/login { phone, password?, nickname? }
router.post('/phone/login', async (req, res) => {
  const { phone, password, nickname } = req.body || {};
  if (!isValidPhone(phone)) {
    return res.status(400).json({ code: 400, message: '手机号格式不对' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM portal_phones WHERE phone = ?', [phone]);
    if (rows.length === 0) {
      // 新注册：需密码
      if (!password || password.length < 4) {
        return res.status(400).json({ code: 400, message: '首次注册需设置密码（4位以上）' });
      }
      const device_code = genDeviceCode(phone);
      const ph = hashPwd(password);
      await pool.query(
        `INSERT INTO portal_phones (phone, password_hash, device_code, nickname)
         VALUES (?, ?, ?, ?)`,
        [phone, ph, device_code, nickname || null]
      );
      await pool.query(`INSERT IGNORE INTO portal_devices (device_code) VALUES (?)`, [device_code]);
      res.json({ code: 0, data: { device_code, is_new: true, nickname: nickname || null } });
    } else {
      // 已注册：校验密码
      const row = rows[0];
      if (row.password_hash) {
        if (!password) {
          return res.status(400).json({ code: 400, message: '请输入密码' });
        }
        if (row.password_hash !== hashPwd(password)) {
          return res.status(401).json({ code: 401, message: '密码错误' });
        }
      }
      await pool.query('UPDATE portal_phones SET last_seen = NOW() WHERE phone = ?', [phone]);
      res.json({
        code: 0,
        data: {
          device_code: row.device_code,
          is_new: false,
          nickname: row.nickname || null
        }
      });
    }
  } catch (e) {
    console.error('门户登录失败:', e);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ---------- 2. 检查手机号是否已注册 ----------
// GET /api/portal/phone/check?phone=xxx
router.get('/phone/check', async (req, res) => {
  const { phone } = req.query;
  if (!isValidPhone(phone)) {
    return res.status(400).json({ code: 400, message: '手机号格式不对' });
  }
  try {
    const [rows] = await pool.query('SELECT phone FROM portal_phones WHERE phone = ?', [phone]);
    res.json({ code: 0, data: { exists: rows.length > 0 } });
  } catch (e) {
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ---------- 3. 修改密码 ----------
// POST /api/portal/phone/change-password { phone, old_password, new_password }
router.post('/phone/change-password', async (req, res) => {
  const { phone, old_password, new_password } = req.body || {};
  if (!isValidPhone(phone) || !old_password || !new_password || new_password.length < 4) {
    return res.status(400).json({ code: 400, message: '参数不完整' });
  }
  try {
    const [rows] = await pool.query('SELECT password_hash FROM portal_phones WHERE phone = ?', [phone]);
    if (rows.length === 0) return res.status(404).json({ code: 404, message: '手机号未注册' });
    if (rows[0].password_hash !== hashPwd(old_password)) {
      return res.status(401).json({ code: 401, message: '旧密码错误' });
    }
    await pool.query('UPDATE portal_phones SET password_hash = ? WHERE phone = ?', [hashPwd(new_password), phone]);
    res.json({ code: 0, message: '密码已修改' });
  } catch (e) {
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ---------- 4. 拉取全部数据 ----------
router.get('/sync', async (req, res) => {
  const { device_code } = req.query;
  if (!device_code || typeof device_code !== 'string') {
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
      catch (_) {}
    }
    pool.query('UPDATE portal_devices SET last_seen = NOW() WHERE device_code = ?', [device_code]).catch(()=>{});
    res.json({ code: 0, data: { items, server_time: Date.now() } });
  } catch (e) {
    console.error('门户拉取失败:', e);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// ---------- 5. 推送数据 ----------
router.post('/sync', async (req, res) => {
  const { device_code, items } = req.body || {};
  if (!device_code || typeof device_code !== 'string') {
    return res.status(400).json({ code: 400, message: '设备码无效' });
  }
  if (!items || typeof items !== 'object') {
    return res.status(400).json({ code: 400, message: '数据格式错误' });
  }
  try {
    await pool.query(`INSERT IGNORE INTO portal_devices (device_code) VALUES (?)`, [device_code]);
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
