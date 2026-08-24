-- ============================================
-- 通用电商ERP - 4套演示账套种子数据
-- 说明：在基础表(schema.sql)和3个升级SQL执行后运行
-- 账套：2=鲜惠社区生鲜超市  3=悦选数码电商  4=康美大药房  5=美味烘焙工坊
-- 每个账套：用户(admin/admin123)、分类、商品、仓库、供应商、客户、
--          采购单、销售单、库存、财务收支、账套科目、2张凭证、印章、预警、
--          入库单、出库单、调拨单
-- ============================================
USE erp_db;

-- 清理旧演示数据（可重复执行）
SET FOREIGN_KEY_CHECKS=0;
DELETE FROM inventory_logs WHERE tenant_id IN (2,3,4,5);
DELETE FROM stock_transfer_items WHERE transfer_id IN (SELECT id FROM stock_transfers WHERE tenant_id IN (2,3,4,5));
DELETE FROM stock_transfers WHERE tenant_id IN (2,3,4,5);
DELETE FROM stock_out_items WHERE order_id IN (SELECT id FROM stock_out_orders WHERE tenant_id IN (2,3,4,5));
DELETE FROM stock_out_orders WHERE tenant_id IN (2,3,4,5);
DELETE FROM stock_in_items WHERE order_id IN (SELECT id FROM stock_in_orders WHERE tenant_id IN (2,3,4,5));
DELETE FROM stock_in_orders WHERE tenant_id IN (2,3,4,5);
DELETE FROM payment_channels WHERE tenant_id IN (2,3,4,5);
DELETE FROM stock_alerts WHERE tenant_id IN (2,3,4,5);
DELETE FROM voucher_items WHERE voucher_id IN (SELECT id FROM vouchers WHERE tenant_id IN (2,3,4,5));
DELETE FROM vouchers WHERE tenant_id IN (2,3,4,5);
DELETE FROM seals WHERE book_id IN (SELECT id FROM accounting_books WHERE tenant_id IN (2,3,4,5));
DELETE FROM accounting_accounts WHERE tenant_id IN (2,3,4,5);
DELETE FROM accounting_books WHERE tenant_id IN (2,3,4,5);
DELETE FROM finance_records WHERE tenant_id IN (2,3,4,5);
DELETE FROM sale_items WHERE order_id IN (SELECT id FROM sales_orders WHERE tenant_id IN (2,3,4,5));
DELETE FROM sales_orders WHERE tenant_id IN (2,3,4,5);
DELETE FROM purchase_items WHERE order_id IN (SELECT id FROM purchase_orders WHERE tenant_id IN (2,3,4,5));
DELETE FROM purchase_orders WHERE tenant_id IN (2,3,4,5);
DELETE FROM inventory WHERE tenant_id IN (2,3,4,5);
DELETE FROM customers WHERE tenant_id IN (2,3,4,5);
DELETE FROM suppliers WHERE tenant_id IN (2,3,4,5);
DELETE FROM warehouses WHERE tenant_id IN (2,3,4,5);
DELETE FROM products WHERE tenant_id IN (2,3,4,5);
DELETE FROM categories WHERE tenant_id IN (2,3,4,5);
DELETE FROM users WHERE tenant_id IN (2,3,4,5);
DELETE FROM tenants WHERE id IN (2,3,4,5);
SET FOREIGN_KEY_CHECKS=1;

-- 管理员密码统一：admin123 的 bcrypt hash（与schema.sql一致）
SET @demo_hash = '$2b$10$rQiWJLk/mXcYGjV8zVwqQeJq7vZ.aB1kZ3pR5cY6dF8gH0jK2mN4u';

-- ---------- 1. 租户 ----------
INSERT INTO tenants (id, name, owner_name, phone, business_type, address) VALUES
(2, '鲜惠社区生鲜超市', '王丽', '13800002001', 'retail', '武汉市江岸区解放大道188号'),
(3, '悦选数码电商', '陈明', '13800002002', 'ecommerce', '深圳市南山区科技园路66号'),
(4, '康美大药房', '李华', '13800002003', 'retail', '广州市天河区体育西路120号'),
(5, '美味烘焙工坊', '张小芳', '13800002004', 'supply_coop', '成都市锦江区春熙路88号');

-- ---------- 2. 用户（每账套一个owner） ----------
INSERT INTO users (tenant_id, username, password_hash, real_name, role, phone) VALUES
(2, 'admin', @demo_hash, '王丽', 'owner', '13800002001'),
(3, 'admin', @demo_hash, '陈明', 'owner', '13800002002'),
(4, 'admin', @demo_hash, '李华', 'owner', '13800002003'),
(5, 'admin', @demo_hash, '张小芳', 'owner', '13800002004');

-- ---------- 3. 分类 ----------
INSERT INTO categories (tenant_id, name, sort_order) VALUES
(2,'蔬菜',1),(2,'水果',2),(2,'肉禽蛋',3),(2,'水产',4),(2,'粮油',5),
(3,'手机',1),(3,'电脑',2),(3,'配件',3),(3,'智能穿戴',4),(3,'影音',5),
(4,'感冒用药',1),(4,'肠胃用药',2),(4,'维生素',3),(4,'医疗器械',4),(4,'保健品',5),
(5,'面包',1),(5,'蛋糕',2),(5,'饼干点心',3),(5,'原料',4),(5,'饮品',5);

-- ---------- 4. 商品 ----------
-- 账套2 生鲜
INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status)
SELECT 2, c.id, t.name, t.barcode, t.unit, t.cost, t.sell, t.min, 'active'
FROM (SELECT '蔬菜' cat,'大白菜' name,'6902001' barcode,'斤' unit,1.20 cost,2.50 sell,20 min
 UNION SELECT '蔬菜','土豆','6902002','斤',1.80,3.50,20
 UNION SELECT '蔬菜','番茄','6902003','斤',2.50,5.80,15
 UNION SELECT '水果','红富士苹果','6902004','斤',4.00,8.80,30
 UNION SELECT '水果','香蕉','6902005','斤',2.80,5.50,25
 UNION SELECT '肉禽蛋','土鸡蛋','6902006','盒',8.00,15.80,10
 UNION SELECT '肉禽蛋','猪五花肉','6902007','斤',15.00,26.80,8
 UNION SELECT '水产','基围虾','6902008','斤',28.00,49.80,5
 UNION SELECT '粮油','东北大米5kg','6902009','袋',35.00,59.90,10
 UNION SELECT '粮油','金龙鱼调和油5L','6902010','桶',52.00,89.90,6
) t JOIN categories c ON c.tenant_id=2 AND c.name=t.cat;

-- 账套3 数码
INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status)
SELECT 3, c.id, t.name, t.barcode, t.unit, t.cost, t.sell, t.min, 'active'
FROM (SELECT '手机' cat,'智能手机A12 128G' name,'6903001' barcode,'台' unit,1899 cost,2399 sell,5 min
 UNION SELECT '手机','智能手机Pro 256G','6903002','台',3299,4299,3
 UNION SELECT '电脑','轻薄笔记本14寸','6903003','台',3899,4999,4
 UNION SELECT '配件','无线蓝牙耳机','6903004','副',89,199,20
 UNION SELECT '配件','快充充电器65W','6903005','个',45,99,30
 UNION SELECT '智能穿戴','智能手表','6903006','块',299,599,8
 UNION SELECT '智能穿戴','运动手环','6903007','个',79,169,15
 UNION SELECT '影音','蓝牙音箱','6903008','台',129,299,10
) t JOIN categories c ON c.tenant_id=3 AND c.name=t.cat;

-- 账套4 药房
INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status)
SELECT 4, c.id, t.name, t.barcode, t.unit, t.cost, t.sell, t.min, 'active'
FROM (SELECT '感冒用药' cat,'感冒灵颗粒' name,'6904001' barcode,'盒' unit,8.50 cost,16.80 sell,30 min
 UNION SELECT '感冒用药','布洛芬缓释胶囊','6904002','盒',12.00,25.00,25
 UNION SELECT '肠胃用药','健胃消食片','6904003','盒',6.50,13.80,40
 UNION SELECT '维生素','维生素C片100片','6904004','瓶',18.00,39.00,20
 UNION SELECT '维生素','复合维生素B','6904005','瓶',15.00,32.00,20
 UNION SELECT '医疗器械','电子体温计','6904006','个',25.00,59.00,15
 UNION SELECT '医疗器械','医用口罩50只','6904007','盒',18.00,39.90,50
 UNION SELECT '保健品','钙片100粒','6904008','瓶',38.00,88.00,12
) t JOIN categories c ON c.tenant_id=4 AND c.name=t.cat;

-- 账套5 烘焙
INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status)
SELECT 5, c.id, t.name, t.barcode, t.unit, t.cost, t.sell, t.min, 'active'
FROM (SELECT '面包' cat,'原味吐司' name,'6905001' barcode,'个' unit,4.50 cost,12.00 sell,15 min
 UNION SELECT '面包','牛角包','6905002','个',3.00,8.00,20
 UNION SELECT '蛋糕','草莓蛋糕6寸','6905003','个',38.00,98.00,3
 UNION SELECT '蛋糕','提拉米苏','6905004','块',12.00,28.00,8
 UNION SELECT '饼干点心','曲奇饼干礼盒','6905005','盒',22.00,58.00,10
 UNION SELECT '饮品','现磨拿铁','6905006','杯',6.00,18.00,0
 UNION SELECT '原料','高筋面粉1kg','6905007','袋',9.00,18.00,20
 UNION SELECT '原料','淡奶油1L','6905008','盒',28.00,48.00,10
) t JOIN categories c ON c.tenant_id=5 AND c.name=t.cat;

-- ---------- 5. 仓库 ----------
INSERT INTO warehouses (tenant_id, code, name, address, manager, is_default, sort_order) VALUES
(2,'WH002','生鲜主仓库','超市后仓','王仓管',TRUE,1),
(2,'WH002S','门店货架','门店前场','王丽',FALSE,2),
(3,'WH003','数码总仓','深圳宝安仓','陈仓管',TRUE,1),
(4,'WH004','药房库区','店内药柜','李华',TRUE,1),
(5,'WH005','烘焙中央厨房','工坊后厨','张师傅',TRUE,1);

-- ---------- 6. 供应商 ----------
INSERT INTO suppliers (tenant_id, name, contact_name, phone, address, bank_name, status) VALUES
(2,'白沙洲蔬菜批发','刘老板','13900002001','武汉白沙洲市场','农业银行','active'),
(2,'汉口北冷链','赵经理','13900002002','汉口北海鲜城','工商银行','active'),
(3,'华强北数码供应链','黄总','13900003001','深圳华强北','招商银行','active'),
(4,'同济医药批发','周经理','13900004001','武汉医药产业园','建设银行','active'),
(5,'烘焙原料商行','吴老板','13900005001','成都粮油市场','中国银行','active');

-- ---------- 7. 客户/会员 ----------
INSERT INTO customers (tenant_id, name, phone, gender, level, points) VALUES
(2,'张三','13700002001','male','gold',520),
(2,'李四','13700002002','female','silver',180),
(3,'数码爱好者小王','13700003001','male','vip',1200),
(4,'老顾客陈阿姨','13700004001','female','gold',680),
(5,'甜品控小美','13700005001','female','silver',320);

-- ---------- 8. 库存（各账套默认仓，用子查询动态获取warehouse_id） ----------
-- 账套2 默认仓=WH002
INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity)
SELECT 2, p.id, (SELECT id FROM warehouses WHERE tenant_id=2 AND is_default=TRUE LIMIT 1),
  CASE p.name WHEN '大白菜' THEN 80 WHEN '土豆' THEN 60 WHEN '番茄' THEN 5
  WHEN '红富士苹果' THEN 45 WHEN '香蕉' THEN 38 WHEN '土鸡蛋' THEN 22
  WHEN '猪五花肉' THEN 3 WHEN '基围虾' THEN 12 WHEN '东北大米5kg' THEN 25
  WHEN '金龙鱼调和油5L' THEN 14 END
FROM products p WHERE p.tenant_id=2;

-- 账套3
INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity)
SELECT 3, p.id, (SELECT id FROM warehouses WHERE tenant_id=3 AND is_default=TRUE LIMIT 1),
  CASE p.name WHEN '智能手机A12 128G' THEN 12 WHEN '智能手机Pro 256G' THEN 2
  WHEN '轻薄笔记本14寸' THEN 6 WHEN '无线蓝牙耳机' THEN 50
  WHEN '快充充电器65W' THEN 80 WHEN '智能手表' THEN 15
  WHEN '运动手环' THEN 40 WHEN '蓝牙音箱' THEN 20 END
FROM products p WHERE p.tenant_id=3;

-- 账套4
INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity)
SELECT 4, p.id, (SELECT id FROM warehouses WHERE tenant_id=4 AND is_default=TRUE LIMIT 1),
  CASE p.name WHEN '感冒灵颗粒' THEN 120 WHEN '布洛芬缓释胶囊' THEN 80
  WHEN '健胃消食片' THEN 90 WHEN '维生素C片100片' THEN 45
  WHEN '复合维生素B' THEN 30 WHEN '电子体温计' THEN 8
  WHEN '医用口罩50只' THEN 200 WHEN '钙片100粒' THEN 4 END
FROM products p WHERE p.tenant_id=4;

-- 账套5
INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity)
SELECT 5, p.id, (SELECT id FROM warehouses WHERE tenant_id=5 AND is_default=TRUE LIMIT 1),
  CASE p.name WHEN '原味吐司' THEN 25 WHEN '牛角包' THEN 30
  WHEN '草莓蛋糕6寸' THEN 1 WHEN '提拉米苏' THEN 12
  WHEN '曲奇饼干礼盒' THEN 18 WHEN '现磨拿铁' THEN 0
  WHEN '高筋面粉1kg' THEN 40 WHEN '淡奶油1L' THEN 16 END
FROM products p WHERE p.tenant_id=5;

-- ---------- 9. 采购单（金额与明细sum一致） ----------
-- 账套2 PO1: 200*1.2+150*1.8+100*2.5 = 240+270+250 = 760
INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, order_date)
VALUES (2,'PO20260810001',1,760.00,'received','2026-08-10');
INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost, received_quantity)
SELECT po.id, p.id,
  CASE p.name WHEN '大白菜' THEN 200 WHEN '土豆' THEN 150 WHEN '番茄' THEN 100 END,
  CASE p.name WHEN '大白菜' THEN 1.20 WHEN '土豆' THEN 1.80 WHEN '番茄' THEN 2.50 END,
  CASE p.name WHEN '大白菜' THEN 200 WHEN '土豆' THEN 150 WHEN '番茄' THEN 100 END
FROM purchase_orders po JOIN products p ON p.tenant_id=2
WHERE po.tenant_id=2 AND po.order_no='PO20260810001' AND p.name IN ('大白菜','土豆','番茄');

-- 账套2 PO2: 20*28+20*15 = 560+300 = 860
INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, order_date)
VALUES (2,'PO20260815001',2,860.00,'received','2026-08-15');
INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost, received_quantity)
SELECT po.id, p.id,
  CASE p.name WHEN '基围虾' THEN 20 WHEN '猪五花肉' THEN 20 END,
  CASE p.name WHEN '基围虾' THEN 28 WHEN '猪五花肉' THEN 15 END,
  CASE p.name WHEN '基围虾' THEN 20 WHEN '猪五花肉' THEN 20 END
FROM purchase_orders po JOIN products p ON p.tenant_id=2
WHERE po.tenant_id=2 AND po.order_no='PO20260815001' AND p.name IN ('基围虾','猪五花肉');

-- 账套3 PO1: 10*1899 = 18990
INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, order_date)
VALUES (3,'PO20260805001',3,18990.00,'received','2026-08-05');
INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost, received_quantity)
SELECT po.id,p.id,10,1899,10
FROM purchase_orders po JOIN products p ON p.tenant_id=3
WHERE po.tenant_id=3 AND po.order_no='PO20260805001' AND p.name='智能手机A12 128G';

-- 账套3 PO2: 50*89 = 4450
INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, order_date)
VALUES (3,'PO20260812001',3,4450.00,'received','2026-08-12');
INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost, received_quantity)
SELECT po.id,p.id,50,89,50
FROM purchase_orders po JOIN products p ON p.tenant_id=3
WHERE po.tenant_id=3 AND po.order_no='PO20260812001' AND p.name='无线蓝牙耳机';

-- 账套4 PO1: 100*8.5+80*12+50*18 = 850+960+900 = 2710
INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, order_date)
VALUES (4,'PO20260808001',4,2710.00,'received','2026-08-08');
INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost, received_quantity)
SELECT po.id,p.id,
 CASE p.name WHEN '感冒灵颗粒' THEN 100 WHEN '布洛芬缓释胶囊' THEN 80 WHEN '医用口罩50只' THEN 50 END,
 CASE p.name WHEN '感冒灵颗粒' THEN 8.5 WHEN '布洛芬缓释胶囊' THEN 12 WHEN '医用口罩50只' THEN 18 END,
 CASE p.name WHEN '感冒灵颗粒' THEN 100 WHEN '布洛芬缓释胶囊' THEN 80 WHEN '医用口罩50只' THEN 50 END
FROM purchase_orders po JOIN products p ON p.tenant_id=4
WHERE po.tenant_id=4 AND po.order_no='PO20260808001' AND p.name IN ('感冒灵颗粒','布洛芬缓释胶囊','医用口罩50只');

-- 账套5 PO1: 60*9+20*28 = 540+560 = 1100
INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, total_amount, status, order_date)
VALUES (5,'PO20260809001',5,1100.00,'received','2026-08-09');
INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost, received_quantity)
SELECT po.id,p.id,
 CASE p.name WHEN '高筋面粉1kg' THEN 60 WHEN '淡奶油1L' THEN 20 END,
 CASE p.name WHEN '高筋面粉1kg' THEN 9 WHEN '淡奶油1L' THEN 28 END,
 CASE p.name WHEN '高筋面粉1kg' THEN 60 WHEN '淡奶油1L' THEN 20 END
FROM purchase_orders po JOIN products p ON p.tenant_id=5
WHERE po.tenant_id=5 AND po.order_no='PO20260809001' AND p.name IN ('高筋面粉1kg','淡奶油1L');

-- ---------- 10. 销售单（固定数据，total与明细sum一致） ----------
-- 账套2 生鲜：5笔POS销售
INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, order_date) VALUES
(2,'S20260820-001','pos',1, 73.00,0,73.00,73.00,'wechat','completed','2026-08-20 09:30:00'),
(2,'S20260821-001','pos',2, 48.60,0,48.60,48.60,'cash','completed','2026-08-21 10:15:00'),
(2,'S20260822-001','pos',1, 149.40,0,149.40,149.40,'alipay','completed','2026-08-22 16:20:00'),
(2,'S20260823-001','pos',NULL, 26.80,0,26.80,26.80,'wechat','completed','2026-08-23 11:00:00'),
(2,'S20260824-001','pos',2, 95.60,0,95.60,95.60,'cash','completed','2026-08-24 14:30:00');
-- 明细（金额=qty*sell_price）
-- S001: 大白菜10斤*2.5=25 + 土豆8斤*3.5=28 + 番茄5斤*4=20... wait 番茄sell=5.8, 5*5.8=29. 25+28+29=82≠73. 需重算
-- 重新设计明细确保合计正确:
-- S001 total=73: 大白菜10*2.5=25 + 土豆8*3.5=28 + 香蕉(73-25-28)/5.5≈3.64不整。改用: 大白菜8*2.5=20+土豆6*3.5=21+红富士苹果(73-41)/8.8≈3.64不整
-- 用整数组合: 土鸡蛋2盒*15.8=31.6 + 香蕉5斤*5.5=27.5 + 大白菜5斤*2.5=12.5 = 71.6. 不够
-- 大白菜10*2.5=25 + 土豆10*3.5=35 + 番茄(73-60)/5.8不整
-- 改为: 红富士苹果5*8.8=44 + 土鸡蛋1*15.8=15.8 + 大白菜(73-59.8)/2.5=5.28不整
-- 简单方案：total由明细决定，用小数精确
INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price)
SELECT so.id, p.id,
  CASE so.order_no
    WHEN 'S20260820-001' THEN CASE p.name WHEN '大白菜' THEN 10 WHEN '土豆' THEN 8 WHEN '香蕉' THEN 4 END
    WHEN 'S20260821-001' THEN CASE p.name WHEN '番茄' THEN 3 WHEN '土鸡蛋' THEN 2 END
    WHEN 'S20260822-001' THEN CASE p.name WHEN '猪五花肉' THEN 2 WHEN '基围虾' THEN 1 WHEN '红富士苹果' THEN 5 END
    WHEN 'S20260823-001' THEN CASE p.name WHEN '大白菜' THEN 5 WHEN '金龙鱼调和油5L' THEN 1 END
    WHEN 'S20260824-001' THEN CASE p.name WHEN '东北大米5kg' THEN 1 WHEN '土鸡蛋' THEN 2 WHEN '香蕉' THEN 3 END
  END,
  p.sell_price
FROM sales_orders so JOIN products p ON p.tenant_id=2
WHERE so.tenant_id=2 AND (
  (so.order_no='S20260820-001' AND p.name IN ('大白菜','土豆','香蕉')) OR
  (so.order_no='S20260821-001' AND p.name IN ('番茄','土鸡蛋')) OR
  (so.order_no='S20260822-001' AND p.name IN ('猪五花肉','基围虾','红富士苹果')) OR
  (so.order_no='S20260823-001' AND p.name IN ('大白菜','金龙鱼调和油5L')) OR
  (so.order_no='S20260824-001' AND p.name IN ('东北大米5kg','土鸡蛋','香蕉'))
);
-- 根据明细重算total（确保精确一致）
UPDATE sales_orders so SET
  total_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id),
  actual_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id),
  paid_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id)
WHERE so.tenant_id=2;

-- 账套3 数码
INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, platform, order_date) VALUES
(3,'S20260801-001','online',3,2399,0,2399,2399,'wechat','completed','taobao','2026-08-01 10:20:00'),
(3,'S20260806-001','online',3,199,0,199,199,'alipay','completed','douyin','2026-08-06 14:30:00'),
(3,'S20260812-001','online',3,4999,0,4999,4999,'card','completed','tmall','2026-08-12 09:15:00'),
(3,'S20260818-001','online',3,599,0,599,599,'wechat','completed','taobao','2026-08-18 16:40:00'),
(3,'S20260820-001','pos',3,4299,100,4199,4199,'alipay','completed',NULL,'2026-08-20 11:00:00');
INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price)
SELECT so.id, p.id, 1, p.sell_price
FROM sales_orders so JOIN products p ON p.tenant_id=3
WHERE so.tenant_id=3 AND (
  (so.order_no='S20260801-001' AND p.name='智能手机A12 128G') OR
  (so.order_no='S20260806-001' AND p.name='无线蓝牙耳机') OR
  (so.order_no='S20260812-001' AND p.name='轻薄笔记本14寸') OR
  (so.order_no='S20260818-001' AND p.name='智能手表') OR
  (so.order_no='S20260820-001' AND p.name='智能手机Pro 256G')
);

-- 账套4 药房：6笔POS销售（固定商品+数量，total由明细计算）
INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, order_date) VALUES
(4,'S20260818-001','pos',4,0,0,0,0,'wechat','completed','2026-08-18 09:00:00'),
(4,'S20260819-001','pos',NULL,0,0,0,0,'cash','completed','2026-08-19 10:30:00'),
(4,'S20260820-001','pos',4,0,0,0,0,'wechat','completed','2026-08-20 14:00:00'),
(4,'S20260821-001','pos',NULL,0,0,0,0,'alipay','completed','2026-08-21 11:20:00'),
(4,'S20260822-001','pos',4,0,0,0,0,'cash','completed','2026-08-22 15:45:00'),
(4,'S20260823-001','pos',NULL,0,0,0,0,'wechat','completed','2026-08-23 09:30:00');
INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price)
SELECT so.id, p.id,
  CASE so.order_no
    WHEN 'S20260818-001' THEN CASE p.name WHEN '感冒灵颗粒' THEN 2 WHEN '布洛芬缓释胶囊' THEN 1 END
    WHEN 'S20260819-001' THEN CASE p.name WHEN '健胃消食片' THEN 3 WHEN '维生素C片100片' THEN 1 END
    WHEN 'S20260820-001' THEN CASE p.name WHEN '医用口罩50只' THEN 2 WHEN '电子体温计' THEN 1 END
    WHEN 'S20260821-001' THEN CASE p.name WHEN '复合维生素B' THEN 2 WHEN '钙片100粒' THEN 1 END
    WHEN 'S20260822-001' THEN CASE p.name WHEN '感冒灵颗粒' THEN 3 WHEN '健胃消食片' THEN 2 END
    WHEN 'S20260823-001' THEN CASE p.name WHEN '布洛芬缓释胶囊' THEN 1 WHEN '维生素C片100片' THEN 2 END
  END,
  p.sell_price
FROM sales_orders so JOIN products p ON p.tenant_id=4
WHERE so.tenant_id=4 AND (
  (so.order_no='S20260818-001' AND p.name IN ('感冒灵颗粒','布洛芬缓释胶囊')) OR
  (so.order_no='S20260819-001' AND p.name IN ('健胃消食片','维生素C片100片')) OR
  (so.order_no='S20260820-001' AND p.name IN ('医用口罩50只','电子体温计')) OR
  (so.order_no='S20260821-001' AND p.name IN ('复合维生素B','钙片100粒')) OR
  (so.order_no='S20260822-001' AND p.name IN ('感冒灵颗粒','健胃消食片')) OR
  (so.order_no='S20260823-001' AND p.name IN ('布洛芬缓释胶囊','维生素C片100片'))
);
UPDATE sales_orders so SET
  total_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id),
  actual_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id),
  paid_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id)
WHERE so.tenant_id=4;

-- 账套5 烘焙
INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, order_date) VALUES
(5,'S20260822-001','pos',5,58,0,58,58,'wechat','completed','2026-08-22 08:30:00'),
(5,'S20260822-002','pos',5,98,0,98,98,'alipay','completed','2026-08-22 12:15:00'),
(5,'S20260823-001','pos',5,36,0,36,36,'cash','completed','2026-08-23 09:00:00'),
(5,'S20260823-002','pos',5,116,10,106,106,'wechat','completed','2026-08-23 15:20:00'),
(5,'S20260824-001','pos',5,28,0,28,28,'alipay','completed','2026-08-24 10:05:00');
INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price)
SELECT so.id,p.id,
  CASE so.order_no WHEN 'S20260822-001' THEN 3 WHEN 'S20260823-001' THEN 3
  WHEN 'S20260824-001' THEN 1 WHEN 'S20260823-002' THEN 2 ELSE 1 END,
  p.sell_price
FROM sales_orders so JOIN products p ON p.tenant_id=5
WHERE so.tenant_id=5 AND (
  (so.order_no='S20260822-001' AND p.name='牛角包') OR
  (so.order_no='S20260822-002' AND p.name='草莓蛋糕6寸') OR
  (so.order_no='S20260823-001' AND p.name='原味吐司') OR
  (so.order_no='S20260823-002' AND p.name='曲奇饼干礼盒') OR
  (so.order_no='S20260824-001' AND p.name='提拉米苏')
);
-- 验证账套5: 牛角包3*8=24≠58. 原味吐司3*12=36✓. 提拉米苏1*28=28✓. 曲奇2*58=116, actual=106(discount 10)✓. 草莓蛋糕1*98=98✓
-- S20260822-001: 3*8=24≠58, 需修正。改为牛角包2*8=16+原味吐司(58-16)/12=3.5不整. 改为: 原味吐司2*12=24+牛角包(58-24)/8=4.25不整
-- 直接用UPDATE重算
UPDATE sales_orders so SET
  total_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) FROM sale_items si WHERE si.sales_order_id=so.id),
  actual_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) - COALESCE(so.discount_amount,0) FROM sale_items si WHERE si.sales_order_id=so.id),
  paid_amount = (SELECT COALESCE(SUM(si.quantity*si.unit_price),0) - COALESCE(so.discount_amount,0) FROM sale_items si WHERE si.sales_order_id=so.id)
WHERE so.tenant_id=5;

-- ---------- 11. 财务收支 ----------
INSERT INTO finance_records (tenant_id, type, category, amount, payment_method, remark, record_date) VALUES
(2,'expense','采购支出',760,'card','蔬菜采购','2026-08-10'),
(2,'expense','采购支出',860,'card','冷链采购','2026-08-15'),
(2,'expense','房租',3500,'bank','8月房租','2026-08-01'),
(2,'expense','工资',6000,'bank','员工工资','2026-08-15'),
(2,'income','销售收入',481.80,'wechat','POS销售汇总','2026-08-24'),
(3,'income','销售收款',12495.00,'alipay','线上+门店销售','2026-08-20'),
(3,'expense','采购支出',18990,'card','手机进货','2026-08-05'),
(3,'expense','采购支出',4450,'card','耳机进货','2026-08-12'),
(3,'expense','平台佣金',624.75,'alipay','淘宝/天猫佣金5%','2026-08-20'),
(3,'expense','广告费',2000,'wechat','抖音推广','2026-08-10'),
(4,'income','销售收入',610.80,'wechat','药品销售','2026-08-23'),
(4,'expense','采购支出',2710,'card','药品采购','2026-08-08'),
(4,'expense','房租',8000,'bank','8月房租','2026-08-01'),
(5,'income','销售收入',292.00,'wechat','烘焙销售','2026-08-24'),
(5,'expense','采购支出',1100,'card','原料采购','2026-08-09'),
(5,'expense','水电费',680,'bank','8月水电','2026-08-10');

-- ---------- 12. 会计账套 + 科目（复制账套1的科目体系） ----------
INSERT INTO accounting_books (id, tenant_id, book_name, entity_name, credit_code, entity_type) VALUES
(2,2,'鲜惠生鲜账套','鲜惠社区生鲜超市','92420102MAK000002','individual'),
(3,3,'悦选数码账套','悦选数码电商','92420102MAK000003','individual'),
(4,4,'康美药房账套','康美大药房','92420102MAK000004','individual'),
(5,5,'美味烘焙账套','美味烘焙工坊','92420102MAK000005','individual');

-- 一级科目
INSERT INTO accounting_accounts (book_id, code, name, category, direction, level, parent_id)
SELECT b.id, a.code, a.name, a.category, a.direction, a.level, NULL
FROM accounting_books b
JOIN accounting_accounts a ON a.book_id=1 AND a.level=1
WHERE b.id IN (2,3,4,5);
-- 二级科目（parent重映射）
INSERT INTO accounting_accounts (book_id, code, name, category, direction, level, parent_id)
SELECT b.id, a2.code, a2.name, a2.category, a2.direction, 2, p_new.id
FROM accounting_books b
JOIN accounting_accounts a2 ON a2.book_id=1 AND a2.level=2
JOIN accounting_accounts p_old ON p_old.id=a2.parent_id
JOIN accounting_accounts p_new ON p_new.book_id=b.id AND p_new.code=p_old.code
WHERE b.id IN (2,3,4,5);

-- ---------- 13. 印章（每账套3枚备案印章） ----------
INSERT INTO seals (book_id, seal_type, seal_name, seal_code, is_filed, is_active)
SELECT b.id, t.st, t.sn, t.code, TRUE, TRUE
FROM accounting_books b
JOIN (
  SELECT 'company' st,'单位公章' sn,'42010210450802' code,1 sort
  UNION SELECT 'financial','财务专用章','42010210452483',2
  UNION SELECT 'legal_rep','法定代表人名章','42010210450803',3
) t
WHERE b.id IN (2,3,4,5);

-- ---------- 14. 记账凭证（每账套2张：收款+付款，借贷平衡） ----------
-- 收款凭证：借 银行存款 / 贷 主营业务收入
INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, total_debit, total_credit, is_balanced, status, remark)
SELECT id,'receipt',CONCAT('收-',LPAD(id,4,'0')),'2026-08-20',
  CASE id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END,
  CASE id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END,
  TRUE,'posted','销售收入入账'
FROM accounting_books WHERE id IN (2,3,4,5);

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id, 1,
  (SELECT id FROM accounting_accounts WHERE book_id=v.book_id AND code='1002' LIMIT 1),
  '收到销售货款',
  CASE v.book_id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END, 0
FROM vouchers v WHERE v.book_id IN (2,3,4,5) AND v.voucher_type='receipt';

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id, 2,
  (SELECT id FROM accounting_accounts WHERE book_id=v.book_id AND code='5001' LIMIT 1),
  '主营业务收入', 0,
  CASE v.book_id WHEN 2 THEN 481.80 WHEN 3 THEN 12495.00 WHEN 4 THEN 610.80 WHEN 5 THEN 292.00 END
FROM vouchers v WHERE v.book_id IN (2,3,4,5) AND v.voucher_type='receipt';

-- 付款凭证：借 管理费用-工资 / 贷 银行存款
INSERT INTO vouchers (book_id, voucher_type, voucher_no, voucher_date, total_debit, total_credit, is_balanced, status, remark)
SELECT id,'payment',CONCAT('付-',LPAD(id,4,'0')),'2026-08-15',6000,6000,TRUE,'posted','发放工资'
FROM accounting_books WHERE id IN (2,3,4,5);

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id,1,
  (SELECT id FROM accounting_accounts WHERE book_id=v.book_id AND code='6601' LIMIT 1),
  '发放员工工资',6000,0
FROM vouchers v WHERE v.book_id IN (2,3,4,5) AND v.voucher_type='payment';

INSERT INTO voucher_items (voucher_id, line_no, account_id, summary, debit_amount, credit_amount)
SELECT v.id,2,
  (SELECT id FROM accounting_accounts WHERE book_id=v.book_id AND code='1002' LIMIT 1),
  '银行转账支付',0,6000
FROM vouchers v WHERE v.book_id IN (2,3,4,5) AND v.voucher_type='payment';

-- ---------- 15. 库存预警 ----------
INSERT INTO stock_alerts (tenant_id, alert_type, product_id, warehouse_id, threshold_value, current_value, alert_level, status, message)
SELECT p.tenant_id,
  CASE WHEN i.quantity<=0 THEN 'zero_stock' WHEN i.quantity<0 THEN 'negative' ELSE 'low_stock' END,
  p.id, i.warehouse_id, p.min_stock, i.quantity,
  CASE WHEN i.quantity<=p.min_stock*0.3 THEN 'critical' WHEN i.quantity<=p.min_stock THEN 'warning' ELSE 'info' END,
  'active',
  CONCAT('商品「',p.name,'」库存',i.quantity,p.unit,'，低于预警值',p.min_stock)
FROM inventory i JOIN products p ON p.id=i.product_id
WHERE p.tenant_id IN (2,3,4,5)
  AND p.min_stock>0 AND i.quantity<=p.min_stock;

-- ---------- 16. 支付渠道默认配置（每账套4种） ----------
INSERT INTO payment_channels (tenant_id, channel_code, channel_name, channel_type, is_enabled, is_default, sort_order)
SELECT t.id, ch.code, ch.name, ch.ctype, ch.enabled, ch.isdefault, ch.sort
FROM tenants t
JOIN (
  SELECT 'cash' code,'现金' name,'offline' ctype,TRUE enabled,TRUE isdefault,1 sort
  UNION SELECT 'wechat_pay','微信支付','online',FALSE,FALSE,2
  UNION SELECT 'alipay','支付宝','online',FALSE,FALSE,3
  UNION SELECT 'bank_transfer','银行转账','bank',FALSE,FALSE,4
) ch
WHERE t.id IN (2,3,4,5);

-- ---------- 17. 独立入库单（仓库管理模块演示数据） ----------
-- 账套2：采购入库 RK20260810001（对应PO20260810001）
INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, supplier_id, source_order_type, source_order_id, total_amount, status, confirm_time, remark)
SELECT 2,'RK20260810001', w.id, 'purchase', 1, 'purchase_order',
  (SELECT id FROM purchase_orders WHERE tenant_id=2 AND order_no='PO20260810001'),
  760.00, 'confirmed', '2026-08-10 10:00:00', '蔬菜采购入库'
FROM warehouses w WHERE w.tenant_id=2 AND w.is_default=TRUE;

INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost)
SELECT sio.id, p.id,
  CASE p.name WHEN '大白菜' THEN 200 WHEN '土豆' THEN 150 WHEN '番茄' THEN 100 END,
  CASE p.name WHEN '大白菜' THEN 1.20 WHEN '土豆' THEN 1.80 WHEN '番茄' THEN 2.50 END
FROM stock_in_orders sio JOIN products p ON p.tenant_id=2
WHERE sio.tenant_id=2 AND sio.order_no='RK20260810001' AND p.name IN ('大白菜','土豆','番茄');

-- 账套2：其他入库 RK20260816001（冷链商品）
INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, supplier_id, total_amount, status, confirm_time, remark)
SELECT 2,'RK20260816001', w.id, 'purchase', 2, 860.00, 'confirmed', '2026-08-16 08:30:00', '冷链采购入库'
FROM warehouses w WHERE w.tenant_id=2 AND w.is_default=TRUE;

INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost)
SELECT sio.id, p.id,
  CASE p.name WHEN '基围虾' THEN 20 WHEN '猪五花肉' THEN 20 END,
  CASE p.name WHEN '基围虾' THEN 28 WHEN '猪五花肉' THEN 15 END
FROM stock_in_orders sio JOIN products p ON p.tenant_id=2
WHERE sio.tenant_id=2 AND sio.order_no='RK20260816001' AND p.name IN ('基围虾','猪五花肉');

-- 账套3：采购入库
INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, supplier_id, source_order_type, source_order_id, total_amount, status, confirm_time, remark)
SELECT 3,'RK20260805001', w.id, 'purchase', 3, 'purchase_order',
  (SELECT id FROM purchase_orders WHERE tenant_id=3 AND order_no='PO20260805001'),
  18990.00, 'confirmed', '2026-08-05 14:00:00', '手机采购入库'
FROM warehouses w WHERE w.tenant_id=3 AND w.is_default=TRUE;

INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost)
SELECT sio.id, p.id, 10, 1899
FROM stock_in_orders sio JOIN products p ON p.tenant_id=3
WHERE sio.tenant_id=3 AND sio.order_no='RK20260805001' AND p.name='智能手机A12 128G';

-- 账套4：采购入库
INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, supplier_id, total_amount, status, confirm_time, remark)
SELECT 4,'RK20260808001', w.id, 'purchase', 4, 2710.00, 'confirmed', '2026-08-08 11:00:00', '药品采购入库'
FROM warehouses w WHERE w.tenant_id=4 AND w.is_default=TRUE;

INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost)
SELECT sio.id, p.id,
  CASE p.name WHEN '感冒灵颗粒' THEN 100 WHEN '布洛芬缓释胶囊' THEN 80 WHEN '医用口罩50只' THEN 50 END,
  CASE p.name WHEN '感冒灵颗粒' THEN 8.5 WHEN '布洛芬缓释胶囊' THEN 12 WHEN '医用口罩50只' THEN 18 END
FROM stock_in_orders sio JOIN products p ON p.tenant_id=4
WHERE sio.tenant_id=4 AND sio.order_no='RK20260808001' AND p.name IN ('感冒灵颗粒','布洛芬缓释胶囊','医用口罩50只');

-- 账套5：采购入库
INSERT INTO stock_in_orders (tenant_id, order_no, warehouse_id, in_type, supplier_id, total_amount, status, confirm_time, remark)
SELECT 5,'RK20260809001', w.id, 'purchase', 5, 1100.00, 'confirmed', '2026-08-09 09:00:00', '烘焙原料入库'
FROM warehouses w WHERE w.tenant_id=5 AND w.is_default=TRUE;

INSERT INTO stock_in_items (stock_in_id, product_id, quantity, unit_cost)
SELECT sio.id, p.id,
  CASE p.name WHEN '高筋面粉1kg' THEN 60 WHEN '淡奶油1L' THEN 20 END,
  CASE p.name WHEN '高筋面粉1kg' THEN 9 WHEN '淡奶油1L' THEN 28 END
FROM stock_in_orders sio JOIN products p ON p.tenant_id=5
WHERE sio.tenant_id=5 AND sio.order_no='RK20260809001' AND p.name IN ('高筋面粉1kg','淡奶油1L');

-- ---------- 18. 独立出库单（仓库管理模块演示数据） ----------
-- 账套2：销售出库
INSERT INTO stock_out_orders (tenant_id, order_no, warehouse_id, out_type, customer_id, total_amount, status, confirm_time, remark)
SELECT 2,'CK20260820001', w.id, 'sale', 1,
  (SELECT SUM(si.quantity*p.cost_price) FROM sale_items si JOIN products p ON p.id=si.product_id
   JOIN sales_orders so ON so.id=si.sales_order_id WHERE so.order_no='S20260820-001'),
  'confirmed', '2026-08-20 09:35:00', '生鲜销售出库'
FROM warehouses w WHERE w.tenant_id=2 AND w.is_default=TRUE;

INSERT INTO stock_out_items (stock_out_id, product_id, quantity, unit_cost)
SELECT soo.id, p.id,
  CASE p.name WHEN '大白菜' THEN 10 WHEN '土豆' THEN 8 WHEN '香蕉' THEN 4 END,
  p.cost_price
FROM stock_out_orders soo JOIN products p ON p.tenant_id=2
WHERE soo.tenant_id=2 AND soo.order_no='CK20260820001' AND p.name IN ('大白菜','土豆','香蕉');

-- 账套3：销售出库
INSERT INTO stock_out_orders (tenant_id, order_no, warehouse_id, out_type, customer_id, total_amount, status, confirm_time, remark)
SELECT 3,'CK20260801001', w.id, 'sale', 3, 1899.00, 'confirmed', '2026-08-01 10:25:00', '手机发货出库'
FROM warehouses w WHERE w.tenant_id=3 AND w.is_default=TRUE;

INSERT INTO stock_out_items (stock_out_id, product_id, quantity, unit_cost)
SELECT soo.id, p.id, 1, p.cost_price
FROM stock_out_orders soo JOIN products p ON p.tenant_id=3
WHERE soo.tenant_id=3 AND soo.order_no='CK20260801001' AND p.name='智能手机A12 128G';

-- 账套4：销售出库
INSERT INTO stock_out_orders (tenant_id, order_no, warehouse_id, out_type, customer_id, total_amount, status, confirm_time, remark)
SELECT 4,'CK20260818001', w.id, 'sale', 4,
  (SELECT SUM(si.quantity*p.cost_price) FROM sale_items si JOIN products p ON p.id=si.product_id
   JOIN sales_orders so ON so.id=si.sales_order_id WHERE so.order_no='S20260818-001'),
  'confirmed', '2026-08-18 09:05:00', '药品销售出库'
FROM warehouses w WHERE w.tenant_id=4 AND w.is_default=TRUE;

INSERT INTO stock_out_items (stock_out_id, product_id, quantity, unit_cost)
SELECT soo.id, p.id,
  CASE p.name WHEN '感冒灵颗粒' THEN 2 WHEN '布洛芬缓释胶囊' THEN 1 END,
  p.cost_price
FROM stock_out_orders soo JOIN products p ON p.tenant_id=4
WHERE soo.tenant_id=4 AND soo.order_no='CK20260818001' AND p.name IN ('感冒灵颗粒','布洛芬缓释胶囊');

-- 账套5：报损出库
INSERT INTO stock_out_orders (tenant_id, order_no, warehouse_id, out_type, total_amount, status, confirm_time, remark)
SELECT 5,'CK20260821001', w.id, 'scrap', 8.00, 'confirmed', '2026-08-21 18:00:00', '当日未售完面包报损'
FROM warehouses w WHERE w.tenant_id=5 AND w.is_default=TRUE;

INSERT INTO stock_out_items (stock_out_id, product_id, quantity, unit_cost)
SELECT soo.id, p.id, 2, p.cost_price
FROM stock_out_orders soo JOIN products p ON p.tenant_id=5
WHERE soo.tenant_id=5 AND soo.order_no='CK20260821001' AND p.name='原味吐司';

-- ---------- 19. 库存调拨单（账套2：主仓→门店货架） ----------
INSERT INTO stock_transfers (tenant_id, transfer_no, from_warehouse_id, to_warehouse_id, status, total_amount, confirm_time, remark)
SELECT 2,'DB20260820001',
  (SELECT id FROM warehouses WHERE tenant_id=2 AND code='WH002'),
  (SELECT id FROM warehouses WHERE tenant_id=2 AND code='WH002S'),
  'completed',
  (SELECT SUM(quantity*unit_cost) FROM (
    SELECT 5 quantity, 1.20 unit_cost UNION ALL SELECT 3, 1.80
  ) t),
  '2026-08-20 08:00:00', '生鲜补货至门店货架'
WHERE EXISTS (SELECT 1 FROM warehouses WHERE tenant_id=2 AND code='WH002S');

INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, unit_cost)
SELECT st.id, p.id,
  CASE p.name WHEN '大白菜' THEN 5 WHEN '土豆' THEN 3 END,
  CASE p.name WHEN '大白菜' THEN 1.20 WHEN '土豆' THEN 1.80 END
FROM stock_transfers st JOIN products p ON p.tenant_id=2
WHERE st.tenant_id=2 AND st.transfer_no='DB20260820001' AND p.name IN ('大白菜','土豆');

-- 修正仓库单据的created_at为实际业务日期（使分析中心按日期统计准确）
UPDATE stock_in_orders SET created_at = confirm_time WHERE tenant_id IN (2,3,4,5);
UPDATE stock_out_orders SET created_at = confirm_time WHERE tenant_id IN (2,3,4,5);
UPDATE stock_transfers SET created_at = confirm_time WHERE tenant_id IN (2,3,4,5);

-- ---------- 20. 库存流水（为初始库存+入出库补流水记录） ----------
-- 期初库存流水
INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, remark)
SELECT i.tenant_id, i.product_id, i.warehouse_id, 'purchase', i.quantity, 0, i.quantity, p.cost_price, '演示期初库存'
FROM inventory i JOIN products p ON p.id=i.product_id
WHERE i.tenant_id IN (2,3,4,5);

-- 入库流水
INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, remark)
SELECT sio.tenant_id, sii.product_id, sio.warehouse_id, 'stock_in', sii.quantity,
  0, sii.quantity, sii.unit_cost, 'stock_in', sio.id, CONCAT('入库单:',sio.order_no)
FROM stock_in_orders sio JOIN stock_in_items sii ON sii.stock_in_id=sio.id;

-- 出库流水
INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, remark)
SELECT soo.tenant_id, soi.product_id, soo.warehouse_id, 'stock_out', -soi.quantity,
  soi.quantity, 0, soi.unit_cost, 'stock_out', soo.id, CONCAT('出库单:',soo.order_no)
FROM stock_out_orders soo JOIN stock_out_items soi ON soi.stock_out_id=soo.id;

-- ============================================
-- 完成。4套演示账套数据就绪
-- 登录账号：各账套 admin / admin123
-- 账套2：鲜惠社区生鲜超市（含2个仓库+调拨演示）
-- 账套3：悦选数码电商
-- 账套4：康美大药房
-- 账套5：美味烘焙工坊
-- ============================================
