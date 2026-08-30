// 创建"随手记"个人日常收支账套（幂等：已存在则跳过）
// 走系统真实建账接口 POST /api/tenants，创建后关闭自动凭证（个人账纯流水）
// 用法：node server/diagnostics/create_personal_book.js
const fs = require('fs');
const envPath = '/opt/universal-erp/server/.env';
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
}
const pool = require('/opt/universal-erp/server/src/config/db');
const http = require('http');

function api(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ host: '127.0.0.1', port: 3000, path: '/api' + path, method, headers }, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(b) }); } catch (e) { resolve({ status: res.statusCode, body: b }); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const BOOK_NAME = '随手记';

(async () => {
  // 0. 先查库是否已存在
  const [exist] = await pool.query("SELECT id FROM tenants WHERE name=? AND status='active'", [BOOK_NAME]);
  if (exist.length) {
    console.log(`ℹ️ 「${BOOK_NAME}」账套已存在（id=${exist[0].id}），跳过创建`);
    process.exit(0);
  }

  // 1. 用主账套 owner 登录拿 token
  const login = await api('POST', '/auth/login', { username: 'admin', password: 'admin123', tenantId: 3 });
  if (login.status !== 200 || !login.body?.data?.token) {
    throw new Error('登录失败: ' + JSON.stringify(login.body));
  }
  const token = login.body.data.token;
  console.log('✅ owner 登录成功');

  // 2. 走真实建账接口
  const create = await api('POST', '/tenants', {
    name: BOOK_NAME,
    ownerName: '邱健军',
    businessType: 'other',
    businessDesc: '个人日常收入与消费记录',
    username: 'admin',
    password: 'admin123'
  }, token);
  if (create.status !== 200 || create.body?.code !== 0) {
    throw new Error('建账失败: ' + JSON.stringify(create.body));
  }
  const tid = create.body.data.tenantId;
  console.log(`✅ 「${BOOK_NAME}」账套创建成功：tenantId=${tid}, bookId=${create.body.data.bookId}`);

  // 3. 个人账：关闭自动凭证（纯流水记录，不生成复式记账凭证）
  await pool.query(
    'UPDATE voucher_auto_settings SET auto_sales=0, auto_purchase=0, auto_fund=0, auto_depreciation=0 WHERE tenant_id=?',
    [tid]
  );
  console.log('✅ 已关闭自动凭证（个人随手记，只记流水）');

  // 4. 核对初始化结果
  const [accs] = await pool.query('SELECT account_name, account_type FROM fund_accounts WHERE tenant_id=?', [tid]);
  const [whs] = await pool.query('SELECT name FROM warehouses WHERE tenant_id=?', [tid]);
  const [subs] = await pool.query('SELECT COUNT(*) as c FROM accounting_accounts aa JOIN accounting_books ab ON aa.book_id=ab.id WHERE ab.tenant_id=?', [tid]);
  console.log(`   资金账户: ${accs.map(a => a.account_name).join('、')}`);
  console.log(`   默认仓库: ${whs.map(w => w.name).join('、')}`);
  console.log(`   会计科目: ${subs[0].c} 个`);
  console.log(`\n🎉 完成。admin/admin123 登录后，顶栏账套切换选「${BOOK_NAME}」即可记个人收支`);
  process.exit(0);
})().catch(err => { console.error('❌', err.message || err); process.exit(1); });
