#!/bin/bash
# 一键部署：后端（凭证跨准则+建账初始化）+ 老账套补齐 + 前端（流水导入+小票打印）
# nohup bash 跑，日志 /tmp/deploy_all.log
set -e
TS=$(date +%Y%m%d%H%M)
RAW="https://gh-proxy.com/https://raw.githubusercontent.com/Yuhang87989/universal-erp/main"
APP=/opt/universal-erp

fetch() {
  local rel="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  echo "拉取 $rel"
  curl -sL "$RAW/$rel?t=$TS-$(date +%N)" -o "$out"
  if head -c 200 "$out" | grep -qi "404: Not Found"; then echo "❌ 404: $rel"; exit 1; fi
}

echo "========== 1. 后端：凭证跨会计准则 + 建账初始化 =========="
fetch "server/src/services/voucher_generator.js" "$APP/server/src/services/voucher_generator.js"
fetch "server/src/routes/tenants.js"            "$APP/server/src/routes/tenants.js"
fetch "server/diagnostics/seed_tenant_basics.js"  "$APP/server/diagnostics/seed_tenant_basics.js"
fetch "server/diagnostics/create_personal_book.js" "$APP/server/diagnostics/create_personal_book.js"
echo "后端语法检查:"
node --check "$APP/server/src/services/voucher_generator.js" && echo "  voucher_generator ✅"
node --check "$APP/server/src/routes/tenants.js" && echo "  tenants ✅"
node --check "$APP/server/diagnostics/seed_tenant_basics.js" && echo "  seed脚本 ✅"
node --check "$APP/server/diagnostics/create_personal_book.js" && echo "  建账脚本 ✅"

echo "========== 2. 重启后端 =========="
systemctl restart erp-server
sleep 3
echo "后端状态: $(systemctl is-active erp-server)"
curl -s -o /dev/null -w "健康检查 HTTP: %{http_code}\n" https://erp.qiuyhang1688.com.cn/api/auth/me

echo "========== 3. 老账套补齐基础数据（幂等）=========="
node "$APP/server/diagnostics/seed_tenant_basics.js"

echo "========== 3.5 创建「随手记」个人账套（幂等）=========="
node "$APP/server/diagnostics/create_personal_book.js" || true

echo "========== 4. 前端：流水导入解析器 + 小票打印 =========="
fetch "client/src/pages/Finance/FundImport.tsx" "$APP/client/src/pages/Finance/FundImport.tsx"
fetch "client/src/components/ReceiptPrinter.tsx"   "$APP/client/src/components/ReceiptPrinter.tsx"
fetch "client/src/pages/POS/index.tsx"            "$APP/client/src/pages/POS/index.tsx"
fetch "client/src/pages/Sales/index.tsx"             "$APP/client/src/pages/Sales/index.tsx"
cd "$APP/client"
NODE_OPTIONS="--max-old-space-size=1536" npx vite build 2>&1 | tail -12

echo "========== 5. 前端部署 =========="
WEBROOT=""
for r in $(grep -rhoE "root[[:space:]]+[^;]+" /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf 2>/dev/null | grep -v "api/uploads" | awk '{print $2}' | tr -d ';' | sort -u); do
  [ -f "$r/index.html" ] && WEBROOT="$r" && break
done
DIST="$APP/client/dist"
if [ -n "$WEBROOT" ] && [ "$(cd "$DIST" && pwd -P)/" != "$(cd "$WEBROOT" 2>/dev/null && pwd -P)/" ]; then
  cp -r "$WEBROOT" "${WEBROOT}.bak_$TS" 2>/dev/null || true
  \cp -rf "$DIST"/. "$WEBROOT"/
  echo "已同步到 $WEBROOT"
else
  echo "Nginx 目录即构建目录，构建即部署"
fi

echo "========== 6. 验证 =========="
NEWJS=$(curl -s https://erp.qiuyhang1688.com.cn/ | grep -oE 'assets/index-[a-z0-9]+\.js' | head -1)
echo "最新主JS: $NEWJS"
curl -s "https://erp.qiuyhang1688.com.cn/$NEWJS" -o /tmp/_chk.js
grep -q "零钱通\|识别到表头" /tmp/_chk.js && echo "✅ 流水导入新解析器已上线" || echo "⚠️ 流水解析器未进产物"
grep -q "感谢惠顾" /tmp/_chk.js && echo "✅ 小票打印模块已上线" || echo "⚠️ 小票模块未进产物"
echo ""
echo "🎉 全部完成。手机强刷页面（微信···→刷新/清缓存）后："
echo "  ① POS收银结算→自动出小票 ②销售详情→打印小票 ③资金管理→导入微信账单"
