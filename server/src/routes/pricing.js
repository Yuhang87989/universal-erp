const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { resolveRoot, getGroupTenantIds, isChildInGroup } = require('../services/groupScope');

const router = express.Router();
router.use(authenticate);

// 校验当前请求租户必须是集团总店
async function requireGroupRoot(req) {
  const { rootId, isRoot } = await resolveRoot(req.tenantId);
  if (!isRoot) {
    const e = new Error('仅集团总店可管理集团定价');
    e.status = 403;
    throw e;
  }
  return rootId;
}

// GET /api/pricing
// 仅集团总店：返回集团下全部分店 + 各店 active 商品(售价/进价/库存/当前成本) + 总店商品(作参考价)
router.get('/', async (req, res) => {
  try {
    const rootId = await requireGroupRoot(req);
    const tenantIds = await getGroupTenantIds(rootId);
    if (!tenantIds.length) {
      return res.json({ stores: [], products: [], rootProducts: [], rootTenantId: rootId });
    }
    const ph = tenantIds.map(() => '?').join(',');

    const [stores] = await pool.query(
      `SELECT id AS tenant_id, name AS tenant_name, is_group_root
       FROM tenants WHERE id IN (${ph}) AND status = 'active' ORDER BY id ASC`,
      tenantIds
    );

    const [products] = await pool.query(
      `SELECT p.id, p.tenant_id, p.name, p.barcode, p.unit,
              p.cost_price, p.sell_price,
              inv.quantity AS stock, inv.avg_cost AS avg_cost
       FROM products p
       LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.tenant_id = p.tenant_id
       WHERE p.tenant_id IN (${ph}) AND p.status = 'active'
       ORDER BY p.tenant_id ASC, p.name ASC`,
      tenantIds
    );

    const [rootProducts] = await pool.query(
      `SELECT p.id, p.tenant_id, p.name, p.sell_price
       FROM products p
       WHERE p.tenant_id = ? AND p.status = 'active'
       ORDER BY p.name ASC`,
      [rootId]
    );

    res.json({ stores, products, rootProducts, rootTenantId: rootId });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || '获取集团定价失败' });
  }
});

// PUT /api/pricing/:tenantId/batch
// 仅集团总店：批量更新某分店(或总店自己)商品售价
// body: { items: [{ product_id, sell_price }] }
router.put('/:tenantId/batch', async (req, res) => {
  try {
    await requireGroupRoot(req);
    const targetTenantId = parseInt(req.params.tenantId, 10);
    if (!targetTenantId) throw Object.assign(new Error('参数错误'), { status: 400 });

    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) throw Object.assign(new Error('缺少待更新商品'), { status: 400 });

    // 校验目标店属于本集团
    if (!(await isChildInGroup(req.tenantId, targetTenantId))) {
      throw Object.assign(new Error('无权管理该分店定价'), { status: 403 });
    }

    // 清洗并校验售价
    const clean = [];
    for (const it of items) {
      const pid = parseInt(it.product_id, 10);
      const sp = parseFloat(it.sell_price);
      if (!pid || isNaN(sp) || sp < 0) continue;
      clean.push([sp.toFixed(2), pid, targetTenantId]);
    }
    if (!clean.length) throw Object.assign(new Error('无可保存的有效价格'), { status: 400 });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of clean) {
        await conn.query(
          'UPDATE products SET sell_price = ? WHERE id = ? AND tenant_id = ?',
          row
        );
      }
      await conn.commit();
      res.json({ updated: clean.length });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || '批量调价失败' });
  }
});

module.exports = router;