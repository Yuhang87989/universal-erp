// 为所有活跃租户补齐基础数据（幂等：缺才补）
// 资金账户（现金/微信/支付宝）、默认仓库、自动凭证开关
// 用法：node server/diagnostics/seed_tenant_basics.js
const path = require('path');
const fs = require('fs');

// 显式加载 server/.env（脚本cwd可能不在server下）
const envPath = '/opt/universal-erp/server/.env';
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
}

const pool = require('/opt/universal-erp/server/src/config/db');

(async () => {
  const [tenants] = await pool.query("SELECT id, name FROM tenants WHERE status='active'");
  console.log(`发现 ${tenants.length} 个活跃租户，开始补齐基础数据...\n`);

  for (const t of tenants) {
    const tid = t.id;
    console.log(`—— 账套${tid} ${t.name} ——`);

    // 资金账户
    const accounts = [
      ['现金账户', 'cash', 1],
      ['微信收款', 'wechat', 0],
      ['支付宝收款', 'alipay', 0],
    ];
    for (const [name, type, isDef] of accounts) {
      const [exist] = await pool.query(
        'SELECT id FROM fund_accounts WHERE tenant_id=? AND (account_name=? OR account_type=?)',
        [tid, name, type]
      );
      if (!exist.length) {
        await pool.query(
          'INSERT INTO fund_accounts (tenant_id, account_name, account_type, balance, is_enabled, is_default, sort_order) VALUES (?,?,?,0,1,?,0)',
          [tid, name, type, isDef]
        );
        console.log(`  ✅ 补资金账户：${name}`);
      }
    }
    // 确保至少一个默认账户
    const [defAcc] = await pool.query(
      'SELECT id FROM fund_accounts WHERE tenant_id=? AND is_default=1 AND is_enabled=1', [tid]);
    if (!defAcc.length) {
      const [cash] = await pool.query(
        'SELECT id FROM fund_accounts WHERE tenant_id=? AND account_type=\'cash\' LIMIT 1', [tid]);
      if (cash.length) {
        await pool.query('UPDATE fund_accounts SET is_default=1 WHERE id=?', [cash[0].id]);
        console.log('  ✅ 设置现金账户为默认');
      }
    }

    // 默认仓库
    const [wh] = await pool.query(
      'SELECT id FROM warehouses WHERE tenant_id=? AND (is_default=1 OR code=\'WH001\')', [tid]);
    if (!wh.length) {
      await pool.query(
        'INSERT INTO warehouses (tenant_id, code, name, is_default, remark) VALUES (?,\'WH001\',\'主仓库\',1,\'默认仓库\')',
        [tid]
      );
      console.log('  ✅ 补默认仓库：主仓库');
    }

    // 自动凭证开关
    const [vas] = await pool.query('SELECT id FROM voucher_auto_settings WHERE tenant_id=?', [tid]);
    if (!vas.length) {
      await pool.query(
        'INSERT INTO voucher_auto_settings (tenant_id, auto_sales, auto_purchase, auto_fund, auto_depreciation) VALUES (?,1,1,1,1)',
        [tid]
      );
      console.log('  ✅ 补自动凭证开关（全开）');
    }
  }

  console.log('\n✅ 全部补齐完成');
  process.exit(0);
})().catch(err => { console.error('❌', err); process.exit(1); });
