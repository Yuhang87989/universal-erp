-- ============================================
-- 通用电商ERP - 分店账套打通·二期（调拨重构为出入库单据模型）
-- 功能：
--  1) 出库单支持跨账套调拨目标（调拨出库 = 调出方出库单）
--  2) 入库单支持跨账套调拨来源（调拨入库 = 真正入库方入库单）
--  3) 调拨单 status 语义：draft→in_transit(已出库)→completed(已入库)
--  4) 采购单确认不再直接入库（入库动作统一走入库单）
-- 兼容性：本脚本使用 information_schema 判断 + 动态 SQL，
--          兼容 MySQL 5.7（不支持 ADD COLUMN IF NOT EXISTS）与 8.0，且可重复执行（幂等）
-- ============================================

USE erp_db;

-- ============ 出库单增加跨账套调拨目标字段 ============
-- to_tenant_id
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_out_orders' AND COLUMN_NAME='to_tenant_id');
SET @s = IF(@c=0,
  'ALTER TABLE stock_out_orders ADD COLUMN to_tenant_id INT COMMENT ''调拨目标账套ID（调拨出库时）'' AFTER warehouse_id',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- to_warehouse_id
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_out_orders' AND COLUMN_NAME='to_warehouse_id');
SET @s = IF(@c=0,
  'ALTER TABLE stock_out_orders ADD COLUMN to_warehouse_id INT COMMENT ''调拨目标仓库ID（调拨出库时）'' AFTER to_tenant_id',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ============ 入库单增加跨账套调拨来源字段 ============
-- from_tenant_id
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_in_orders' AND COLUMN_NAME='from_tenant_id');
SET @s = IF(@c=0,
  'ALTER TABLE stock_in_orders ADD COLUMN from_tenant_id INT COMMENT ''调拨来源账套ID（调拨入库时）'' AFTER warehouse_id',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- from_warehouse_id
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_in_orders' AND COLUMN_NAME='from_warehouse_id');
SET @s = IF(@c=0,
  'ALTER TABLE stock_in_orders ADD COLUMN from_warehouse_id INT COMMENT ''调拨来源仓库ID（调拨入库时）'' AFTER from_tenant_id',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- transfer_linked
SET @c = (SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_in_orders' AND COLUMN_NAME='transfer_linked');
SET @s = IF(@c=0,
  'ALTER TABLE stock_in_orders ADD COLUMN transfer_linked INT COMMENT ''关联调拨单ID（业务单完成标记，0/1）'' DEFAULT 0 AFTER source_order_id',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ============ 索引补强 ============
-- idx_to_tenant
SET @c = (SELECT COUNT(*) FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_out_orders' AND INDEX_NAME='idx_to_tenant');
SET @s = IF(@c=0,
  'CREATE INDEX idx_to_tenant ON stock_out_orders (to_tenant_id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
-- idx_from_tenant
SET @c = (SELECT COUNT(*) FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA='erp_db' AND TABLE_NAME='stock_in_orders' AND INDEX_NAME='idx_from_tenant');
SET @s = IF(@c=0,
  'CREATE INDEX idx_from_tenant ON stock_in_orders (from_tenant_id)',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;