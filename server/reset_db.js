const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'Erp@Secure2026',
    database: process.env.DB_NAME || 'erp_db'
  });

  console.log('🔨 开始重建数据库表...\n');

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    'sale_items','purchase_items','ecommerce_platforms','finance_records',
    'purchase_orders','sales_orders','inventory','products','categories',
    'customers','suppliers','users','tenants','operation_logs'
  ];

  for (const tbl of tables) {
    await conn.query(`DROP TABLE IF EXISTS ${tbl}`);
    console.log(`  ✓ 已删除 ${tbl}`);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');

  // 读取 schema.sql 重新建表（跳过 CREATE DATABASE 和 USE 语句）
  const fs = require('fs');
  const path = require('path');
  const schemaPath = path.join(__dirname, 'prisma', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--') && s !== '');

  for (const stmt of statements) {
    // 跳过 CREATE DATABASE 和 USE 语句（数据库已存在）
    if (stmt.toUpperCase().startsWith('CREATE DATABASE') || stmt.toUpperCase().startsWith('USE ')) continue;
    try {
      await conn.query(stmt + ';');
    } catch (e) {
      console.error(`  ✗ 建表失败: ${e.message.substring(0, 100)}`);
    }
  }

  console.log('\n✅ 数据库表重建完成！');
  console.log('现在可以运行 node seed_demo.js 生成演示数据');

  await conn.end();
})();
