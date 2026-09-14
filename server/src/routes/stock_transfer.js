const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

const genTransferNo = async (tenantId) => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `DB${today}`;
  const [rows] = await pool.query(
    "SELECT transfer_no FROM stock_transfers WHERE tenant_id = ? AND transfer_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].transfer_no.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// 确保调拨目标账套存在该商品档案（跨账套调拨自动复制，保持各店独立账套）
async function ensureProductInTenant(conn, productId, destTenantId) {
  const [[src]] = await conn.query('SELECT * FROM products WHERE id = ?', [productId]);
  if (!src) throw new Error('商品不存在');
  let q = 'SELECT id FROM products WHERE tenant_id = ? AND status != ?';
  const p = [destTenantId, 'deleted'];
  if (src.barcode) { q += ' AND barcode = ?'; p.push(src.barcode); }
  else { q += ' AND name = ?'; p.push(src.name); }
  const [ex] = await conn.query(q + ' LIMIT 1', p);
  if (ex.length) return ex[0].id;
  const [ins] = await conn.query(
    `INSERT INTO products (tenant_id, category_id, name, barcode, sku, unit, cost_price, sell_price, wholesale_price, image_url, description, is_weigh, is_batch, min_stock, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [destTenantId, src.category_id, src.name, src.barcode, src.sku ? `${src.sku}-${destTenantId}` : null, src.unit,
     src.cost_price, src.sell_price, src.wholesale_price, src.image_url, src.description, src.is_weigh, src.is_batch, src.min_stock]
  );
  return ins.insertId;
}

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, keyword, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    // 集团内可见性：调拨单对该单的 发起账套 / 调出账套 / 调入账套 三方都可见
    // （总店发的单，相关分店作为调入方能够查到；分店发的单总店也能看到）
    let where = 'WHERE (st.tenant_id = ? OR st.from_tenant_id = ? OR st.to_tenant_id = ?)';
    const params = [req.tenantId, req.tenantId, req.tenantId];
    if (status) { where += ' AND st.status = ?'; params.push(status); }
    if (keyword) { where += ' AND (st.transfer_no LIKE ? OR fw.name LIKE ? OR tw.name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (startDate) { where += ' AND st.created_at >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND st.created_at <= ?'; params.push(endDate + ' 23:59:59'); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM stock_transfers st
       LEFT JOIN warehouses fw ON st.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON st.to_warehouse_id = tw.id ${where}`, params);

    const [rows] = await pool.query(
      `SELECT st.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name,
              ft.name as from_tenant_name, tt.name as to_tenant_name,
              u.real_name as operator_name, c.real_name as confirmer_name
       FROM stock_transfers st
       LEFT JOIN warehouses fw ON st.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON st.to_warehouse_id = tw.id
       LEFT JOIN tenants ft ON st.from_tenant_id = ft.id
       LEFT JOIN tenants tt ON st.to_tenant_id = tt.id
       LEFT JOIN users u ON st.operator_id = u.id
       LEFT JOIN users c ON st.confirmer_id = c.id
       ${where} ORDER BY st.id DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    for (const t of rows) {
      const [items] = await pool.query(
        `SELECT sti.*, p.name as product_name, p.unit FROM stock_transfer_items sti
         JOIN products p ON sti.product_id = p.id WHERE sti.transfer_id = ?`, [t.id]);
      t.items = items;
      t.item_count = items.length;
    }

    res.json({ code: 0, data: { list: rows, total, page: parseInt(page), pageSize: parseInt(pageSize) } });
  } catch (err) {
    console.error('获取调拨单列表失败:', err);
    res.status(500).json({ code: 500, message: '获取列表失败' });
  }
});

// 详情
router.get('/:id', async (req, res) => {
  try {
    const [[row]] = await pool.query(
      `SELECT st.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name,
              ft.name as from_tenant_name, tt.name as to_tenant_name
       FROM stock_transfers st
       LEFT JOIN warehouses fw ON st.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON st.to_warehouse_id = tw.id
       LEFT JOIN tenants ft ON st.from_tenant_id = ft.id
       LEFT JOIN tenants tt ON st.to_tenant_id = tt.id
       WHERE st.id = ? AND (st.tenant_id = ? OR st.from_tenant_id = ? OR st.to_tenant_id = ?)`, [req.params.id, req.tenantId, req.tenantId, req.tenantId]);
    if (!row) return res.status(404).json({ code: 404, message: '调拨单不存在' });
    const [items] = await pool.query(
      `SELECT sti.*, p.name as product_name, p.unit, p.barcode FROM stock_transfer_items sti
       JOIN products p ON sti.product_id = p.id WHERE sti.transfer_id = ?`, [row.id]);
    row.items = items;
    res.json({ code: 0, data: row });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取详情失败' });
  }
});

// 新建调拨单（调出方发起：总店↔分店 或 分店↔分店）
router.post('/', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  try {
    const { from_warehouse_id, to_warehouse_id, items, remark } = req.body;
    if (!from_warehouse_id || !to_warehouse_id) return res.status(400).json({ code: 400, message: '请选择调出和调入仓库' });
    if (from_warehouse_id === to_warehouse_id) return res.status(400).json({ code: 400, message: '调出和调入仓库不能相同' });
    if (!items?.length) return res.status(400).json({ code: 400, message: '请添加调拨商品' });

    const [fwRows] = await pool.query('SELECT id, tenant_id, name, status FROM warehouses WHERE id = ?', [from_warehouse_id]);
    const [twRows] = await pool.query('SELECT id, tenant_id, name, status FROM warehouses WHERE id = ?', [to_warehouse_id]);
    if (!fwRows.length || !twRows.length) return res.status(400).json({ code: 400, message: '仓库不存在' });
    if (fwRows[0].status !== 'active') return res.status(400).json({ code: 400, message: '调出仓库已暂停，无法调拨' });
    if (twRows[0].status !== 'active') return res.status(400).json({ code: 400, message: '调入仓库已暂停，无法调拨' });
    const fromTenant = fwRows[0].tenant_id;
    const toTenant = twRows[0].tenant_id;

    // 校验调出仓库存（按调出账套）
    for (const item of items) {
      const [inv] = await pool.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?',
        [fromTenant, item.product_id, from_warehouse_id]
      );
      const available = inv.length ? parseFloat(inv[0].quantity) : 0;
      if (available < parseFloat(item.quantity)) {
        const [prod] = await pool.query('SELECT name FROM products WHERE id = ?', [item.product_id]);
        return res.status(400).json({ code: 400, message: `商品「${prod[0]?.name || ''}」调出仓库存不足（可用${available}）` });
      }
    }

    const transferNo = await genTransferNo(req.tenantId);
    let totalAmount = 0;
    for (const item of items) {
      const [prod] = await pool.query('SELECT cost_price FROM products WHERE id = ?', [item.product_id]);
      item._cost = prod[0]?.cost_price || 0;
      totalAmount += (item.quantity || 0) * (item._cost || 0);
    }

    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const [result] = await conn.query(
        `INSERT INTO stock_transfers (tenant_id, from_tenant_id, to_tenant_id, transfer_no, from_warehouse_id, to_warehouse_id, status, total_amount, operator_id, remark)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        [req.tenantId, fromTenant, toTenant, transferNo, from_warehouse_id, to_warehouse_id, totalAmount, req.user.id, remark || null]
      );
      for (const item of items) {
        await conn.query(
          'INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, unit_cost, remark) VALUES (?, ?, ?, ?, ?)',
          [result.insertId, item.product_id, item.quantity, item._cost, item.remark || null]
        );
      }
      await conn.commit();
      res.json({ code: 0, message: '调拨单创建成功', data: { id: result.insertId, transfer_no: transferNo } });
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  } catch (err) {
    console.error('创建调拨单失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 确认调拨（调出方确认出库）：调出仓扣减库存 → 在真正入库方账套生成"调拨入库"草稿单（自动建档），
// 真正入库方在其入库单里确认后才加库存。权责分开，入库由真正入库方入。
router.post('/:id/confirm', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[transfer]] = await conn.query(
      'SELECT * FROM stock_transfers WHERE id = ? AND (tenant_id = ? OR from_tenant_id = ? OR to_tenant_id = ?) AND status = "draft" FOR UPDATE',
      [req.params.id, req.tenantId, req.tenantId, req.tenantId]
    );
    if (!transfer) { await conn.rollback(); return res.status(400).json({ code: 400, message: '调拨单不存在或已确认' }); }

    const [items] = await conn.query('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [transfer.id]);
    const fromTenant = transfer.from_tenant_id || transfer.tenant_id;
    const toTenant = transfer.to_tenant_id || transfer.tenant_id;

    // 1) 调出仓扣减（按调出账套）+ 写调拨出库流水
    //    同时自动生成一张"调拨出库"已确认出库单（作为调出追溯单据，不重复扣库存）
    const outNo = await genOutNo(conn, fromTenant);
    const [outRes] = await conn.query(
      `INSERT INTO stock_out_orders (tenant_id, order_no, warehouse_id, out_type, total_amount, status, operator_id, remark)
       VALUES (?, ?, ?, 'transfer_out', ?, 'confirmed', ?, ?)`,
      [fromTenant, outNo, transfer.from_warehouse_id, transfer.total_amount || 0, req.user.id, `调拨出库(自动) - ${transfer.transfer_no}`]
    );
    const transferOutId = outRes.insertId;
    for (const item of items) {
      const [fromInv] = await conn.query(
        'SELECT * FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? FOR UPDATE',
        [fromTenant, item.product_id, transfer.from_warehouse_id]
      );
      if (!fromInv.length || parseFloat(fromInv[0].quantity) < parseFloat(item.quantity)) {
        await conn.rollback();
        return res.status(400).json({ code: 400, message: '调出仓库存不足' });
      }
      const fromBefore = parseFloat(fromInv[0].quantity);
      const fromAfter = fromBefore - parseFloat(item.quantity);
      await conn.query('UPDATE inventory SET quantity = ? WHERE id = ?', [fromAfter, fromInv[0].id]);
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id, remark)
         VALUES (?, ?, ?, 'transfer_out', ?, ?, ?, ?, 'transfer', ?, ?, ?)`,
        [fromTenant, item.product_id, transfer.from_warehouse_id, -item.quantity, fromBefore, fromAfter,
         item.unit_cost, transfer.id, req.user.id, `调拨出库 - ${transfer.transfer_no}`]
      );
      await conn.query(
        'INSERT INTO stock_out_items (stock_out_id, product_id, quantity, unit_cost, remark) VALUES (?, ?, ?, ?, ?)',
        [transferOutId, item.product_id, item.quantity, item.unit_cost, item.remark || null]
      );
    }

    // 2) 在真正入库方账套生成一张"调拨入库"草稿单（含明细；商品自动建档到入库方）
    //    真正入库方在自己的"入库单"里确认后才加库存
    const orderNo = await genInOrderNo(conn, toTenant);
    const [insRes] = await conn.query(
      `INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, from_tenant_id, from_warehouse_id, source_order_type, source_order_id, total_amount, status, operator_id, remark)
       VALUES (?, ?, ?, 'transfer_in', ?, ?, 'stock_transfer', ?, ?, 'draft', ?, ?)`,
      [toTenant, orderNo, transfer.to_warehouse_id, fromTenant, transfer.from_warehouse_id,
       transfer.id, transfer.total_amount || 0, req.user.id, `调拨入库(待确认) - ${transfer.transfer_no}`]
    );
    const destStockInId = insRes.insertId;
    for (const item of items) {
      // 跨账套时先确保入库方商品档案存在
      let destProductId = item.product_id;
      if (fromTenant !== toTenant) {
        destProductId = await ensureProductInTenant(conn, item.product_id, toTenant);
      }
      await conn.query(
        'INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost, remark) VALUES (?, ?, ?, ?, ?)',
        [destStockInId, destProductId, item.quantity, item.unit_cost, item.remark || null]
      );
    }

    // 3) 调拨单状态：in_transit（在途，等待真正入库方确认入库）
    await conn.query(
      "UPDATE stock_transfers SET status = 'in_transit', confirmer_id = ?, confirm_time = NOW() WHERE id = ?",
      [req.user.id, transfer.id]
    );
    await conn.commit();
    res.json({ code: 0, message: '调拨已出库，待调入方在入库单确认后入库', data: { transfer_id: transfer.id, stock_in_id: destStockInId, wait_in: true } });
  } catch (err) {
    await conn.rollback();
    console.error('确认调拨失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

async function genInOrderNo(conn, tenantId) {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `RK${today}`;
  const [rows] = await conn.query(
    "SELECT order_no FROM stock_in_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].order_no.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// 生成自动出库单号（调拨出库等自动落账） CK 前缀
async function genOutNo(conn, tenantId) {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `CK${today}`;
  const [rows] = await conn.query(
    "SELECT order_no FROM stock_out_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = rows.length ? parseInt(rows[0].order_no.slice(-3)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

// 删除（仅草稿）
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      "SELECT * FROM stock_transfers WHERE id = ? AND (tenant_id = ? OR from_tenant_id = ? OR to_tenant_id = ?) AND status = 'draft'",
      [req.params.id, req.tenantId, req.tenantId, req.tenantId]
    );
    if (!row) { await conn.rollback(); return res.status(400).json({ code: 400, message: '调拨单不存在或无法删除' }); }
    await conn.query('DELETE FROM stock_transfer_items WHERE transfer_id = ?', [row.id]);
    await conn.query('DELETE FROM stock_transfers WHERE id = ?', [row.id]);
    await conn.commit();
    res.json({ code: 0, message: '调拨单已删除' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

module.exports = router;