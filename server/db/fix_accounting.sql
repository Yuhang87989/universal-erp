-- ============================================================
-- 修复会计账套数据（确保账套1-5的账套、科目、印章、凭证完整）
-- 可重复执行
-- ============================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. 确保账套1存在（默认店铺）
INSERT INTO accounting_books (id, tenant_id, book_name, entity_name, credit_code, entity_type)
VALUES (1, 1, '默认账套', '宇航智荟电商', '92420102MAKJME5F3R', 'individual')
ON DUPLICATE KEY UPDATE book_name=VALUES(book_name);

-- 2. 确保账套1有标准科目（如果不存在则插入）
INSERT IGNORE INTO accounting_accounts (book_id, code, name, category, direction, level, parent_id) VALUES
(1, '1001', '库存现金', 'asset', 'debit', 1, NULL),
(1, '1002', '银行存款', 'asset', 'debit', 1, NULL),
(1, '1002.01', '基本户', 'asset', 'debit', 2, 2),
(1, '1002.02', '一般户', 'asset', 'debit', 2, 2),
(1, '1122', '应收账款', 'asset', 'debit', 1, NULL),
(1, '1405', '库存商品', 'asset', 'debit', 1, NULL),
(1, '2202', '应付账款', 'liability', 'credit', 1, NULL),
(1, '2211', '应付职工薪酬', 'liability', 'credit', 1, NULL),
(1, '4001', '实收资本', 'equity', 'credit', 1, NULL),
(1, '5001', '主营业务收入', 'revenue', 'credit', 1, NULL),
(1, '5051', '其他业务收入', 'revenue', 'credit', 1, NULL),
(1, '5401', '主营业务成本', 'cost', 'debit', 1, NULL),
(1, '5402', '其他业务成本', 'cost', 'debit', 1, NULL),
(1, '6601', '管理费用', 'expense', 'debit', 1, NULL),
(1, '6601.01', '工资薪金', 'expense', 'debit', 2, 13),
(1, '6601.02', '办公费', 'expense', 'debit', 2, 13),
(1, '6601.03', '差旅费', 'expense', 'debit', 2, 13),
(1, '6601.04', '水电费', 'expense', 'debit', 2, 13),
(1, '6602', '销售费用', 'expense', 'debit', 1, NULL),
(1, '6602.01', '广告宣传费', 'expense', 'debit', 2, 19),
(1, '6602.02', '运费', 'expense', 'debit', 2, 19),
(1, '6603', '财务费用', 'expense', 'debit', 1, NULL);

-- 3. 清除租户2-5旧数据（按依赖顺序）
DELETE vi FROM voucher_items vi
JOIN vouchers v ON vi.voucher_id = v.id
JOIN accounting_books b ON v.book_id = b.id
WHERE b.tenant_id IN (2,3,4,5);
DELETE FROM voucher_seals WHERE voucher_id IN (SELECT id FROM vouchers WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5)));
DELETE FROM vouchers WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5));
DELETE FROM seals WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5));
DELETE FROM account_balances WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5));
DELETE FROM period_closures WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5));
DELETE FROM accounting_accounts WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5));
DELETE FROM accounting_books WHERE tenant_id IN (2,3,4,5);

-- 4. 插入账套2-5
INSERT INTO accounting_books (id, tenant_id, book_name, entity_name, credit_code, entity_type) VALUES
(2, 2, '鲜惠生鲜账套', '鲜惠社区生鲜超市', '92420102MAK000002', 'individual'),
(3, 3, '悦选数码账套', '悦选数码电商', '92420102MAK000003', 'individual'),
(4, 4, '康美药房账套', '康美大药房', '92420102MAK000004', 'individual'),
(5, 5, '美味烘焙账套', '美味烘焙工坊', '92420102MAK000005', 'individual');

-- 5. 为账套2-5复制一级科目（从账套1）
INSERT INTO accounting_accounts (book_id, code, name, category, direction, level, parent_id)
SELECT b.id, a.code, a.name, a.category, a.direction, 1, NULL
FROM accounting_books b
CROSS JOIN accounting_accounts a ON a.book_id = 1 AND a.level = 1
WHERE b.id IN (2,3,4,5);

-- 6. 为账套2-5复制二级科目（parent_id重映射到新科目）
INSERT INTO accounting_accounts (book_id, code, name, category, direction, level, parent_id)
SELECT b.id, a2.code, a2.name, a2.category, a2.direction, 2, p_new.id
FROM accounting_books b
JOIN accounting_accounts a2 ON a2.book_id = 1 AND a2.level = 2
JOIN accounting_accounts p_old ON p_old.id = a2.parent_id
JOIN accounting_accounts p_new ON p_new.book_id = b.id AND p_new.code = p_old.code
WHERE b.id IN (2,3,4,5);

-- 7. 为账套2-5插入印章
INSERT INTO seals (book_id, seal_type, seal_name, seal_code, is_filed, is_active, created_at)
SELECT b.id, t.st, t.sn, t.code, 1, 1, NOW()
FROM accounting_books b
JOIN (
  SELECT 'company' AS st, '单位公章' AS sn, '42010210450802' AS code
  UNION SELECT 'financial', '财务专用章', '42010210452483'
  UNION SELECT 'legal_rep', '法定代表人名章', '42010210450803'
) t
WHERE b.id IN (2,3,4,5);

-- 8. 为账套2-5插入凭证
-- 收款凭证
INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, total_debit, total_credit, is_balanced, status, remark, created_at)
SELECT b.id, 'receipt', CONCAT('收-', LPAD(b.id,4,'0')), '2026-08-20',
  CASE b.id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END,
  CASE b.id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END,
  1, 'posted', '销售收入入账', NOW()
FROM accounting_books b WHERE b.id IN (2,3,4,5);

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id, 1, a1.id, '收到销售货款',
  CASE v.book_id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END, 0
FROM vouchers v
JOIN accounting_accounts a1 ON a1.book_id = v.book_id AND a1.code = '1002'
WHERE v.book_id IN (2,3,4,5) AND v.voucher_type = 'receipt';

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id, 2, a2.id, '主营业务收入', 0,
  CASE v.book_id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END
FROM vouchers v
JOIN accounting_accounts a2 ON a2.book_id = v.book_id AND a2.code = '5001'
WHERE v.book_id IN (2,3,4,5) AND v.voucher_type = 'receipt';

-- 付款凭证
INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, total_debit, total_credit, is_balanced, status, remark, created_at)
SELECT b.id, 'payment', CONCAT('付-', LPAD(b.id,4,'0')), '2026-08-15', 6000, 6000, 1, 'posted', '发放工资', NOW()
FROM accounting_books b WHERE b.id IN (2,3,4,5);

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id, 1, a3.id, '发放员工工资', 6000, 0
FROM vouchers v
JOIN accounting_accounts a3 ON a3.book_id = v.book_id AND a3.code = '6601'
WHERE v.book_id IN (2,3,4,5) AND v.voucher_type = 'payment';

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id, 2, a4.id, '银行转账支付', 0, 6000
FROM vouchers v
JOIN accounting_accounts a4 ON a4.book_id = v.book_id AND a4.code = '1002'
WHERE v.book_id IN (2,3,4,5) AND v.voucher_type = 'payment';

-- 9. 为账套1也插入凭证和印章（如不存在）
INSERT INTO seals (book_id, seal_type, seal_name, seal_code, is_filed, is_active, created_at)
SELECT 1, t.st, t.sn, t.code, 1, 1, NOW()
FROM (
  SELECT 'company' AS st, '单位公章' AS sn, '42010210450802' AS code
  UNION SELECT 'financial', '财务专用章', '42010210452483'
  UNION SELECT 'legal_rep', '法定代表人名章', '42010210450803'
) t
WHERE NOT EXISTS (SELECT 1 FROM seals WHERE book_id = 1);

SET FOREIGN_KEY_CHECKS = 1;

-- 验证结果
SELECT '账套数' as check_item, COUNT(*) as cnt FROM accounting_books
UNION ALL SELECT '科目总数', COUNT(*) FROM accounting_accounts
UNION ALL SELECT '印章总数', COUNT(*) FROM seals
UNION ALL SELECT '凭证总数', COUNT(*) FROM vouchers
UNION ALL SELECT '凭证明细数', COUNT(*) FROM voucher_items;
