const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
const voucherGen = require('../services/voucher_generator');
router.use(authenticate);

// 生成流水号
async function genTxNo(conn, tenantId) {
  const prefix = 'FT' + dayjs().format('YYYYMMDD');
  const [rows] = await conn.query(
    "SELECT tx_no FROM fund_transactions WHERE tenant_id=? AND tx_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, prefix + '%']
  );
  let seq = 1;
  if (rows.length) {
    seq = parseInt(rows[0].tx_no.slice(-4)) + 1;
  }
  return prefix + String(seq).padStart(4, '0');
}

// =================== 资金账户 ===================

// 账户列表（含余额）
router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM fund_accounts WHERE tenant_id=? ORDER BY sort_order ASC, id ASC`,
      [req.tenantId]
    );
    // 汇总每个账户的当期收支
    const today = dayjs().format('YYYY-MM-DD');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
    const [stats] = await pool.query(
      `SELECT account_id,
        SUM(CASE WHEN direction='in' THEN amount ELSE 0 END) AS month_in,
        SUM(CASE WHEN direction='out' THEN amount ELSE 0 END) AS month_out
       FROM fund_transactions
       WHERE tenant_id=? AND tx_date>=?
       GROUP BY account_id`,
      [req.tenantId, monthStart]
    );
    const statMap = {};
    stats.forEach(s => { statMap[s.account_id] = s; });
    const list = rows.map(a => ({
      ...a,
      month_in: parseFloat(statMap[a.id]?.month_in || 0),
      month_out: parseFloat(statMap[a.id]?.month_out || 0),
    }));
    const totalBalance = list.reduce((s, a) => s + parseFloat(a.balance), 0);
    res.json({ code: 0, data: { list, totalBalance } });
  } catch (err) {
    console.error('获取资金账户失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 新增/编辑账户
router.post('/accounts', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { id, account_name, account_type, account_no, bank_name, balance, is_enabled, remark } = req.body;
    if (!account_name || !account_type) return res.status(400).json({ code: 400, message: '账户名称和类型必填' });
    if (id) {
      await pool.query(
        `UPDATE fund_accounts SET account_name=?, account_type=?, account_no=?, bank_name=?, is_enabled=?, remark=? WHERE id=? AND tenant_id=?`,
        [account_name, account_type, account_no || null, bank_name || null, is_enabled !== false ? 1 : 0, remark || null, id, req.tenantId]
      );
      res.json({ code: 0, message: '账户已更新' });
    } else {
      const [r] = await pool.query(
        `INSERT INTO fund_accounts (tenant_id, account_name, account_type, account_no, bank_name, balance, is_enabled, is_default, sort_order, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        [req.tenantId, account_name, account_type, account_no || null, bank_name || null, balance || 0, 1, remark || null]
      );
      // 如果有初始余额，生成一条初始化流水
      if (balance > 0) {
        const txNo = await genTxNo(pool, req.tenantId);
        await pool.query(
          `INSERT INTO fund_transactions (tenant_id, account_id, tx_no, tx_type, amount, direction, counterparty_type, counterparty_name, business_type, remark, tx_date, operator_id)
           VALUES (?, ?, ?, 'income', ?, 'in', 'other', '账户初始化', 'other_income', '账户初始余额', NOW(), ?)`,
          [req.tenantId, r.insertId, txNo, balance, req.user.id]
        );
      }
      res.json({ code: 0, message: '账户已创建', data: { id: r.insertId } });
    }
  } catch (err) {
    console.error('保存账户失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 删除账户（无流水才能删）
router.delete('/accounts/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const [[acc]] = await pool.query('SELECT * FROM fund_accounts WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    if (!acc) return res.status(404).json({ code: 404, message: '账户不存在' });
    if (acc.is_default) return res.status(400).json({ code: 400, message: '默认账户不能删除' });
    const [[cntRow]] = await pool.query('SELECT COUNT(*) as cnt FROM fund_transactions WHERE account_id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    const cnt = cntRow.cnt;
    if (cnt > 0) return res.status(400).json({ code: 400, message: '该账户有流水记录，不能删除（可禁用）' });
    await pool.query('DELETE FROM fund_accounts WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '账户已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// =================== 资金流水 ===================

// 流水列表（筛选：账户、日期、类型、往来方、单据）
router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, account_id, direction, business_type, counterparty_name,
      reference_type, reference_id, start_date, end_date, keyword } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE ft.tenant_id=?';
    const params = [req.tenantId];
    if (account_id) { where += ' AND ft.account_id=?'; params.push(account_id); }
    if (direction) { where += ' AND ft.direction=?'; params.push(direction); }
    if (business_type) { where += ' AND ft.business_type=?'; params.push(business_type); }
    if (counterparty_name) { where += ' AND ft.counterparty_name LIKE ?'; params.push('%' + counterparty_name + '%'); }
    if (reference_type) { where += ' AND ft.reference_type=?'; params.push(reference_type); }
    if (reference_id) { where += ' AND ft.reference_id=?'; params.push(reference_id); }
    if (start_date) { where += ' AND ft.tx_date>=?'; params.push(start_date); }
    if (end_date) { where += ' AND ft.tx_date<=?'; params.push(end_date); }
    if (keyword) { where += ' AND (ft.remark LIKE ? OR ft.tx_no LIKE ? OR ft.reference_no LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%', '%'+keyword+'%'); }

    const [[totalRow]] = await pool.query(`SELECT COUNT(*) as total FROM fund_transactions ft ${where}`, params);
    const total = totalRow.total;
    const [rows] = await pool.query(
      `SELECT ft.*, fa.account_name, fa.account_type, u.real_name AS operator_name
       FROM fund_transactions ft
       LEFT JOIN fund_accounts fa ON fa.id=ft.account_id
       LEFT JOIN users u ON u.id=ft.operator_id
       ${where} ORDER BY ft.tx_date DESC, ft.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 汇总
    const [sumRows] = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE 0 END),0) AS total_in,
        COALESCE(SUM(CASE WHEN direction='out' THEN amount ELSE 0 END),0) AS total_out
       FROM fund_transactions ft ${where}`, params
    );

    res.json({
      code: 0,
      data: {
        list: rows,
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        summary: {
          total_in: parseFloat(sumRows[0].total_in),
          total_out: parseFloat(sumRows[0].total_out),
          net: parseFloat(sumRows[0].total_in) - parseFloat(sumRows[0].total_out),
        }
      }
    });
  } catch (err) {
    console.error('获取流水失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 登记一笔收支
router.post('/transactions', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { account_id, direction, amount, counterparty_type, counterparty_id, counterparty_name,
      business_type, reference_type, reference_id, reference_no, remark, tx_date } = req.body;

    if (!account_id || !direction || !amount || amount <= 0)
      return res.status(400).json({ code: 400, message: '账户、方向和金额必填' });

    await conn.beginTransaction();

    const txNo = await genTxNo(conn, req.tenantId);
    const txType = direction === 'in' ? 'income' : 'expense';
    const txDate = tx_date || dayjs().format('YYYY-MM-DD');

    const [r] = await conn.query(
      `INSERT INTO fund_transactions
       (tenant_id, account_id, tx_no, tx_type, amount, direction, counterparty_type, counterparty_id, counterparty_name,
        business_type, reference_type, reference_id, reference_no, remark, tx_date, tx_time, operator_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),?)`,
      [req.tenantId, account_id, txNo, txType, amount, direction,
       counterparty_type || 'other', counterparty_id || null, counterparty_name || null,
       business_type || (direction === 'in' ? 'other_income' : 'other_expense'),
       reference_type || null, reference_id || null, reference_no || null,
       remark || null, txDate, req.user.id]
    );

    // 更新账户余额
    const delta = direction === 'in' ? parseFloat(amount) : -parseFloat(amount);
    await conn.query('UPDATE fund_accounts SET balance = balance + ? WHERE id=? AND tenant_id=?',
      [delta, account_id, req.tenantId]);

    // 如果关联了销售单/采购单，更新paid_amount并写核销记录
    if (reference_type && reference_id) {
      if (reference_type === 'sales_order') {
        const [[so]] = await conn.query('SELECT actual_amount, paid_amount, order_no FROM sales_orders WHERE id=? AND tenant_id=?', [reference_id, req.tenantId]);
        if (so) {
          const newPaid = parseFloat(so.paid_amount) + parseFloat(amount);
          await conn.query('UPDATE sales_orders SET paid_amount=? WHERE id=?', [newPaid, reference_id]);
          await conn.query(
            `INSERT INTO fund_settlements (tenant_id, tx_id, reference_type, reference_id, reference_no, amount)
             VALUES (?,?,'sales_order',?,?,?)`,
            [req.tenantId, r.insertId, reference_id, so.order_no, amount]
          );
        }
      } else if (reference_type === 'purchase_order') {
        const [[po]] = await conn.query('SELECT total_amount, paid_amount, order_no FROM purchase_orders WHERE id=? AND tenant_id=?', [reference_id, req.tenantId]);
        if (po) {
          const newPaid = parseFloat(po.paid_amount) + parseFloat(amount);
          await conn.query('UPDATE purchase_orders SET paid_amount=? WHERE id=?', [newPaid, reference_id]);
          await conn.query(
            `INSERT INTO fund_settlements (tenant_id, tx_id, reference_type, reference_id, reference_no, amount)
             VALUES (?,?,'purchase_order',?,?,?)`,
            [req.tenantId, r.insertId, reference_id, po.order_no, amount]
          );
        }
      }
    }

    // 查询资金账户类型
    const [[accRow]] = await conn.query(
      'SELECT account_type FROM fund_accounts WHERE id = ? AND tenant_id = ?',
      [account_id, req.tenantId]
    );
    const accountType = accRow ? accRow.account_type : 'bank';

    // 自动生成资金收支凭证
    let voucherResult = null;
    try {
      const [settingRows] = await conn.query(
        'SELECT auto_fund FROM voucher_auto_settings WHERE tenant_id = ?',
        [req.tenantId]
      );
      const autoEnabled = settingRows.length ? settingRows[0].auto_fund === 1 : true;
      if (autoEnabled) {
        const vParams = {
          tenantId: req.tenantId,
          userId: req.user.id,
          txId: r.insertId,
          txNo,
          txDate,
          accountType,
          amount: parseFloat(amount),
          counterpartyName: counterparty_name,
          referenceType: reference_type,
          referenceNo: reference_no,
          businessType: business_type,
          remark
        };
        if (direction === 'in') {
          voucherResult = await voucherGen.generateFundIncomeVoucher(conn, vParams);
        } else {
          voucherResult = await voucherGen.generateFundExpenseVoucher(conn, vParams);
        }
      }
    } catch (vErr) {
      console.error('资金凭证生成失败:', vErr.message);
      throw new Error('凭证生成失败: ' + vErr.message);
    }

    await conn.commit();
    res.json({ code: 0, message: direction === 'in' ? '收款登记成功' : '付款登记成功',
      data: { id: r.insertId, tx_no: txNo, voucherNo: voucherResult?.voucher_no } });
  } catch (err) {
    await conn.rollback();
    console.error('登记流水失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally {
    conn.release();
  }
});

// 资金转账（A账户转到B账户）
router.post('/transfer', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { from_account_id, to_account_id, amount, remark, tx_date } = req.body;
    if (!from_account_id || !to_account_id || !amount || amount <= 0)
      return res.status(400).json({ code: 400, message: '转出账户、转入账户和金额必填' });
    if (from_account_id === to_account_id)
      return res.status(400).json({ code: 400, message: '转出和转入账户不能相同' });

    const [[fromAcc]] = await conn.query('SELECT * FROM fund_accounts WHERE id=? AND tenant_id=?', [from_account_id, req.tenantId]);
    if (!fromAcc) return res.status(404).json({ code: 404, message: '转出账户不存在' });
    if (parseFloat(fromAcc.balance) < parseFloat(amount))
      return res.status(400).json({ code: 400, message: `转出账户余额不足（当前¥${parseFloat(fromAcc.balance).toFixed(2)}）` });

    await conn.beginTransaction();
    const txDate = tx_date || dayjs().format('YYYY-MM-DD');
    const txNoOut = await genTxNo(conn, req.tenantId);

    // 转出
    const [rOut] = await conn.query(
      `INSERT INTO fund_transactions (tenant_id, account_id, tx_no, tx_type, amount, direction, counterparty_type, counterparty_name, business_type, remark, tx_date, tx_time, operator_id)
       VALUES (?, ?, ?, 'transfer_out', ?, 'out', 'other', '账户转账', 'transfer', ?, ?, NOW(), ?)`,
      [req.tenantId, from_account_id, txNoOut, amount, `转账至账户#${to_account_id} ${remark||''}`.trim(), txDate, req.user.id]
    );
    await conn.query('UPDATE fund_accounts SET balance = balance - ? WHERE id=?', [amount, from_account_id]);

    // 转入
    const txNoIn = await genTxNo(conn, req.tenantId);
    await conn.query(
      `INSERT INTO fund_transactions (tenant_id, account_id, tx_no, tx_type, amount, direction, counterparty_type, counterparty_name, business_type, remark, tx_date, tx_time, operator_id)
       VALUES (?, ?, ?, 'transfer_in', ?, 'in', 'other', '账户转账', 'transfer', ?, ?, NOW(), ?)`,
      [req.tenantId, to_account_id, txNoIn, amount, `从账户#${from_account_id}转入 ${remark||''}`.trim(), txDate, req.user.id]
    );
    await conn.query('UPDATE fund_accounts SET balance = balance + ? WHERE id=?', [amount, to_account_id]);

    await conn.commit();
    res.json({ code: 0, message: '转账成功' });
  } catch (err) {
    await conn.rollback();
    console.error('转账失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally {
    conn.release();
  }
});

// =================== 应收应付核销 ===================

// 按客户/供应商查询待核销单据 + 已核销记录
router.get('/settlements/pending', async (req, res) => {
  try {
    const { counterparty_type, counterparty_id } = req.query;
    if (!counterparty_type) return res.status(400).json({ code: 400, message: '缺少往来类型' });
    let result = { receivables: [], payables: [], recent: [] };

    if (counterparty_type === 'customer' && counterparty_id) {
      const [orders] = await pool.query(
        `SELECT id, order_no, order_date, total_amount, actual_amount, paid_amount,
           (actual_amount - paid_amount) AS unpaid_amount, status
         FROM sales_orders
         WHERE tenant_id=? AND customer_id=? AND actual_amount - paid_amount > 0.001
         ORDER BY order_date ASC`,
        [req.tenantId, counterparty_id]
      );
      result.receivables = orders;
    }
    if (counterparty_type === 'supplier' && counterparty_id) {
      const [orders] = await pool.query(
        `SELECT id, order_no, order_date, total_amount, paid_amount,
           (total_amount - paid_amount) AS unpaid_amount, status
         FROM purchase_orders
         WHERE tenant_id=? AND supplier_id=? AND total_amount - paid_amount > 0.001
         ORDER BY order_date ASC`,
        [req.tenantId, counterparty_id]
      );
      result.payables = orders;
    }

    // 最近10条流水
    const [recent] = await pool.query(
      `SELECT ft.id, ft.tx_no, ft.tx_date, ft.amount, ft.direction, ft.account_id, ft.remark,
              fa.account_name, ft.counterparty_name
       FROM fund_transactions ft
       LEFT JOIN fund_accounts fa ON fa.id=ft.account_id
       WHERE ft.tenant_id=? ORDER BY ft.id DESC LIMIT 10`,
      [req.tenantId]
    );
    result.recent = recent;
    res.json({ code: 0, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 查询某笔流水的核销明细
router.get('/transactions/:id/settlements', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM fund_settlements WHERE tx_id=? AND tenant_id=?`,
      [req.params.id, req.tenantId]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
