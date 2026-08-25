-- 创建finance_records表（如不存在）
CREATE TABLE IF NOT EXISTS finance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  type ENUM('income','expense') NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(20),
  remark TEXT,
  record_date DATE NOT NULL,
  operator_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tenant (tenant_id),
  INDEX idx_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- suppliers表已存在，无需重建
-- 如果suppliers表缺少字段，补充bank_name和bank_account
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100) AFTER address;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50) AFTER bank_name;
