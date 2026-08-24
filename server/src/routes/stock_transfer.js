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

// 列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, keyword, startDate, endDate } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE st.tenant_id = ?';
    const params = [req.tenantId];
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
              u.real_name as operator_name, c.real_name as confirmer_name
       FROM stock_transfers st
       LEFT JOIN warehouses fw ON st.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON st.to_warehouse_id = tw.id
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
      `SELECT st.*, fw.name as from_warehouse_name, tw.name as to_warehouse_name
       FROM stock_transfers st
       LEFT JOIN warehouses fw ON st.from_warehouse_id = fw.id
       LEFT JOIN warehouses tw ON st.to_warehouse_id = tw.id
       WHERE st.id = ? AND st.tenant_id = ?`, [req.params.id, req.tenantId]);
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

// 新建调拨单
router.post('/', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  try {
    const { from_warehouse_id, to_warehouse_id, items, remark } = req.body;
    if (!from_warehouse_id || !to_warehouse_id) return res.status(400).json({ code: 400, message: '请选择调出和调入仓库' });
    if (from_warehouse_id === to_warehouse_id) return res.status(400).json({ code: 400, message: '调出和调入仓库不能相同' });
    if (!items?.length) return res.status(400).json({ code: 400, message: '请添加调拨商品' });

    // 校验调出仓库库存
    for (const item of items) {
      const [inv] = await pool.query(
        'SELECT quantity FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ?',
        [req.tenantId, item.product_id, from_warehouse_id]
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
        `INSERT INTO stock_transfers (tenant_id, transfer_no, from_warehouse_id, to_warehouse_id, status, total_amount, operator_id, remark)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
        [req.tenantId, transferNo, from_warehouse_id, to_warehouse_id, totalAmount, req.user.id, remark || null]
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

// 确认调拨（一步完成：调出仓扣减 + 调入仓增加 + 写流水）
router.post('/:id/confirm', requireRole('owner', 'manager', 'warehouse'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[transfer]] = await conn.query(
      'SELECT * FROM stock_transfers WHERE id = ? AND tenant_id = ? AND status = "draft" FOR UPDATE',
      [req.params.id, req.tenantId]
    );
    if (!transfer) { await conn.rollback(); return res.status(400).json({ code: 400, message: '调拨单不存在或已确认' }); }

    const [items] = await conn.query('SELECT * FROM stock_transfer_items WHERE transfer_id = ?', [transfer.id]);

    for (const item of items) {
      // 调出仓扣减
      const [fromInv] = await conn.query(
        'SELECT * FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? FOR UPDATE',
        [req.tenantId, item.product_id, transfer.from_warehouse_id]
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
        [req.tenantId, item.product_id, transfer.from_warehouse_id, -item.quantity, fromBefore, fromAfter,
         item.unit_cost, transfer.id, req.user.id, `调拨出库 - ${transfer.transfer_no}`]
      );

      // 调入仓增加
      const [toInv] = await conn.query(
        'SELECT * FROM inventory WHERE tenant_id = ? AND product_id = ? AND warehouse_id = ? FOR UPDATE',
        [req.tenantId, item.product_id, transfer.to_warehouse_id]
      );
      const toBefore = toInv.length ? parseFloat(toInv[0].quantity) : 0;
      const toAfter = toBefore + parseFloat(item.quantity);
      if (toInv.length) {
        await conn.query('UPDATE inventory SET quantity = ? WHERE id = ?', [toAfter, toInv[0].id]);
      } else {
        await conn.query(
          'INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity) VALUES (?, ?, ?, ?)',
          [req.tenantId, item.product_id, transfer.to_warehouse_id, toAfter]
        );
      }

      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id, remark)
         VALUES (?, ?, ?, 'transfer_in', ?, ?, ?, ?, 'transfer', ?, ?, ?)`,
        [req.tenantId, item.product_id, transfer.to_warehouse_id, item.quantity, toBefore, toAfter,
         item.unit_cost, transfer.id, req.user.id, `调拨入库 - ${transfer.transfer_no}`]
      );
    }

    await conn.query(
      "UPDATE stock_transfers SET status = 'completed', confirmer_id = ?, confirm_time = NOW() WHERE id = ?",
      [req.user.id, transfer.id]
    );
    await conn.commit();
    res.json({ code: 0, message: '调拨完成，库存已同步' });
  } catch (err) {
    await conn.rollback();
    console.error('确认调拨失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 删除（仅草稿）
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.query(
      "SELECT * FROM stock_transfers WHERE id = ? AND tenant_id = ? AND status = 'draft'",
      [req.params.id, req.tenantId]
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
