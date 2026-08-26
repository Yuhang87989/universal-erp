-- 资金账户管理
CREATE TABLE IF NOT EXISTS fund_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  account_name VARCHAR(100) NOT NULL COMMENT '账户名称，如：现金、微信、支付宝、工行基本户',
  account_type ENUM('cash','wechat','alipay','bank','other') NOT NULL DEFAULT 'other' COMMENT '账户类型',
  account_no VARCHAR(100) COMMENT '账号（银行卡号/微信商户号等，脱敏存储）',
  bank_name VARCHAR(100) COMMENT '开户行',
  balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '当前余额',
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  remark VARCHAR(500),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant (tenant_id),
  INDEX idx_type (account_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资金账户';

-- 资金流水（每笔收支，关联业务单据和资金账户）
CREATE TABLE IF NOT EXISTS fund_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  account_id INT NOT NULL COMMENT '资金账户ID',
  tx_no VARCHAR(50) NOT NULL COMMENT '流水号',
  tx_type ENUM('income','expense','transfer_in','transfer_out') NOT NULL COMMENT '收入/支出/转入/转出',
  amount DECIMAL(15,2) NOT NULL COMMENT '金额（正数）',
  direction ENUM('in','out') NOT NULL COMMENT '资金方向 in/out',
  counterparty_type ENUM('customer','supplier','other') DEFAULT 'other' COMMENT '往来对象类型',
  counterparty_id INT COMMENT '往来对象ID',
  counterparty_name VARCHAR(200) COMMENT '往来对象名称',
  business_type ENUM('sale_receipt','purchase_payment','salary','rent','utility','other_income','other_expense','transfer') NOT NULL DEFAULT 'other_expense' COMMENT '业务类型',
  reference_type VARCHAR(50) COMMENT '关联单据类型 sales_order/purchase_order/finance_record',
  reference_id INT COMMENT '关联单据ID',
  reference_no VARCHAR(100) COMMENT '关联单据号',
  payment_method VARCHAR(50) COMMENT '支付方式（冗余）',
  remark VARCHAR(500),
  tx_date DATE NOT NULL COMMENT '交易日期',
  tx_time DATETIME COMMENT '交易时间',
  operator_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant (tenant_id),
  INDEX idx_account (account_id),
  INDEX idx_date (tx_date),
  INDEX idx_ref (reference_type, reference_id),
  INDEX idx_counterparty (counterparty_type, counterparty_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资金流水';

-- 核销记录：一笔资金流水核销一笔或多笔业务单据
CREATE TABLE IF NOT EXISTS fund_settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  tx_id INT NOT NULL COMMENT '资金流水ID',
  reference_type VARCHAR(50) NOT NULL COMMENT 'sales_order/purchase_order',
  reference_id INT NOT NULL,
  reference_no VARCHAR(100),
  amount DECIMAL(15,2) NOT NULL COMMENT '本次核销金额',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tx (tx_id),
  INDEX idx_ref (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='资金核销记录';

-- 为每个已有租户创建默认资金账户
INSERT INTO fund_accounts (tenant_id, account_name, account_type, balance, is_enabled, is_default, sort_order)
SELECT t.id, '现金账户', 'cash', 0, 1, 1, 1 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM fund_accounts fa WHERE fa.tenant_id = t.id AND fa.account_name = '现金账户');

INSERT INTO fund_accounts (tenant_id, account_name, account_type, balance, is_enabled, is_default, sort_order)
SELECT t.id, '微信收款', 'wechat', 0, 1, 0, 2 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM fund_accounts fa WHERE fa.tenant_id = t.id AND fa.account_name = '微信收款');

INSERT INTO fund_accounts (tenant_id, account_name, account_type, balance, is_enabled, is_default, sort_order)
SELECT t.id, '支付宝收款', 'alipay', 0, 1, 0, 3 FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM fund_accounts fa WHERE fa.tenant_id = t.id AND fa.account_name = '支付宝收款');
