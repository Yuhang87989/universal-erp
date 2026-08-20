const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 获取收支记录列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, type, startDate, endDate, category } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (type) { where += ' AND type = ?'; params.push(type); }
    if (category) { where += ' AND category = ?'; params.push(category); }
    if (startDate) { where += ' AND record_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND record_date <= ?'; params.push(endDate); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM finance_records ${where}`, params);

    const [records] = await pool.query(
      `SELECT fr.*, u.real_name as operator_name FROM finance_records fr
       LEFT JOIN users u ON fr.operator_id = u.id
       ${where} ORDER BY fr.record_date DESC, fr.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    // 汇总
    const [incomeSum] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM finance_records WHERE tenant_id = ? AND type = 'income'`,
      [req.tenantId]
    );
    const [expenseSum] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM finance_records WHERE tenant_id = ? AND type = 'expense'`,
      [req.tenantId]
    );

    res.json({
      code: 0,
      data: {
        list: records,
        total: countResult[0].total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        summary: {
          income: parseFloat(incomeSum[0].total),
          expense: parseFloat(expenseSum[0].total)
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '获取收支记录失败' });
  }
});

// 新增收支记录
router.post('/', async (req, res) => {
  try {
    const { type, category, amount, paymentMethod, remark, recordDate } = req.body;
    if (!type || !category || !amount) throw new Error('类型、类别和金额不能为空');

    const [result] = await pool.query(
      `INSERT INTO finance_records (tenant_id, type, category, amount, payment_method, remark, record_date, operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, type, category, amount, paymentMethod || null, remark || null, recordDate || dayjs().format('YYYY-MM-DD'), req.user.id]
    );
    res.json({ code: 0, message: '记录添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新收支记录
router.put('/:id', async (req, res) => {
  try {
    const { type, category, amount, paymentMethod, remark, recordDate } = req.body;
    await pool.query(
      `UPDATE finance_records SET type=?, category=?, amount=?, payment_method=?, remark=?, record_date=?
       WHERE id=? AND tenant_id=?`,
      [type, category, amount, paymentMethod, remark, recordDate, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '记录更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除收支记录
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM finance_records WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '记录已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

// 获取收支汇总（按类别/月份）
router.get('/summary', async (req, res) => {
  try {
    const { groupBy = 'category' } = req.query;
    let sql;
    if (groupBy === 'month') {
      sql = `SELECT DATE_FORMAT(record_date, '%Y-%m') as period, type, SUM(amount) as total
             FROM finance_records WHERE tenant_id = ?
             GROUP BY period, type ORDER BY period DESC`;
    } else {
      sql = `SELECT category, type, SUM(amount) as total, COUNT(*) as count
             FROM finance_records WHERE tenant_id = ?
             GROUP BY category, type ORDER BY total DESC`;
    }
    const [rows] = await pool.query(sql, [req.tenantId]);
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取汇总失败' });
  }
});

module.exports = router;
