const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 判断某仓库是否在当前登录账套的可管理范围内：
//  - 子店只能管理自己的仓库
//  - 集团根（is_group_root=1）可管理 自己 + 其所有子账套 + 共享仓 的仓库（供总店统一启停/删除分店仓库）
async function canManageWarehouse(tenantId, whId) {
  const [[wh]] = await pool.query('SELECT tenant_id, is_shared FROM warehouses WHERE id = ?', [whId]);
  if (!wh) return false;
  const [[tn]] = await pool.query('SELECT parent_id, is_group_root FROM tenants WHERE id = ?', [tenantId]);
  if (!tn) return false;
  if (tn.is_group_root === 1) {
    if (wh.tenant_id === tenantId || wh.is_shared) return true;
    let cursor = wh.tenant_id;
    const seen = new Set();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      if (cursor === tenantId) return true;
      const [[p]] = await pool.query('SELECT id, parent_id FROM tenants WHERE id = ?', [cursor]);
      if (!p || !p.parent_id) break;
      cursor = p.parent_id;
    }
    return false;
  }
  return wh.tenant_id === tenantId;
}

// 仓库列表（含集团共享总仓）
router.get('/', async (req, res) => {
  try {
    const { keyword, status } = req.query;
    let where = 'WHERE tenant_id = ?';
    const params = [req.tenantId];
    if (keyword) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
    if (status) { where += ' AND status = ?'; params.push(status); }
    const [my] = await pool.query(`SELECT * FROM warehouses ${where} ORDER BY is_default DESC, sort_order ASC, id ASC`, params);

    // 集团共享总仓与跨店仓库可见性：
    //  - 总店（集团根，is_group_root=1）：可见 自己的仓库 + 全部共享仓 + 所有子账套的 active 仓库，
    //    便于总店从总仓统一调拨发货到各分店
    //  - 子店：可见 自己的仓库 + 集团内全部共享总仓
    const rows = [...my];
    try {
      const [[tn]] = await pool.query('SELECT parent_id, is_group_root FROM tenants WHERE id = ?', [req.tenantId]);
      const isRoot = tn && tn.is_group_root === 1;
      const inGroup = tn && (isRoot || tn.parent_id !== null);
      if (isRoot) {
        const [groupWhs] = await pool.query(
          `SELECT w.*, t.name AS tenant_name FROM warehouses w
           LEFT JOIN tenants t ON w.tenant_id = t.id
           WHERE (w.is_shared = 1 OR w.tenant_id IN (SELECT id FROM tenants WHERE parent_id = ?))
           ORDER BY w.id`,
          [req.tenantId]
        );
        for (const g of groupWhs) {
          if (!rows.find(r => r.id === g.id)) rows.push({ ...g, __is_shared: g.is_shared === 1, __tenant_name: g.tenant_name });
        }
      } else if (inGroup) {
        // 子店可见：自己 + 共享总仓 + 同集团内其他子店(兄弟店/总店)的 active 仓库，
        // 便于子店与子店之间直接调拨（A 仓出、B 仓入），也保持各店仓库在总店侧完整可见
        const [[root]] = await pool.query(
          'SELECT id, parent_id, is_group_root FROM tenants WHERE id = ?', [req.tenantId]
        );
        let rootId = req.tenantId;
        let curT = root;
        const seenT = new Set();
        while (curT && curT.parent_id && !seenT.has(curT.parent_id)) {
          seenT.add(curT.parent_id);
          const [[p]] = await pool.query('SELECT id, parent_id, is_group_root FROM tenants WHERE id = ?', [curT.parent_id]);
          if (!p) break;
          rootId = p.id; curT = p;
          if (p.is_group_root === 1 || !p.parent_id) break;
        }
        const [groupWhs] = await pool.query(
          `SELECT w.*, t.name AS tenant_name FROM warehouses w
           LEFT JOIN tenants t ON w.tenant_id = t.id
           WHERE (
             w.tenant_id = ?
             OR w.tenant_id IN (SELECT id FROM tenants WHERE parent_id = ? OR id = ?)
             OR w.is_shared = 1
           ) ORDER BY w.id`,
          [req.tenantId, rootId, rootId]
        );
        for (const g of groupWhs) {
          if (!rows.find(r => r.id === g.id)) rows.push({ ...g, __is_shared: g.is_shared === 1, __tenant_name: g.tenant_name });
        }
      }
    } catch (e) { /* 非集团环境忽略 */ }

    // 统计每个仓库的库存品种数和总价值（按仓库归属账套统计）
    for (const w of rows) {
      const [stats] = await pool.query(
        `SELECT COUNT(*) as sku_count, COALESCE(SUM(i.quantity * p.cost_price), 0) as total_value
         FROM inventory i JOIN products p ON i.product_id = p.id
         WHERE i.tenant_id = ? AND i.warehouse_id = ?`,
        [w.tenant_id, w.id]
      );
      w.sku_count = stats[0].sku_count;
      w.total_value = stats[0].total_value;
    }

    res.json({ code: 0, data: rows });
  } catch (err) {
    console.error('获取仓库列表失败:', err);
    res.status(500).json({ code: 500, message: '获取仓库列表失败' });
  }
});

// 新增仓库
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { code, name, address, manager, phone, is_default, is_shared, remark } = req.body;
    if (!code || !name) return res.status(400).json({ code: 400, message: '仓库编码和名称不能为空' });

    await conn.beginTransaction();
    if (is_default) {
      await conn.query('UPDATE warehouses SET is_default = FALSE WHERE tenant_id = ?', [req.tenantId]);
    }
    const [result] = await conn.query(
      `INSERT INTO warehouses (tenant_id, code, name, address, manager, phone, is_default, is_shared, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, code, name, address || null, manager || null, phone || null, is_default || false, is_shared || false, remark || null]
    );
    await conn.commit();
    res.json({ code: 0, message: '仓库创建成功', data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ code: 400, message: '仓库编码已存在' });
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 修改仓库
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!await canManageWarehouse(req.tenantId, req.params.id)) {
      conn.release(); return res.status(404).json({ code: 404, message: '仓库不存在或无权限' });
    }
    const [[wh]] = await pool.query('SELECT tenant_id FROM warehouses WHERE id = ?', [req.params.id]);
    const { code, name, address, manager, phone, is_default, status, remark } = req.body;
    await conn.beginTransaction();
    if (is_default) {
      await conn.query('UPDATE warehouses SET is_default = FALSE WHERE tenant_id = ? AND id != ?', [wh.tenant_id, req.params.id]);
    }
    await conn.query(
      `UPDATE warehouses SET code=?, name=?, address=?, manager=?, phone=?, is_default=?, status=?, remark=?
       WHERE id=?`,
      [code, name, address || null, manager || null, phone || null, is_default || false, status || 'active', remark || null, req.params.id]
    );
    await conn.commit();
    res.json({ code: 0, message: '仓库更新成功' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ code: 500, message: err.message });
  } finally { conn.release(); }
});

// 启用/暂停仓库（子店管自己的；总店可管集团内的）
router.put('/:id/status', requireRole('owner', 'manager'), async (req, res) => {
  try {
    if (!await canManageWarehouse(req.tenantId, req.params.id)) return res.status(404).json({ code: 404, message: '仓库不存在或无权限' });
    const st = req.body.status === 'active' ? 'active' : 'disabled';
    await pool.query('UPDATE warehouses SET status = ? WHERE id = ?', [st, req.params.id]);
    res.json({ code: 0, message: st === 'active' ? '已启用' : '已暂停' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '操作失败' });
  }
});

// 删除仓库（需无库存）
router.delete('/:id', requireRole('owner'), async (req, res) => {
  try {
    if (!await canManageWarehouse(req.tenantId, req.params.id)) return res.status(404).json({ code: 404, message: '仓库不存在或无权限' });
    const [inv] = await pool.query(
      'SELECT COUNT(*) as cnt FROM inventory WHERE warehouse_id = ? AND quantity > 0',
      [req.params.id]
    );
    if (inv[0].cnt > 0) return res.status(400).json({ code: 400, message: '该仓库还有库存，无法删除' });
    await pool.query('DELETE FROM warehouses WHERE id = ? AND is_default = FALSE', [req.params.id]);
    res.json({ code: 0, message: '仓库已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
