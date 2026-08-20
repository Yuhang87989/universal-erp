const mysql = require('mysql2/promise');
const dayjs = require('dayjs');

/**
 * 为三套帐套生成演示数据
 * 用途：让用户切换帐套后立即看到真实可用的数据，验证系统功能
 * 
 * 三套帐套各自的业务场景：
 * 1. 农村供销社 - 农资经营（化肥/农药/种子/农具）
 * 2. 菜市场商户 - 生鲜经营（蔬菜/水果/肉禽/水产）
 * 3. 个体门店   - 百货经营（日用品/食品饮料/零食/洗护）
 */

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'Erp@Secure2026',
    database: process.env.DB_NAME || 'erp_db'
  });

  console.log('🎬 开始生成三套帐套的演示数据...\n');

  // 获取三个租户ID
  const [tenantRows] = await conn.query(
    "SELECT id, name, business_type FROM tenants WHERE business_type IN ('supply_coop','market','retail')"
  );
  if (tenantRows.length < 3) {
    console.error('❌ 缺少帐套，请先执行 init_tenants.js');
    await conn.end();
    return;
  }
  const tenantMap = {};
  tenantRows.forEach(t => { tenantMap[t.business_type] = t.id; });
  console.log('帐套映射:', tenantMap, '\n');

  // 清理已有演示数据（避免重复执行时报 ER_DUP_ENTRY）
  const tenantIds = tenantRows.map(t => t.id);
  const tables = ['ecommerce_platforms','finance_records','purchase_items','purchase_orders','sale_items','sales_orders','inventory','products','categories','customers','suppliers'];
  for (const tbl of tables) {
    await conn.query(`DELETE FROM ${tbl} WHERE tenant_id IN (${tenantIds.join(',')})`);
  }
  // 重建自增ID
  for (const tbl of tables) {
    await conn.query(`ALTER TABLE ${tbl} AUTO_INCREMENT = 1`);
  }
  console.log('🧹 已清理旧演示数据\n');

  // 获取每个租户的管理员ID
  const [adminRows] = await conn.query(
    "SELECT id, tenant_id FROM users WHERE username IN ('supply_coop_admin','market_admin','retail_admin')"
  );
  const adminMap = {};
  adminRows.forEach(a => {
    const t = tenantRows.find(r => r.id === a.tenant_id);
    if (t) adminMap[t.business_type] = a.id;
  });

  const today = dayjs();

  // ============================================================
  //  1. 农村供销社 (supply_coop)
  // ============================================================
  const SC = tenantMap.supply_coop;
  const scAdmin = adminMap.supply_coop;
  console.log('📦 [农村供销社] 生成演示数据...');

  // 分类
  const scCats = [
    { name: '化肥', sort: 1, subs: ['氮肥', '磷肥', '复合肥', '有机肥'] },
    { name: '农药', sort: 2, subs: ['杀虫剂', '杀菌剂', '除草剂'] },
    { name: '种子', sort: 3, subs: ['蔬菜种子', '粮食种子', '花卉种子'] },
    { name: '农具', sort: 4, subs: ['手动工具', '电动工具', '灌溉设备'] },
  ];
  const scCatIds = {};
  for (const c of scCats) {
    await conn.query('INSERT INTO categories (tenant_id, name, sort_order) VALUES (?, ?, ?)', [SC, c.name, c.sort]);
    const [r] = await conn.query('SELECT LAST_INSERT_ID() as id');
    scCatIds[c.name] = r[0].id;
    for (const s of c.subs) {
      await conn.query('INSERT INTO categories (tenant_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)', [SC, scCatIds[c.name], s, c.sort]);
    }
  }
  console.log('  ✓ 商品分类');

  // 供应商
  const scSuppliers = [
    { name: '湖北宜化集团', contact: '王经理', phone: '13971001001', addr: '湖北省宜昌市', bank: '工商银行宜昌支行', account: '6222021234567890', notes: '月结30天，化肥主营供应商' },
    { name: '武汉科诺生物', contact: '李总', phone: '13971001002', addr: '武汉市洪山区', bank: '建设银行武汉支行', account: '6222021234567891', notes: '农药代理，现款现货' },
    { name: '湖北种子集团', contact: '张站长', phone: '13971001003', addr: '武汉市江夏区', bank: '农业银行武汉支行', account: '6222021234567892', notes: '优质蔬菜/粮食种子供应' },
    { name: '永康农具批发', contact: '陈老板', phone: '13971001004', addr: '浙江永康市', bank: '农商行永康支行', account: '6222021234567893', notes: '各类农具批发，货到付款' },
  ];
  const scSupIds = [];
  for (const s of scSuppliers) {
    const [r] = await conn.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, address, bank_name, bank_account, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [SC, s.name, s.contact, s.phone, s.addr, s.bank, s.account, s.notes]
    );
    scSupIds.push(r.insertId);
  }
  console.log('  ✓ 供应商');

  // 商品
  const scProducts = [
    { name: '尿素(40kg/袋)', cat: '化肥', barcode: '6901234500001', unit: '袋', cost: 75, sell: 95, stock: 120, min: 20 },
    { name: '复合肥15-15-15(50kg)', cat: '化肥', barcode: '6901234500002', unit: '袋', cost: 120, sell: 155, stock: 85, min: 15 },
    { name: '有机肥(40kg/袋)', cat: '化肥', barcode: '6901234500003', unit: '袋', cost: 45, sell: 65, stock: 60, min: 10 },
    { name: '磷酸二铵(50kg)', cat: '化肥', barcode: '6901234500004', unit: '袋', cost: 135, sell: 168, stock: 40, min: 10 },
    { name: '吡虫啉(100ml)', cat: '农药', barcode: '6901234500011', unit: '瓶', cost: 8, sell: 15, stock: 200, min: 30 },
    { name: '草甘膦(1000ml)', cat: '农药', barcode: '6901234500012', unit: '瓶', cost: 18, sell: 28, stock: 150, min: 20 },
    { name: '多菌灵(500g)', cat: '农药', barcode: '6901234500013', unit: '袋', cost: 12, sell: 20, stock: 80, min: 15 },
    { name: '白菜种子(10g/包)', cat: '种子', barcode: '6901234500021', unit: '包', cost: 3, sell: 8, stock: 300, min: 50 },
    { name: '水稻种子(5kg/袋)', cat: '种子', barcode: '6901234500022', unit: '袋', cost: 35, sell: 55, stock: 100, min: 20 },
    { name: '番茄种子(5g)', cat: '种子', barcode: '6901234500023', unit: '包', cost: 5, sell: 12, stock: 180, min: 30 },
    { name: '锄头(木柄)', cat: '农具', barcode: '6901234500031', unit: '把', cost: 15, sell: 28, stock: 50, min: 10 },
    { name: '喷雾器(16L)', cat: '农具', barcode: '6901234500032', unit: '台', cost: 65, sell: 98, stock: 25, min: 5 },
    { name: '水管(50米/卷)', cat: '农具', barcode: '6901234500033', unit: '卷', cost: 85, sell: 120, stock: 30, min: 8 },
  ];
  const scProductIds = [];
  for (const p of scProducts) {
    const [r] = await conn.query(
      `INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [SC, scCatIds[p.cat], p.name, p.barcode, p.unit, p.cost, p.sell, p.min]
    );
    scProductIds.push(r.insertId);
    // 库存
    await conn.query(
      `INSERT INTO inventory (tenant_id, product_id, quantity) VALUES (?, ?, ?)`,
      [SC, r.insertId, p.stock]
    );
  }
  console.log('  ✓ 商品 & 库存');

  // 客户
  const scCustomers = [
    { name: '李大户(李家村)', phone: '13800002001', gender: 'male', level: 'gold', spent: 28500, notes: '种粮大户，年采购量大，月结' },
    { name: '王大姐果园', phone: '13800002002', gender: 'female', level: 'vip', spent: 45200, notes: '果园经营，长期客户，农药用量大' },
    { name: '张庄村合作社', phone: '13800002003', gender: 'male', level: 'gold', spent: 67800, notes: '村集体采购，季度结算' },
    { name: '老赵蔬菜基地', phone: '13800002004', gender: 'male', level: 'silver', spent: 15600, notes: '蔬菜种植户，季节性采购' },
    { name: '周小花圃', phone: '13800002005', gender: 'female', level: 'normal', spent: 3200, notes: '花卉种植，小批量' },
  ];
  for (const c of scCustomers) {
    await conn.query(
      `INSERT INTO customers (tenant_id, name, phone, gender, level, total_spent, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [SC, c.name, c.phone, c.gender, c.level, c.spent, c.notes]
    );
  }
  console.log('  ✓ 客户');

  // 采购单（近7天）
  const scPurchaseData = [
    { supIdx: 0, items: [{ pi: 0, qty: 50, price: 75 }, { pi: 1, qty: 30, price: 120 }], days: 1, status: 'received' },
    { supIdx: 1, items: [{ pi: 4, qty: 100, price: 8 }, { pi: 5, qty: 50, price: 18 }], days: 3, status: 'received' },
    { supIdx: 2, items: [{ pi: 7, qty: 200, price: 3 }, { pi: 8, qty: 40, price: 35 }], days: 5, status: 'received' },
    { supIdx: 3, items: [{ pi: 11, qty: 10, price: 65 }, { pi: 12, qty: 5, price: 85 }], days: 2, status: 'draft' },
  ];
  for (const pd of scPurchaseData) {
    const orderDate = today.subtract(pd.days, 'day').format('YYYY-MM-DD');
    const total = pd.items.reduce((s, i) => s + i.qty * i.price, 0);
    const orderNo = `PO${orderDate.replace(/-/g, '')}${String(scProductIds.length + scPurchaseData.indexOf(pd) + 1).padStart(4, '0')}`;
    const [or] = await conn.query(
      `INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, order_date, total_amount, status, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [SC, orderNo, scSupIds[pd.supIdx], orderDate, total, pd.status, scAdmin]
    );
    for (const it of pd.items) {
      await conn.query(
        'INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [or.insertId, scProductIds[it.pi], it.qty, it.price]
      );
    }
  }
  console.log('  ✓ 采购单');

  // 销售单（近7天）
  const scSalesData = [
    { custIdx: 0, items: [{ pi: 0, qty: 10, price: 95 }, { pi: 1, qty: 5, price: 155 }], days: 0, type: 'wholesale', pay: 'cash' },
    { custIdx: 1, items: [{ pi: 4, qty: 20, price: 15 }, { pi: 5, qty: 10, price: 28 }], days: 0, type: 'pos', pay: 'wechat' },
    { custIdx: 2, items: [{ pi: 0, qty: 30, price: 95 }, { pi: 2, qty: 20, price: 65 }], days: 1, type: 'wholesale', pay: 'card' },
    { custIdx: 3, items: [{ pi: 7, qty: 50, price: 8 }, { pi: 9, qty: 30, price: 12 }], days: 2, type: 'pos', pay: 'cash' },
    { custIdx: 0, items: [{ pi: 3, qty: 8, price: 168 }, { pi: 6, qty: 15, price: 20 }], days: 3, type: 'phone', pay: 'cash' },
    { custIdx: 4, items: [{ pi: 8, qty: 5, price: 55 }, { pi: 10, qty: 3, price: 28 }], days: 4, type: 'pos', pay: 'wechat' },
    { custIdx: 1, items: [{ pi: 4, qty: 30, price: 15 }, { pi: 5, qty: 15, price: 28 }], days: 5, type: 'wholesale', pay: 'alipay' },
  ];
  for (const sd of scSalesData) {
    const orderDate = today.subtract(sd.days, 'day').format('YYYY-MM-DD');
    const total = sd.items.reduce((s, i) => s + i.qty * i.price, 0);
    const orderNo = `S${orderDate.replace(/-/g, '')}${String(sd.days + 1).padStart(4, '0')}`;
    const [or] = await conn.query(
      `INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, order_date, operator_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'completed', ?, ?)`,
      [SC, orderNo, sd.type, null, total, total, total, sd.pay, orderDate, scAdmin]
    );
    for (const it of sd.items) {
      await conn.query(
        'INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price, discount) VALUES (?, ?, ?, ?, ?)',
        [or.insertId, scProductIds[it.pi], it.qty, it.price, 0]
      );
    }
  }
  console.log('  ✓ 销售单');

  // 财务记录（近30天，按平台）
  const scFinanceData = [
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 3580, days: 0, remark: '线下门店今日销售收入' },
    { type: 'income', cat: '销售收入', platform: 'wechat_shop', amount: 1260, days: 0, remark: '微信小程序商城订单' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 4500, days: 1, remark: '采购化肥尿素50袋' },
    { type: 'expense', cat: '运费支出', platform: 'offline', amount: 200, days: 1, remark: '化肥配送运费' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 2890, days: 2, remark: '线下批发收入' },
    { type: 'income', cat: '销售收入', platform: 'pinduoduo', amount: 860, days: 2, remark: '拼多多农资店铺收入' },
    { type: 'expense', cat: '房租水电', platform: 'offline', amount: 1500, days: 3, remark: '本月店面租金分摊' },
    { type: 'income', cat: '销售收入', platform: 'douyin', amount: 2100, days: 3, remark: '抖音直播间卖种子' },
    { type: 'expense', cat: '推广费用', platform: 'douyin', amount: 300, days: 4, remark: '抖音DOU+推广费' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 4200, days: 5, remark: '张庄村合作社采购' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 2800, days: 5, remark: '采购农药一批' },
    { type: 'income', cat: '平台收入', platform: 'wechat_shop', amount: 680, days: 6, remark: '微信小程序订单' },
    { type: 'expense', cat: '人工支出', platform: 'offline', amount: 3500, days: 7, remark: '员工半月工资' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 5600, days: 10, remark: '大额批发-李大户' },
    { type: 'income', cat: '销售收入', platform: 'taobao', amount: 1350, days: 12, remark: '淘宝农资店收入' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 6200, days: 15, remark: '批量采购复合肥' },
  ];
  for (const f of scFinanceData) {
    await conn.query(
      `INSERT INTO finance_records (tenant_id, type, category, platform, amount, payment_method, remark, record_date, operator_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [SC, f.type, f.cat, f.platform, f.amount, f.type === 'income' ? 'wechat' : 'bank', f.remark, today.subtract(f.days, 'day').format('YYYY-MM-DD'), scAdmin]
    );
  }
  console.log('  ✓ 财务记录');

  // 电商平台
  const scEcommerce = [
    { platform: 'pinduoduo', shop: '供销社农资直营店', rate: 3 },
    { platform: 'douyin', shop: '老邱农资直播间', rate: 5 },
    { platform: 'taobao', shop: '宇航农资旗舰店', rate: 3 },
    { platform: 'wechat_shop', shop: '供销社小程序商城', rate: 0.6 },
  ];
  for (const e of scEcommerce) {
    await conn.query(
      'INSERT INTO ecommerce_platforms (tenant_id, platform, shop_name, commission_rate) VALUES (?, ?, ?, ?)',
      [SC, e.platform, e.shop, e.rate]
    );
  }
  console.log('  ✓ 电商平台\n');


  // ============================================================
  //  2. 菜市场商户 (market_vendor)
  // ============================================================
  const MV = tenantMap.market;
  const mvAdmin = adminMap.market;
  console.log('🥬 [菜市场商户] 生成演示数据...');

  const mvCats = [
    { name: '蔬菜', sort: 1, subs: ['叶菜类', '根茎类', '瓜果类', '豆类'] },
    { name: '水果', sort: 2, subs: ['时令水果', '进口水果', '柑橘类'] },
    { name: '肉禽', sort: 3, subs: ['猪肉', '牛羊肉', '鸡鸭', '加工肉制品'] },
    { name: '水产', sort: 4, subs: ['淡水鱼', '海鲜', '虾蟹'] },
    { name: '豆制品', sort: 5, subs: ['豆腐', '豆干', '豆芽'] },
  ];
  const mvCatIds = {};
  for (const c of mvCats) {
    await conn.query('INSERT INTO categories (tenant_id, name, sort_order) VALUES (?, ?, ?)', [MV, c.name, c.sort]);
    const [r] = await conn.query('SELECT LAST_INSERT_ID() as id');
    mvCatIds[c.name] = r[0].id;
    for (const s of c.subs) {
      await conn.query('INSERT INTO categories (tenant_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)', [MV, mvCatIds[c.name], s, c.sort]);
    }
  }
  console.log('  ✓ 商品分类');

  const mvSuppliers = [
    { name: '白沙洲蔬菜批发', contact: '刘老板', phone: '13800003001', addr: '武汉市洪山区白沙洲市场', notes: '每日凌晨配送，蔬菜主供应商' },
    { name: '黄陂果园直供', contact: '赵大哥', phone: '13800003002', addr: '武汉市黄陂区', notes: '时令水果直供，价格实惠' },
    { name: '江夏肉联厂', contact: '孙经理', phone: '13800003003', addr: '武汉市江夏区', notes: '猪肉/牛肉批发，检疫齐全' },
    { name: '蔡甸水产基地', contact: '周师傅', phone: '13800003004', addr: '武汉市蔡甸区', notes: '活鱼直供，草鱼/鲫鱼/鳊鱼' },
    { name: '老街坊豆坊', contact: '吴婶', phone: '13800003005', addr: '武汉市江岸区', notes: '手工豆腐/豆干，每日现做' },
  ];
  const mvSupIds = [];
  for (const s of mvSuppliers) {
    const [r] = await conn.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, address, remark) VALUES (?, ?, ?, ?, ?, ?)`,
      [MV, s.name, s.contact, s.phone, s.addr, s.notes]
    );
    mvSupIds.push(r.insertId);
  }
  console.log('  ✓ 供应商');

  const mvProducts = [
    { name: '大白菜', cat: '蔬菜', barcode: '', unit: '斤', cost: 0.8, sell: 1.5, stock: 200, min: 50 },
    { name: '西红柿', cat: '蔬菜', barcode: '', unit: '斤', cost: 1.5, sell: 3, stock: 100, min: 30 },
    { name: '黄瓜', cat: '蔬菜', barcode: '', unit: '斤', cost: 1.2, sell: 2.5, stock: 80, min: 20 },
    { name: '土豆', cat: '蔬菜', barcode: '', unit: '斤', cost: 1, sell: 2, stock: 150, min: 40 },
    { name: '青椒', cat: '蔬菜', barcode: '', unit: '斤', cost: 1.8, sell: 3.5, stock: 60, min: 15 },
    { name: '苹果(红富士)', cat: '水果', barcode: '', unit: '斤', cost: 3.5, sell: 6, stock: 80, min: 20 },
    { name: '香蕉', cat: '水果', barcode: '', unit: '斤', cost: 2, sell: 3.5, stock: 60, min: 15 },
    { name: '橙子(赣南)', cat: '水果', barcode: '', unit: '斤', cost: 2.5, sell: 4.5, stock: 50, min: 10 },
    { name: '五花肉', cat: '肉禽', barcode: '', unit: '斤', cost: 12, sell: 16, stock: 30, min: 10 },
    { name: '前腿肉', cat: '肉禽', barcode: '', unit: '斤', cost: 10, sell: 14, stock: 40, min: 10 },
    { name: '土鸡(整只)', cat: '肉禽', barcode: '', unit: '只', cost: 35, sell: 55, stock: 15, min: 5 },
    { name: '草鱼', cat: '水产', barcode: '', unit: '斤', cost: 6, sell: 10, stock: 40, min: 10 },
    { name: '鲫鱼', cat: '水产', barcode: '', unit: '斤', cost: 7, sell: 12, stock: 30, min: 8 },
    { name: '基围虾', cat: '水产', barcode: '', unit: '斤', cost: 25, sell: 38, stock: 15, min: 5 },
    { name: '老豆腐', cat: '豆制品', barcode: '', unit: '块', cost: 1.5, sell: 3, stock: 40, min: 10 },
    { name: '千张(豆皮)', cat: '豆制品', barcode: '', unit: '斤', cost: 4, sell: 7, stock: 20, min: 5 },
  ];
  const mvProductIds = [];
  for (const p of mvProducts) {
    const [r] = await conn.query(
      `INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [MV, mvCatIds[p.cat], p.name, p.barcode, p.unit, p.cost, p.sell, p.min]
    );
    mvProductIds.push(r.insertId);
    await conn.query('INSERT INTO inventory (tenant_id, product_id, quantity) VALUES (?, ?, ?)', [MV, r.insertId, p.stock]);
  }
  console.log('  ✓ 商品 & 库存');

  const mvCustomers = [
    { name: '陈阿姨(回头客)', phone: '13800004001', gender: 'female', level: 'gold', spent: 8900, notes: '每天来买菜，喜欢新鲜蔬菜' },
    { name: '刘叔(肉摊邻居)', phone: '13800004002', gender: 'male', level: 'silver', spent: 5200, notes: '隔壁摊主，偶尔来采购' },
    { name: '小张餐饮店', phone: '13800004003', gender: 'male', level: 'vip', spent: 32000, notes: '快餐店老板，每日批量采购蔬菜肉类' },
    { name: '王姐(水果控)', phone: '13800004004', gender: 'female', level: 'normal', spent: 2100, notes: '水果爱好者' },
  ];
  for (const c of mvCustomers) {
    await conn.query(
      'INSERT INTO customers (tenant_id, name, phone, gender, level, total_spent, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [MV, c.name, c.phone, c.gender, c.level, c.spent, c.notes]
    );
  }
  console.log('  ✓ 客户');

  // 采购单
  const mvPurchaseData = [
    { supIdx: 0, items: [{ pi: 0, qty: 100, price: 0.8 }, { pi: 1, qty: 50, price: 1.5 }, { pi: 2, qty: 40, price: 1.2 }, { pi: 3, qty: 80, price: 1 }], days: 0, status: 'received' },
    { supIdx: 1, items: [{ pi: 5, qty: 40, price: 3.5 }, { pi: 6, qty: 30, price: 2 }, { pi: 7, qty: 25, price: 2.5 }], days: 0, status: 'received' },
    { supIdx: 2, items: [{ pi: 8, qty: 15, price: 12 }, { pi: 9, qty: 20, price: 10 }, { pi: 10, qty: 8, price: 35 }], days: 0, status: 'received' },
    { supIdx: 3, items: [{ pi: 11, qty: 20, price: 6 }, { pi: 12, qty: 15, price: 7 }, { pi: 13, qty: 8, price: 25 }], days: 0, status: 'draft' },
    { supIdx: 0, items: [{ pi: 4, qty: 30, price: 1.8 }], days: 1, status: 'received' },
  ];
  for (const pd of mvPurchaseData) {
    const orderDate = today.subtract(pd.days, 'day').format('YYYY-MM-DD');
    const total = pd.items.reduce((s, i) => s + i.qty * i.price, 0);
    const orderNo = `PO${orderDate.replace(/-/g, '')}${String(mvSupIds.length + pd.days + 1).padStart(4, '0')}`;
    const [or] = await conn.query(
      'INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, order_date, total_amount, status, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [MV, orderNo, mvSupIds[pd.supIdx], orderDate, total, pd.status, mvAdmin]
    );
    for (const it of pd.items) {
      await conn.query('INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [or.insertId, mvProductIds[it.pi], it.qty, it.price]);
    }
  }
  console.log('  ✓ 采购单');

  // 销售单
  const mvSalesData = [
    { items: [{ pi: 0, qty: 5, price: 1.5 }, { pi: 9, qty: 2, price: 14 }, { pi: 11, qty: 1, price: 10 }], days: 0, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 1, qty: 3, price: 3 }, { pi: 4, qty: 2, price: 3.5 }, { pi: 14, qty: 3, price: 3 }], days: 0, type: 'pos', pay: 'cash' },
    { items: [{ pi: 0, qty: 20, price: 1.5 }, { pi: 8, qty: 5, price: 16 }, { pi: 3, qty: 10, price: 2 }], days: 1, type: 'wholesale', pay: 'cash' },
    { items: [{ pi: 5, qty: 3, price: 6 }, { pi: 6, qty: 4, price: 3.5 }], days: 1, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 8, qty: 3, price: 16 }, { pi: 9, qty: 5, price: 14 }, { pi: 10, qty: 2, price: 55 }], days: 2, type: 'pos', pay: 'cash' },
    { items: [{ pi: 11, qty: 2, price: 10 }, { pi: 12, qty: 3, price: 12 }, { pi: 13, qty: 1, price: 38 }], days: 2, type: 'pos', pay: 'alipay' },
    { items: [{ pi: 5, qty: 5, price: 6 }, { pi: 7, qty: 4, price: 4.5 }, { pi: 15, qty: 2, price: 7 }], days: 3, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 2, qty: 4, price: 2.5 }, { pi: 3, qty: 5, price: 2 }, { pi: 14, qty: 5, price: 3 }], days: 4, type: 'pos', pay: 'cash' },
  ];
  for (const sd of mvSalesData) {
    const orderDate = today.subtract(sd.days, 'day').format('YYYY-MM-DD');
    const total = sd.items.reduce((s, i) => s + i.qty * i.price, 0);
    const orderNo = `S${orderDate.replace(/-/g, '')}${String(sd.days + 1).padStart(4, '0')}`;
    const [or] = await conn.query(
      `INSERT INTO sales_orders (tenant_id, order_no, order_type, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, order_date, operator_id)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'completed', ?, ?)`,
      [MV, orderNo, sd.type, total, total, total, sd.pay, orderDate, mvAdmin]
    );
    for (const it of sd.items) {
      await conn.query('INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price, discount) VALUES (?, ?, ?, ?, ?)',
        [or.insertId, mvProductIds[it.pi], it.qty, it.price, 0]);
    }
  }
  console.log('  ✓ 销售单');

  // 财务记录
  const mvFinanceData = [
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 1280, days: 0, remark: '今日摊位销售收入' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 650, days: 0, remark: '白沙洲蔬菜进货' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 420, days: 0, remark: '水果进货-黄陂果园' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 980, days: 1, remark: '昨日销售收入' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 380, days: 1, remark: '猪肉进货-江夏肉联厂' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 1560, days: 2, remark: '小张餐饮店批发收入' },
    { type: 'expense', cat: '摊位租金', platform: 'offline', amount: 2000, days: 3, remark: '本月菜市场摊位租金' },
    { type: 'income', cat: '销售收入', platform: 'wechat_shop', amount: 320, days: 3, remark: '微信社区团购订单' },
    { type: 'expense', cat: '运费支出', platform: 'wechat_shop', amount: 50, days: 3, remark: '社区团购配送费' },
    { type: 'income', cat: '销售收入', platform: 'douyin', amount: 680, days: 4, remark: '抖音直播卖货收入' },
    { type: 'expense', cat: '推广费用', platform: 'douyin', amount: 100, days: 5, remark: '抖音推广费' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 1100, days: 5, remark: '周末零售收入' },
    { type: 'income', cat: '销售收入', platform: 'kuaishou', amount: 450, days: 6, remark: '快手短视频带货' },
    { type: 'expense', cat: '人工支出', platform: 'offline', amount: 2500, days: 7, remark: '帮工半月工资' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 1350, days: 8, remark: '日常销售收入' },
    { type: 'expense', cat: '水电费', platform: 'offline', amount: 300, days: 10, remark: '本月水电费' },
  ];
  for (const f of mvFinanceData) {
    await conn.query(
      'INSERT INTO finance_records (tenant_id, type, category, platform, amount, payment_method, remark, record_date, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [MV, f.type, f.cat, f.platform, f.amount, f.type === 'income' ? 'wechat' : 'cash', f.remark, today.subtract(f.days, 'day').format('YYYY-MM-DD'), mvAdmin]
    );
  }
  console.log('  ✓ 财务记录');

  // 电商平台
  const mvEcommerce = [
    { platform: 'wechat_shop', shop: '邱记菜摊社区团购', rate: 0 },
    { platform: 'douyin', shop: '菜市场邱哥', rate: 5 },
    { platform: 'kuaishou', shop: '鲜货直供小邱', rate: 3 },
  ];
  for (const e of mvEcommerce) {
    await conn.query(
      'INSERT INTO ecommerce_platforms (tenant_id, platform, shop_name, commission_rate) VALUES (?, ?, ?, ?)',
      [MV, e.platform, e.shop, e.rate]
    );
  }
  console.log('  ✓ 电商平台\n');


  // ============================================================
  //  3. 个体门店 (retail_store)
  // ============================================================
  const RS = tenantMap.retail;
  const rsAdmin = adminMap.retail;
  console.log('🏪 [个体门店] 生成演示数据...');

  const rsCats = [
    { name: '日用百货', sort: 1, subs: ['纸巾湿巾', '清洁用品', '收纳整理'] },
    { name: '食品饮料', sort: 2, subs: ['矿泉水', '饮料', '方便食品', '调味品'] },
    { name: '零食糖果', sort: 3, subs: ['膨化食品', '坚果炒货', '饼干糕点', '糖果巧克力'] },
    { name: '个人护理', sort: 4, subs: ['洗发水', '沐浴露', '牙膏牙刷', '护肤品'] },
    { name: '烟酒', sort: 5, subs: ['卷烟', '白酒', '啤酒', '红酒'] },
  ];
  const rsCatIds = {};
  for (const c of rsCats) {
    await conn.query('INSERT INTO categories (tenant_id, name, sort_order) VALUES (?, ?, ?)', [RS, c.name, c.sort]);
    const [r] = await conn.query('SELECT LAST_INSERT_ID() as id');
    rsCatIds[c.name] = r[0].id;
    for (const s of c.subs) {
      await conn.query('INSERT INTO categories (tenant_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)', [RS, rsCatIds[c.name], s, c.sort]);
    }
  }
  console.log('  ✓ 商品分类');

  const rsSuppliers = [
    { name: '武汉中百仓储', contact: '黄经理', phone: '13800005001', addr: '武汉市东西湖区', bank: '中国银行东西湖支行', account: '6222025000000001', notes: '日用品/洗护主供应商，周配送' },
    { name: '旺旺湖北经销商', contact: '钱总', phone: '13800005002', addr: '武汉市硚口区', bank: '工商银行硚口支行', account: '6222025000000002', notes: '零食/膨化食品供应' },
    { name: '可口可乐武汉', contact: '马主管', phone: '13800005003', addr: '武汉市汉阳区', bank: '建设银行汉阳支行', account: '6222025000000003', notes: '饮料直供，月结' },
    { name: '黄鹤楼酒业', contact: '吴总代', phone: '13800005004', addr: '武汉市武昌区', bank: '招商银行武昌支行', account: '6222025000000004', notes: '白酒/啤酒供应' },
    { name: '康师傅武汉办事处', contact: '郑业务', phone: '13800005005', addr: '武汉市江汉区', notes: '方便食品/饮品供应' },
  ];
  const rsSupIds = [];
  for (const s of rsSuppliers) {
    const [r] = await conn.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, address, bank_name, bank_account, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [RS, s.name, s.contact, s.phone, s.addr, s.bank || null, s.account || null, s.notes]
    );
    rsSupIds.push(r.insertId);
  }
  console.log('  ✓ 供应商');

  const rsProducts = [
    { name: '维达抽纸(3层120抽)', cat: '日用百货', barcode: '6901028108311', unit: '包', cost: 3.5, sell: 5.5, stock: 200, min: 30 },
    { name: '蓝月亮洗衣液(1kg)', cat: '日用百货', barcode: '6901028108322', unit: '瓶', cost: 12, sell: 19.9, stock: 60, min: 10 },
    { name: '威猛先生清洁剂(500ml)', cat: '日用百货', barcode: '6901028108333', unit: '瓶', cost: 8, sell: 13.5, stock: 40, min: 8 },
    { name: '农夫山泉(550ml)', cat: '食品饮料', barcode: '6921168500016', unit: '瓶', cost: 0.8, sell: 2, stock: 480, min: 100 },
    { name: '可口可乐(330ml罐)', cat: '食品饮料', barcode: '6921168500027', unit: '罐', cost: 1.5, sell: 3, stock: 240, min: 48 },
    { name: '康师傅红烧牛肉面', cat: '食品饮料', barcode: '6921168500038', unit: '桶', cost: 2.8, sell: 5, stock: 120, min: 20 },
    { name: '海天酱油(500ml)', cat: '食品饮料', barcode: '6921168500049', unit: '瓶', cost: 5.5, sell: 9.9, stock: 80, min: 15 },
    { name: '乐事薯片(75g)', cat: '零食糖果', barcode: '6921168500050', unit: '袋', cost: 4, sell: 7.5, stock: 100, min: 20 },
    { name: '良品铺子每日坚果(25g)', cat: '零食糖果', barcode: '6921168500061', unit: '袋', cost: 2.5, sell: 5, stock: 150, min: 30 },
    { name: '奥利奥饼干(97g)', cat: '零食糖果', barcode: '6921168500072', unit: '包', cost: 3.5, sell: 6.5, stock: 80, min: 15 },
    { name: '海飞丝洗发水(400ml)', cat: '个人护理', barcode: '6921168500083', unit: '瓶', cost: 18, sell: 29.9, stock: 35, min: 8 },
    { name: '舒肤佳沐浴露(400ml)', cat: '个人护理', barcode: '6921168500094', unit: '瓶', cost: 15, sell: 25.9, stock: 30, min: 8 },
    { name: '佳洁士牙膏(120g)', cat: '个人护理', barcode: '6921168500100', unit: '支', cost: 5, sell: 9.9, stock: 60, min: 10 },
    { name: '黄鹤楼(软蓝)', cat: '烟酒', barcode: '6921168500111', unit: '包', cost: 14, sell: 19, stock: 50, min: 10 },
    { name: '雪花啤酒(500ml罐)', cat: '烟酒', barcode: '6921168500122', unit: '罐', cost: 2.5, sell: 4.5, stock: 120, min: 24 },
  ];
  const rsProductIds = [];
  for (const p of rsProducts) {
    const [r] = await conn.query(
      'INSERT INTO products (tenant_id, category_id, name, barcode, unit, cost_price, sell_price, min_stock, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, \'active\')',
      [RS, rsCatIds[p.cat], p.name, p.barcode, p.unit, p.cost, p.sell, p.min]
    );
    rsProductIds.push(r.insertId);
    await conn.query('INSERT INTO inventory (tenant_id, product_id, quantity) VALUES (?, ?, ?)', [RS, r.insertId, p.stock]);
  }
  console.log('  ✓ 商品 & 库存');

  const rsCustomers = [
    { name: '刘阿姨(街坊)', phone: '13800006001', gender: 'female', level: 'gold', spent: 4500, notes: '每天来逛，喜欢买日用品' },
    { name: '张哥(白领)', phone: '13800006002', gender: 'male', level: 'silver', spent: 2800, notes: '中午来买水和零食' },
    { name: '王奶奶', phone: '13800006003', gender: 'female', level: 'vip', spent: 12000, notes: '老顾客，每周固定来2-3次' },
    { name: '小李(大学生)', phone: '13800006004', gender: 'male', level: 'normal', spent: 680, notes: '偶尔来买零食饮料' },
    { name: '陈姐(邻居)', phone: '13800006005', gender: 'female', level: 'silver', spent: 3200, notes: '喜欢买洗护用品' },
  ];
  for (const c of rsCustomers) {
    await conn.query(
      'INSERT INTO customers (tenant_id, name, phone, gender, level, total_spent, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [RS, c.name, c.phone, c.gender, c.level, c.spent, c.notes]
    );
  }
  console.log('  ✓ 客户');

  // 采购单
  const rsPurchaseData = [
    { supIdx: 0, items: [{ pi: 0, qty: 100, price: 3.5 }, { pi: 1, qty: 20, price: 12 }, { pi: 2, qty: 15, price: 8 }], days: 1, status: 'received' },
    { supIdx: 2, items: [{ pi: 4, qty: 120, price: 1.5 }], days: 2, status: 'received' },
    { supIdx: 1, items: [{ pi: 7, qty: 50, price: 4 }, { pi: 8, qty: 80, price: 2.5 }, { pi: 9, qty: 40, price: 3.5 }], days: 3, status: 'received' },
    { supIdx: 4, items: [{ pi: 5, qty: 60, price: 2.8 }, { pi: 3, qty: 240, price: 0.8 }], days: 4, status: 'received' },
    { supIdx: 3, items: [{ pi: 13, qty: 20, price: 14 }, { pi: 14, qty: 48, price: 2.5 }], days: 5, status: 'draft' },
    { supIdx: 0, items: [{ pi: 10, qty: 15, price: 18 }, { pi: 11, qty: 12, price: 15 }, { pi: 12, qty: 20, price: 5 }], days: 6, status: 'received' },
  ];
  for (const pd of rsPurchaseData) {
    const orderDate = today.subtract(pd.days, 'day').format('YYYY-MM-DD');
    const total = pd.items.reduce((s, i) => s + i.qty * i.price, 0);
    const orderNo = `PO${orderDate.replace(/-/g, '')}${String(rsSupIds.length + pd.days + 1).padStart(4, '0')}`;
    const [or] = await conn.query(
      'INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, order_date, total_amount, status, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [RS, orderNo, rsSupIds[pd.supIdx], orderDate, total, pd.status, rsAdmin]
    );
    for (const it of pd.items) {
      await conn.query('INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [or.insertId, rsProductIds[it.pi], it.qty, it.price]);
    }
  }
  console.log('  ✓ 采购单');

  // 销售单
  const rsSalesData = [
    { items: [{ pi: 3, qty: 6, price: 2 }, { pi: 7, qty: 2, price: 7.5 }, { pi: 8, qty: 3, price: 5 }], days: 0, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 0, qty: 2, price: 5.5 }, { pi: 1, qty: 1, price: 19.9 }], days: 0, type: 'pos', pay: 'cash' },
    { items: [{ pi: 4, qty: 12, price: 3 }, { pi: 14, qty: 6, price: 4.5 }], days: 1, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 10, qty: 1, price: 29.9 }, { pi: 11, qty: 1, price: 25.9 }, { pi: 12, qty: 1, price: 9.9 }], days: 1, type: 'pos', pay: 'alipay' },
    { items: [{ pi: 5, qty: 5, price: 5 }, { pi: 9, qty: 3, price: 6.5 }, { pi: 3, qty: 4, price: 2 }], days: 2, type: 'pos', pay: 'cash' },
    { items: [{ pi: 13, qty: 2, price: 19 }, { pi: 14, qty: 4, price: 4.5 }], days: 3, type: 'pos', pay: 'cash' },
    { items: [{ pi: 6, qty: 2, price: 9.9 }, { pi: 0, qty: 3, price: 5.5 }], days: 4, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 8, qty: 5, price: 5 }, { pi: 7, qty: 3, price: 7.5 }, { pi: 4, qty: 6, price: 3 }], days: 5, type: 'pos', pay: 'wechat' },
    { items: [{ pi: 3, qty: 24, price: 2 }, { pi: 1, qty: 2, price: 19.9 }], days: 6, type: 'wholesale', pay: 'cash' },
  ];
  for (const sd of rsSalesData) {
    const orderDate = today.subtract(sd.days, 'day').format('YYYY-MM-DD');
    const total = sd.items.reduce((s, i) => s + i.qty * i.price, 0);
    const orderNo = `S${orderDate.replace(/-/g, '')}${String(sd.days + 1).padStart(4, '0')}`;
    const [or] = await conn.query(
      `INSERT INTO sales_orders (tenant_id, order_no, order_type, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, order_date, operator_id)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'completed', ?, ?)`,
      [RS, orderNo, sd.type, total, total, total, sd.pay, orderDate, rsAdmin]
    );
    for (const it of sd.items) {
      await conn.query('INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price, discount) VALUES (?, ?, ?, ?, ?)',
        [or.insertId, rsProductIds[it.pi], it.qty, it.price, 0]);
    }
  }
  console.log('  ✓ 销售单');

  // 财务记录
  const rsFinanceData = [
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 860, days: 0, remark: '今日门店零售收入' },
    { type: 'income', cat: '销售收入', platform: 'wechat_shop', amount: 245, days: 0, remark: '微信小程序外卖订单' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 580, days: 1, remark: '中百仓储日用品进货' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 720, days: 1, remark: '昨日零售收入' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 360, days: 2, remark: '可口可乐进货' },
    { type: 'income', cat: '销售收入', platform: 'douyin', amount: 180, days: 2, remark: '抖音小店零食订单' },
    { type: 'expense', cat: '房租水电', platform: 'offline', amount: 3000, days: 3, remark: '本月店面租金' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 950, days: 3, remark: '零售收入' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 420, days: 4, remark: '旺旺零食进货' },
    { type: 'income', cat: '销售收入', platform: 'meituan', amount: 380, days: 4, remark: '美团外卖收入' },
    { type: 'expense', cat: '推广费用', platform: 'meituan', amount: 60, days: 5, remark: '美团推广费' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 1100, days: 5, remark: '周末零售收入' },
    { type: 'income', cat: '平台收入', platform: 'wechat_shop', amount: 150, days: 6, remark: '小程序订单' },
    { type: 'expense', cat: '人工支出', platform: 'offline', amount: 2800, days: 7, remark: '店员半月工资' },
    { type: 'income', cat: '销售收入', platform: 'offline', amount: 680, days: 8, remark: '日常零售' },
    { type: 'expense', cat: '水电费', platform: 'offline', amount: 450, days: 10, remark: '本月水电费' },
    { type: 'income', cat: '销售收入', platform: 'eleme', amount: 220, days: 12, remark: '饿了么外卖收入' },
    { type: 'expense', cat: '采购支出', platform: 'offline', amount: 1200, days: 15, remark: '批量进货-日用品' },
  ];
  for (const f of rsFinanceData) {
    await conn.query(
      'INSERT INTO finance_records (tenant_id, type, category, platform, amount, payment_method, remark, record_date, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [RS, f.type, f.cat, f.platform, f.amount, f.type === 'income' ? 'wechat' : 'bank', f.remark, today.subtract(f.days, 'day').format('YYYY-MM-DD'), rsAdmin]
    );
  }
  console.log('  ✓ 财务记录');

  // 电商平台
  const rsEcommerce = [
    { platform: 'wechat_shop', shop: '宇航便利生活', rate: 0 },
    { platform: 'meituan', shop: '宇航便利店(光谷店)', rate: 5 },
    { platform: 'eleme', shop: '宇航便利店(外卖)', rate: 5 },
    { platform: 'douyin', shop: '邱老板零食铺', rate: 3 },
  ];
  for (const e of rsEcommerce) {
    await conn.query(
      'INSERT INTO ecommerce_platforms (tenant_id, platform, shop_name, commission_rate) VALUES (?, ?, ?, ?)',
      [RS, e.platform, e.shop, e.rate]
    );
  }
  console.log('  ✓ 电商平台\n');

  // 完成
  console.log('====================================');
  console.log('✅ 三套帐套演示数据生成完成！');
  console.log('====================================');
  console.log('');
  console.log('📦 农村供销社:');
  console.log(`   商品: ${scProducts.length}个 | 分类: ${scCats.length}大类${scCats.reduce((s, c) => s + c.subs.length, 0)}小类`);
  console.log(`   供应商: ${scSuppliers.length}家 | 客户: ${scCustomers.length}个`);
  console.log(`   采购单: ${scPurchaseData.length}笔 | 销售单: ${scSalesData.length}笔 | 财务记录: ${scFinanceData.length}条`);
  console.log(`   电商平台: ${scEcommerce.length}家`);
  console.log('');
  console.log('🥬 菜市场商户:');
  console.log(`   商品: ${mvProducts.length}个 | 分类: ${mvCats.length}大类${mvCats.reduce((s, c) => s + c.subs.length, 0)}小类`);
  console.log(`   供应商: ${mvSuppliers.length}家 | 客户: ${mvCustomers.length}个`);
  console.log(`   采购单: ${mvPurchaseData.length}笔 | 销售单: ${mvSalesData.length}笔 | 财务记录: ${mvFinanceData.length}条`);
  console.log(`   电商平台: ${mvEcommerce.length}家`);
  console.log('');
  console.log('🏪 个体门店:');
  console.log(`   商品: ${rsProducts.length}个 | 分类: ${rsCats.length}大类${rsCats.reduce((s, c) => s + c.subs.length, 0)}小类`);
  console.log(`   供应商: ${rsSuppliers.length}家 | 客户: ${rsCustomers.length}个`);
  console.log(`   采购单: ${rsPurchaseData.length}笔 | 销售单: ${rsSalesData.length}笔 | 财务记录: ${rsFinanceData.length}条`);
  console.log(`   电商平台: ${rsEcommerce.length}家`);

  await conn.end();
})();
