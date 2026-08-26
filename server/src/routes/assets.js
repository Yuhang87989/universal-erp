const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 资产编号生成
async function genAssetNo(tenantId) {
  const prefix = 'FA' + dayjs().format('YYYY');
  const [rows] = await pool.query(
    "SELECT asset_no FROM fixed_assets WHERE tenant_id=? AND asset_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, prefix + '%']
  );
  let seq = 1;
  if (rows.length) {
    seq = parseInt(rows[0].asset_no.slice(-4)) + 1;
  }
  return prefix + String(seq).padStart(4, '0');
}

// 计算月折旧额（直线法）
function calcMonthlyDepreciation(originalValue, residual, lifeMonths) {
  if (lifeMonths <= 0) return 0;
  return Math.max(0, (originalValue - residual) / lifeMonths);
}

// =================== 固定资产列表 ===================
router.get('/', async (req, res) => {
  try {
    const { status, category, keyword } = req.query;
    let where = 'WHERE tenant_id=?';
    const params = [req.tenantId];
    if (status) { where += ' AND status=?'; params.push(status); }
    if (category) { where += ' AND category=?'; params.push(category); }
    if (keyword) { where += ' AND (asset_name LIKE ? OR asset_no LIKE ?)'; params.push('%'+keyword+'%', '%'+keyword+'%'); }

    const [rows] = await pool.query(
      `SELECT * FROM fixed_assets ${where} ORDER BY id DESC`, params
    );
    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('获取固定资产失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const [[asset]] = await pool.query('SELECT * FROM fixed_assets WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    if (!asset) return res.status(404).json({ code: 404, message: '资产不存在' });
    const [records] = await pool.query(
      'SELECT * FROM depreciation_records WHERE asset_id=? ORDER BY period DESC', [req.params.id]
    );
    res.json({ code: 0, data: { ...asset, depreciation_records: records } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 新增固定资产
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { asset_name, category, specification, acquisition_date, original_value,
      estimated_residual, useful_life_months, depreciation_method, department,
      responsible_person, warehouse_id, remark } = req.body;

    if (!asset_name || !acquisition_date || !original_value || !useful_life_months)
      return res.status(400).json({ code: 400, message: '资产名称、取得日期、原值、使用月数必填' });

    const assetNo = await genAssetNo(req.tenantId);
    const residual = parseFloat(estimated_residual || 0);
    const life = parseInt(useful_life_months);
    const monthly = calcMonthlyDepreciation(parseFloat(original_value), residual, life);

    const [r] = await pool.query(
      `INSERT INTO fixed_assets
       (tenant_id, asset_no, asset_name, category, specification, acquisition_date,
        original_value, estimated_residual, useful_life_months, depreciation_method,
        monthly_depreciation, accumulated_depreciation, net_value, status,
        warehouse_id, department, responsible_person, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'straight_line', ?, 0, ?, 'in_use', ?, ?, ?, ?)`,
      [req.tenantId, assetNo, asset_name, category || 'other', specification || null,
       acquisition_date, original_value, residual, life, monthly, original_value,
       warehouse_id || null, department || null, responsible_person || null, remark || null]
    );
    res.json({ code: 0, message: '固定资产已登记', data: { id: r.insertId, asset_no: assetNo, monthly_depreciation: monthly } });
  } catch (err) {
    console.error('新增固定资产失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 更新
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { asset_name, category, specification, estimated_residual, useful_life_months,
      department, responsible_person, warehouse_id, remark, status } = req.body;
    const [[asset]] = await pool.query('SELECT * FROM fixed_assets WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    if (!asset) return res.status(404).json({ code: 404, message: '资产不存在' });

    const newLife = useful_life_months ? parseInt(useful_life_months) : asset.useful_life_months;
    const newResidual = estimated_residual !== undefined ? parseFloat(estimated_residual) : parseFloat(asset.estimated_residual);
    const newMonthly = calcMonthlyDepreciation(parseFloat(asset.original_value), newResidual, newLife);

    await pool.query(
      `UPDATE fixed_assets SET asset_name=?, category=?, specification=?, estimated_residual=?,
        useful_life_months=?, monthly_depreciation=?, department=?, responsible_person=?,
        warehouse_id=?, remark=?, status=? WHERE id=?`,
      [asset_name || asset.asset_name, category || asset.category, specification || asset.specification,
       newResidual, newLife, newMonthly, department || asset.department,
       responsible_person || asset.responsible_person, warehouse_id || asset.warehouse_id,
       remark !== undefined ? remark : asset.remark, status || asset.status, req.params.id]
    );
    res.json({ code: 0, message: '已更新' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 处置（报废/出售）
router.post('/:id/dispose', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { disposal_date, disposal_amount, remark } = req.body;
    await conn.beginTransaction();
    const [[asset]] = await conn.query('SELECT * FROM fixed_assets WHERE id=? AND tenant_id=? FOR UPDATE', [req.params.id, req.tenantId]);
    if (!asset) { await conn.rollback(); return res.status(404).json({ code: 404, message: '资产不存在' }); }
    if (asset.status === 'disposed') { await conn.rollback(); return res.status(400).json({ code: 400, message: '资产已处置' }); }

    // 处置时先补提到处置当月
    const disposeDate = disposal_date || dayjs().format('YYYY-MM-DD');
    // 这里简化：直接标记处置，不做补提（可在计提折旧时统一处理）
    await conn.query(
      `UPDATE fixed_assets SET status='disposed', disposal_date=?, disposal_amount=?, remark=CONCAT(IFNULL(remark,''), ?) WHERE id=?`,
      [disposeDate, disposal_amount || 0, remark ? ` | 处置: ${remark}` : '', req.params.id]
    );
    await conn.commit();
    res.json({ code: 0, message: '资产已处置' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ code: 500, message: err.message });
  } finally {
    conn.release();
  }
});

// =================== 折旧计提 ===================

// 查询某月折旧预览（哪些资产需要计提、金额多少）
router.get('/depreciation/preview', async (req, res) => {
  try {
    const period = req.query.period || dayjs().format('YYYY-MM');
    const periodStart = dayjs(period + '-01');

    // 查找在该月需要计提折旧的资产：
    // 1. 状态为in_use或idle
    // 2. 取得日期早于该月
    // 3. 未提足折旧（累计折旧 < 原值-残值）
    // 4. 该月尚未计提
    const [assets] = await pool.query(
      `SELECT fa.* FROM fixed_assets fa
       WHERE fa.tenant_id=? AND fa.status IN ('in_use','idle')
         AND fa.acquisition_date < DATE_ADD(?, INTERVAL 1 MONTH)
         AND fa.accumulated_depreciation < (fa.original_value - fa.estimated_residual) - 0.01
         AND NOT EXISTS (
           SELECT 1 FROM depreciation_records dr
           WHERE dr.asset_id=fa.id AND dr.period=?
         )
       ORDER BY fa.id`,
      [req.tenantId, periodStart.format('YYYY-MM-DD'), period]
    );

    // 计算每个资产本月应提折旧
    const list = assets.map(a => {
      const remaining = parseFloat(a.original_value) - parseFloat(a.estimated_residual) - parseFloat(a.accumulated_depreciation);
      const monthly = parseFloat(a.monthly_depreciation);
      const amount = Math.min(monthly, Math.max(0, remaining));
      return {
        id: a.id, asset_no: a.asset_no, asset_name: a.asset_name, category: a.category,
        acquisition_date: a.acquisition_date, original_value: parseFloat(a.original_value),
        estimated_residual: parseFloat(a.estimated_residual), accumulated_depreciation: parseFloat(a.accumulated_depreciation),
        monthly_depreciation: monthly, amount: Math.round(amount * 100) / 100,
        net_value: parseFloat(a.net_value)
      };
    });
    const total = list.reduce((s, a) => s + a.amount, 0);
    res.json({ code: 0, data: { period, list, total: Math.round(total * 100) / 100, count: list.length } });
  } catch (err) {
    console.error('折旧预览失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 执行某月折旧计提
router.post('/depreciation/run', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const period = req.body.period || dayjs().format('YYYY-MM');
    await conn.beginTransaction();

    // 取待计提资产
    const periodStart = dayjs(period + '-01');
    const [assets] = await conn.query(
      `SELECT fa.* FROM fixed_assets fa
       WHERE fa.tenant_id=? AND fa.status IN ('in_use','idle')
         AND fa.acquisition_date < DATE_ADD(?, INTERVAL 1 MONTH)
         AND fa.accumulated_depreciation < (fa.original_value - fa.estimated_residual) - 0.01
         AND NOT EXISTS (
           SELECT 1 FROM depreciation_records dr WHERE dr.asset_id=fa.id AND dr.period=?
         )
       ORDER BY fa.id FOR UPDATE`,
      [req.tenantId, periodStart.format('YYYY-MM-DD'), period]
    );

    if (!assets.length) {
      await conn.rollback();
      return res.json({ code: 0, message: `${period} 没有需要计提折旧的资产`, data: { count: 0, total: 0 } });
    }

    let totalDep = 0;
    for (const a of assets) {
      const remaining = parseFloat(a.original_value) - parseFloat(a.estimated_residual) - parseFloat(a.accumulated_depreciation);
      const monthly = parseFloat(a.monthly_depreciation);
      const amount = Math.round(Math.min(monthly, Math.max(0, remaining)) * 100) / 100;
      if (amount <= 0) continue;

      const newAccumulated = Math.round((parseFloat(a.accumulated_depreciation) + amount) * 100) / 100;
      const newNet = Math.round((parseFloat(a.original_value) - newAccumulated) * 100) / 100;

      await conn.query(
        'UPDATE fixed_assets SET accumulated_depreciation=?, net_value=? WHERE id=?',
        [newAccumulated, newNet, a.id]
      );
      await conn.query(
        `INSERT INTO depreciation_records (tenant_id, asset_id, period, amount, accumulated_after, net_value_after)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [req.tenantId, a.id, period, amount, newAccumulated, newNet]
      );
      totalDep += amount;
    }

    await conn.commit();
    res.json({ code: 0, message: `${period} 折旧计提完成`, data: { count: assets.length, total: Math.round(totalDep * 100) / 100 } });
  } catch (err) {
    await conn.rollback();
    console.error('折旧计提失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally {
    conn.release();
  }
});

// 折旧历史记录
router.get('/depreciation/history', async (req, res) => {
  try {
    const { period, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE dr.tenant_id=?';
    const params = [req.tenantId];
    if (period) { where += ' AND dr.period=?'; params.push(period); }

    const [[{total}]] = await pool.query(`SELECT COUNT(*) as total FROM depreciation_records dr ${where}`, params);
    const [rows] = await pool.query(
      `SELECT dr.*, fa.asset_no, fa.asset_name, fa.category
       FROM depreciation_records dr
       JOIN fixed_assets fa ON fa.id=dr.asset_id
       ${where} ORDER BY dr.period DESC, dr.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );
    // 按期间汇总
    const [summary] = await pool.query(
      `SELECT period, COUNT(*) as asset_count, SUM(amount) as total_amount
       FROM depreciation_records WHERE tenant_id=? GROUP BY period ORDER BY period DESC LIMIT 12`,
      [req.tenantId]
    );
    res.json({ code: 0, data: { list: rows, total, summary, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
