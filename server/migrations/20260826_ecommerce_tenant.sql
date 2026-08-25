-- 2026-08-26 电商账套改为用户真实营业执照信息
-- 租户3：悦选数码电商（演示）→ 武汉市江岸区宇航智荟电商营业部（用户真实主体）

UPDATE tenants 
SET name = '武汉市江岸区宇航智荟电商营业部',
    owner_name = '邱健军',
    phone = '18667887138',
    business_type = 'ecommerce'
WHERE id = 3;

UPDATE accounting_books 
SET book_name = '宇航智荟电商账套',
    entity_name = '武汉市江岸区宇航智荟电商营业部',
    credit_code = '92420102MAKJME5F3R',
    entity_type = 'individual'
WHERE id = 3;

-- 更新admin真实姓名
UPDATE users SET real_name = '邱健军' WHERE tenant_id = 3 AND username = 'admin';

-- 为租户3创建三枚印章（公章、财务专用章、法定代表人名章）
-- 公章备案号 42010210450802，法人私章备案号 42010210450803
-- 财务专用章备案号参考租户2的格式：42010210452483
INSERT INTO seals (book_id, seal_type, seal_name, seal_code, image_url, is_filed, is_active)
SELECT 3, 'company', '武汉市江岸区宇航智荟电商营业部', '42010210450802', NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM seals WHERE book_id = 3 AND seal_type = 'company');

INSERT INTO seals (book_id, seal_type, seal_name, seal_code, image_url, is_filed, is_active)
SELECT 3, 'financial', '武汉市江岸区宇航智荟电商营业部', '42010210452483', NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM seals WHERE book_id = 3 AND seal_type = 'financial');

INSERT INTO seals (book_id, seal_type, seal_name, seal_code, image_url, is_filed, is_active)
SELECT 3, 'legal_rep', '邱健军', '42010210450803', NULL, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM seals WHERE book_id = 3 AND seal_type = 'legal_rep');

-- 将三枚印章自动盖到账套3的所有凭证上
INSERT INTO voucher_seals (voucher_id, seal_id, stamped_by)
SELECT v.id, s.id, 38
FROM vouchers v
CROSS JOIN seals s
WHERE v.book_id = 3 AND s.book_id = 3
  AND NOT EXISTS (
    SELECT 1 FROM voucher_seals vs 
    WHERE vs.voucher_id = v.id AND vs.seal_id = s.id
  );
