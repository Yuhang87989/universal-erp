#!/bin/bash
# 全量部署：按 commit SHA 拉完整仓库tarball（SHA每次不同，gh-proxy无法缓存），
# 前端/后端源码全量同步后再构建。比"只拉改动文件"可靠（避免漏传依赖文件）。
set -e
SHA="5e88233231989431fa47e6f5fb4a2e63ba287fa2"   # 代码更新后改这里（用已验证可下载的main HEAD）
APP=/opt/universal-erp
URL="https://gh-proxy.com/https://github.com/Yuhang87989/universal-erp/archive/${SHA}.tar.gz"

WORK=/tmp/erp_deploy
rm -rf "$WORK"; mkdir -p "$WORK"; cd "$WORK"
echo "========== 1. 拉取完整仓库 (${SHA:0:7}) =========="
curl -sL "$URL" -o repo.tar.gz
[ -s repo.tar.gz ] || { echo "❌ 下载失败"; exit 1; }
tar -xzf repo.tar.gz
SRC=$(find "$WORK" -maxdepth 1 -type d -name "universal-erp-*" | head -1)
echo "源码目录: $SRC"
grep -q "零钱通" "$SRC/client/src/pages/Finance/FundImport.tsx" || { echo "❌ 拉到的代码非最新（缺新解析器），SHA可能要更新"; exit 1; }
grep -q "跨会计准则" "$SRC/server/src/services/voucher_generator.js" || { echo "❌ 拉到的代码非最新（缺后端修复）"; exit 1; }
echo "✅ 代码版本校验通过"

echo "========== 2. 同步后端源码（保留 .env / node_modules）=========="
cp -rf "$SRC/server/src/." "$APP/server/src/"
cp -f "$SRC"/server/diagnostics/*.js "$APP/server/diagnostics/" 2>/dev/null || true
cp -f "$SRC"/server/diagnostics/*.sh "$APP/server/diagnostics/" 2>/dev/null || true
node --check "$APP/server/src/services/voucher_generator.js" && echo "  voucher_generator ✅"
node --check "$APP/server/src/routes/tenants.js" && echo "  tenants ✅"

echo "========== 3. 重启后端 =========="
systemctl restart erp-server
sleep 3
echo "后端状态: $(systemctl is-active erp-server)"

echo "========== 4. 数据补齐 + 随手记账套（幂等）=========="
node "$APP/server/diagnostics/seed_tenant_basics.js"
node "$APP/server/diagnostics/create_personal_book.js" || true

echo "========== 5. 同步前端源码（全量，保留 node_modules / dist）=========="
cp -rf "$SRC/client/src/." "$APP/client/src/"
cp -f "$SRC/client/index.html" "$APP/client/index.html"
[ -f "$SRC/client/package.json" ] && cp -f "$SRC/client/package.json" "$APP/client/package.json"
[ -f "$SRC/client/vite.config.ts" ] && cp -f "$SRC/client/vite.config.ts" "$APP/client/vite.config.ts"
[ -f "$SRC/client/tsconfig.json" ] && cp -f "$SRC/client/tsconfig.json" "$APP/client/tsconfig.json"
[ -d "$SRC/client/public" ] && cp -rf "$SRC/client/public/." "$APP/client/public/"
echo "前端源码已全量同步"

echo "========== 6. 构建前端 =========="
cd "$APP/client"
NODE_OPTIONS="--max-old-space-size=1536" npx vite build 2>&1 | tail -8

echo "========== 7. 部署 & 验证 =========="
WEBROOT=""
for r in $(grep -rhoE "root[[:space:]]+[^;]+" /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf 2>/dev/null | grep -v "api/uploads" | awk '{print $2}' | tr -d ';' | sort -u); do
  [ -f "$r/index.html" ] && WEBROOT="$r" && break
done
DIST="$APP/client/dist"
if [ -n "$WEBROOT" ] && [ "$(cd "$DIST" && pwd -P)/" != "$(cd "$WEBROOT" 2>/dev/null && pwd -P)/" ]; then
  \cp -rf "$DIST"/. "$WEBROOT"/
  echo "已同步到 $WEBROOT"
else
  echo "Nginx 目录即构建目录，构建即部署"
fi

NEWJS=$(curl -s https://erp.qiuyhang1688.com.cn/ | grep -oE 'assets/index-[a-z0-9]+\.js' | head -1)
echo "最新主JS: $NEWJS"
curl -s "https://erp.qiuyhang1688.com.cn/$NEWJS" -o /tmp/_chk.js
grep -q "零钱通" /tmp/_chk.js && echo "✅ 流水导入新解析器已上线" || echo "⚠️ 流水解析器未进产物"
grep -q "感谢惠顾" /tmp/_chk.js && echo "✅ 小票打印模块已上线" || echo "⚠️ 小票模块未进产物"
grep -q "我的账本" /tmp/_chk.js && echo "✅ 随手记个人账本已上线" || echo "⚠️ 个人账本未进产物"
echo ""
echo "🎉 完成。手机强刷（微信···→刷新/清缓存）后验证："
echo "  ① 资金管理→导入微信账单 ② POS结算出小票 ③ 顶栏账套切换→随手记"
