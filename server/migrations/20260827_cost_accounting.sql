-- 存货成本核算：给inventory表加移动加权平均成本字段
ALTER TABLE inventory ADD COLUMN avg_cost DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '移动加权平均单位成本' AFTER quantity;

-- 固定资产表
CREATE TABLE IF NOT EXISTS fixed_assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_no VARCHAR(50) NOT NULL COMMENT '资产编号',
  asset_name VARCHAR(200) NOT NULL COMMENT '资产名称',
  category VARCHAR(50) NOT NULL DEFAULT 'office' COMMENT '类别: office办公设备/vehicle运输设备/machine机器设备/electronic电子设备/furniture家具/building房屋建筑/other',
  specification VARCHAR(200) COMMENT '规格型号',
  acquisition_date DATE NOT NULL COMMENT '取得日期',
  original_value DECIMAL(15,2) NOT NULL COMMENT '原值',
  estimated_residual DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '预计净残值',
  useful_life_months INT NOT NULL COMMENT '预计使用月数',
  depreciation_method ENUM('straight_line','double_declining','sum_of_years') NOT NULL DEFAULT 'straight_line' COMMENT '折旧方法',
  monthly_depreciation DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '月折旧额（直线法自动计算）',
  accumulated_depreciation DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '累计折旧',
  net_value DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '净值（原值-累计折旧）',
  status ENUM('in_use','idle','disposed') NOT NULL DEFAULT 'in_use' COMMENT '状态',
  disposal_date DATE COMMENT '处置日期',
  disposal_amount DECIMAL(15,2) COMMENT '处置金额',
  warehouse_id INT COMMENT '存放仓库/地点',
  department VARCHAR(100) COMMENT '使用部门',
  responsible_person VARCHAR(100) COMMENT '责任人',
  voucher_id INT COMMENT '入账凭证ID',
  remark VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant (tenant_id),
  INDEX idx_status (status),
  UNIQUE KEY uk_asset_no (tenant_id, asset_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='固定资产';

-- 折旧计提记录表
CREATE TABLE IF NOT EXISTS depreciation_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  asset_id INT NOT NULL,
  period VARCHAR(7) NOT NULL COMMENT '折旧期间 YYYY-MM',
  amount DECIMAL(15,2) NOT NULL COMMENT '本月折旧额',
  accumulated_after DECIMAL(15,2) NOT NULL COMMENT '计提后累计折旧',
  net_value_after DECIMAL(15,2) NOT NULL COMMENT '计提后净值',
  voucher_id INT COMMENT '折旧凭证ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_asset_period (asset_id, period),
  INDEX idx_tenant_period (tenant_id, period),
  INDEX idx_asset (asset_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='折旧计提记录';

-- 销售单和销售明细增加成本字段
ALTER TABLE sales_orders ADD COLUMN total_cost DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '销售成本合计' AFTER actual_amount;
ALTER TABLE sale_items ADD COLUMN unit_cost DECIMAL(15,4) NOT NULL DEFAULT 0 COMMENT '单位成本（出库时加权平均）' AFTER unit_price;
ALTER TABLE sale_items ADD COLUMN cost_amount DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '成本小计' AFTER unit_cost;

-- 盘点单/调拨单等其他出入库也使用avg_cost（库存表已有avg_cost字段）
-- 库存流水表unit_cost字段已存在，用于记录每笔出入库的单位成本

-- 供应商信息扩展
ALTER TABLE suppliers ADD COLUMN supplier_type ENUM('individual','company') NOT NULL DEFAULT 'company' COMMENT '供应商类型' AFTER name;
ALTER TABLE suppliers ADD COLUMN credit_code VARCHAR(50) COMMENT '统一社会信用代码' AFTER supplier_type;
ALTER TABLE suppliers ADD COLUMN email VARCHAR(100) AFTER phone;
ALTER TABLE suppliers ADD COLUMN contact_position VARCHAR(50) COMMENT '联系人职位' AFTER contact_name;
ALTER TABLE suppliers ADD COLUMN tax_number VARCHAR(50) COMMENT '税号' AFTER email;
ALTER TABLE suppliers ADD COLUMN invoice_title VARCHAR(200) COMMENT '开票抬头' AFTER tax_number;
ALTER TABLE suppliers ADD COLUMN bank_account_name VARCHAR(100) COMMENT '开户名' AFTER bank_name;
ALTER TABLE suppliers ADD COLUMN bank_branch VARCHAR(200) COMMENT '开户支行' AFTER bank_account_name;
ALTER TABLE suppliers ADD COLUMN payment_terms VARCHAR(100) COMMENT '账期/付款条件' AFTER bank_branch;
ALTER TABLE suppliers ADD COLUMN cooperation_start_date DATE COMMENT '合作开始日期' AFTER payment_terms;
ALTER TABLE suppliers ADD COLUMN rating TINYINT DEFAULT 5 COMMENT '供应商评级1-5' AFTER cooperation_start_date;
ALTER TABLE suppliers ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER rating;
