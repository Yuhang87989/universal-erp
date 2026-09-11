-- ============================================
-- 通用电商ERP - 分店账套打通·二期（调拨重构为出入库单据模型）
-- 功能：
--  1) 出库单支持跨账套调拨目标（调拨出库 = 调出方出库单）
--  2) 入库单支持跨账套调拨来源（调拨入库 = 真正入库方入库单）
--  3) 调拨单 status 语义：draft→in_transit(已出库)→completed(已入库)
--  4) 采购单确认不再直接入库（入库动作统一走入库单）
-- ============================================

USE erp_db;

-- 出库单增加跨账套调拨目标字段
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS to_tenant_id INT COMMENT '调拨目标账套ID（调拨出库时）' AFTER warehouse_id,
  ADD COLUMN IF NOT EXISTS to_warehouse_id INT COMMENT '调拨目标仓库ID（调拨出库时）' AFTER to_tenant_id;

-- 入库单增加跨账套调拨来源字段
ALTER TABLE stock_in_orders
  ADD COLUMN IF NOT EXISTS from_tenant_id INT COMMENT '调拨来源账套ID（调拨入库时）' AFTER warehouse_id,
  ADD COLUMN IF NOT EXISTS from_warehouse_id INT COMMENT '调拨来源仓库ID（调拨入库时）' AFTER from_tenant_id,
  ADD COLUMN IF NOT EXISTS transfer_linked INT COMMENT '关联调拨单ID（业务单完成标记，0/1）' DEFAULT 0 AFTER source_order_id;

-- 库存流水 change_type：补充 transfer_in/transfer_out 已存在，跳过
-- 额外扩展：确保 'stock_in'/'stock_out' 已存在（一期已处理）

-- 索引补强
CREATE INDEX IF NOT EXISTS idx_to_tenant ON stock_out_orders (to_tenant_id);
CREATE INDEX IF NOT EXISTS idx_from_tenant ON stock_in_orders (from_tenant_id);