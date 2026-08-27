-- 凭证自动生成：增加来源单据关联字段
ALTER TABLE vouchers ADD COLUMN source_type VARCHAR(50) NULL COMMENT '来源单据类型' AFTER remark;
ALTER TABLE vouchers ADD COLUMN source_id INT NULL COMMENT '来源单据ID' AFTER source_type;
ALTER TABLE vouchers ADD COLUMN source_no VARCHAR(100) NULL COMMENT '来源单据编号' AFTER source_id;

-- 增加索引便于按来源查询
CREATE INDEX idx_vouchers_source ON vouchers(source_type, source_id);

-- 凭证设置表：控制是否自动生成凭证（默认开启）
CREATE TABLE IF NOT EXISTS voucher_auto_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  auto_sales TINYINT(1) DEFAULT 1 COMMENT '销售自动生成凭证',
  auto_purchase TINYINT(1) DEFAULT 1 COMMENT '采购自动生成凭证',
  auto_fund TINYINT(1) DEFAULT 1 COMMENT '资金收支自动生成凭证',
  auto_depreciation TINYINT(1) DEFAULT 1 COMMENT '折旧自动生成凭证',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='凭证自动生成设置';

-- 为租户3插入默认设置
INSERT IGNORE INTO voucher_auto_settings (tenant_id, auto_sales, auto_purchase, auto_fund, auto_depreciation)
VALUES (3, 1, 1, 1, 1);
