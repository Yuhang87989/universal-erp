const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 辅助：生成盘点单号
async function generateStocktakeNo(conn, tenantId, date) {
  const dateStr = dayjs(date).format('YYYYMMDD');
  const pattern = `PD-${dateStr}-%`;
  const [last] = await conn.query(
    `SELECT stocktake_no FROM stocktakes WHERE tenant_id = ? AND stocktake_no LIKE ? ORDER BY stocktake_no DESC LIMIT 1`,
    [tenantId, pattern]
  );
  let seq = 1;
  if (last.length) {
    const parts = last[0].stocktake_no.split('-');
    seq = parseInt(parts[2] || '0') + 1;
  }
  return `PD-${dateStr}-${String(seq).padStart(3, '0')}`;
}

// 获取盘点单列表
router.get('/', async (req, res) => {
  try {
    const { status, stocktake_type, page = 1, pageSize = 20 } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE s.tenant_id = ?';
    const params = [req.tenantId];

    if (status) { where += ' AND s.status = ?'; params.push(status); }
    if (stocktake_type) { where += ' AND s.stocktake_type = ?'; params.push(stocktake_type); }

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM stocktakes s ${where}`, params);

    const [list] = await pool.query(
      `SELECT s.*, u1.real_name as operator_name, u2.real_name as reviewer_name
       FROM stocktakes s
       LEFT JOIN users u1 ON s.operator_id = u1.id
       LEFT JOIN users u2 ON s.reviewer_id = u2.id
       ${where} ORDER BY s.stocktake_date DESC, s.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      code: 0,
      data: { list, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取盘点列表失败: ' + err.message });
  }
});

// 获取盘点单详情
router.get('/:id', async (req, res) => {
  try {
    const [list] = await pool.query(
      `SELECT s.*, u1.real_name as operator_name, u2.real_name as reviewer_name
       FROM stocktakes s
       LEFT JOIN users u1 ON s.operator_id = u1.id
       LEFT JOIN users u2 ON s.reviewer_id = u2.id
       WHERE s.id = ? AND s.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );
    if (!list.length) return res.status(404).json({ code: 404, message: '盘点单不存在' });

    const [items] = await pool.query(
      `SELECT si.*, p.name as product_name, p.unit, p.barcode as product_barcode, p.cost_price,
        c.name as category_name
       FROM stocktake_items si
       JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE si.stocktake_id = ?
       ORDER BY p.name ASC`,
      [req.params.id]
    );

    res.json({ code: 0, data: { ...list[0], items } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取盘点详情失败: ' + err.message });
  }
});

// 创建盘点单
router.post('/', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { stocktake_type = 'full', stocktake_date, warehouse_id = 1, product_ids, remark } = req.body;
    const date = stocktake_date || dayjs().format('YYYY-MM-DD');
    const stocktakeNo = await generateStocktakeNo(conn, req.tenantId, date);

    const [result] = await conn.query(
      `INSERT INTO stocktakes (tenant_id, stocktake_no, warehouse_id, stocktake_type, stocktake_date, status, operator_id, remark)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [req.tenantId, stocktakeNo, warehouse_id, stocktake_type, date, req.user.id, remark || null]
    );
    const stocktakeId = result.insertId;

    // 全盘：加载所有商品
    let productWhere = 'WHERE p.tenant_id = ? AND p.status = ?';
    const productParams = [req.tenantId, 'active'];

    // 抽盘：指定商品
    if (stocktake_type === 'partial' && product_ids && product_ids.length) {
      productWhere += ` AND p.id IN (${product_ids.map(() => '?').join(',')})`;
      productParams.push(...product_ids);
    }

    const [products] = await conn.query(
      `SELECT p.id, p.name, p.barcode, p.unit, p.cost_price
       FROM products p ${productWhere} ORDER BY p.name ASC`,
      productParams
    );

    // 批量插入盘点明细
    for (const p of products) {
      // 获取当前库存
      const [inv] = await conn.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?',
        [req.tenantId, p.id, warehouse_id]
      );
      const systemQty = inv.length ? parseFloat(inv[0].quantity) : 0;

      await conn.query(
        `INSERT INTO stocktake_items (stocktake_id, product_id, barcode, system_quantity, actual_quantity, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [stocktakeId, p.id, p.barcode, systemQty, systemQty, p.cost_price]
      );
    }

    // 更新统计
    await conn.query(
      'UPDATE stocktakes SET total_items = ? WHERE id = ?',
      [products.length, stocktakeId]
    );

    await conn.commit();
    res.json({ code: 0, message: `盘点单创建成功，共 ${products.length} 个商品`, data: { id: stocktakeId, stocktake_no: stocktakeNo } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 录入/更新盘点实盘数量
router.put('/:id/items', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 检查盘点单状态
    const [st] = await conn.query('SELECT status FROM stocktakes WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!st.length) throw new Error('盘点单不存在');
    if (!['draft', 'counting'].includes(st[0].status)) throw new Error('当前状态不允许录入');

    const { items } = req.body; // [{item_id, actual_quantity, remark}]
    if (!items || !Array.isArray(items)) throw new Error('盘点数据不能为空');

    for (const item of items) {
      await conn.query(
        'UPDATE stocktake_items SET actual_quantity = ?, remark = COALESCE(?, remark) WHERE id = ? AND stocktake_id = ?',
        [item.actual_quantity, item.remark || null, item.item_id, req.params.id]
      );
    }

    // 更新状态为盘点中
    if (st[0].status === 'draft') {
      await conn.query('UPDATE stocktakes SET status = ? WHERE id = ?', ['counting', req.params.id]);
    }

    await conn.commit();
    res.json({ code: 0, message: '盘点数据已保存' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 完成盘点（计算差异统计）
router.post('/:id/complete', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [st] = await conn.query('SELECT * FROM stocktakes WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!st.length) throw new Error('盘点单不存在');
    if (st[0].status === 'completed') throw new Error('盘点单已完成');

    // 计算差异统计
    const [stats] = await conn.query(
      `SELECT 
        COUNT(*) as total_items,
        SUM(CASE WHEN actual_quantity = system_quantity THEN 1 ELSE 0 END) as matched_items,
        SUM(CASE WHEN actual_quantity > system_quantity THEN 1 ELSE 0 END) as over_items,
        SUM(CASE WHEN actual_quantity < system_quantity THEN 1 ELSE 0 END) as loss_items,
        COALESCE(SUM(CASE WHEN actual_quantity > system_quantity THEN (actual_quantity - system_quantity) * COALESCE(unit_cost, 0) ELSE 0 END), 0) as total_over_amount,
        COALESCE(SUM(CASE WHEN actual_quantity < system_quantity THEN (system_quantity - actual_quantity) * COALESCE(unit_cost, 0) ELSE 0 END), 0) as total_loss_amount
       FROM stocktake_items WHERE stocktake_id = ?`,
      [req.params.id]
    );

    const s = stats[0];
    await conn.query(
      `UPDATE stocktakes SET status = 'reviewing', total_items = ?, matched_items = ?, 
       over_items = ?, loss_items = ?, total_over_amount = ?, total_loss_amount = ?, reviewer_id = ?
       WHERE id = ?`,
      [s.total_items, s.matched_items, s.over_items, s.loss_items, s.total_over_amount, s.total_loss_amount, req.user.id, req.params.id]
    );

    await conn.commit();
    res.json({
      code: 0,
      message: '盘点统计完成',
      data: {
        total_items: s.total_items,
        matched_items: s.matched_items,
        over_items: s.over_items,
        loss_items: s.loss_items,
        total_over_amount: parseFloat(s.total_over_amount),
        total_loss_amount: parseFloat(s.total_loss_amount)
      }
    });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 确认调整（自动更新库存）
router.post('/:id/adjust', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [st] = await conn.query('SELECT * FROM stocktakes WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!st.length) throw new Error('盘点单不存在');
    if (st[0].status !== 'reviewing') throw new Error('只有复核中的盘点单可以确认调整');

    // 获取有差异的明细
    const [diffItems] = await conn.query(
      `SELECT si.*, p.name as product_name
       FROM stocktake_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.stocktake_id = ? AND si.actual_quantity != si.system_quantity`,
      [req.params.id]
    );

    let adjustCount = 0;
    for (const item of diffItems) {
      const variance = parseFloat(item.actual_quantity) - parseFloat(item.system_quantity);
      const warehouseId = st[0].warehouse_id || 1;

      // 更新库存
      await conn.query(
        `UPDATE inventory SET quantity = ? WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?`,
        [item.actual_quantity, req.tenantId, item.product_id, warehouseId]
      );

      // 记录库存变动流水
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, remark, operator_id)
         VALUES (?, ?, ?, 'check', ?, ?, ?, ?, 'stocktake', ?, ?, ?)`,
        [req.tenantId, item.product_id, warehouseId, variance, item.system_quantity, item.actual_quantity,
         item.unit_cost, req.params.id, `盘点调整：${item.product_name} ${item.system_quantity}→${item.actual_quantity}`, req.user.id]
      );
      adjustCount++;
    }

    // 更新盘点单状态
    await conn.query(
      "UPDATE stocktakes SET status = 'completed' WHERE id = ?",
      [req.params.id]
    );

    await conn.commit();
    res.json({ code: 0, message: `库存调整完成，共调整 ${adjustCount} 个商品` });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
