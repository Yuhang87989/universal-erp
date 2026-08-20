const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'Erp@Secure2026',
    database: process.env.DB_NAME || 'erp_db'
  });

  console.log('开始初始化三套帐套...');

  // 确保 tenants 表有 switchable_tenants 字段
  try {
    await conn.query('ALTER TABLE tenants ADD COLUMN business_desc VARCHAR(200) AFTER business_type');
    console.log('✓ tenants.business_desc 字段已添加');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('  tenants.business_desc 已存在，跳过');
    else throw e;
  }

  // 确保 users 表有 switchable_tenants 字段（JSON数组，存储可切换的租户ID列表）
  try {
    await conn.query('ALTER TABLE users ADD COLUMN switchable_tenants JSON AFTER tenant_id');
    console.log('✓ users.switchable_tenants 字段已添加');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('  users.switchable_tenants 已存在，跳过');
    else throw e;
  }

  const hash = await bcrypt.hash('admin123', 10);

  // 定义三套帐套
  const tenants = [
    { name: '农村供销社', owner: '邱健军', phone: '13800001001', type: 'supply_coop', desc: '农用供销社，经营农资、农药、化肥、种子等' },
    { name: '菜市场商户', owner: '邱健军', phone: '13800001002', type: 'market_vendor', desc: '个体菜市场摊位，经营蔬菜、水果、肉禽等' },
    { name: '个体门店', owner: '邱健军', phone: '13800001003', type: 'retail_store', desc: '个体商户门店，经营日用百货等' },
  ];

  const tenantIds = [];

  for (const t of tenants) {
    // 检查是否已存在
    const [existing] = await conn.query('SELECT id FROM tenants WHERE name = ?', [t.name]);
    let tid;
    if (existing.length > 0) {
      tid = existing[0].id;
      console.log(`  租户「${t.name}」已存在 (id=${tid})，跳过创建`);
    } else {
      await conn.query(
        'INSERT INTO tenants (name, owner_name, phone, business_type, business_desc) VALUES (?, ?, ?, ?, ?)',
        [t.name, t.owner, t.phone, t.type, t.desc]
      );
      const [r] = await conn.query('SELECT LAST_INSERT_ID() as id');
      tid = r[0].id;
      console.log(`✓ 创建租户「${t.name}」(id=${tid})`);
    }
    tenantIds.push(tid);

    // 为该租户创建管理员
    const username = t.type + '_admin';
    const [userExists] = await conn.query('SELECT id FROM users WHERE username = ?', [username]);
    if (userExists.length === 0) {
      await conn.query(
        'INSERT INTO users (tenant_id, username, password_hash, real_name, role, status, switchable_tenants) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tid, username, hash, t.owner, 'owner', 'active', JSON.stringify(tenantIds.slice())]
      );
      console.log(`✓ 创建管理员 ${username} (密码: admin123)`);
    } else {
      console.log(`  管理员 ${username} 已存在，跳过`);
    }
  }

  // 更新所有租户管理员的 switchable_tenants 为全部三个租户ID
  const allTenantIdsJson = JSON.stringify(tenantIds);
  for (const t of tenants) {
    const username = t.type + '_admin';
    await conn.query(
      'UPDATE users SET switchable_tenants = ? WHERE username = ?',
      [allTenantIdsJson, username]
    );
  }
  console.log('✓ 已为所有管理员设置可切换帐套权限');

  // 同时更新原来的 admin 账号（如果存在）
  const [oldAdmin] = await conn.query('SELECT id FROM users WHERE username = "admin"');
  if (oldAdmin.length > 0) {
    await conn.query(
      'UPDATE users SET switchable_tenants = ? WHERE username = "admin"',
      [allTenantIdsJson]
    );
    console.log('✓ 已为原 admin 账号设置可切换帐套权限');
  }

  // 输出结果
  console.log('\n========== 帐套初始化完成 ==========');
  console.log(`帐套列表:`);
  for (let i = 0; i < tenants.length; i++) {
    console.log(`  ${i + 1}. ${tenants[i].name} - 账号: ${tenants[i].type}_admin / admin123`);
  }
  console.log(`\n原 admin 账号也可切换所有帐套`);
  console.log('====================================\n');

  await conn.end();
})();
