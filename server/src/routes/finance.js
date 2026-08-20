const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 获取收支记录列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, type, referenceType, startDate, endDate, category } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];

    if (type) { where += ' AND type = ?'; params.push(type); }
    if (referenceType) { where += ' AND reference_type = ?'; params.push(referenceType); }
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
    let sumWhere = 'WHERE tenant_id = ?';
    const sumParams = [req.tenantId];
    if (referenceType) { sumWhere += ' AND reference_type = ?'; sumParams.push(referenceType); }
    if (type) { sumWhere += ' AND type = ?'; sumParams.push(type); }

    const [incomeSum] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM finance_records ${sumWhere} AND type = 'income'`,
      [...sumParams]
    );
    const [expenseSum] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM finance_records WHERE tenant_id = ? AND type = 'expense'${referenceType ? ' AND reference_type = ?' : ''}`,
      [req.tenantId, ...(referenceType ? [referenceType] : [])]
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
    const { type, category, amount, referenceType, paymentMethod, remark, recordDate } = req.body;
    if (!type || !category || !amount) throw new Error('类型、类别和金额不能为空');

    const [result] = await pool.query(
      `INSERT INTO finance_records (tenant_id, type, category, amount, reference_type, payment_method, remark, record_date, operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, type, category, amount, referenceType || null, paymentMethod || null, remark || null, recordDate || dayjs().format('YYYY-MM-DD'), req.user.id]
    );
    res.json({ code: 0, message: '记录添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新收支记录
router.put('/:id', async (req, res) => {
  try {
    const { type, category, amount, referenceType, paymentMethod, remark, recordDate } = req.body;
    await pool.query(
      `UPDATE finance_records SET type=?, category=?, amount=?, reference_type=?, payment_method=?, remark=?, record_date=?
       WHERE id=? AND tenant_id=?`,
      [type, category, amount, referenceType || null, paymentMethod, remark, recordDate, req.params.id, req.tenantId]
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

// 各来源收支汇总（用于总帐目页面）
router.get('/platform-summary', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
        COALESCE(reference_type, 'other') as source,
        COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense,
        COUNT(*) as record_count
       FROM finance_records
       WHERE tenant_id = ?
       GROUP BY reference_type
       ORDER BY income DESC`,
      [req.tenantId]
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ code: 500, message: '获取汇总失败' });
  }
});

// 获取收支汇总（按类别/月份）
router.get('/summary', async (req, res) => {
  try {
    const { groupBy = 'category', referenceType } = req.query;
    let baseWhere = 'WHERE tenant_id = ?';
    const baseParams = [req.tenantId];
    if (referenceType) { baseWhere += ' AND reference_type = ?'; baseParams.push(referenceType); }

    let sql;
    if (groupBy === 'month') {
      sql = `SELECT DATE_FORMAT(record_date, '%Y-%m') as period, type, SUM(amount) as total
             FROM finance_records ${baseWhere}
             GROUP BY period, type ORDER BY period DESC`;
    } else if (groupBy === 'source') {
      sql = `SELECT COALESCE(reference_type, 'other') as source, type, SUM(amount) as total, COUNT(*) as count
             FROM finance_records ${baseWhere}
             GROUP BY reference_type, type ORDER BY total DESC`;
    } else {
      sql = `SELECT category, type, SUM(amount) as total, COUNT(*) as count
             FROM finance_records ${baseWhere}
             GROUP BY category, type ORDER BY total DESC`;
    }
    const [rows] = await pool.query(sql, baseParams);
    res.json({ code: 0, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取汇总失败' });
  }
});

module.exports = router;
