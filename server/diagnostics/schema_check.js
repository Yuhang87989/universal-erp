// ERP 综合结构一致性诊断（只读 + 凭证模拟回滚，不写脏数据）
// 用法: node server/diagnostics/schema_check.js   （在 /opt/universal-erp 目录下运行）
const path = require('path');
const fs = require('fs');
// 手动加载 server/.env（dotenv 默认从进程 cwd 找，诊断脚本从项目根跑，需显式指定）
(function loadEnv(){
  const envPath = '/opt/universal-erp/server/.env';
  try {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const i = line.indexOf('=');
      if (i < 0) return;
      const k = line.slice(0, i).trim();
      const v = line.slice(i+1).trim().replace(/^["']|["']$/g, '');
      if (k && process.env[k] === undefined) process.env[k] = v;
    });
    console.log('[env] 已加载 server/.env: DB_USER=' + process.env.DB_USER + ' DB_NAME=' + process.env.DB_NAME);
  } catch(e) {
    console.log('[env] 警告: 未找到 ' + envPath + ' (' + e.message + ')，将用 db.js 默认配置');
  }
})();
const pool = require('/opt/universal-erp/server/src/config/db');

(async () => {
  const TENANT = 3;
  const out = { sections: [] };
  function log(section, line) { console.log(`[${section}] ${line}`); }

  try {
    // ========== 1. 代码引用的表是否存在 + INSERT/UPDATE 列是否存在 ==========
    // 表清单（后端代码引用）
    const codeTables = ["accounting_accounts","accounting_books","ai_chat_history","auto_sales",
      "categories","customers","depreciation_records","ecommerce_platforms","finance_records",
      "fixed_assets","fund_accounts","fund_settlements","fund_transactions","inventory",
      "inventory_logs","operation_logs","payment_channels","payment_transactions","period_closures",
      "products","purchase_items","purchase_orders","sale_items","sales_orders","seals",
      "stock_alerts","stock_in_items","stock_in_orders","stock_out_items","stock_out_orders",
      "stock_transfer_items","stock_transfers","stocktake_items","stocktakes","suppliers",
      "tenant_settings","tenants","users","voucher_auto_settings","voucher_items",
      "voucher_seals","vouchers","warehouses"];

    const [dbTables] = await pool.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()"
    );
    const existSet = new Set(dbTables.map(t => t.TABLE_NAME));
    log('1-表存在性', `真实库共 ${existSet.size} 张表`);
    const missingTables = codeTables.filter(t => !existSet.has(t));
    if (missingTables.length) log('1-表存在性', '❌ 代码引用但库中不存在的表: ' + missingTables.join(', '));
    else log('1-表存在性', '✅ 代码引用的43张表全部存在');

    // 库里有但代码没引用的表
    const codeSet = new Set(codeTables);
    const extraTables = [...existSet].filter(t => !codeSet.has(t));
    if (extraTables.length) log('1-表存在性', 'ℹ️  库中存在但代码未引用的表: ' + extraTables.join(', '));

    // 取所有表的列映射
    const [cols] = await pool.query(
      "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
    );
    const colMap = {};
    cols.forEach(c => { (colMap[c.TABLE_NAME] = colMap[c.TABLE_NAME] || new Set()).add(c.COLUMN_NAME); });

    // ========== 2. 逐表列级校验：把后端所有 .js 里 INSERT INTO t (cols) / UPDATE t SET 的列检查一遍 ==========
    const fs = require('fs');
    const routeDir = '/opt/universal-erp/server/src';
    function walk(d){ let r=[]; for(const f of fs.readdirSync(d)){ const fp=path.join(d,f); const st=fs.statSync(fp); if(st.isDirectory()) r=r.concat(walk(fp)); else if(f.endsWith('.js')) r.push(fp);} return r; }
    const jsFiles = walk(routeDir);
    const colErrors = [];
    for (const fp of jsFiles) {
      const src = fs.readFileSync(fp, 'utf8');
      // 模板字符串里的SQL
      const tpls = src.match(/`[\s\S]*?`/g) || [];
      for (let tpl of tpls) {
        const sql = tpl.replace(/\$\{[^}]*\}/g, ' ? ').replace(/`/g,'');
        // INSERT INTO tbl (col list)
        const insRe = /INSERT\s+(?:IGNORE\s+)?INTO\s+`?([a-z_][a-z0-9_]*)`?\s*\(([^)]*)\)/gi;
        let m;
        while ((m = insRe.exec(sql))) {
          const tbl = m[1].toLowerCase();
          if (!colMap[tbl]) continue; // 表不存在已在上面报
          const insCols = m[2].split(',').map(s=>s.trim().replace(/`/g,'').split(/\s+AS\s+/i)[0]).filter(c=>/^[a-z_][a-z0-9_]*$/i.test(c));
          for (const c of insCols) {
            if (!colMap[tbl].has(c)) colErrors.push(`${path.basename(fp)}: INSERT ${tbl}.${c} 列不存在`);
          }
        }
        // UPDATE tbl SET col=
        const updRe = /UPDATE\s+`?([a-z_][a-z0-9_]*)`?\s+SET\s+([\s\S]*?)(?:\sWHERE\s|$)/gi;
        let u;
        while ((u = updRe.exec(sql))) {
          const tbl = u[1].toLowerCase();
          if (!colMap[tbl]) continue;
          // SET 段按逗号拆，取等号左侧列名（去掉别名 a. / b.）
          for (let part of u[2].split(',')) {
            const lm = part.match(/(?:[a-z_]+\.)?\s*`?([a-z_][a-z0-9_]*)`?\s*=/i);
            if (lm) {
              const c = lm[1];
              if (!colMap[tbl].has(c)) colErrors.push(`${path.basename(fp)}: UPDATE ${tbl}.${c} 列不存在`);
            }
          }
        }
      }
    }
    // 去重
    const uniqColErr = [...new Set(colErrors)];
    if (uniqColErr.length) { log('2-列校验', `❌ 发现 ${uniqColErr.length} 处列不匹配:`); uniqColErr.forEach(e=>log('2-列校验', '   - '+e)); }
    else log('2-列校验', '✅ 所有 INSERT/UPDATE 列在真实库中均存在');

    // ========== 3. fund / voucher 数据真相（跨租户）==========
    const [ftAll] = await pool.query("SELECT tenant_id, COUNT(*) c, MIN(tx_date) mind, MAX(tx_date) maxd FROM fund_transactions GROUP BY tenant_id");
    log('3-数据真相', 'fund_transactions 各租户: ' + JSON.stringify(ftAll));
    const [vAll] = await pool.query("SELECT tenant_id, book_id, voucher_type, COUNT(*) c, MAX(voucher_date) latest FROM vouchers GROUP BY tenant_id, book_id, voucher_type");
    log('3-数据真相', 'vouchers 分组: ' + JSON.stringify(vAll));
    const [ft3] = await pool.query("SELECT id, tx_no, tx_type, direction, amount, business_type, tx_date, account_id FROM fund_transactions WHERE tenant_id=? ORDER BY id", [TENANT]);
    log('3-数据真相', `租户${TENANT} fund_transactions ${ft3.length}条: ` + JSON.stringify(ft3));
    const [vsrc] = await pool.query("SELECT id, voucher_no, voucher_type, voucher_date, source_type, source_id, source_no, total_debit FROM vouchers WHERE tenant_id=? ORDER BY id DESC LIMIT 15", [TENANT]);
    log('3-数据真相', `租户${TENANT} 最近凭证: ` + JSON.stringify(vsrc));

    // ========== 4. 会计科目配置检查（凭证生成依赖）==========
    const [books] = await pool.query("SELECT id, book_name, tenant_id FROM accounting_books WHERE tenant_id=?", [TENANT]);
    log('4-科目', '账套: ' + JSON.stringify(books));
    for (const b of books) {
      const [accts] = await pool.query("SELECT code, name FROM accounting_accounts WHERE book_id=? AND is_enabled=1 ORDER BY code", [b.id]);
      const codes = accts.map(a=>a.code);
      log('4-科目', `账套${b.id}(${b.book_name}) 共${accts.length}个启用科目`);
      // 凭证生成需要的关键科目
      const needed = {
        '1001库存现金': codes.some(c=>c==='1001'||c.startsWith('1001.')),
        '1002银行存款': codes.some(c=>c==='1002'||c.startsWith('1002.')),
        '1012/其他货币资金': codes.some(c=>c==='1012'||c.startsWith('1012')),
        '1122应收账款': codes.some(c=>c==='1122'||c.startsWith('1122.')),
        '2202应付账款': codes.some(c=>c==='2202'||c.startsWith('2202.')),
        '5001主营业务收入': codes.some(c=>c==='5001'||c.startsWith('5001.')),
        '5051/5111/6301其他业务收入': codes.some(c=>['5051','5111','6301'].some(k=>c===k||c.startsWith(k+'.'))),
        '6601管理费用': codes.some(c=>c==='6601'||c.startsWith('6601.')),
        '6602/6401销售费用': codes.some(c=>['6602','6401'].some(k=>c===k||c.startsWith(k+'.'))),
        '6603财务费用': codes.some(c=>c==='6603'||c.startsWith('6603.')),
        '1405库存商品(采购凭证)': codes.some(c=>c==='1405'||c.startsWith('1405')),
        '1602/1502累计折旧': codes.some(c=>['1602','1502'].some(k=>c===k||c.startsWith(k))),
      };
      for (const [k,v] of Object.entries(needed)) {
        if (!v) log('4-科目', `   ❌ 账套${b.id} 缺少科目类别: ${k}`);
      }
      log('4-科目', `   科目代码列表: ${codes.join(', ')}`);
    }

    // ========== 5. voucher_auto_settings 开关 ==========
    const [vas] = await pool.query("SELECT * FROM voucher_auto_settings WHERE tenant_id=?", [TENANT]);
    log('5-凭证开关', 'voucher_auto_settings: ' + JSON.stringify(vas));

    // ========== 6. 模拟凭证生成（事务回滚，不留数据）==========
    const vgen = require('/opt/universal-erp/server/src/services/voucher_generator');
    const conn = await pool.getConnection();
    const cases = [
      { name: '资金收入-销售收入(微信)', dir: 'in',  p: { tenantId:TENANT, userId:38, txId:999999, txNo:'TEST-INC', txDate:'2026-08-29', accountType:'wechat', amount:100, counterpartyName:'测试客户', referenceType:null, referenceNo:null, businessType:'revenue', remark:'诊断测试收入' } },
      { name: '资金支出-房租(现金)',   dir: 'out', p: { tenantId:TENANT, userId:38, txId:999998, txNo:'TEST-EXP', txDate:'2026-08-29', accountType:'cash', amount:88, counterpartyName:'房东', referenceType:null, referenceNo:null, businessType:'rent', remark:'诊断测试房租' } },
      { name: '资金支出-营销(支付宝)', dir: 'out', p: { tenantId:TENANT, userId:38, txId:999997, txNo:'TEST-MKT', txDate:'2026-08-29', accountType:'alipay', amount:66, counterpartyName:'广告平台', referenceType:null, referenceNo:null, businessType:'marketing', remark:'诊断测试推广' } },
      { name: '资金收入-其他(微信)',   dir: 'in',  p: { tenantId:TENANT, userId:38, txId:999996, txNo:'TEST-OTH', txDate:'2026-08-29', accountType:'wechat', amount:50, counterpartyName:null, referenceType:null, referenceNo:null, businessType:'other_income', remark:'诊断测试其他收入' } },
    ];
    for (const c of cases) {
      try {
        await conn.beginTransaction();
        let r;
        if (c.dir === 'in') r = await vgen.generateFundIncomeVoucher(conn, c.p);
        else r = await vgen.generateFundExpenseVoucher(conn, c.p);
        log('6-凭证模拟', `✅ ${c.name} → 凭证号 ${r.voucher_no}`);
      } catch (e) {
        log('6-凭证模拟', `❌ ${c.name} → 抛错: ${e.message}`);
      } finally {
        try { await conn.rollback(); } catch(e){}
      }
    }
    conn.release();

    // ========== 7. 期间结账状态 ==========
    const [pc] = await pool.query("SELECT * FROM period_closures WHERE tenant_id=? OR book_id IN (SELECT id FROM accounting_books WHERE tenant_id=?)", [TENANT,TENANT]);
    log('7-期间结账', 'period_closures: ' + JSON.stringify(pc));

  } catch (e) {
    console.error('诊断脚本自身异常:', e);
  } finally {
    await pool.end();
  }
})();
