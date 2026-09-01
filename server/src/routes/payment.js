const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 收款码上传目录
const QR_UPLOAD_DIR = path.join(__dirname, '../../uploads/payment_qr');
if (!fs.existsSync(QR_UPLOAD_DIR)) {
  fs.mkdirSync(QR_UPLOAD_DIR, { recursive: true });
}

// 渠道列表
router.get('/channels', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, channel_code, channel_name, channel_type, fee_rate, fee_fixed,
              is_enabled, is_default, sort_order, remark,
              wechat_appid, wechat_mch_id, wechat_notify_url,
              alipay_app_id, alipay_notify_url, alipay_sandbox,
              bank_name, bank_account_name, bank_account_no, bank_branch,
              qrcode_url
       FROM payment_channels WHERE tenant_id = ? ORDER BY sort_order ASC, id ASC`,
      [req.tenantId]
    );
    // 脱敏：不返回完整密钥
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('获取支付渠道失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 新增/更新渠道配置
router.put('/channels/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { channel_name, is_enabled, is_default, fee_rate, fee_fixed, sort_order, remark,
      wechat_appid, wechat_mch_id, wechat_api_key, wechat_cert_path, wechat_notify_url,
      alipay_app_id, alipay_private_key, alipay_public_key, alipay_notify_url, alipay_sandbox,
      bank_name, bank_account_name, bank_account_no, bank_branch, qrcode_url } = req.body;

    if (is_default) {
      await pool.query('UPDATE payment_channels SET is_default = FALSE WHERE tenant_id = ?', [req.tenantId]);
    }

    const fields = [];
    const values = [];
    const addField = (k, v) => { fields.push(`${k} = ?`); values.push(v ?? null); };

    addField('channel_name', channel_name);
    addField('is_enabled', is_enabled);
    addField('is_default', is_default);
    addField('fee_rate', fee_rate);
    addField('fee_fixed', fee_fixed);
    addField('sort_order', sort_order);
    addField('remark', remark);

    // 微信
    if (wechat_appid !== undefined) addField('wechat_appid', wechat_appid);
    if (wechat_mch_id !== undefined) addField('wechat_mch_id', wechat_mch_id);
    if (wechat_api_key) addField('wechat_api_key', wechat_api_key); // 只在传值时更新
    if (wechat_cert_path !== undefined) addField('wechat_cert_path', wechat_cert_path);
    if (wechat_notify_url !== undefined) addField('wechat_notify_url', wechat_notify_url);
    // 支付宝
    if (alipay_app_id !== undefined) addField('alipay_app_id', alipay_app_id);
    if (alipay_private_key) addField('alipay_private_key', alipay_private_key);
    if (alipay_public_key) addField('alipay_public_key', alipay_public_key);
    if (alipay_notify_url !== undefined) addField('alipay_notify_url', alipay_notify_url);
    if (alipay_sandbox !== undefined) addField('alipay_sandbox', alipay_sandbox);
    // 银行
    if (bank_name !== undefined) addField('bank_name', bank_name);
    if (bank_account_name !== undefined) addField('bank_account_name', bank_account_name);
    if (bank_account_no !== undefined) addField('bank_account_no', bank_account_no);
    if (bank_branch !== undefined) addField('bank_branch', bank_branch);
    // 收款码
    if (qrcode_url !== undefined) addField('qrcode_url', qrcode_url);

    values.push(req.params.id, req.tenantId);
    await pool.query(`UPDATE payment_channels SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
    res.json({ code: 0, message: '渠道配置已保存' });
  } catch (err) {
    console.error('更新支付渠道失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 测试渠道连接（预留接口——实际部署时对接微信/支付宝SDK）
router.post('/channels/:id/test', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [[ch]] = await pool.query(
      'SELECT * FROM payment_channels WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!ch) return res.status(404).json({ code: 404, message: '渠道不存在' });

    // TODO: 实际对接时调用对应SDK验证
    // 微信支付：调用沙箱下单接口验证
    // 支付宝：调用alipay.trade.query测试
    // 银行：验证账号格式
    const checks = [];
    if (ch.channel_code === 'wechat_pay') {
      if (!ch.wechat_appid) checks.push({ item: 'AppID', ok: false, msg: '未配置' });
      else checks.push({ item: 'AppID', ok: true, msg: ch.wechat_appid });
      if (!ch.wechat_mch_id) checks.push({ item: '商户号', ok: false, msg: '未配置' });
      else checks.push({ item: '商户号', ok: true, msg: ch.wechat_mch_id });
      if (!ch.wechat_api_key) checks.push({ item: 'API密钥', ok: false, msg: '未配置' });
      else checks.push({ item: 'API密钥', ok: true, msg: '******' });
    } else if (ch.channel_code === 'alipay') {
      if (!ch.alipay_app_id) checks.push({ item: '应用ID', ok: false, msg: '未配置' });
      else checks.push({ item: '应用ID', ok: true, msg: ch.alipay_app_id });
      if (!ch.alipay_private_key) checks.push({ item: '应用私钥', ok: false, msg: '未配置' });
      else checks.push({ item: '应用私钥', ok: true, msg: '******' });
      if (!ch.alipay_public_key) checks.push({ item: '支付宝公钥', ok: false, msg: '未配置' });
      else checks.push({ item: '支付宝公钥', ok: true, msg: '******' });
    } else if (ch.channel_code === 'bank_transfer') {
      if (!ch.bank_name) checks.push({ item: '开户银行', ok: false, msg: '未配置' });
      else checks.push({ item: '开户银行', ok: true, msg: ch.bank_name });
      if (!ch.bank_account_no) checks.push({ item: '银行账号', ok: false, msg: '未配置' });
      else checks.push({ item: '银行账号', ok: true, msg: ch.bank_account_no.replace(/.(?=.{4})/g, '*') });
    } else {
      checks.push({ item: '现金渠道', ok: true, msg: '无需配置，直接可用' });
    }

    const allOk = checks.every(c => c.ok);
    res.json({
      code: 0,
      data: {
        status: allOk ? 'ready' : 'incomplete',
        message: allOk ? '配置完整，可启用' : '配置不完整，请补充必填项',
        checks
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ========== 收款码上传 ==========

// 上传收款码图片（接收二进制文件数据）
router.post('/qrcode/upload', requireRole('owner', 'manager'), express.raw({
  type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'],
  limit: '5mb'
}), async (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ code: 400, message: '未收到图片数据' });
    }
    const contentType = req.headers['content-type'] || 'image/png';
    const extMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };
    const ext = extMap[contentType] || 'png';
    const channelCode = req.query.channel || 'default';
    const fileName = `qr_${channelCode}_${req.tenantId}_${Date.now()}.${ext}`;
    const filePath = path.join(QR_UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, req.body);

    const url = `/api/uploads/payment_qr/${fileName}`;
    
    // 如果提供了channel_id，自动更新对应渠道的qrcode_url
    const channelId = req.query.channel_id;
    if (channelId) {
      await pool.query(
        'UPDATE payment_channels SET qrcode_url = ? WHERE id = ? AND tenant_id = ?',
        [url, parseInt(channelId), req.tenantId]
      );
    }

    res.json({ code: 0, data: { url, fileName } });
  } catch (err) {
    console.error('上传收款码失败:', err);
    res.status(500).json({ code: 500, message: '上传失败: ' + err.message });
  }
});

// ========== 支付交易流水 ==========

// 生成交易流水号
const genTxNo = () => {
  return 'PAY' + dayjs().format('YYYYMMDDHHmmss') + Math.random().toString(36).slice(2, 8).toUpperCase();
};

// 创建支付交易（业务单据调用，如销售单、采购付款等）
router.post('/transactions', requireRole('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const { channel_id, biz_type, biz_order_type, biz_order_id, biz_order_no, amount, payer_info, remark } = req.body;
    if (!channel_id || !amount) return res.status(400).json({ code: 400, message: '缺少必要参数' });

    const [[ch]] = await pool.query(
      'SELECT * FROM payment_channels WHERE id = ? AND tenant_id = ? AND is_enabled = TRUE',
      [channel_id, req.tenantId]
    );
    if (!ch) return res.status(400).json({ code: 400, message: '支付渠道不可用' });

    const fee = parseFloat(amount) * parseFloat(ch.fee_rate || 0) + parseFloat(ch.fee_fixed || 0);
    const txNo = genTxNo();

    const [result] = await pool.query(
      `INSERT INTO payment_transactions
       (tenant_id, transaction_no, channel_id, channel_code, biz_type, biz_order_type, biz_order_id, biz_order_no,
        amount, fee, status, payer_info, remark, operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [req.tenantId, txNo, channel_id, ch.channel_code, biz_type, biz_order_type || null,
       biz_order_id || null, biz_order_no || null, amount, fee, payer_info || null, remark || null, req.user.id]
    );

    // TODO: 对接实际支付网关（微信/支付宝统一下单，银行转账生成收款码等）
    // 目前返回支付链接/二维码占位
    res.json({
      code: 0,
      message: '支付交易已创建',
      data: {
        id: result.insertId,
        transaction_no: txNo,
        amount: parseFloat(amount),
        fee: parseFloat(fee.toFixed(2)),
        net_amount: parseFloat((amount - fee).toFixed(2)),
        pay_url: ch.channel_type === 'online' ? `#pending-integration-${txNo}` : null,
        status: 'pending'
      }
    });
  } catch (err) {
    console.error('创建支付交易失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 交易列表
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, channel_code, biz_type, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE pt.tenant_id = ?';
    const params = [req.tenantId];
    if (status) { where += ' AND pt.status = ?'; params.push(status); }
    if (channel_code) { where += ' AND pt.channel_code = ?'; params.push(channel_code); }
    if (biz_type) { where += ' AND pt.biz_type = ?'; params.push(biz_type); }
    if (startDate) { where += ' AND pt.created_at >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND pt.created_at <= ?'; params.push(endDate + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM payment_transactions pt ${where}`, params);
    const [rows] = await pool.query(
      `SELECT pt.*, pc.channel_name, u.real_name as operator_name
       FROM payment_transactions pt
       LEFT JOIN payment_channels pc ON pt.channel_id = pc.id
       LEFT JOIN users u ON pt.operator_id = u.id
       ${where} ORDER BY pt.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    res.json({ code: 0, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 支付回调接口（预留——微信/支付宝异步通知）
router.post('/callback/:channel', async (req, res) => {
  // TODO: 验证签名，更新交易状态
  // 微信：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_1.shtml
  // 支付宝：https://opendocs.alipay.com/open/204/105301
  console.log(`[${req.params.channel}] 支付回调:`, req.body);
  res.json({ code: 'SUCCESS' });
});

// 手动确认收款（线下/银行转账）
router.post('/transactions/:id/confirm', requireRole('owner', 'manager', 'cashier'), async (req, res) => {
  try {
    const { third_party_no } = req.body;
    await pool.query(
      "UPDATE payment_transactions SET status = 'success', third_party_no = ?, pay_time = NOW() WHERE id = ? AND tenant_id = ? AND status = 'pending'",
      [third_party_no || null, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '收款已确认' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
