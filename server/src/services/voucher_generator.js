/**
 * 凭证自动生成服务
 * 根据业务单据自动生成会计凭证
 */
const pool = require('../config/db');
const dayjs = require('dayjs');

// 凭证类型映射
const VOUCHER_TYPE_MAP = { receipt: '收', payment: '付', transfer: '转', general: '记' };

// 缓存租户的科目映射
const accountCache = {};

/**
 * 获取默认账套ID
 */
async function getDefaultBookId(conn, tenantId, bookId) {
  if (bookId) return bookId;
  const [books] = await conn.query(
    'SELECT id FROM accounting_books WHERE tenant_id = ? AND is_active = TRUE ORDER BY id ASC LIMIT 1',
    [tenantId]
  );
  if (!books.length) throw new Error('当前租户暂无账套');
  return books[0].id;
}

/**
 * 按科目代码前缀查找科目ID（自动兼容不同会计准则）
 * 优先精确匹配，其次前缀匹配
 */
async function findAccountId(conn, bookId, codeCandidates, nameKeyword) {
  // codeCandidates 是候选代码数组，如 ['1001','1002']
  // nameKeyword 是科目名称关键字，如 '库存现金'
  const cacheKey = `book_${bookId}`;
  if (!accountCache[cacheKey]) {
    const [accounts] = await conn.query(
      'SELECT id, code, name FROM accounting_accounts WHERE book_id = ? AND is_enabled = 1',
      [bookId]
    );
    accountCache[cacheKey] = accounts;
  }
  const accounts = accountCache[cacheKey];

  // 1. 精确代码匹配（只匹配一级科目，不含小数点）
  for (const code of codeCandidates) {
    const found = accounts.find(a => a.code === code);
    if (found) return found.id;
  }

  // 2. 前缀匹配（如 5001 匹配 5001, 5001.01 等，优先一级）
  for (const code of codeCandidates) {
    const found = accounts.find(a => a.code && a.code.startsWith(code) && !a.code.includes('.'));
    if (found) return found.id;
  }
  for (const code of codeCandidates) {
    const found = accounts.find(a => a.code && a.code.startsWith(code));
    if (found) return found.id;
  }

  // 3. 按名称模糊匹配
  if (nameKeyword) {
    const found = accounts.find(a => a.name && a.name.includes(nameKeyword));
    if (found) return found.id;
  }

  throw new Error(`找不到对应会计科目（候选代码：${codeCandidates.join('/')}，名称关键字：${nameKeyword}），请在科目设置中配置`);
}

/**
 * 清除科目缓存（租户科目变更时调用）
 */
function clearAccountCache(tenantId) {
  if (tenantId) { Object.keys(accountCache).filter(k=>k.startsWith('book_')).forEach(k=>delete accountCache[k]); }
  else Object.keys(accountCache).forEach(k => delete accountCache[k]);
}

/**
 * 生成凭证编号
 */
async function generateVoucherNo(conn, bookId, voucherType, voucherDate) {
  const prefix = VOUCHER_TYPE_MAP[voucherType] || '记';
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

/**
 * 检查期间是否已结账
 */
async function assertPeriodOpen(conn, bookId, voucherDate) {
  const period = dayjs(voucherDate).format('YYYY-MM');
  const [rows] = await conn.query(
    "SELECT id FROM period_closures WHERE book_id = ? AND period = ? AND status = 'closed' LIMIT 1",
    [bookId, period]
  );
  if (rows.length) throw new Error(`会计期间 ${period} 已结账，不能生成凭证`);
}

/**
 * 核心：创建凭证（内部使用，接受外部conn事务）
 * @param {object} conn - 数据库连接（事务中）
 * @param {object} params
 * @param {number} params.tenantId
 * @param {number} params.userId
 * @param {string} params.voucherType - receipt/payment/transfer/general
 * @param {string} params.voucherDate - YYYY-MM-DD
 * @param {string} params.remark - 凭证备注
 * @param {Array} params.entries - [{accountCode, accountNameKeyword, summary, debit, credit}]
 * @param {string} params.sourceType - 来源单据类型（sales_order/purchase_order/fund_transaction等）
 * @param {number} params.sourceId - 来源单据ID
 * @param {string} params.sourceNo - 来源单据号
 */
async function createVoucher(conn, params) {
  const {
    tenantId, userId, voucherType = 'general', voucherDate,
    remark, entries = [], sourceType, sourceId, sourceNo, bookId
  } = params;

  if (entries.length < 2) throw new Error('凭证明细至少需要两行');

  const bid = await getDefaultBookId(conn, tenantId, bookId);
  await assertPeriodOpen(conn, bid, voucherDate);

  // 查找科目ID并校验借贷平衡
  let totalDebit = 0, totalCredit = 0;
  const items = [];
  for (const e of entries) {
    const debit = parseFloat(e.debit) || 0;
    const credit = parseFloat(e.credit) || 0;
    if (debit > 0 && credit > 0) throw new Error(`摘要"${e.summary}"：借贷不能同时有金额`);
    if (debit === 0 && credit === 0) throw new Error(`摘要"${e.summary}"：借贷不能同时为零`);

    const accountId = await findAccountId(conn, bid, e.accountCode, e.accountNameKeyword);
    items.push({ accountId, summary: e.summary, debit, credit });
    totalDebit += debit;
    totalCredit += credit;
  }

  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    throw new Error(`借贷不平衡：借方¥${totalDebit.toFixed(2)} ≠ 贷方¥${totalCredit.toFixed(2)}`);
  }

  // 生成凭证号
  const voucherNo = await generateVoucherNo(conn, bid, voucherType, voucherDate);

  // 插入凭证头
  const [result] = await conn.query(
    `INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, attachment_count, total_debit, total_credit, is_balanced, status, creator_id, remark, source_type, source_id, source_no)
     VALUES (?, ?, ?, ?, 0, ?, ?, 1, 'posted', ?, ?, ?, ?, ?)`,
    [bid, voucherType, voucherNo, voucherDate, totalDebit, totalCredit, userId, remark || null, sourceType || null, sourceId || null, sourceNo || null]
  );
  const voucherId = result.insertId;

  // 插入明细
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await conn.query(
      `INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [voucherId, i + 1, item.accountId, item.summary, item.debit, item.credit]
    );
  }

  return { id: voucherId, voucher_no: voucherNo, total_debit: totalDebit, total_credit: totalCredit };
}

// ============ 业务凭证生成函数 ============

/**
 * 生成销售凭证（销售出库确认时调用）
 * 借：银行存款/现金/应收账款
 * 贷：主营业务收入
 *
 * 同时结转成本：
 * 借：主营业务成本
 * 贷：库存商品
 */
async function generateSalesVoucher(conn, { tenantId, userId, orderId, orderNo, orderDate, paymentMethod, customerName, totalAmount, totalCost, customerId }) {
  const date = dayjs(orderDate).format('YYYY-MM-DD');
  // 收款科目映射
  let receiptAccount;
  if (paymentMethod === 'cash') {
    receiptAccount = { accountCode: ['1001'], accountNameKeyword: '库存现金' };
  } else if (paymentMethod === 'card' || paymentMethod === 'bank') {
    receiptAccount = { accountCode: ['1002'], accountNameKeyword: '银行存款' };
  } else if (paymentMethod === 'wechat' || paymentMethod === 'alipay') {
    receiptAccount = { accountCode: ['1012', '1002'], accountNameKeyword: '其他货币资金' };
  } else {
    receiptAccount = { accountCode: ['1122'], accountNameKeyword: '应收账款' };
  }

  const entries = [
    { ...receiptAccount, summary: `销售收款 - ${orderNo}${customerName ? ' - ' + customerName : ''}`, debit: totalAmount, credit: 0 },
    { accountCode: ['5001'], accountNameKeyword: '主营业务收入', summary: `销售收入 - ${orderNo}`, debit: 0, credit: totalAmount }
  ];

  // 如果有成本，结转成本
  if (totalCost && parseFloat(totalCost) > 0) {
    entries.push(
      { accountCode: ['6001', '6401'], accountNameKeyword: '主营业务成本', summary: `结转销售成本 - ${orderNo}`, debit: parseFloat(totalCost), credit: 0 },
      { accountCode: ['1405', '1403'], accountNameKeyword: '库存商品', summary: `出库成本 - ${orderNo}`, debit: 0, credit: parseFloat(totalCost) }
    );
  }

  return createVoucher(conn, {
    tenantId, userId,
    voucherType: paymentMethod === 'cash' ? 'receipt' : 'general',
    voucherDate: dayjs(orderDate).format('YYYY-MM-DD'),
    remark: `销售单 ${orderNo} 自动生成`,
    entries,
    sourceType: 'sales_order',
    sourceId: orderId,
    sourceNo: orderNo
  });
}

/**
 * 生成采购入库凭证
 * 借：库存商品
 * 贷：应付账款 / 银行存款 / 现金
 */
async function generatePurchaseVoucher(conn, { tenantId, userId, orderId, orderNo, orderDate, supplierName, totalAmount, paymentMethod }) {
  let paymentAccount;
  if (paymentMethod === 'cash') {
    paymentAccount = { accountCode: ['1001'], accountNameKeyword: '库存现金' };
  } else if (paymentMethod === 'card' || paymentMethod === 'bank') {
    paymentAccount = { accountCode: ['1002'], accountNameKeyword: '银行存款' };
  } else {
    paymentAccount = { accountCode: ['2202'], accountNameKeyword: '应付账款' };
  }

  const entries = [
    { accountCode: ['1405', '1403'], accountNameKeyword: '库存商品', summary: `采购入库 - ${orderNo}${supplierName ? ' - ' + supplierName : ''}`, debit: totalAmount, credit: 0 },
    { ...paymentAccount, summary: `采购付款 - ${orderNo}`, debit: 0, credit: totalAmount }
  ];

  const vType = (paymentMethod === 'cash' || paymentMethod === 'card' || paymentMethod === 'bank') ? 'payment' : 'transfer';
  return createVoucher(conn, {
    tenantId, userId,
    voucherType: vType,
    voucherDate: dayjs(orderDate).format('YYYY-MM-DD'),
    remark: `采购单 ${orderNo} 自动生成`,
    entries,
    sourceType: 'purchase_order',
    sourceId: orderId,
    sourceNo: orderNo
  });
}

/**
 * 生成资金收入凭证
 * 借：资金科目（现金/银行/其他货币资金）
 * 贷：应收账款 / 主营业务收入 / 其他
 */
async function generateFundIncomeVoucher(conn, { tenantId, userId, txId, txNo, txDate, accountType, amount, counterpartyName, referenceType, referenceNo, businessType, remark }) {
  let debitAccount;
  if (accountType === 'cash') debitAccount = { accountCode: ['1001'], accountNameKeyword: '库存现金' };
  else if (accountType === 'bank') debitAccount = { accountCode: ['1002'], accountNameKeyword: '银行存款' };
  else debitAccount = { accountCode: ['1012', '1002'], accountNameKeyword: '其他货币资金' };

  let creditAccount;
  let summary;
  if (referenceType === 'sales_order') {
    creditAccount = { accountCode: ['1122'], accountNameKeyword: '应收账款' };
    summary = `收回销售款 - ${referenceNo || ''} ${counterpartyName || ''}`;
  } else if (businessType === 'revenue' || businessType === 'sales_receipt') {
    creditAccount = { accountCode: ['5001'], accountNameKeyword: '主营业务收入' };
    summary = `经营收入${counterpartyName ? ' - ' + counterpartyName : ''}`;
  } else {
    // other_income / refund_in / 其他 → 其他业务收入
    creditAccount = { accountCode: ['5051', '5111', '6301'], accountNameKeyword: '其他业务收入' };
    summary = `其他收入${counterpartyName ? ' - ' + counterpartyName : ''}`;
  }

  return createVoucher(conn, {
    tenantId, userId,
    voucherType: 'receipt',
    voucherDate: dayjs(txDate).format('YYYY-MM-DD'),
    remark: remark || `资金收入 ${txNo} 自动生成`,
    entries: [
      { ...debitAccount, summary, debit: amount, credit: 0 },
      { ...creditAccount, summary, debit: 0, credit: amount }
    ],
    sourceType: 'fund_transaction',
    sourceId: txId,
    sourceNo: txNo
  });
}

/**
 * 生成资金支出凭证
 * 借：应付账款 / 费用科目
 * 贷：资金科目
 */
async function generateFundExpenseVoucher(conn, { tenantId, userId, txId, txNo, txDate, accountType, amount, counterpartyName, referenceType, referenceNo, businessType, remark }) {
  let creditAccount;
  if (accountType === 'cash') creditAccount = { accountCode: ['1001'], accountNameKeyword: '库存现金' };
  else if (accountType === 'bank') creditAccount = { accountCode: ['1002'], accountNameKeyword: '银行存款' };
  else creditAccount = { accountCode: ['1012', '1002'], accountNameKeyword: '其他货币资金' };

  let debitAccount;
  let summary;
  if (referenceType === 'purchase_order') {
    debitAccount = { accountCode: ['2202'], accountNameKeyword: '应付账款' };
    summary = `支付采购款 - ${referenceNo || ''} ${counterpartyName || ''}`;
  } else {
    // 业务类型 → 借方科目映射（小企业会计准则）
    // 优先匹配明细子科目（如 6601.02 工资），findAccountId 会自动前缀匹配
    const EXPENSE_MAP = {
      salary:        { codes: ['6601.02', '6601'], name: '管理费用', label: '工资薪金' },
      rent:          { codes: ['6601'],        name: '管理费用', label: '房租物业' },
      utilities:     { codes: ['6601'],        name: '管理费用', label: '水电网费' },
      travel:        { codes: ['6601'],        name: '管理费用', label: '差旅交通' },
      office:        { codes: ['6601.01', '6601'], name: '管理费用', label: '办公费' },
      freight:       { codes: ['6602', '6401'], name: '销售费用', label: '运费物流' },
      marketing:     { codes: ['6602', '6401'], name: '销售费用', label: '广告推广' },
      sales:         { codes: ['6602', '6401'], name: '销售费用', label: '销售费用' },
      finance:       { codes: ['6603'],        name: '财务费用', label: '财务费用' },
      admin:         { codes: ['6601'],        name: '管理费用', label: '管理费用' },
      other_expense: { codes: ['6601'],        name: '管理费用', label: '其他支出' }
    };
    const m = EXPENSE_MAP[businessType] || EXPENSE_MAP.other_expense;
    debitAccount = { accountCode: m.codes, accountNameKeyword: m.name };
    summary = `${m.label}${counterpartyName ? ' - ' + counterpartyName : ''}`;
  }

  return createVoucher(conn, {
    tenantId, userId,
    voucherType: 'payment',
    voucherDate: dayjs(txDate).format('YYYY-MM-DD'),
    remark: remark || `资金支出 ${txNo} 自动生成`,
    entries: [
      { ...debitAccount, summary, debit: amount, credit: 0 },
      { ...creditAccount, summary, debit: 0, credit: amount }
    ],
    sourceType: 'fund_transaction',
    sourceId: txId,
    sourceNo: txNo
  });
}

/**
 * 生成折旧凭证
 * 借：管理费用-折旧费 / 制造费用等
 * 贷：累计折旧
 */
async function generateDepreciationVoucher(conn, { tenantId, userId, period, assetName, department, monthlyDepreciation, assetId, assetNo }) {
  // 根据部门决定费用科目（默认管理费用）
  const expenseAccount = department && department.includes('生产')
    ? { accountCode: ['5401', '6601'], accountNameKeyword: '制造费用' }
    : { accountCode: ['6601'], accountNameKeyword: '管理费用' };

  return createVoucher(conn, {
    tenantId, userId,
    voucherType: 'transfer',
    voucherDate: dayjs(period + '-01').endOf('month').format('YYYY-MM-DD'),
    remark: `计提${period}折旧 - ${assetName}`,
    entries: [
      { ...expenseAccount, summary: `计提折旧 - ${assetName}(${assetNo})`, debit: monthlyDepreciation, credit: 0 },
      { accountCode: ['1502', '1602'], accountNameKeyword: '累计折旧', summary: `累计折旧 - ${assetName}`, debit: 0, credit: monthlyDepreciation }
    ],
    sourceType: 'fixed_asset',
    sourceId: assetId,
    sourceNo: assetNo
  });
}

module.exports = {
  createVoucher,
  generateSalesVoucher,
  generatePurchaseVoucher,
  generateFundIncomeVoucher,
  generateFundExpenseVoucher,
  generateDepreciationVoucher,
  clearAccountCache,
  getDefaultBookId
};
