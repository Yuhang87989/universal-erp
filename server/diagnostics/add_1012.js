// 补建「1012 其他货币资金」一级科目（账套3），复制1002银行存款结构
const fs = require('fs');
(function loadEnv(){
  try {
    fs.readFileSync('/opt/universal-erp/server/.env','utf8').split('\n').forEach(line=>{
      line=line.trim(); if(!line||line.startsWith('#'))return;
      const i=line.indexOf('='); if(i<0)return;
      const k=line.slice(0,i).trim(), v=line.slice(i+1).trim().replace(/^["']|["']$/g,'');
      if(k&&process.env[k]===undefined)process.env[k]=v;
    });
  } catch(e){ console.log('[env] '+e.message); }
})();
const pool = require('/opt/universal-erp/server/src/config/db');

(async()=>{
  try {
    const TENANT=3;
    const [[book]] = await pool.query("SELECT id, book_name FROM accounting_books WHERE tenant_id=? ORDER BY id LIMIT 1",[TENANT]);
    console.log('[账套]', book.id, book.book_name);

    const [exist] = await pool.query("SELECT id, code, name FROM accounting_accounts WHERE book_id=? AND code='1012'",[book.id]);
    if (exist.length) { console.log('✅ 1012 其他货币资金 已存在(id='+exist[0].id+')，无需补建'); process.exit(0); }

    // 以1002银行存款为模板（同为资产类一级科目、借方余额）
    const [tpl] = await pool.query("SELECT * FROM accounting_accounts WHERE book_id=? AND code='1002' LIMIT 1",[book.id]);
    if (!tpl.length) { console.log('❌ 未找到1002银行存款作为模板，无法自动补建'); process.exit(1); }
    const row = { ...tpl[0] };
    delete row.id;
    row.code = '1012';
    row.name = '其他货币资金';
    // 保持与1002同级（parent_id/level/balance_direction等沿用模板）
    const cols = Object.keys(row);
    const vals = cols.map(c=>row[c]);
    const placeholders = cols.map(()=>'?').join(',');
    const [res] = await pool.query(`INSERT INTO accounting_accounts (${cols.join(',')}) VALUES (${placeholders})`, vals);
    console.log('✅ 已补建 1012 其他货币资金，新科目id='+res.insertId);
    console.log('   （parent_id/level/余额方向等均沿用1002银行存款模板）');

    // 复查
    const [chk] = await pool.query("SELECT code,name FROM accounting_accounts WHERE book_id=? AND code IN ('1001','1002','1012') ORDER BY code",[book.id]);
    console.log('[复查] 资金类科目:', chk.map(a=>a.code+' '+a.name).join('、'));
  } catch(e) {
    console.error('❌ 补建失败:', e.message);
  } finally { await pool.end(); }
})();
