const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'erp_db',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4'
});

// 测试连接
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL 连接成功');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL 连接失败:', err.message);
  });

module.exports = pool;
