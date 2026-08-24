-- ============================================
-- 通用电商ERP - 仓库管理模块升级
-- 功能：仓库管理 + 入库单 + 出库单 + 库存调拨 + 库存流水增强
-- ============================================

USE erp_db;

-- -------------------------------------------
-- 25. 仓库表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  code VARCHAR(30) NOT NULL COMMENT '仓库编码（如WH001）',
  name VARCHAR(100) NOT NULL COMMENT '仓库名称',
  address VARCHAR(255) COMMENT '仓库地址',
  manager VARCHAR(50) COMMENT '仓库管理员',
  phone VARCHAR(20) COMMENT '联系电话',
  is_default BOOLEAN DEFAULT FALSE COMMENT '是否默认仓库',
  status ENUM('active','disabled') DEFAULT 'active',
  sort_order INT DEFAULT 0,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_tenant_code (tenant_id, code),
  INDEX idx_tenant (tenant_id)
) COMMENT='仓库管理';

-- 默认主仓库
INSERT INTO warehouses (tenant_id, code, name, address, is_default, sort_order) VALUES
(1, 'WH001', '主仓库', NULL, TRUE, 1);

-- -------------------------------------------
-- 26. 入库单主表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_in_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  order_no VARCHAR(30) NOT NULL COMMENT '入库单号（RK-YYYYMMDD-NNN）',
  warehouse_id INT NOT NULL DEFAULT 1 COMMENT '入库仓库',
  in_type ENUM('purchase','return','production_in','transfer_in','adjust_in','other') NOT NULL DEFAULT 'other' COMMENT '入库类型',
  supplier_id INT COMMENT '供应商（采购入库时）',
  source_order_type VARCHAR(50) COMMENT '来源单据类型（purchase_order等）',
  source_order_id INT COMMENT '来源单据ID',
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '入库总金额',
  status ENUM('draft','confirmed','cancelled') DEFAULT 'draft' COMMENT '状态：草稿/已确认/已取消',
  operator_id INT COMMENT '操作人',
  confirmer_id INT COMMENT '确认人',
  confirm_time DATETIME COMMENT '确认时间',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  UNIQUE KEY uk_order_no (tenant_id, order_no),
  INDEX idx_tenant_date (tenant_id, created_at),
  INDEX idx_warehouse (warehouse_id),
  INDEX idx_status (tenant_id, status),
  INDEX idx_type (tenant_id, in_type)
) COMMENT='入库单';

-- -------------------------------------------
-- 27. 入库单明细
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_in_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stock_in_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL COMMENT '入库数量',
  unit_cost DECIMAL(10,2) DEFAULT 0 COMMENT '单位成本',
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  remark VARCHAR(255),
  FOREIGN KEY (stock_in_id) REFERENCES stock_in_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_stock_in (stock_in_id),
  INDEX idx_product (product_id)
) COMMENT='入库单明细';

-- -------------------------------------------
-- 28. 出库单主表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_out_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  order_no VARCHAR(30) NOT NULL COMMENT '出库单号（CK-YYYYMMDD-NNN）',
  warehouse_id INT NOT NULL DEFAULT 1 COMMENT '出库仓库',
  out_type ENUM('sale','return_out','production_out','transfer_out','adjust_out','scrap','other') NOT NULL DEFAULT 'other' COMMENT '出库类型',
  customer_id INT COMMENT '客户（销售出库时）',
  source_order_type VARCHAR(50) COMMENT '来源单据类型',
  source_order_id INT COMMENT '来源单据ID',
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '出库总金额（成本）',
  status ENUM('draft','confirmed','cancelled') DEFAULT 'draft',
  operator_id INT COMMENT '操作人',
  confirmer_id INT COMMENT '确认人',
  confirm_time DATETIME COMMENT '确认时间',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  UNIQUE KEY uk_order_no (tenant_id, order_no),
  INDEX idx_tenant_date (tenant_id, created_at),
  INDEX idx_warehouse (warehouse_id),
  INDEX idx_status (tenant_id, status),
  INDEX idx_type (tenant_id, out_type)
) COMMENT='出库单';

-- -------------------------------------------
-- 29. 出库单明细
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_out_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stock_out_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL COMMENT '出库数量',
  unit_cost DECIMAL(10,2) DEFAULT 0 COMMENT '单位成本（出库时取商品成本价）',
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  remark VARCHAR(255),
  FOREIGN KEY (stock_out_id) REFERENCES stock_out_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_stock_out (stock_out_id),
  INDEX idx_product (product_id)
) COMMENT='出库单明细';

-- -------------------------------------------
-- 30. 库存调拨单主表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  transfer_no VARCHAR(30) NOT NULL COMMENT '调拨单号（DB-YYYYMMDD-NNN）',
  from_warehouse_id INT NOT NULL COMMENT '调出仓库',
  to_warehouse_id INT NOT NULL COMMENT '调入仓库',
  status ENUM('draft','in_transit','completed','cancelled') DEFAULT 'draft',
  total_amount DECIMAL(12,2) DEFAULT 0,
  operator_id INT,
  confirmer_id INT,
  confirm_time DATETIME,
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
  FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id),
  UNIQUE KEY uk_transfer_no (tenant_id, transfer_no),
  INDEX idx_tenant_date (tenant_id, created_at),
  INDEX idx_status (tenant_id, status)
) COMMENT='库存调拨单';

-- -------------------------------------------
-- 31. 调拨单明细
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  transfer_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  remark VARCHAR(255),
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_transfer (transfer_id)
) COMMENT='调拨单明细';

-- -------------------------------------------
-- 库存流水表增强：补充 warehouse_id 字段（如已有则跳过）
-- -------------------------------------------
-- 注意：inventory_logs 表已有 warehouse_id 字段（DEFAULT 1），无需修改
-- 但 change_type ENUM 需要扩展：增加 transfer_in / transfer_out / stock_in / stock_out
-- 使用 MODIFY COLUMN 扩展枚举值
ALTER TABLE inventory_logs
  MODIFY COLUMN change_type ENUM(
    'purchase','sale','return_in','return_out',
    'adjust_in','adjust_out','transfer','check',
    'stock_in','stock_out','transfer_in','transfer_out','scrap'
  ) NOT NULL COMMENT '变动类型';
