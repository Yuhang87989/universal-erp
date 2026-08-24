-- ============================================
-- 通用电商ERP - 财务记账模块升级
-- 功能：会计科目表 + 凭证系统 + 印章管理
-- 借贷平衡 + 用友风格
-- ============================================

USE erp_db;

-- -------------------------------------------
-- 16. 账套表（支持多账套管理）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_books (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  book_name VARCHAR(100) NOT NULL COMMENT '账套名称（如：宇航智荟电商、XX公司）',
  entity_name VARCHAR(200) NOT NULL COMMENT '核算主体名称',
  credit_code VARCHAR(50) COMMENT '统一社会信用代码',
  entity_type ENUM('individual','company','other') DEFAULT 'individual' COMMENT '主体类型：个体工商户/公司/其他',
  currency VARCHAR(10) DEFAULT 'CNY' COMMENT '本位币',
  fiscal_year_start INT DEFAULT 1 COMMENT '会计年度起始月（1=1月起）',
  accounting_standard VARCHAR(50) DEFAULT 'small_enterprise' COMMENT '会计准则：small_enterprise/general',
  is_active BOOLEAN DEFAULT TRUE,
  created_by INT COMMENT '创建人',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_active (tenant_id, is_active)
) COMMENT='账套管理（一个租户可建多套账）';

-- -------------------------------------------
-- 17. 会计科目表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS accounting_accounts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  book_id INT NOT NULL COMMENT '所属账套ID',
  code VARCHAR(20) NOT NULL COMMENT '科目编码（如1001, 1002.01）',
  name VARCHAR(100) NOT NULL COMMENT '科目名称',
  category ENUM('asset','liability','equity','revenue','expense') NOT NULL COMMENT '科目类别',
  parent_id INT DEFAULT NULL COMMENT '上级科目ID',
  direction ENUM('debit','credit') DEFAULT 'debit' COMMENT '余额方向：资产/费用=借方，负债/权益/收入=贷方',
  level INT DEFAULT 1 COMMENT '科目层级',
  is_enabled BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES accounting_books(id),
  UNIQUE KEY uk_book_code (book_id, code),
  INDEX idx_book (book_id),
  INDEX idx_category (book_id, category)
) COMMENT='会计科目表（按账套隔离）';

-- 默认账套（宇航智荟电商营业部）
INSERT IGNORE INTO accounting_books (tenant_id, book_name, entity_name, credit_code, entity_type) VALUES
(1, '宇航智荟电商', '武汉市江岸区宇航智荟电商营业部', '92420102MAKJME5F3R', 'individual');

-- 默认科目数据（账套ID=1，适用于个体工商户/小微企业）
INSERT IGNORE INTO accounting_accounts (book_id, code, name, category, direction, level, parent_id) VALUES
-- 资产类
(1, '1001', '库存现金', 'asset', 'debit', 1, NULL),
(1, '1002', '银行存款', 'asset', 'debit', 1, NULL),
(1, '1002.01', '基本户', 'asset', 'debit', 2, 2),
(1, '1002.02', '一般户', 'asset', 'debit', 2, 2),
(1, '1122', '应收账款', 'asset', 'debit', 1, NULL),
(1, '1122.01', '客户A', 'asset', 'debit', 2, 5),
(1, '1123', '预付账款', 'asset', 'debit', 1, NULL),
(1, '1403', '原材料', 'asset', 'debit', 1, NULL),
(1, '1405', '库存商品', 'asset', 'debit', 1, NULL),
(1, '1501', '固定资产', 'asset', 'debit', 1, NULL),
(1, '1501.01', '办公设备', 'asset', 'debit', 2, 10),
(1, '1501.02', '运输设备', 'asset', 'debit', 2, 10),
(1, '1502', '累计折旧', 'asset', 'credit', 1, NULL),
-- 负债类
(1, '2001', '短期借款', 'liability', 'credit', 1, NULL),
(1, '2202', '应付账款', 'liability', 'credit', 1, NULL),
(1, '2202.01', '供应商B', 'liability', 'credit', 2, 15),
(1, '2203', '预收账款', 'liability', 'credit', 1, NULL),
(1, '2211', '应付职工薪酬', 'liability', 'credit', 1, NULL),
(1, '2221', '应交税费', 'liability', 'credit', 1, NULL),
(1, '2221.01', '应交增值税', 'liability', 'credit', 2, 20),
(1, '2221.02', '应交企业所得税', 'liability', 'credit', 2, 20),
-- 所有者权益类
(1, '3001', '实收资本', 'equity', 'credit', 1, NULL),
(1, '3001.01', '投资者A', 'equity', 'credit', 2, 23),
(1, '3101', '盈余公积', 'equity', 'credit', 1, NULL),
(1, '3104', '本年利润', 'equity', 'credit', 1, NULL),
(1, '3104.01', '未分配利润', 'equity', 'credit', 2, 26),
-- 收入类
(1, '5001', '主营业务收入', 'revenue', 'credit', 1, NULL),
(1, '5001.01', '商品销售收入', 'revenue', 'credit', 2, 28),
(1, '5001.02', '服务收入', 'revenue', 'credit', 2, 28),
(1, '5111', '其他业务收入', 'revenue', 'credit', 1, NULL),
-- 费用类
(1, '6001', '主营业务成本', 'expense', 'debit', 1, NULL),
(1, '6401', '销售费用', 'expense', 'debit', 1, NULL),
(1, '6401.01', '广告费', 'expense', 'debit', 2, 32),
(1, '6401.02', '运费', 'expense', 'debit', 2, 32),
(1, '6601', '管理费用', 'expense', 'debit', 1, NULL),
(1, '6601.01', '办公费', 'expense', 'debit', 2, 35),
(1, '6601.02', '工资薪金', 'expense', 'debit', 2, 35),
(1, '6601.03', '折旧费', 'expense', 'debit', 2, 35),
(1, '6603', '财务费用', 'expense', 'debit', 1, NULL),
(1, '6711', '营业外支出', 'expense', 'debit', 1, NULL),
(1, '6801', '所得税费用', 'expense', 'debit', 1, NULL);

-- -------------------------------------------
-- 18. 凭证表（凭证头）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  book_id INT NOT NULL COMMENT '所属账套ID',
  voucher_type ENUM('receipt','payment','transfer','general') NOT NULL COMMENT '凭证类型：收款/付款/转账/通用',
  voucher_no VARCHAR(30) NOT NULL COMMENT '凭证编号（如：收-0001）',
  voucher_date DATE NOT NULL COMMENT '凭证日期',
  attachment_count INT DEFAULT 0 COMMENT '附单据数量',
  total_debit DECIMAL(15,2) DEFAULT 0 COMMENT '借方合计',
  total_credit DECIMAL(15,2) DEFAULT 0 COMMENT '贷方合计',
  is_balanced BOOLEAN DEFAULT FALSE COMMENT '借贷是否平衡',
  status ENUM('draft','pending_audit','audited','posted','void') DEFAULT 'draft' COMMENT '凭证状态',
  creator_id INT COMMENT '制单人',
  auditor_id INT COMMENT '审核人',
  poster_id INT COMMENT '记账人',
  cashier_id INT COMMENT '出纳',
  audit_time DATETIME COMMENT '审核时间',
  post_time DATETIME COMMENT '记账时间',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES accounting_books(id),
  UNIQUE KEY uk_book_voucher_no (book_id, voucher_no),
  INDEX idx_book_date (book_id, voucher_date),
  INDEX idx_status (book_id, status),
  INDEX idx_type (book_id, voucher_type)
) COMMENT='记账凭证（按账套隔离）';

-- -------------------------------------------
-- 18. 凭证明细（凭证行/分录）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  voucher_id INT NOT NULL,
  line_no INT NOT NULL COMMENT '行号',
  account_id INT NOT NULL COMMENT '会计科目ID',
  summary VARCHAR(255) NOT NULL COMMENT '摘要',
  debit_amount DECIMAL(15,2) DEFAULT 0 COMMENT '借方金额',
  credit_amount DECIMAL(15,2) DEFAULT 0 COMMENT '贷方金额',
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounting_accounts(id),
  INDEX idx_voucher (voucher_id),
  INDEX idx_account (account_id)
) COMMENT='凭证明细';

-- -------------------------------------------
-- 19. 印章管理表（支持新增自定义印章）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS seals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  book_id INT NOT NULL COMMENT '所属账套ID',
  seal_type VARCHAR(50) NOT NULL COMMENT '印章类型（company/financial/legal_rep/contract/invoice/custom）',
  seal_name VARCHAR(100) NOT NULL COMMENT '印章名称',
  seal_code VARCHAR(50) COMMENT '公安备案编号',
  image_url VARCHAR(500) COMMENT '印章图片URL（PNG透明背景）',
  is_filed BOOLEAN DEFAULT FALSE COMMENT '是否公安备案',
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES accounting_books(id),
  INDEX idx_book (book_id)
) COMMENT='印章管理（支持新增，引用公安备案编号）';

-- -------------------------------------------
-- 20. 凭证盖章记录
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_seals (
  id INT PRIMARY KEY AUTO_INCREMENT,
  voucher_id INT NOT NULL,
  seal_id INT NOT NULL,
  position_x INT DEFAULT 0 COMMENT '盖章X坐标（相对凭证）',
  position_y INT DEFAULT 0 COMMENT '盖章Y坐标',
  stamped_by INT COMMENT '盖章操作人',
  stamped_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '盖章时间',
  FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE,
  FOREIGN KEY (seal_id) REFERENCES seals(id),
  INDEX idx_voucher (voucher_id)
) COMMENT='凭证盖章记录';

-- -------------------------------------------
-- 初始化印章数据（武汉市江岸区宇航智荟电商营业部 - 引用公安备案编号）
-- -------------------------------------------
INSERT IGNORE INTO seals (book_id, seal_type, seal_name, seal_code, is_filed) VALUES
(1, 'company', '武汉市江岸区宇航智荟电商营业部（个体工商户）', '42010210450802', TRUE),
(1, 'financial', '武汉市江岸区宇航智荟电商营业部财务专用章', '42010210452483', TRUE),
(1, 'legal_rep', '邱健军印', '42010210450803', TRUE);

-- -------------------------------------------
-- 21. 科目余额表（用于试算平衡）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS account_balances (
  id INT PRIMARY KEY AUTO_INCREMENT,
  book_id INT NOT NULL COMMENT '所属账套ID',
  account_id INT NOT NULL,
  period VARCHAR(7) NOT NULL COMMENT '会计期间（YYYY-MM）',
  opening_debit DECIMAL(15,2) DEFAULT 0 COMMENT '期初借方余额',
  opening_credit DECIMAL(15,2) DEFAULT 0 COMMENT '期初贷方余额',
  current_debit DECIMAL(15,2) DEFAULT 0 COMMENT '本期借方发生额',
  current_credit DECIMAL(15,2) DEFAULT 0 COMMENT '本期贷方发生额',
  closing_debit DECIMAL(15,2) DEFAULT 0 COMMENT '期末借方余额',
  closing_credit DECIMAL(15,2) DEFAULT 0 COMMENT '期末贷方余额',
  FOREIGN KEY (book_id) REFERENCES accounting_books(id),
  FOREIGN KEY (account_id) REFERENCES accounting_accounts(id),
  UNIQUE KEY uk_book_account_period (book_id, account_id, period),
  INDEX idx_period (book_id, period)
) COMMENT='科目余额表（按账套隔离）';

-- -------------------------------------------
-- 22. 期末结转表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS period_closures (
  id INT PRIMARY KEY AUTO_INCREMENT,
  book_id INT NOT NULL COMMENT '所属账套ID',
  period VARCHAR(7) NOT NULL COMMENT '会计期间（YYYY-MM）',
  status ENUM('open','closing','closed') DEFAULT 'open',
  trial_balance_debit DECIMAL(15,2) DEFAULT 0 COMMENT '试算平衡借方合计',
  trial_balance_credit DECIMAL(15,2) DEFAULT 0 COMMENT '试算平衡贷方合计',
  is_balanced BOOLEAN DEFAULT FALSE,
  closed_at DATETIME COMMENT '结账时间',
  closed_by INT COMMENT '结账操作人',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES accounting_books(id),
  UNIQUE KEY uk_book_period (book_id, period),
  INDEX idx_status (book_id, status)
) COMMENT='期末结转（按账套隔离）';

-- -------------------------------------------
-- 23. 库存盘点主表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stocktakes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  stocktake_no VARCHAR(30) NOT NULL COMMENT '盘点单号（如：PD-20260824-001）',
  warehouse_id INT DEFAULT 1 COMMENT '盘点仓库',
  stocktake_type ENUM('full','partial','cycle') DEFAULT 'full' COMMENT '盘点类型：全盘/抽盘/循环盘',
  stocktake_date DATE NOT NULL COMMENT '盘点日期',
  status ENUM('draft','counting','reviewing','completed','cancelled') DEFAULT 'draft' COMMENT '状态',
  total_items INT DEFAULT 0 COMMENT '盘点商品数',
  matched_items INT DEFAULT 0 COMMENT '账实一致数',
  over_items INT DEFAULT 0 COMMENT '盘盈商品数',
  loss_items INT DEFAULT 0 COMMENT '盘亏商品数',
  total_over_amount DECIMAL(12,2) DEFAULT 0 COMMENT '盘盈总金额',
  total_loss_amount DECIMAL(12,2) DEFAULT 0 COMMENT '盘亏总金额',
  operator_id INT COMMENT '盘点人',
  reviewer_id INT COMMENT '复核人',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_stocktake_no (tenant_id, stocktake_no),
  INDEX idx_tenant_date (tenant_id, stocktake_date),
  INDEX idx_status (tenant_id, status)
) COMMENT='库存盘点主表';

-- -------------------------------------------
-- 24. 库存盘点明细表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stocktake_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  stocktake_id INT NOT NULL COMMENT '盘点单ID',
  product_id INT NOT NULL COMMENT '商品ID',
  barcode VARCHAR(50) COMMENT '条形码（盘点时扫码用）',
  system_quantity DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '系统库存数量',
  actual_quantity DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '实际盘点数量',
  variance_quantity DECIMAL(12,2) GENERATED ALWAYS AS (actual_quantity - system_quantity) STORED COMMENT '差异数量（正=盘盈，负=盘亏）',
  unit_cost DECIMAL(10,2) COMMENT '单位成本',
  variance_amount DECIMAL(12,2) GENERATED ALWAYS AS ((actual_quantity - system_quantity) * COALESCE(unit_cost, 0)) STORED COMMENT '差异金额',
  remark VARCHAR(255),
  FOREIGN KEY (stocktake_id) REFERENCES stocktakes(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_stocktake (stocktake_id),
  INDEX idx_product (product_id)
) COMMENT='库存盘点明细';
