const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取供应商列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, supplier_type, enabled } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (keyword) {
      where += ' AND (name LIKE ? OR contact_name LIKE ? OR phone LIKE ? OR credit_code LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (supplier_type) { where += ' AND supplier_type = ?'; params.push(supplier_type); }
    if (enabled === '0' || enabled === '1') { where += ' AND enabled = ?'; params.push(parseInt(enabled)); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM suppliers ${where}`, params);

    const [suppliers] = await pool.query(
      `SELECT * FROM suppliers ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 统计采购数据
    for (const s of suppliers) {
      const [[stats]] = await pool.query(
        `SELECT COUNT(*) as totalOrders, COALESCE(SUM(total_amount),0) as totalAmount,
                COALESCE(SUM(paid_amount),0) as paidAmount
         FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?`,
        [s.id, req.tenantId]
      );
      s.totalOrders = stats.totalOrders;
      s.totalAmount = stats.totalAmount;
      s.paidAmount = stats.paidAmount;
      s.unpaidAmount = parseFloat(stats.totalAmount) - parseFloat(stats.paidAmount);
    }

    res.json({
      code: 0,
      data: { list: suppliers, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (err) {
    console.error('获取供应商列表失败:', err);
    res.status(500).json({ code: 500, message: '获取供应商列表失败' });
  }
});

// 获取所有供应商（下拉选择用，不分页）
router.get('/all/list', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, contact_name, phone, supplier_type, enabled FROM suppliers
       WHERE tenant_id=? AND enabled=1 ORDER BY name ASC`,
      [req.tenantId]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 获取供应商详情
router.get('/:id', async (req, res) => {
  try {
    const [[s]] = await pool.query(
      'SELECT * FROM suppliers WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!s) return res.status(404).json({ code: 404, message: '供应商不存在' });

    const [orders] = await pool.query(
      `SELECT id, order_no, order_date, total_amount, paid_amount, status
       FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ? ORDER BY order_date DESC LIMIT 20`,
      [req.params.id, req.tenantId]
    );
    s.recentOrders = orders;

    // 采购统计
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount),0) as total_amount,
              COALESCE(SUM(paid_amount),0) as paid_amount
       FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?`,
      [req.params.id, req.tenantId]
    );
    s.stats = stats;

    res.json({ code: 0, data: s });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取供应商详情失败' });
  }
});

// 新增供应商
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const f = req.body;
    if (!f.name) throw new Error('供应商名称不能为空');

    const [result] = await pool.query(
      `INSERT INTO suppliers
       (tenant_id, name, supplier_type, credit_code, contact_name, contact_position, phone, email,
        address, tax_number, invoice_title, bank_name, bank_account_name, bank_account, bank_branch,
        payment_terms, cooperation_start_date, rating, enabled, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, f.name, f.supplier_type || 'company', f.credit_code || null,
       f.contact_name || null, f.contact_position || null, f.phone || null, f.email || null,
       f.address || null, f.tax_number || null, f.invoice_title || null,
       f.bank_name || null, f.bank_account_name || null, f.bank_account || null, f.bank_branch || null,
       f.payment_terms || null, f.cooperation_start_date || null, f.rating || 5,
       f.enabled !== false ? 1 : 0, f.remark || null]
    );
    res.json({ code: 0, message: '供应商添加成功', data: { id: result.insertId } });
  } catch (err) {
    console.error('新增供应商失败:', err);
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新供应商
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const f = req.body;
    await pool.query(
      `UPDATE suppliers SET
        name=?, supplier_type=?, credit_code=?, contact_name=?, contact_position=?,
        phone=?, email=?, address=?, tax_number=?, invoice_title=?,
        bank_name=?, bank_account_name=?, bank_account=?, bank_branch=?,
        payment_terms=?, cooperation_start_date=?, rating=?, enabled=?, remark=?
       WHERE id=? AND tenant_id=?`,
      [f.name, f.supplier_type || 'company', f.credit_code || null,
       f.contact_name || null, f.contact_position || null, f.phone || null, f.email || null,
       f.address || null, f.tax_number || null, f.invoice_title || null,
       f.bank_name || null, f.bank_account_name || null, f.bank_account || null, f.bank_branch || null,
       f.payment_terms || null, f.cooperation_start_date || null, f.rating || 5,
       f.enabled !== false ? 1 : 0, f.remark || null,
       req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '供应商更新成功' });
  } catch (err) {
    console.error('更新供应商失败:', err);
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除（停用）
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [[{cnt}]] = await pool.query(
      'SELECT COUNT(*) as cnt FROM purchase_orders WHERE supplier_id=? AND tenant_id=?',
      [req.params.id, req.tenantId]
    );
    if (cnt > 0) {
      // 有关联单据，改为停用
      await pool.query('UPDATE suppliers SET enabled=0 WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
      return res.json({ code: 0, message: '该供应商有采购记录，已设为停用' });
    }
    await pool.query('DELETE FROM suppliers WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '供应商已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

module.exports = router;
