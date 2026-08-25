const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 凭证类型中文映射
const voucherTypeMap = { receipt: '收', payment: '付', transfer: '转', general: '记' };

// 辅助：获取当前租户的默认账套ID
async function getDefaultBookId(tenantId, bookId) {
  if (bookId) return bookId;
  const [books] = await pool.query(
    'SELECT id FROM accounting_books WHERE tenant_id = ? AND is_active = TRUE ORDER BY id ASC LIMIT 1',
    [tenantId]
  );
  if (!books.length) throw new Error('当前租户暂无账套');
  return books[0].id;
}

// 辅助：生成凭证编号
async function generateVoucherNo(conn, bookId, voucherType, voucherDate) {
  const prefix = voucherTypeMap[voucherType] || '记';
  const month = dayjs(voucherDate).format('YYYYMM');
  const pattern = `${prefix}-${month}-%`;

  const [last] = await conn.query(
    `SELECT voucher_no FROM vouchers WHERE book_id = ? AND voucher_no LIKE ? ORDER BY voucher_no DESC LIMIT 1`,
    [bookId, pattern]
  );

  let seq = 1;
  if (last.length) {
    const parts = last[0].voucher_no.split('-');
    seq = parseInt(parts[2] || '0') + 1;
  }
  return `${prefix}-${month}-${String(seq).padStart(4, '0')}`;
}

// 获取凭证列表
router.get('/', async (req, res) => {
  try {
    const { book_id, status, voucher_type, start_date, end_date, keyword, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);

    let where = 'WHERE v.book_id = ?';
    const params = [bid];

    if (status) { where += ' AND v.status = ?'; params.push(status); }
    if (voucher_type) { where += ' AND v.voucher_type = ?'; params.push(voucher_type); }
    if (start_date) { where += ' AND v.voucher_date >= ?'; params.push(start_date); }
    if (end_date) { where += ' AND v.voucher_date <= ?'; params.push(end_date); }
    if (keyword) {
      where += ' AND (v.voucher_no LIKE ? OR v.remark LIKE ? OR EXISTS(SELECT 1 FROM voucher_items vi WHERE vi.voucher_id = v.id AND vi.summary LIKE ?))';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM vouchers v ${where}`, params);

    const [vouchers] = await pool.query(
      `SELECT v.*, 
        u1.real_name as creator_name, u2.real_name as auditor_name
       FROM vouchers v
       LEFT JOIN users u1 ON v.creator_id = u1.id
       LEFT JOIN users u2 ON v.auditor_id = u2.id
       ${where} ORDER BY v.voucher_date DESC, v.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 汇总统计
    const [summary] = await pool.query(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(total_debit), 0) as total_amount,
        SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN status='audited' THEN 1 ELSE 0 END) as audited_count
       FROM vouchers WHERE book_id = ?`,
      [bid]
    );

    res.json({
      code: 0,
      data: {
        list: vouchers,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        summary: summary[0]
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取凭证列表失败: ' + err.message });
  }
});

// 获取凭证详情
router.get('/:id', async (req, res) => {
  try {
    const [vouchers] = await pool.query(
      `SELECT v.*, u1.real_name as creator_name, u2.real_name as auditor_name
       FROM vouchers v
       LEFT JOIN users u1 ON v.creator_id = u1.id
       LEFT JOIN users u2 ON v.auditor_id = u2.id
       WHERE v.id = ?`,
      [req.params.id]
    );
    if (!vouchers.length) return res.status(404).json({ code: 404, message: '凭证不存在' });

    // 凭证明细行
    const [items] = await pool.query(
      `SELECT vi.*, a.code as account_code, a.name as account_name, a.category as account_category
       FROM voucher_items vi
       JOIN accounting_accounts a ON vi.account_id = a.id
       WHERE vi.voucher_id = ?
       ORDER BY vi.line_no ASC`,
      [req.params.id]
    );

    // 关联印章
    const [seals] = await pool.query(
      `SELECT vs.*, s.seal_name, s.seal_code, s.seal_type, s.image_url, s.is_filed
       FROM voucher_seals vs
       JOIN seals s ON vs.seal_id = s.id
       WHERE vs.voucher_id = ?`,
      [req.params.id]
    );

    res.json({
      code: 0,
      data: {
        ...vouchers[0],
        items,
        seals
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取凭证详情失败: ' + err.message });
  }
});

// 新建凭证
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { book_id, voucher_type = 'general', voucher_date, attachment_count = 0, items, remark } = req.body;

    if (!items || !Array.isArray(items) || items.length < 2) {
      throw new Error('凭证明细至少需要两行');
    }
    if (!voucher_date) throw new Error('凭证日期不能为空');

    const bid = await getDefaultBookId(req.tenantId, book_id);

    // 校验借贷平衡
    let totalDebit = 0, totalCredit = 0;
    for (const item of items) {
      if (!item.account_id) throw new Error('明细行科目不能为空');
      if (!item.summary) throw new Error('明细行摘要不能为空');
      const d = parseFloat(item.debit_amount) || 0;
      const c = parseFloat(item.credit_amount) || 0;
      if (d > 0 && c > 0) throw new Error(`摘要"${item.summary}"：借方和贷方不能同时有金额`);
      if (d === 0 && c === 0) throw new Error(`摘要"${item.summary}"：借方和贷方不能同时为零`);
      totalDebit += d;
      totalCredit += c;
    }

    // 精度处理（保留2位小数比较）
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      throw new Error(`借贷不平衡！借方合计 ¥${totalDebit.toFixed(2)} ≠ 贷方合计 ¥${totalCredit.toFixed(2)}，差额 ¥${(totalDebit - totalCredit).toFixed(2)}`);
    }

    const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

    // 生成凭证编号
    const voucherNo = await generateVoucherNo(conn, bid, voucher_type, voucher_date);

    // 插入凭证头
    const [result] = await conn.query(
      `INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, attachment_count, total_debit, total_credit, is_balanced, status, creator_id, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [bid, voucher_type, voucherNo, voucher_date, attachment_count, totalDebit, totalCredit, isBalanced, req.user.id, remark || null]
    );
    const voucherId = result.insertId;

    // 插入明细行
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await conn.query(
        `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [voucherId, i + 1, item.account_id, item.summary, parseFloat(item.debit_amount) || 0, parseFloat(item.credit_amount) || 0]
      );
    }

    await conn.commit();
    res.json({ code: 0, message: '凭证保存成功', data: { id: voucherId, voucher_no: voucherNo } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 修改凭证（仅draft状态）
router.put('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 检查状态
    const [existing] = await conn.query('SELECT * FROM vouchers WHERE id = ?', [req.params.id]);
    if (!existing.length) throw new Error('凭证不存在');
    if (existing[0].status !== 'draft') throw new Error('只有草稿状态的凭证可以修改');

    const { voucher_date, attachment_count, items, remark } = req.body;

    // 校验借贷平衡
    let totalDebit = 0, totalCredit = 0;
    for (const item of items) {
      const d = parseFloat(item.debit_amount) || 0;
      const c = parseFloat(item.credit_amount) || 0;
      if (d > 0 && c > 0) throw new Error(`摘要"${item.summary}"：借贷不能同时有金额`);
      if (d === 0 && c === 0) throw new Error(`摘要"${item.summary}"：借贷不能同时为零`);
      totalDebit += d;
      totalCredit += c;
    }

    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      throw new Error(`借贷不平衡！借方 ¥${totalDebit.toFixed(2)} ≠ 贷方 ¥${totalCredit.toFixed(2)}`);
    }

    // 更新凭证头
    await conn.query(
      `UPDATE vouchers SET voucher_date = COALESCE(?, voucher_date), attachment_count = COALESCE(?, attachment_count),
       total_debit = ?, total_credit = ?, is_balanced = ?, remark = COALESCE(?, remark)
       WHERE id = ?`,
      [voucher_date || null, attachment_count !== undefined ? attachment_count : null,
       totalDebit, totalCredit, true, remark || null, req.params.id]
    );

    // 删除旧明细，重新插入
    await conn.query('DELETE FROM voucher_items WHERE voucher_id = ?', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await conn.query(
        `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.params.id, i + 1, item.account_id, item.summary, parseFloat(item.debit_amount) || 0, parseFloat(item.credit_amount) || 0]
      );
    }

    await conn.commit();
    res.json({ code: 0, message: '凭证更新成功' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 删除凭证（仅draft状态）
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT status FROM vouchers WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ code: 404, message: '凭证不存在' });
    if (existing[0].status !== 'draft') return res.status(400).json({ code: 400, message: '只有草稿状态的凭证可以删除' });

    await pool.query('DELETE FROM voucher_items WHERE voucher_id = ?', [req.params.id]);
    await pool.query('DELETE FROM voucher_seals WHERE voucher_id = ?', [req.params.id]);
    await pool.query('DELETE FROM vouchers WHERE id = ?', [req.params.id]);
    res.json({ code: 0, message: '凭证已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败: ' + err.message });
  }
});

// 审核凭证
router.post('/:id/audit', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM vouchers WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ code: 404, message: '凭证不存在' });
    if (existing[0].status !== 'draft') return res.status(400).json({ code: 400, message: '只有草稿状态可以审核' });
    if (!existing[0].is_balanced) return res.status(400).json({ code: 400, message: '凭证借贷不平衡，无法审核' });

    await pool.query(
      `UPDATE vouchers SET status = 'audited', auditor_id = ?, audit_time = NOW() WHERE id = ?`,
      [req.user.id, req.params.id]
    );
    res.json({ code: 0, message: '凭证审核通过' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 作废凭证
router.post('/:id/void', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT status FROM vouchers WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ code: 404, message: '凭证不存在' });
    if (existing[0].status === 'void') return res.status(400).json({ code: 400, message: '凭证已经是作废状态' });

    await pool.query('UPDATE vouchers SET status = ? WHERE id = ?', ['void', req.params.id]);
    res.json({ code: 0, message: '凭证已作废' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 试算平衡表
router.get('/report/trial-balance', async (req, res) => {
  try {
    const { book_id, period } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const targetPeriod = period || dayjs().format('YYYY-MM');

    // 获取所有科目及其在指定期间的发生额
    const [rows] = await pool.query(
      `SELECT 
        a.id, a.code, a.name, a.category, a.direction,
        COALESCE(ab.opening_debit, 0) as opening_debit,
        COALESCE(ab.opening_credit, 0) as opening_credit,
        COALESCE(SUM(CASE WHEN vi.debit_amount > 0 THEN vi.debit_amount ELSE 0 END), 0) as current_debit,
        COALESCE(SUM(CASE WHEN vi.credit_amount > 0 THEN vi.credit_amount ELSE 0 END), 0) as current_credit
       FROM accounting_accounts a
       LEFT JOIN account_balances ab ON ab.account_id = a.id AND ab.book_id = a.book_id AND ab.period = ?
       LEFT JOIN vouchers v ON v.book_id = a.book_id AND v.voucher_date >= ? AND v.voucher_date <= ? AND v.status IN ('audited', 'posted') AND v.is_balanced = TRUE
       LEFT JOIN voucher_items vi ON vi.voucher_id = v.id AND vi.account_id = a.id
       WHERE a.book_id = ? AND a.is_enabled = TRUE
       GROUP BY a.id, a.code, a.name, a.category, a.direction, ab.opening_debit, ab.opening_credit
       HAVING (opening_debit + opening_credit + current_debit + current_credit) > 0
       ORDER BY a.code ASC`,
      [targetPeriod, dayjs(targetPeriod).startOf('month').format('YYYY-MM-DD'), dayjs(targetPeriod).endOf('month').format('YYYY-MM-DD'), bid]
    );

    // 计算期末余额
    const result = rows.map(r => {
      const closingDebit = parseFloat(r.opening_debit) + parseFloat(r.current_debit);
      const closingCredit = parseFloat(r.opening_credit) + parseFloat(r.current_credit);
      
      // 根据科目方向计算净余额
      let netClosing = 0;
      if (r.direction === 'debit') {
        netClosing = closingDebit - closingCredit;
      } else {
        netClosing = closingCredit - closingDebit;
      }

      return {
        ...r,
        closing_debit: r.direction === 'debit' ? Math.max(netClosing, 0) : 0,
        closing_credit: r.direction === 'credit' ? Math.max(netClosing, 0) : 0,
        net_closing: netClosing
      };
    });

    // 汇总
    const totalOpeningDebit = result.reduce((s, r) => s + parseFloat(r.opening_debit), 0);
    const totalOpeningCredit = result.reduce((s, r) => s + parseFloat(r.opening_credit), 0);
    const totalCurrentDebit = result.reduce((s, r) => s + parseFloat(r.current_debit), 0);
    const totalCurrentCredit = result.reduce((s, r) => s + parseFloat(r.current_credit), 0);
    const totalClosingDebit = result.reduce((s, r) => s + parseFloat(r.closing_debit), 0);
    const totalClosingCredit = result.reduce((s, r) => s + parseFloat(r.closing_credit), 0);

    res.json({
      code: 0,
      data: {
        period: targetPeriod,
        items: result,
        totals: {
          opening_debit: totalOpeningDebit,
          opening_credit: totalOpeningCredit,
          current_debit: totalCurrentDebit,
          current_credit: totalCurrentCredit,
          closing_debit: totalClosingDebit,
          closing_credit: totalClosingCredit,
          is_balanced: Math.round(totalClosingDebit * 100) === Math.round(totalClosingCredit * 100)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取试算平衡表失败: ' + err.message });
  }
});

module.exports = router;
