const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

async function getDefaultBookId(tenantId, bookId) {
  if (bookId) return bookId;
  const [books] = await pool.query(
    'SELECT id FROM accounting_books WHERE tenant_id = ? AND is_active = TRUE ORDER BY id ASC LIMIT 1',
    [tenantId]
  );
  if (!books.length) throw new Error('当前租户暂无账套');
  return books[0].id;
}

// 计算指定期间收入/费用净额
async function calcProfitLoss(bid, startDate, endDate) {
  const [rows] = await pool.query(
    `SELECT a.category,
       COALESCE(SUM(CASE WHEN vi.debit_amount > 0 THEN vi.debit_amount ELSE 0 END),0) AS d,
       COALESCE(SUM(CASE WHEN vi.credit_amount > 0 THEN vi.credit_amount ELSE 0 END),0) AS c
     FROM accounting_accounts a
     JOIN voucher_items vi ON vi.account_id = a.id
     JOIN vouchers v ON v.id = vi.voucher_id
     WHERE a.book_id = ? AND a.category IN ('revenue','expense')
       AND v.status IN ('audited','posted') AND v.is_balanced = TRUE
       AND v.voucher_date >= ? AND v.voucher_date <= ?
     GROUP BY a.category`,
    [bid, startDate, endDate]
  );
  let revenue = 0, expense = 0;
  rows.forEach(r => {
    if (r.category === 'revenue') revenue = parseFloat(r.c) - parseFloat(r.d); // 收入净额=贷-借
    if (r.category === 'expense') expense = parseFloat(r.d) - parseFloat(r.c); // 费用净额=借-贷
  });
  return { revenue, expense, profit: revenue - expense };
}

// =================== 结转状态查询 ===================
router.get('/status', async (req, res) => {
  try {
    const { book_id, period } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const targetPeriod = period || dayjs().format('YYYY-MM');
    const [closures] = await pool.query(
      'SELECT pc.*, v.voucher_no, u.real_name AS closed_by_name FROM period_closures pc LEFT JOIN vouchers v ON v.id=pc.voucher_id LEFT JOIN users u ON u.id=pc.closed_by WHERE pc.book_id = ? AND period = ?',
      [bid, targetPeriod]
    );
    const startDate = dayjs(targetPeriod).startOf('month').format('YYYY-MM-DD');
    const endDate = dayjs(targetPeriod).endOf('month').format('YYYY-MM-DD');
    const { revenue, expense, profit } = await calcProfitLoss(bid, startDate, endDate);

    res.json({
      code: 0,
      data: {
        period: targetPeriod,
        is_closed: closures.length > 0 && closures[0].status === 'closed',
        closure: closures[0] || null,
        revenue,
        expense,
        profit,
        start_date: startDate,
        end_date: endDate,
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '查询结转状态失败: ' + err.message });
  }
});

// =================== 期末结转损益 ===================
// 将本期收入、费用科目余额结转至 4103 本年利润，生成一张记账凭证
router.post('/close', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { book_id, period, remark } = req.body;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const targetPeriod = period || dayjs().format('YYYY-MM');

    await conn.beginTransaction();

    // 检查是否已结转
    const [existing] = await conn.query(
      'SELECT id FROM period_closures WHERE book_id = ? AND period = ? FOR UPDATE',
      [bid, targetPeriod]
    );
    if (existing.length) {
      await conn.rollback();
      return res.status(400).json({ code: 400, message: `${targetPeriod} 期间已结转，请勿重复操作` });
    }

    const startDate = dayjs(targetPeriod).startOf('month').format('YYYY-MM-DD');
    const endDate = dayjs(targetPeriod).endOf('month').format('YYYY-MM-DD');

    // 取本期各收入/费用科目发生额
    const [accRows] = await conn.query(
      `SELECT a.id, a.code, a.name, a.category, a.direction,
         COALESCE(SUM(CASE WHEN vi.debit_amount > 0 THEN vi.debit_amount ELSE 0 END),0) AS d,
         COALESCE(SUM(CASE WHEN vi.credit_amount > 0 THEN vi.credit_amount ELSE 0 END),0) AS c
       FROM accounting_accounts a
       LEFT JOIN voucher_items vi ON vi.account_id = a.id
       LEFT JOIN vouchers v ON v.id = vi.voucher_id
         AND v.status IN ('audited','posted') AND v.is_balanced = TRUE
         AND v.voucher_date >= ? AND v.voucher_date <= ?
       WHERE a.book_id = ? AND a.category IN ('revenue','expense') AND a.is_enabled = TRUE
       GROUP BY a.id, a.code, a.name, a.category, a.direction
       HAVING (d + c) > 0
       ORDER BY a.code ASC`,
      [startDate, endDate, bid]
    );

    if (!accRows.length) {
      await conn.rollback();
      return res.status(400).json({ code: 400, message: '本期无收入/费用发生额，无需结转' });
    }

    // 找本年利润科目（兼容4103企业准则和3104小企业准则）
    const [profitAcc] = await conn.query(
      "SELECT id FROM accounting_accounts WHERE book_id = ? AND code IN ('4103','3104') ORDER BY code LIMIT 1",
      [bid]
    );
    if (!profitAcc.length) {
      await conn.rollback();
      return res.status(400).json({ code: 400, message: '未找到本年利润科目(4103/3104)，请检查科目设置' });
    }
    const profitAccountId = profitAcc[0].id;

    // 生成结转凭证
    const voucherDate = endDate;
    const month = dayjs(voucherDate).format('YYYYMM');
    const [lastV] = await conn.query(
      "SELECT voucher_no FROM vouchers WHERE book_id = ? AND voucher_no LIKE ? ORDER BY voucher_no DESC LIMIT 1",
      [bid, `结-${month}-%`]
    );
    let seq = 1;
    if (lastV.length) {
      seq = parseInt(lastV[0].voucher_no.split('-')[2] || '0') + 1;
    }
    const voucherNo = `结-${month}-${String(seq).padStart(4, '0')}`;

    // 计算总收入/总费用和净利润
    let totalRevenue = 0, totalExpense = 0;
    accRows.forEach(r => {
      if (r.category === 'revenue') totalRevenue += parseFloat(r.c) - parseFloat(r.d);
      else totalExpense += parseFloat(r.d) - parseFloat(r.c);
    });
    const netProfit = totalRevenue - totalExpense;

    const [vResult] = await conn.query(
      `INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, attachment_count,
         total_debit, total_credit, is_balanced, status, remark, creator_id, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [bid, 'transfer', voucherNo, voucherDate, 0,
       Math.abs(totalRevenue) + Math.abs(totalExpense) > 0 ? (totalRevenue > 0 ? totalRevenue : 0) + (totalExpense > 0 ? totalExpense : 0) : 0,
       0, 0, 'posted', remark || `期末结转损益（${targetPeriod}）`, req.user.id]
    );
    const voucherId = vResult.insertId;
    let lineNo = 1;
    let totalDebit = 0, totalCredit = 0;

    // 收入类：借记收入科目（冲平贷方余额），贷记本年利润
    for (const r of accRows) {
      if (r.category !== 'revenue') continue;
      const balance = parseFloat(r.c) - parseFloat(r.d); // 贷方余额
      if (balance <= 0) continue;
      await conn.query(
        `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
         VALUES (?,?,?,?,?,?)`,
        [voucherId, lineNo++, r.id, `结转${r.name}`, balance, 0]
      );
      totalDebit += balance;
    }
    // 费用类：借记本年利润，贷记费用科目（冲平借方余额）
    for (const r of accRows) {
      if (r.category !== 'expense') continue;
      const balance = parseFloat(r.d) - parseFloat(r.c); // 借方余额
      if (balance <= 0) continue;
      await conn.query(
        `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
         VALUES (?,?,?,?,?,?)`,
        [voucherId, lineNo++, r.id, `结转${r.name}`, 0, balance]
      );
      totalCredit += balance;
    }
    // 本年利润科目：净利润在贷方（盈利），净亏损在借方
    if (netProfit >= 0) {
      totalCredit += netProfit;
      await conn.query(
        `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
         VALUES (?,?,?,?,?,?)`,
        [voucherId, lineNo, profitAccountId, '结转本年利润', 0, netProfit]
      );
    } else {
      totalDebit += Math.abs(netProfit);
      await conn.query(
        `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
         VALUES (?,?,?,?,?,?)`,
        [voucherId, lineNo, profitAccountId, '结转本年利润（亏损）', Math.abs(netProfit), 0]
      );
    }

    // 更新凭证借贷合计
    await conn.query(
      'UPDATE vouchers SET total_debit = ?, total_credit = ?, is_balanced = TRUE, post_time = NOW() WHERE id = ?',
      [totalDebit, totalCredit, voucherId]
    );

    // 记录结转
    await conn.query(
      `INSERT INTO period_closures (book_id, period, status, voucher_id, total_revenue, total_expense, net_profit, is_balanced, closed_at, closed_by, created_at)
       VALUES (?,?,?, 'closed', ?,?,?,?, TRUE, NOW(), ?, NOW())`,
      [bid, targetPeriod, voucherId, totalRevenue, totalExpense, netProfit, req.user.id]
    );

    await conn.commit();
    res.json({
      code: 0,
      message: `${targetPeriod} 期末结转成功`,
      data: {
        voucher_id: voucherId,
        voucher_no: voucherNo,
        total_revenue: totalRevenue,
        total_expense: totalExpense,
        net_profit: netProfit,
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('期末结转失败:', err);
    res.status(500).json({ code: 500, message: '期末结转失败: ' + err.message });
  } finally {
    conn.release();
  }
});

// =================== 结转历史 ===================
router.get('/history', async (req, res) => {
  try {
    const { book_id } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const [rows] = await pool.query(
      `SELECT pc.*, v.voucher_no, u.real_name AS closed_by_name
       FROM period_closures pc
       LEFT JOIN vouchers v ON v.id = pc.voucher_id
       LEFT JOIN users u ON u.id = pc.closed_by
       WHERE pc.book_id = ?
       ORDER BY pc.period DESC`,
      [bid]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: '查询结转历史失败: ' + err.message });
  }
});

module.exports = router;
