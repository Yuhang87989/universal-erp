-- ============================================
-- 通用电商ERP - 支付渠道 + 分析预警模块
-- 功能：微信/支付宝/银行支付配置（预留接口）+ 库存预警 + 数据看板
-- ============================================

USE erp_db;

-- -------------------------------------------
-- 32. 支付渠道配置表（预留接口，支持微信/支付宝/银行）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS payment_channels (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  channel_code VARCHAR(30) NOT NULL COMMENT '渠道编码：wechat_pay/alipay/bank_transfer/balance/cash',
  channel_name VARCHAR(100) NOT NULL COMMENT '渠道名称',
  channel_type ENUM('online','offline','bank') NOT NULL DEFAULT 'offline' COMMENT '渠道类型',
  -- 微信支付配置
  wechat_appid VARCHAR(100) COMMENT '微信AppID',
  wechat_mch_id VARCHAR(50) COMMENT '微信商户号',
  wechat_api_key VARCHAR(255) COMMENT '微信API密钥（加密存储）',
  wechat_cert_path VARCHAR(500) COMMENT '微信证书路径',
  wechat_notify_url VARCHAR(500) COMMENT '微信回调地址',
  -- 支付宝配置
  alipay_app_id VARCHAR(100) COMMENT '支付宝应用ID',
  alipay_private_key TEXT COMMENT '支付宝应用私钥',
  alipay_public_key TEXT COMMENT '支付宝公钥',
  alipay_notify_url VARCHAR(500) COMMENT '支付宝回调地址',
  alipay_sandbox BOOLEAN DEFAULT FALSE COMMENT '是否沙箱环境',
  -- 银行转账配置
  bank_name VARCHAR(100) COMMENT '开户银行',
  bank_account_name VARCHAR(100) COMMENT '账户名称',
  bank_account_no VARCHAR(50) COMMENT '银行账号',
  bank_branch VARCHAR(200) COMMENT '开户支行',
  -- 通用配置
  fee_rate DECIMAL(5,4) DEFAULT 0 COMMENT '手续费率（如0.006=0.6%）',
  fee_fixed DECIMAL(10,2) DEFAULT 0 COMMENT '固定手续费（每笔）',
  sort_order INT DEFAULT 0,
  is_enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  is_default BOOLEAN DEFAULT FALSE COMMENT '是否默认渠道',
  config_json JSON COMMENT '扩展配置（预留）',
  remark VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_tenant_channel (tenant_id, channel_code),
  INDEX idx_tenant (tenant_id),
  INDEX idx_enabled (tenant_id, is_enabled)
) COMMENT='支付渠道配置（微信/支付宝/银行预留接口）';

-- 默认支付渠道
INSERT INTO payment_channels (tenant_id, channel_code, channel_name, channel_type, is_enabled, is_default, sort_order) VALUES
(1, 'cash', '现金', 'offline', TRUE, TRUE, 1),
(1, 'wechat_pay', '微信支付', 'online', FALSE, FALSE, 2),
(1, 'alipay', '支付宝', 'online', FALSE, FALSE, 3),
(1, 'bank_transfer', '银行转账', 'bank', FALSE, FALSE, 4);

-- -------------------------------------------
-- 33. 支付交易流水表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  transaction_no VARCHAR(50) NOT NULL COMMENT '交易流水号',
  channel_id INT COMMENT '支付渠道ID',
  channel_code VARCHAR(30) COMMENT '渠道编码（冗余）',
  biz_type ENUM('sale_in','purchase_out','expense','income','refund') NOT NULL COMMENT '业务类型',
  biz_order_type VARCHAR(50) COMMENT '关联单据类型',
  biz_order_id INT COMMENT '关联单据ID',
  biz_order_no VARCHAR(50) COMMENT '关联单据号',
  amount DECIMAL(12,2) NOT NULL COMMENT '交易金额',
  fee DECIMAL(10,2) DEFAULT 0 COMMENT '手续费',
  net_amount DECIMAL(12,2) GENERATED ALWAYS AS (amount - COALESCE(fee, 0)) STORED COMMENT '到账金额',
  status ENUM('pending','success','failed','cancelled','refunded') DEFAULT 'pending',
  third_party_no VARCHAR(100) COMMENT '第三方交易号（微信/支付宝/银行）',
  payer_info VARCHAR(255) COMMENT '付款方信息',
  pay_time DATETIME COMMENT '支付时间',
  expire_time DATETIME COMMENT '过期时间',
  callback_data JSON COMMENT '回调原始数据',
  remark VARCHAR(255),
  operator_id INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (channel_id) REFERENCES payment_channels(id),
  UNIQUE KEY uk_transaction_no (tenant_id, transaction_no),
  INDEX idx_tenant_date (tenant_id, created_at),
  INDEX idx_biz (tenant_id, biz_order_type, biz_order_id),
  INDEX idx_status (tenant_id, status),
  INDEX idx_channel (channel_id)
) COMMENT='支付交易流水';

-- -------------------------------------------
-- 34. 库存预警规则表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS stock_alerts (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  alert_type ENUM('low_stock','over_stock','expiry','zero_stock','negative') NOT NULL COMMENT '预警类型',
  product_id INT NOT NULL,
  warehouse_id INT DEFAULT 1,
  threshold_value DECIMAL(12,2) COMMENT '预警阈值',
  current_value DECIMAL(12,2) COMMENT '当前值',
  alert_level ENUM('info','warning','critical') DEFAULT 'warning' COMMENT '预警级别',
  status ENUM('active','resolved','ignored') DEFAULT 'active',
  message VARCHAR(500) COMMENT '预警信息',
  resolved_at DATETIME,
  resolved_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX idx_tenant_status (tenant_id, status),
  INDEX idx_type (tenant_id, alert_type),
  INDEX idx_product (product_id)
) COMMENT='库存预警';

-- -------------------------------------------
-- 35. 预警通知记录表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS alert_notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  alert_id INT NOT NULL,
  channel ENUM('sms','email','wechat','system','webhook') DEFAULT 'system',
  recipient VARCHAR(100) COMMENT '接收人',
  title VARCHAR(200),
  content TEXT,
  status ENUM('pending','sent','failed') DEFAULT 'pending',
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (alert_id) REFERENCES stock_alerts(id),
  INDEX idx_alert (alert_id),
  INDEX idx_status (status)
) COMMENT='预警通知记录';

-- -------------------------------------------
-- 36. 租户设置表（AI配置等键值对，支持用户自助更换DeepSeek接口）
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  setting_key VARCHAR(100) NOT NULL COMMENT '设置键，如 ai_api_key / ai_api_url / ai_model',
  setting_value TEXT COMMENT '设置值',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE KEY uk_tenant_key (tenant_id, setting_key),
  INDEX idx_tenant (tenant_id)
) COMMENT='租户设置（AI配置等）';

-- -------------------------------------------
-- 37. AI对话历史表
-- -------------------------------------------
CREATE TABLE IF NOT EXISTS ai_chat_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  user_id INT NOT NULL,
  user_message TEXT NOT NULL COMMENT '用户消息',
  ai_reply TEXT COMMENT 'AI回复',
  tokens_used INT DEFAULT 0 COMMENT '消耗token数',
  response_time INT DEFAULT 0 COMMENT '响应耗时(ms)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_tenant_date (tenant_id, created_at),
  INDEX idx_user (tenant_id, user_id)
) COMMENT='AI对话历史';
