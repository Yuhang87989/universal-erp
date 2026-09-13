// 集团化分店账套 · 范围解析服务
// 用途：总店(root/is_group_root)只读穿透分店账 + 集团合并报表
// 权限硬约束：非集团总店调用任何集团范围能力一律拒绝；子店穿透必须逐层校验 parent_id 链归属本集团
const pool = require('../config/db');

// 沿 parent_id 向上找集团根(总店)
// 返回 { rootId, isRoot }：isRoot 表示“当前请求租户即集团总店”
async function resolveRoot(tenantId) {
  let cur = tenantId;
  const visited = new Set();
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const [[t]] = await pool.query(
      'SELECT id, parent_id, is_group_root FROM tenants WHERE id = ?',
      [cur]
    );
    if (!t) break;
    if (t.is_group_root === 1 || !t.parent_id) return { rootId: t.id, isRoot: t.id === tenantId };
    cur = t.parent_id;
  }
  // 兜底：无法向上则视自己为根（向下仅能拿到直属子店，由调用方再校验）
  return { rootId: tenantId, isRoot: true };
}

// 取 root 集团下全部租户 id（含 root 自身，递归支持嵌套子店）
async function getGroupTenantIds(rootId) {
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const ph = frontier.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT id FROM tenants WHERE status IN ('active','suspended') AND parent_id IN (${ph})`,
      frontier
    );
    const next = rows.map((r) => r.id);
    if (!next.length) break;
    ids.push(...next);
    frontier = next;
  }
  return ids;
}

// 取 root 集团下全部默认账套 id
async function getGroupBookIds(rootId) {
  const tenantIds = await getGroupTenantIds(rootId);
  if (!tenantIds.length) return [];
  const ph = tenantIds.map(() => '?').join(',');
  const [books] = await pool.query(
    `SELECT id FROM accounting_books WHERE tenant_id IN (${ph}) AND is_active = TRUE`,
    tenantIds
  );
  return books.map((b) => b.id);
}

// 校验 tenantId 是否归属 root 集团（逐层向上比对 parent_id 链）
async function isChildInGroup(rootId, tenantId) {
  let cur = tenantId;
  const visited = new Set();
  while (cur && !visited.has(cur)) {
    visited.add(cur);
    const [[t]] = await pool.query('SELECT id, parent_id FROM tenants WHERE id = ?', [cur]);
    if (!t) return false;
    if (t.id === rootId) return true;
    cur = t.parent_id;
  }
  return false;
}

module.exports = { resolveRoot, getGroupTenantIds, getGroupBookIds, isChildInGroup };