-- =====================================================================
-- 集团化分店账套升级（一期：组织层级 + 跨店/跨账套调拨）
-- 目标：总店 + 多个子电商店，各店独立账套，共享总仓，货物互相调拨
-- 执行：mysql -u erp_user -p erp_db < upgrade_group.sql
-- =====================================================================

-- 1. tenants 增加父账套 + 集团根标记（组织层级）
ALTER TABLE tenants
  ADD COLUMN parent_id INT NULL COMMENT '父账套ID（总店为空）' AFTER business_type,
  ADD COLUMN is_group_root TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否集团根（总店）' AFTER parent_id;

-- 2. warehouses 增加共享总仓标记（总店创建，全集团子店可见）
ALTER TABLE warehouses
  ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否共享总仓（全集团可见）' AFTER is_default;

-- 3. stock_transfers 增加跨账套调拨字段（from/to 账套）
ALTER TABLE stock_transfers
  ADD COLUMN from_tenant_id INT NOT NULL DEFAULT 0 COMMENT '调出账套ID' AFTER tenant_id,
  ADD COLUMN to_tenant_id INT NOT NULL DEFAULT 0 COMMENT '调入账套ID' AFTER from_tenant_id;

-- 存量调拨单回填为同账套（历史数据都是店内调拨）
UPDATE stock_transfers SET from_tenant_id = tenant_id, to_tenant_id = tenant_id
  WHERE from_tenant_id = 0 AND to_tenant_id = 0;

-- 索引
ALTER TABLE tenants ADD INDEX idx_parent (parent_id);
ALTER TABLE stock_transfers ADD INDEX idx_from_tenant (from_tenant_id);
ALTER TABLE stock_transfers ADD INDEX idx_to_tenant (to_tenant_id);