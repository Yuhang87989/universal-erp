#!/bin/bash
# ERP 修复部署 + 全面结构诊断（后台运行，日志 /tmp/deploy.log）
LOG(){ echo "[$(date '+%H:%M:%S')] $*"; }

LOG "===== 开始部署+诊断 ====="
cd /opt/universal-erp || { LOG "FATAL: /opt/universal-erp 不存在"; exit 1; }

LOG "1. 下载最新代码..."
rm -rf /tmp/erp_new /tmp/erp_new.tgz
ok=0
for i in 1 2 3; do
  curl -sL --max-time 120 "https://gh-proxy.com/https://github.com/Yuhang87989/universal-erp/archive/refs/heads/main.tar.gz?t=$(date +%s)" -o /tmp/erp_new.tgz
  if tar tzf /tmp/erp_new.tgz >/dev/null 2>&1; then LOG "   下载成功 ($(du -h /tmp/erp_new.tgz | cut -f1))"; ok=1; break; fi
  LOG "   第${i}次下载失败，重试..."; sleep 2
done
[ $ok -eq 0 ] && { LOG "FATAL: 代码下载失败"; exit 1; }
mkdir -p /tmp/erp_new
tar xzf /tmp/erp_new.tgz -C /tmp/erp_new --strip-components=1 || { LOG "FATAL: 解压失败"; exit 1; }

LOG "2. 备份并覆盖文件..."
TS=$(date +%s)
cp server/src/routes/fund.js server/src/routes/fund.js.bak.$TS 2>/dev/null
cp server/src/routes/reports.js server/src/routes/reports.js.bak.$TS 2>/dev/null
\cp /tmp/erp_new/server/src/routes/fund.js server/src/routes/fund.js
\cp /tmp/erp_new/server/src/routes/reports.js server/src/routes/reports.js
mkdir -p server/diagnostics
\cp /tmp/erp_new/server/diagnostics/schema_check.js server/diagnostics/schema_check.js
LOG "   fund.js / reports.js / schema_check.js 已覆盖"

LOG "3. 语法检查..."
node --check server/src/routes/fund.js && LOG "   fund.js 语法OK" || LOG "   !!! fund.js 语法错误"
node --check server/src/routes/reports.js && LOG "   reports.js 语法OK" || LOG "   !!! reports.js 语法错误"
node --check server/diagnostics/schema_check.js && LOG "   schema_check.js 语法OK" || LOG "   !!! schema_check.js 语法错误"

LOG "4. 重启服务..."
systemctl restart erp-server
sleep 4
systemctl is-active erp-server | grep -q active && LOG "   服务运行中 OK" || LOG "   !!! 服务未运行"

LOG "5. 健康检查: $(curl -s --max-time 10 http://127.0.0.1:3000/api/health)"

LOG "===== 6. 全面结构一致性诊断 ====="
node server/diagnostics/schema_check.js 2>&1

LOG "===== 7. 接口验证 ====="
TOKEN=$(curl -s -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123","tenantId":3}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
LOG "流水: $(curl -s "http://127.0.0.1:3000/api/fund/transactions?page=1&pageSize=3" -H "Authorization: Bearer $TOKEN" | head -c 160)"
LOG "利润: $(curl -s "http://127.0.0.1:3000/api/reports/profit" -H "Authorization: Bearer $TOKEN" | head -c 160)"
LOG "收支: $(curl -s "http://127.0.0.1:3000/api/finance?page=1&pageSize=3" -H "Authorization: Bearer $TOKEN" | head -c 160)"

LOG "===== 全部完成 ====="
