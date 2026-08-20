const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'erp_user',
    password: process.env.DB_PASSWORD || 'Erp@Secure2026',
    database: process.env.DB_NAME || 'erp_db'
  });

  try {
    console.log('开始数据库迁移...');

    // 1. 创建finance_records表
    await pool.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✓ finance_records 表创建/已存在');

    // 2. 给suppliers表补字段（安全的try-catch方式）
    try {
      await pool.query('ALTER TABLE suppliers ADD COLUMN bank_name VARCHAR(100) AFTER address');
      console.log('✓ suppliers.bank_name 字段已添加');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('  suppliers.bank_name 已存在，跳过');
      else throw e;
    }

    try {
      await pool.query('ALTER TABLE suppliers ADD COLUMN bank_account VARCHAR(50) AFTER bank_name');
      console.log('✓ suppliers.bank_account 字段已添加');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') console.log('  suppliers.bank_account 已存在，跳过');
      else throw e;
    }

    console.log('\n✅ 数据库迁移完成！');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
