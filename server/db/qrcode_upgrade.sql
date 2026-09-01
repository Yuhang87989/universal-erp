-- V2.3 收款码功能：为支付渠道添加收款码图片URL字段
-- 2026-09-01

ALTER TABLE payment_channels 
  ADD COLUMN qrcode_url VARCHAR(500) DEFAULT NULL COMMENT '收款码图片URL' AFTER remark;

