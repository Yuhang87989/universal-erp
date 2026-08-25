-- ============================================
-- 演示账套数据完整性验证脚本
-- 在demo_seed.sql执行后运行，逐项检查
-- ============================================
USE erp_db;

-- 1. 租户数量（应有4个新租户2-5）
SELECT '1.租户数量' as check_item, COUNT(*) as cnt, 
  CASE WHEN COUNT(*)=4 THEN 'PASS' ELSE 'FAIL' END as result
FROM tenants WHERE id IN (2,3,4,5);

-- 2. 用户数量（每账套1个admin）
SELECT '2.用户数量' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=4 THEN 'PASS' ELSE 'FAIL' END as result
FROM users WHERE tenant_id IN (2,3,4,5) AND username='admin';

-- 3. 商品数量（账套2有10个，账套3/4/5各8个，共34）
SELECT '3.商品总数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=34 THEN 'PASS' ELSE 'FAIL' END as result
FROM products WHERE tenant_id IN (2,3,4,5);

-- 4. 仓库数量（2+1+1+1=6）
SELECT '4.仓库总数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=6 THEN 'PASS' ELSE 'FAIL' END as result
FROM warehouses WHERE tenant_id IN (2,3,4,5);

-- 5. 库存记录（10+8+8+8=34）
SELECT '5.库存记录数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=34 THEN 'PASS' ELSE 'FAIL' END as result
FROM inventory WHERE tenant_id IN (2,3,4,5);

-- 6. 采购单金额与明细一致性
SELECT '6.采购单金额一致' as check_item, COUNT(*) as mismatch_count,
  CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END as result
FROM purchase_orders po
LEFT JOIN (
  SELECT purchase_order_id, SUM(quantity*unit_cost) as item_total
  FROM purchase_items GROUP BY purchase_order_id
) pi ON pi.purchase_order_id=po.id
WHERE po.tenant_id IN (2,3,4,5)
  AND ABS(po.total_amount - COALESCE(pi.item_total,0)) > 0.01;

-- 7. 销售单金额与明细一致性
SELECT '7.销售单金额一致' as check_item, COUNT(*) as mismatch_count,
  CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END as result
FROM sales_orders so
LEFT JOIN (
  SELECT sales_order_id, SUM(quantity*unit_price) as item_total
  FROM sale_items GROUP BY sales_order_id
) si ON si.sales_order_id=so.id
WHERE so.tenant_id IN (2,3,4,5)
  AND ABS(so.total_amount - COALESCE(si.item_total,0)) > 0.01;

-- 8. 会计账套数量
SELECT '8.会计账套数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=4 THEN 'PASS' ELSE 'FAIL' END as result
FROM accounting_books WHERE id IN (2,3,4,5);

-- 9. 会计科目数量（每账套从账套1复制，检查是否>0）
SELECT '9.科目复制完整' as check_item, 
  MIN(acct_cnt) as min_accounts,
  CASE WHEN MIN(acct_cnt) > 30 THEN 'PASS' ELSE 'FAIL' END as result
FROM (
  SELECT book_id, COUNT(*) as acct_cnt
  FROM accounting_accounts WHERE book_id IN (2,3,4,5)
  GROUP BY book_id
) t;

-- 10. 凭证借贷平衡（凭证头）
SELECT '10.凭证头借贷平衡' as check_item, COUNT(*) as imbalance_count,
  CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END as result
FROM vouchers WHERE book_id IN (2,3,4,5)
  AND ABS(total_debit - total_credit) > 0.01;

-- 11. 凭证借贷平衡（凭证体 vs 凭证头）
SELECT '11.凭证体头一致' as check_item, COUNT(*) as mismatch_count,
  CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END as result
FROM vouchers v
LEFT JOIN (
  SELECT voucher_id, SUM(debit_amount) as d, SUM(credit_amount) as c
  FROM voucher_items GROUP BY voucher_id
) vi ON vi.voucher_id=v.id
WHERE v.book_id IN (2,3,4,5)
  AND (ABS(v.total_debit - COALESCE(vi.d,0)) > 0.01
    OR ABS(v.total_credit - COALESCE(vi.c,0)) > 0.01
    OR ABS(COALESCE(vi.d,0) - COALESCE(vi.c,0)) > 0.01);

-- 12. 印章数量（每账套3枚，共12）
SELECT '12.印章总数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=12 THEN 'PASS' ELSE 'FAIL' END as result
FROM seals s JOIN accounting_books b ON b.id=s.book_id
WHERE b.tenant_id IN (2,3,4,5);

-- 13. 库存预警（应有若干条）
SELECT '13.预警记录数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'WARN:无预警' END as result
FROM stock_alerts WHERE tenant_id IN (2,3,4,5);

-- 14. 支付渠道（每账套4种，共16）
SELECT '14.支付渠道数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=16 THEN 'PASS' ELSE 'FAIL' END as result
FROM payment_channels WHERE tenant_id IN (2,3,4,5);

-- 15. 入库单数量
SELECT '15.入库单数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=5 THEN 'PASS' ELSE 'FAIL' END as result
FROM stock_in_orders WHERE tenant_id IN (2,3,4,5);

-- 16. 出库单数量
SELECT '16.出库单数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=4 THEN 'PASS' ELSE 'FAIL' END as result
FROM stock_out_orders WHERE tenant_id IN (2,3,4,5);

-- 17. 调拨单数量
SELECT '17.调拨单数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*)=1 THEN 'PASS' ELSE 'FAIL' END as result
FROM stock_transfers WHERE tenant_id=2;

-- 18. 入库单金额与明细一致性
SELECT '18.入库单金额一致' as check_item, COUNT(*) as mismatch_count,
  CASE WHEN COUNT(*)=0 THEN 'PASS' ELSE 'FAIL' END as result
FROM stock_in_orders sio
LEFT JOIN (
  SELECT stock_in_id, SUM(quantity*unit_cost) as item_total
  FROM stock_in_items GROUP BY stock_in_id
) sii ON sii.stock_in_id=sio.id
WHERE sio.tenant_id IN (2,3,4,5)
  AND ABS(sio.total_amount - COALESCE(sii.item_total,0)) > 0.01;

-- 19. 财务收支记录
SELECT '19.财务记录数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*) >= 10 THEN 'PASS' ELSE 'FAIL' END as result
FROM finance_records WHERE tenant_id IN (2,3,4,5);

-- 20. 库存流水
SELECT '20.库存流水数' as check_item, COUNT(*) as cnt,
  CASE WHEN COUNT(*) > 32 THEN 'PASS' ELSE 'FAIL' END as result
FROM inventory_logs WHERE tenant_id IN (2,3,4,5);

-- ============================================
-- 汇总：每账套数据概览
-- ============================================
SELECT 
  t.id as 账套ID,
  t.name as 账套名称,
  COUNT(DISTINCT p.id) as 商品数,
  COUNT(DISTINCT w.id) as 仓库数,
  COUNT(DISTINCT po.id) as 采购单数,
  COUNT(DISTINCT so.id) as 销售单数,
  COUNT(DISTINCT sio.id) as 入库单数,
  COUNT(DISTINCT soo.id) as 出库单数,
  COUNT(DISTINCT v.id) as 凭证数,
  COUNT(DISTINCT s.id) as 印章数,
  COUNT(DISTINCT pc.id) as 支付渠道数,
  COUNT(DISTINCT sa.id) as 预警数
FROM tenants t
LEFT JOIN products p ON p.tenant_id=t.id
LEFT JOIN warehouses w ON w.tenant_id=t.id
LEFT JOIN purchase_orders po ON po.tenant_id=t.id
LEFT JOIN sales_orders so ON so.tenant_id=t.id
LEFT JOIN stock_in_orders sio ON sio.tenant_id=t.id
LEFT JOIN stock_out_orders soo ON soo.tenant_id=t.id
LEFT JOIN accounting_books b ON b.tenant_id=t.id
LEFT JOIN vouchers v ON v.book_id=b.id
LEFT JOIN seals s ON s.book_id=b.id
LEFT JOIN payment_channels pc ON pc.tenant_id=t.id
LEFT JOIN stock_alerts sa ON sa.tenant_id=t.id
WHERE t.id IN (2,3,4,5)
GROUP BY t.id, t.name
ORDER BY t.id;
