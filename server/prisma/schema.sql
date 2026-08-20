-- ============================================
-- 通用电商ERP - 数据库初始化脚本
-- 适用：MySQL 8.0+
-- 编码：UTF-8 (utf8mb4)
-- ============================================

CREATE DATABASE IF NOT EXISTS erp_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE erp_db;

-- -------------------------------------------
-- 1. 租户表（多租户SaaS）
-- -------------------------------------------
CREATE TABLE tenants (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL COMMENT '店铺/企业名称',
  owner_name VARCHAR(50) COMMENT '经营者姓名',
  phone VARCHAR(20) COMMENT '联系电话',
  address VARCHAR(255) COMMENT '地址',
  business_type ENUM('market','supply_coop','ecommerce','retail','other') DEFAULT 'retail' COMMENT '业态类型',
  logo_url VARCHAR(500) COMMENT 'Logo地址',
  status ENUM('active','suspended','cancelled') DEFAULT 'active',
  settings JSON COMMENT '租户个性化设置',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status)
) COMMENT='租户/店铺';

-- -------------------------------------------
-- 2. 用户表
-- -------------------------------------------
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  username VARCHAR(50) NOT NULL COMMENT '登录账号',
  password_hash VARCHAR(255) NOT NULL,
  real_name VARCHAR(50) COMMENT '真实姓名',
  phone VARCHAR(20),
  role ENUM('owner','manager','cashier','warehouse') NOT NULL DEFAULT 'cashier' COMMENT '角色',
  avatar_url VARCHAR(500),
  status ENUM('active','disabled') DEFAULT 'active',
  last_login_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_tenant_username (tenant_id, username),
  INDEX idx_tenant (tenant_id)
) COMMENT='系统用户';

-- -------------------------------------------
-- 3. 商品分类
-- -------------------------------------------
CREATE TABLE categories (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  parent_id INT DEFAULT NULL COMMENT '父分类ID，NULL为顶级',
  name VARCHAR(50) NOT NULL,
  sort_order INT DEFAULT 0,
  icon VARCHAR(100) COMMENT '图标',
  status ENUM('active','disabled') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant_parent (tenant_id, parent_id)
) COMMENT='商品分类';

-- -------------------------------------------
-- 4. 商品表
-- -------------------------------------------
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  category_id INT,
  name VARCHAR(100) NOT NULL,
  barcode VARCHAR(50) COMMENT '条形码',
  sku VARCHAR(50) COMMENT 'SKU编码',
  unit VARCHAR(20) NOT NULL DEFAULT '个' COMMENT '计量单位',
  cost_price DECIMAL(10,2) DEFAULT 0 COMMENT '成本价/进货价',
  sell_price DECIMAL(10,2) NOT NULL DEFAULT 0 COMMENT '售价',
  wholesale_price DECIMAL(10,2) COMMENT '批发价',
  image_url VARCHAR(500) COMMENT '商品图片',
  description TEXT,
  is_weigh BOOLEAN DEFAULT FALSE COMMENT '是否称重商品',
  is_batch BOOLEAN DEFAULT FALSE COMMENT '是否批次管理',
  min_stock INT DEFAULT 0 COMMENT '最低库存预警值',
  status ENUM('active','disabled','deleted') DEFAULT 'active',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_barcode (tenant_id, barcode),
  INDEX idx_category (tenant_id, category_id),
  INDEX idx_status (tenant_id, status)
) COMMENT='商品';

-- -------------------------------------------
-- 5. 库存表
-- -------------------------------------------
CREATE TABLE inventory (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  product_id INT NOT NULL,
  warehouse_id INT DEFAULT 1 COMMENT '仓库ID，默认主仓库',
  quantity DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '当前库存数量',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE KEY uk_tenant_product_warehouse (tenant_id, product_id, warehouse_id),
  INDEX idx_tenant (tenant_id)
) COMMENT='库存';

-- -------------------------------------------
-- 6. 库存流水
-- -------------------------------------------
CREATE TABLE inventory_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  product_id INT NOT NULL,
  warehouse_id INT DEFAULT 1,
  change_type ENUM('purchase','sale','return_in','return_out','adjust_in','adjust_out','transfer','check') NOT NULL COMMENT '变动类型',
  quantity DECIMAL(12,2) NOT NULL COMMENT '变动数量（正数增加，负数减少）',
  before_quantity DECIMAL(12,2) COMMENT '变动前数量',
  after_quantity DECIMAL(12,2) COMMENT '变动后数量',
  unit_cost DECIMAL(10,2) COMMENT '单位成本',
  reference_type VARCHAR(50) COMMENT '关联单据类型',
  reference_id INT COMMENT '关联单据ID',
  remark VARCHAR(255),
  operator_id INT COMMENT '操作人',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant_product (tenant_id, product_id),
  INDEX idx_time (tenant_id, created_at)
) COMMENT='库存变动流水';

-- -------------------------------------------
-- 7. 供应商
-- -------------------------------------------
CREATE TABLE suppliers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  contact_name VARCHAR(50),
  phone VARCHAR(20),
  address VARCHAR(255),
  bank_account VARCHAR(50),
  bank_name VARCHAR(100),
  remark TEXT,
  status ENUM('active','disabled') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant (tenant_id)
) COMMENT='供应商';

-- -------------------------------------------
-- 8. 采购单
-- -------------------------------------------
CREATE TABLE purchase_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  order_no VARCHAR(30) NOT NULL COMMENT '采购单号',
  supplier_id INT,
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  paid_amount DECIMAL(12,2) DEFAULT 0 COMMENT '已付金额',
  status ENUM('draft','confirmed','received','partial_received','cancelled') DEFAULT 'draft',
  remark VARCHAR(255),
  operator_id INT,
  order_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_order_no (tenant_id, order_no),
  INDEX idx_tenant_date (tenant_id, order_date)
) COMMENT='采购单';

-- -------------------------------------------
-- 9. 采购单明细
-- -------------------------------------------
CREATE TABLE purchase_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  purchase_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL COMMENT '采购数量',
  unit_cost DECIMAL(10,2) NOT NULL COMMENT '采购单价',
  received_quantity DECIMAL(12,2) DEFAULT 0 COMMENT '已入库数量',
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  remark VARCHAR(255),
  FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) COMMENT='采购单明细';

-- -------------------------------------------
-- 10. 客户/会员
-- -------------------------------------------
CREATE TABLE customers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  gender ENUM('unknown','male','female') DEFAULT 'unknown',
  level ENUM('normal','silver','gold','vip') DEFAULT 'normal' COMMENT '会员等级',
  total_spent DECIMAL(12,2) DEFAULT 0 COMMENT '累计消费',
  points INT DEFAULT 0 COMMENT '积分',
  birthday DATE,
  address VARCHAR(255),
  remark VARCHAR(255),
  status ENUM('active','disabled') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_phone (tenant_id, phone)
) COMMENT='客户/会员';

-- -------------------------------------------
-- 11. 销售单
-- -------------------------------------------
CREATE TABLE sales_orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  order_no VARCHAR(30) NOT NULL COMMENT '销售单号',
  order_type ENUM('pos','online','wholesale','phone') DEFAULT 'pos' COMMENT '订单类型',
  customer_id INT DEFAULT NULL,
  total_amount DECIMAL(12,2) DEFAULT 0 COMMENT '总金额',
  discount_amount DECIMAL(12,2) DEFAULT 0 COMMENT '优惠金额',
  actual_amount DECIMAL(12,2) DEFAULT 0 COMMENT '实收金额',
  paid_amount DECIMAL(12,2) DEFAULT 0 COMMENT '已付金额',
  payment_method ENUM('cash','wechat','alipay','card','credit','mixed') DEFAULT 'cash',
  status ENUM('pending','completed','refunded','partial_refund','cancelled') DEFAULT 'pending',
  platform VARCHAR(50) COMMENT '电商平台（online类型时使用）',
  platform_order_no VARCHAR(100) COMMENT '平台订单号',
  remark VARCHAR(255),
  operator_id INT,
  order_date DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_order_no (tenant_id, order_no),
  INDEX idx_tenant_date (tenant_id, order_date),
  INDEX idx_customer (tenant_id, customer_id),
  INDEX idx_type (tenant_id, order_type)
) COMMENT='销售单';

-- -------------------------------------------
-- 12. 销售单明细
-- -------------------------------------------
CREATE TABLE sale_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sales_order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL COMMENT '售价',
  discount DECIMAL(10,2) DEFAULT 0 COMMENT '单品优惠',
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (quantity * unit_price - COALESCE(discount, 0)) STORED,
  remark VARCHAR(255),
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) COMMENT='销售单明细';

-- -------------------------------------------
-- 13. 财务流水
-- -------------------------------------------
CREATE TABLE finance_records (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  type ENUM('income','expense') NOT NULL,
  category VARCHAR(50) NOT NULL COMMENT '收支类别',
  amount DECIMAL(12,2) NOT NULL,
  reference_type VARCHAR(50) COMMENT '关联单据类型',
  reference_id INT COMMENT '关联单据ID',
  payment_method VARCHAR(20),
  remark VARCHAR(255),
  operator_id INT,
  record_date DATE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant_date (tenant_id, record_date),
  INDEX idx_type (tenant_id, type)
) COMMENT='财务收支记录';

-- -------------------------------------------
-- 14. 电商平台配置
-- -------------------------------------------
CREATE TABLE ecommerce_platforms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  platform ENUM('pinduoduo','taobao','tmall','douyin','kuaishou','wechat_shop','other') NOT NULL,
  shop_name VARCHAR(100) COMMENT '店铺名称',
  api_key VARCHAR(255),
  api_secret VARCHAR(255),
  commission_rate DECIMAL(5,4) DEFAULT 0 COMMENT '平台佣金比例',
  status ENUM('active','disabled') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant (tenant_id)
) COMMENT='电商平台配置';

-- -------------------------------------------
-- 15. 系统操作日志
-- -------------------------------------------
CREATE TABLE operation_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  user_id INT,
  module VARCHAR(50) NOT NULL COMMENT '操作模块',
  action VARCHAR(50) NOT NULL COMMENT '操作类型',
  target_type VARCHAR(50) COMMENT '操作对象类型',
  target_id INT COMMENT '操作对象ID',
  detail JSON COMMENT '变更详情',
  ip VARCHAR(50),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant_time (tenant_id, created_at)
) COMMENT='操作日志';

-- -------------------------------------------
-- 初始数据：默认租户和管理员
-- -------------------------------------------
INSERT INTO tenants (name, owner_name, phone, business_type) VALUES
('默认店铺', '管理员', '13800138000', 'retail');

INSERT INTO users (tenant_id, username, password_hash, real_name, role) VALUES
(1, 'admin', '$2b$10$rQiWJLk/mXcYGjV8zVwqQeJq7vZ.aB1kZ3pR5cY6dF8gH0jK2mN4u', '管理员', 'owner');
-- 默认密码: admin123 (bcrypt hash)

INSERT INTO categories (tenant_id, name, sort_order) VALUES
(1, '蔬菜', 1),
(1, '水果', 2),
(1, '肉类', 3),
(1, '水产', 4),
(1, '粮油', 5),
(1, '调味品', 6),
(1, '日用品', 7),
(1, '其他', 99);
