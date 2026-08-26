-- 第十轮：财务报表三表 + 应收应付 + 期末结转
-- 为 period_closures 表补充字段（原表仅有 status/试算平衡/结账时间，缺少凭证关联和损益金额）

ALTER TABLE period_closures
  ADD COLUMN voucher_id INT NULL COMMENT '结转凭证ID' AFTER period,
  ADD COLUMN total_revenue DECIMAL(15,2) DEFAULT 0 COMMENT '本期收入合计' AFTER voucher_id,
  ADD COLUMN total_expense DECIMAL(15,2) DEFAULT 0 COMMENT '本期费用合计' AFTER total_revenue,
  ADD COLUMN net_profit DECIMAL(15,2) DEFAULT 0 COMMENT '本期净利润' AFTER total_expense;

-- 补建外键（如果不存在）。MySQL 5.7 不支持 ADD CONSTRAINT IF NOT EXISTS，失败可忽略
-- ALTER TABLE period_closures ADD CONSTRAINT fk_pc_voucher FOREIGN KEY (voucher_id) REFERENCES vouchers(id);
