const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost', user: 'erp_user',
    password: 'Erp@Secure2026', database: 'erp_db'
  });

  const hash = await bcrypt.hash('admin123', 10);

  const [r] = await conn.execute(
    'SELECT id FROM users WHERE username="admin"'
  );

  if (r.length === 0) {
    const [t] = await conn.execute('SELECT id FROM tenants LIMIT 1');
    let tid;
    if (t.length === 0) {
      await conn.execute(
        'INSERT INTO tenants (name, owner_name, phone, business_type) VALUES (?, ?, ?, ?)',
        ['默认店铺', '管理员', '13800138000', 'retail']
      );
      const [t2] = await conn.execute('SELECT LAST_INSERT_ID() as id');
      tid = t2[0].id;
    } else {
      tid = t[0].id;
    }
    await conn.execute(
      'INSERT INTO users (tenant_id, username, password_hash, real_name, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [tid, 'admin', hash, '管理员', 'owner', 'active']
    );
    console.log('Admin created with tenant_id:', tid);
  } else {
    await conn.execute(
      'UPDATE users SET password_hash=? WHERE username="admin"', [hash]
    );
    console.log('Admin password updated');
  }

  const [check] = await conn.execute(
    'SELECT id, username, tenant_id, role, status FROM users WHERE username="admin"'
  );
  console.log('Check:', JSON.stringify(check));
  await conn.end();
})();
