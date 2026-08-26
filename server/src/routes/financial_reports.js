const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 获取当前租户的默认账套ID
async function getDefaultBookId(tenantId, bookId) {
  if (bookId) return bookId;
  const [books] = await pool.query(
    'SELECT id FROM accounting_books WHERE tenant_id = ? AND is_active = TRUE ORDER BY id ASC LIMIT 1',
    [tenantId]
  );
  if (!books.length) throw new Error('当前租户暂无账套');
  return books[0].id;
}

// 取某账套所有科目（code -> row）
async function getAccounts(bid) {
  const [rows] = await pool.query(
    'SELECT id, code, name, category, direction FROM accounting_accounts WHERE book_id = ? AND is_enabled = TRUE ORDER BY code ASC',
    [bid]
  );
  const map = {};
  rows.forEach(r => { map[r.code] = r; });
  return { rows, map };
}

// 计算各科目在 [start, end] 期间的净发生额及期初余额
// 返回 { code: { openingDebit, openingCredit, periodDebit, periodCredit, closingDebit, closingCredit, net } }
async function computeBalances(bid, startDate, endDate) {
  // 期初：期初之前（不含start）已过账凭证累计
  const [opening] = await pool.query(
    `SELECT vi.account_id,
       COALESCE(SUM(vi.debit_amount),0) AS d,
       COALESCE(SUM(vi.credit_amount),0) AS c
     FROM voucher_items vi
     JOIN vouchers v ON v.id = vi.voucher_id
     WHERE v.book_id = ? AND v.status IN ('audited','posted') AND v.is_balanced = TRUE
       AND v.voucher_date < ?
     GROUP BY vi.account_id`,
    [bid, startDate]
  );
  // 本期发生
  const [period] = await pool.query(
    `SELECT vi.account_id,
       COALESCE(SUM(vi.debit_amount),0) AS d,
       COALESCE(SUM(vi.credit_amount),0) AS c
     FROM voucher_items vi
     JOIN vouchers v ON v.id = vi.voucher_id
     WHERE v.book_id = ? AND v.status IN ('audited','posted') AND v.is_balanced = TRUE
       AND v.voucher_date >= ? AND v.voucher_date <= ?
     GROUP BY vi.account_id`,
    [bid, startDate, endDate]
  );
  const result = {};
  opening.forEach(r => {
    result[r.account_id] = { od: parseFloat(r.d), oc: parseFloat(r.c), pd: 0, pc: 0 };
  });
  period.forEach(r => {
    if (!result[r.account_id]) result[r.account_id] = { od: 0, oc: 0, pd: 0, pc: 0 };
    result[r.account_id].pd = parseFloat(r.d);
    result[r.account_id].pc = parseFloat(r.c);
  });
  return result;
}

// 根据科目方向计算期末余额净值（正数=方向侧余额）
function closingNet(acc, bal) {
  if (!bal) return 0;
  if (acc.direction === 'debit') {
    return (bal.od - bal.oc) + (bal.pd - bal.pc);
  } else {
    return (bal.oc - bal.od) + (bal.pc - bal.pd);
  }
}

// =================== 资产负债表 ===================
// 公式：资产 = 负债 + 所有者权益
router.get('/balance-sheet', async (req, res) => {
  try {
    const { book_id, period } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const targetPeriod = period || dayjs().format('YYYY-MM');
    const startDate = dayjs(targetPeriod).startOf('month').format('YYYY-MM-DD');
    const endDate = dayjs(targetPeriod).endOf('month').format('YYYY-MM-DD');

    const { rows, map } = await getAccounts(bid);
    const balances = await computeBalances(bid, startDate, endDate);

    const val = (code) => {
      const acc = map[code];
      if (!acc) return 0;
      return closingNet(acc, balances[acc.id]);
    };

    // 按科目编码前缀汇总
    const sumByPrefix = (prefixes) => {
      let total = 0;
      rows.forEach(acc => {
        if (prefixes.some(p => acc.code.startsWith(p))) {
          const v = closingNet(acc, balances[acc.id]);
          // 资产/费用方向为debit取正；负债/权益/收入方向为credit
          total += v; // closingNet 已按方向带正负
        }
      });
      return total;
    };

    // 资产类
    const monetary = val('1001') + val('1002') + val('1012'); // 货币资金
    const receivables = val('1122'); // 应收账款
    const otherReceivables = val('1221'); // 其他应收款
    const inventory = val('1403') + val('1405') + val('1411'); // 原材料+库存商品+周转材料
    const inTransit = val('1402'); // 在途物资
    const fixedAssets = val('1601') - val('1602'); // 固定资产-累计折旧
    const intangible = val('1701'); // 无形资产
    const currentAssetsTotal = monetary + receivables + otherReceivables + inventory + inTransit;
    const nonCurrentAssetsTotal = fixedAssets + intangible;
    const totalAssets = currentAssetsTotal + nonCurrentAssetsTotal;

    // 负债类
    const shortTermLoan = val('2001');
    const payables = val('2202'); // 应付账款
    const salariesPayable = val('2211');
    const taxPayable = val('2221');
    const interestPayable = val('2231');
    const otherPayables = val('2241');
    const longTermLoan = val('2501');
    const currentLiabilitiesTotal = shortTermLoan + payables + salariesPayable + taxPayable + interestPayable + otherPayables;
    const nonCurrentLiabilitiesTotal = longTermLoan;
    const totalLiabilities = currentLiabilitiesTotal + nonCurrentLiabilitiesTotal;

    // 所有者权益
    const paidInCapital = val('4001') + val('4002'); // 实收资本+资本公积
    const surplusReserve = val('4101');
    // 未分配利润 = 本年利润 + 利润分配 + 收入-费用（期末结转前）
    const currentYearProfit = val('4103');
    const retainedProfit = val('4104');
    // 当期损益净额（收入类贷方-费用类借方），用于未结转时显示
    let revenueTotal = 0, expenseTotal = 0;
    rows.forEach(acc => {
      const v = closingNet(acc, balances[acc.id]);
      if (acc.category === 'revenue') revenueTotal += v;
      if (acc.category === 'expense') expenseTotal += v;
    });
    const periodProfit = revenueTotal - expenseTotal;
    const undistributedProfit = currentYearProfit + retainedProfit + (periodProfit > 0 ? periodProfit : 0);
    const totalEquity = paidInCapital + surplusReserve + undistributedProfit;

    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    res.json({
      code: 0,
      data: {
        period: targetPeriod,
        endDate,
        assets: {
          currentAssets: [
            { name: '货币资金', amount: monetary, accounts: ['1001 库存现金', '1002 银行存款', '1012 其他货币资金'] },
            { name: '应收账款', amount: receivables },
            { name: '其他应收款', amount: otherReceivables },
            { name: '存货', amount: inventory, accounts: ['1403 原材料', '1405 库存商品', '1411 周转材料'] },
            { name: '在途物资', amount: inTransit },
          ],
          currentAssetsTotal,
          nonCurrentAssets: [
            { name: '固定资产', amount: fixedAssets, accounts: ['1601 固定资产 - 1602 累计折旧'] },
            { name: '无形资产', amount: intangible },
          ],
          nonCurrentAssetsTotal,
          total: totalAssets,
        },
        liabilities: {
          currentLiabilities: [
            { name: '短期借款', amount: shortTermLoan },
            { name: '应付账款', amount: payables },
            { name: '应付职工薪酬', amount: salariesPayable },
            { name: '应交税费', amount: taxPayable },
            { name: '应付利息', amount: interestPayable },
            { name: '其他应付款', amount: otherPayables },
          ],
          currentLiabilitiesTotal,
          nonCurrentLiabilities: [
            { name: '长期借款', amount: longTermLoan },
          ],
          nonCurrentLiabilitiesTotal,
          total: totalLiabilities,
        },
        equity: {
          items: [
            { name: '实收资本（或股本）', amount: paidInCapital, accounts: ['4001 实收资本', '4002 资本公积'] },
            { name: '盈余公积', amount: surplusReserve },
            { name: '未分配利润', amount: undistributedProfit, note: '含本年利润' },
          ],
          total: totalEquity,
        },
        totalLiabilitiesAndEquity,
        isBalanced: Math.round(totalAssets * 100) === Math.round(totalLiabilitiesAndEquity * 100),
      }
    });
  } catch (err) {
    console.error('资产负债表错误:', err);
    res.status(500).json({ code: 500, message: '获取资产负债表失败: ' + err.message });
  }
});

// =================== 利润表 ===================
router.get('/income-statement', async (req, res) => {
  try {
    const { book_id, period } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const targetPeriod = period || dayjs().format('YYYY-MM');
    const startDate = dayjs(targetPeriod).startOf('month').format('YYYY-MM-DD');
    const endDate = dayjs(targetPeriod).endOf('month').format('YYYY-MM-DD');

    const { rows, map } = await getAccounts(bid);
    const balances = await computeBalances(bid, startDate, endDate);

    // 本期发生额（按方向净值）
    const periodCredit = (code) => {
      const acc = map[code];
      if (!acc || !balances[acc.id]) return 0;
      return balances[acc.id].pc;
    };
    const periodDebit = (code) => {
      const acc = map[code];
      if (!acc || !balances[acc.id]) return 0;
      return balances[acc.id].pd;
    };

    // 一、营业收入
    const operatingRevenue = periodCredit('6001') + periodCredit('6051');
    // 减：营业成本
    const operatingCost = periodDebit('6401') + periodDebit('6402');
    // 税金及附加
    const taxesSurcharges = periodDebit('6403');
    // 销售费用
    const sellingExpenses = periodDebit('6601');
    // 管理费用
    const adminExpenses = periodDebit('6602');
    // 财务费用
    const financeExpenses = periodDebit('6603');
    // 二、营业利润
    const operatingProfit = operatingRevenue - operatingCost - taxesSurcharges - sellingExpenses - adminExpenses - financeExpenses;
    // 加：营业外收入
    const nonOperatingIncome = periodCredit('6301');
    // 减：营业外支出
    const nonOperatingExpense = periodDebit('6711');
    // 投资收益
    const investmentIncome = periodCredit('6111');
    // 三、利润总额
    const totalProfit = operatingProfit + nonOperatingIncome + investmentIncome - nonOperatingExpense;
    // 减：所得税费用
    const incomeTax = periodDebit('6801');
    // 四、净利润
    const netProfit = totalProfit - incomeTax;

    res.json({
      code: 0,
      data: {
        period: targetPeriod,
        items: [
          { line: 1, name: '一、营业收入', amount: operatingRevenue, indent: 0, bold: true, accounts: ['6001 主营业务收入', '6051 其他业务收入'] },
          { line: 2, name: '减：营业成本', amount: operatingCost, indent: 1, accounts: ['6401 主营业务成本', '6402 其他业务成本'] },
          { line: 3, name: '    税金及附加', amount: taxesSurcharges, indent: 1, accounts: ['6403 税金及附加'] },
          { line: 4, name: '    销售费用', amount: sellingExpenses, indent: 1, accounts: ['6601 销售费用'] },
          { line: 5, name: '    管理费用', amount: adminExpenses, indent: 1, accounts: ['6602 管理费用'] },
          { line: 6, name: '    财务费用', amount: financeExpenses, indent: 1, accounts: ['6603 财务费用'] },
          { line: 7, name: '加：投资收益', amount: investmentIncome, indent: 1, accounts: ['6111 投资收益'] },
          { line: 8, name: '二、营业利润', amount: operatingProfit, indent: 0, bold: true },
          { line: 9, name: '加：营业外收入', amount: nonOperatingIncome, indent: 1, accounts: ['6301 营业外收入'] },
          { line: 10, name: '减：营业外支出', amount: nonOperatingExpense, indent: 1, accounts: ['6711 营业外支出'] },
          { line: 11, name: '三、利润总额', amount: totalProfit, indent: 0, bold: true },
          { line: 12, name: '减：所得税费用', amount: incomeTax, indent: 1, accounts: ['6801 所得税费用'] },
          { line: 13, name: '四、净利润', amount: netProfit, indent: 0, bold: true, highlight: true },
        ],
        totals: {
          operatingRevenue,
          operatingCost,
          operatingProfit,
          totalProfit,
          netProfit,
        }
      }
    });
  } catch (err) {
    console.error('利润表错误:', err);
    res.status(500).json({ code: 500, message: '获取利润表失败: ' + err.message });
  }
});

// =================== 现金流量表（简化版，基于货币资金科目的对方科目分析） ===================
router.get('/cash-flow', async (req, res) => {
  try {
    const { book_id, period } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const targetPeriod = period || dayjs().format('YYYY-MM');
    const startDate = dayjs(targetPeriod).startOf('month').format('YYYY-MM-DD');
    const endDate = dayjs(targetPeriod).endOf('month').format('YYYY-MM-DD');

    const { map } = await getAccounts(bid);
    const cashAccountIds = [map['1001'], map['1002'], map['1012']].filter(Boolean).map(a => a.id);

    if (!cashAccountIds.length) {
      return res.json({ code: 0, data: { period: targetPeriod, items: [], totals: {} } });
    }

    // 找出涉及现金科目的所有分录行，按凭证分组，分析对方科目
    const [lines] = await pool.query(
      `SELECT v.id AS voucher_id, vi.account_id, vi.debit_amount, vi.credit_amount, vi.summary,
              a.code AS account_code, a.name AS account_name, a.category
       FROM voucher_items vi
       JOIN vouchers v ON v.id = vi.voucher_id
       JOIN accounting_accounts a ON a.id = vi.account_id
       WHERE v.book_id = ? AND v.status IN ('audited','posted') AND v.is_balanced = TRUE
         AND v.voucher_date >= ? AND v.voucher_date <= ?
       ORDER BY v.id, vi.line_no`,
      [bid, startDate, endDate]
    );

    // 按凭证分组
    const byVoucher = {};
    lines.forEach(l => {
      if (!byVoucher[l.voucher_id]) byVoucher[l.voucher_id] = [];
      byVoucher[l.voucher_id].push(l);
    });

    let inflowOperating = 0, outflowOperating = 0;
    let inflowInvesting = 0, outflowInvesting = 0;
    let inflowFinancing = 0, outflowFinancing = 0;

    Object.values(byVoucher).forEach(entries => {
      const cashLines = entries.filter(e => cashAccountIds.includes(e.account_id));
      const otherLines = entries.filter(e => !cashAccountIds.includes(e.account_id));
      if (!cashLines.length) return;

      const cashIn = cashLines.reduce((s, e) => s + parseFloat(e.debit_amount || 0), 0);
      const cashOut = cashLines.reduce((s, e) => s + parseFloat(e.credit_amount || 0), 0);
      // 对方科目金额合计（用于判断收支；复式记账下对方合计应等于现金金额）
      const otherDebit = otherLines.reduce((s, e) => s + parseFloat(e.debit_amount || 0), 0);
      const otherCredit = otherLines.reduce((s, e) => s + parseFloat(e.credit_amount || 0), 0);

      // 按对方科目逐笔分类（避免整单金额重复累加）
      otherLines.forEach(o => {
        const code = o.account_code || '';
        let activity = 'operating';
        // 投资活动：固定资产(16xx)、无形资产(17xx)
        if (code.startsWith('16') || code.startsWith('17')) activity = 'investing';
        // 筹资活动：借款(2001/2501)、实收资本(4001)、资本公积(4002)
        else if (code.startsWith('2001') || code.startsWith('2501') || code.startsWith('4001') || code.startsWith('4002')) activity = 'financing';

        // 现金流入时，对方科目在贷方；现金流出时，对方科目在借方
        if (cashIn > 0) {
          const amt = parseFloat(o.credit_amount || 0) || 0;
          if (activity === 'operating') inflowOperating += amt;
          else if (activity === 'investing') inflowInvesting += amt;
          else inflowFinancing += amt;
        }
        if (cashOut > 0) {
          const amt = parseFloat(o.debit_amount || 0) || 0;
          if (activity === 'operating') outflowOperating += amt;
          else if (activity === 'investing') outflowInvesting += amt;
          else outflowFinancing += amt;
        }
      });
    });

    const netOperating = inflowOperating - outflowOperating;
    const netInvesting = inflowInvesting - outflowInvesting;
    const netFinancing = inflowFinancing - outflowFinancing;
    const netIncrease = netOperating + netInvesting + netFinancing;

    res.json({
      code: 0,
      data: {
        period: targetPeriod,
        items: [
          { name: '一、经营活动产生的现金流量', indent: 0, bold: true, type: 'header' },
          { name: '销售商品、提供劳务收到的现金', indent: 1, amount: inflowOperating },
          { name: '购买商品、接受劳务支付的现金', indent: 1, amount: -outflowOperating },
          { name: '经营活动产生的现金流量净额', indent: 1, bold: true, amount: netOperating, subtotal: true },
          { name: '二、投资活动产生的现金流量', indent: 0, bold: true, type: 'header' },
          { name: '购建固定资产等支付的现金', indent: 1, amount: -outflowInvesting },
          { name: '投资活动产生的现金流量净额', indent: 1, bold: true, amount: netInvesting, subtotal: true },
          { name: '三、筹资活动产生的现金流量', indent: 0, bold: true, type: 'header' },
          { name: '取得借款收到的现金', indent: 1, amount: inflowFinancing },
          { name: '筹资活动产生的现金流量净额', indent: 1, bold: true, amount: netFinancing, subtotal: true },
          { name: '四、现金及现金等价物净增加额', indent: 0, bold: true, amount: netIncrease, highlight: true },
        ],
        totals: { inflowOperating, outflowOperating, netOperating, netInvesting, netFinancing, netIncrease }
      }
    });
  } catch (err) {
    console.error('现金流量表错误:', err);
    res.status(500).json({ code: 500, message: '获取现金流量表失败: ' + err.message });
  }
});

module.exports = router;
