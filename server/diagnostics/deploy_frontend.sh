#!/bin/bash
# 前端热更新+构建+部署（在服务器执行，nohup bash 跑，日志 /tmp/deploy_fe.log）
# 直接从 GitHub raw 拉取改动文件（绕开 tarball 边缘缓存），同步后 vite build
set -e
TS=$(date +%Y%m%d%H%M)
RAW="https://gh-proxy.com/https://raw.githubusercontent.com/Yuhang87989/universal-erp/main"
APP=/opt/universal-erp
TMPD=/tmp/erp_fe_files_$TS
mkdir -p "$TMPD" && cd "$TMPD"

fetch() {
  # $1 = github 相对路径, $2 = 本地保存路径
  local rel="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  echo "拉取 $rel"
  curl -sL "$RAW/$rel?t=$TS-$(date +%N)" -o "$out"
  # 基本校验：JS/TS 文件应以正常字符开头、非404页面
  if head -c 200 "$out" | grep -qi "404: Not Found"; then
    echo "❌ 拉取失败(404): $rel"; exit 1
  fi
}

echo "=== 1. 拉取本次改动的前端源码 ==="
fetch "client/src/pages/Finance/FundImport.tsx" "$APP/client/src/pages/Finance/FundImport.tsx"
fetch "client/src/components/ReceiptPrinter.tsx"   "$APP/client/src/components/ReceiptPrinter.tsx"
fetch "client/src/pages/POS/index.tsx"            "$APP/client/src/pages/POS/index.tsx"
fetch "client/src/pages/Sales/index.tsx"          "$APP/client/src/pages/Sales/index.tsx"
echo "源码同步完成"

echo "=== 2. vite build（限制内存1.5G防OOM）==="
cd "$APP/client"
NODE_OPTIONS="--max-old-space-size=1536" npx vite build 2>&1 | tail -14

echo "=== 3. 确认 Nginx 前端目录 ==="
WEBROOT=""
for r in $(grep -rhoE "root[[:space:]]+[^;]+" /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf 2>/dev/null | grep -v "api/uploads" | awk '{print $2}' | tr -d ';' | sort -u); do
  [ -f "$r/index.html" ] && WEBROOT="$r" && break
done
echo "Nginx 前端目录: ${WEBROOT:-未找到}"

DIST="$APP/client/dist"
if [ -z "$WEBROOT" ]; then
  echo "构建产物在 $DIST（未找到独立Nginx目录，若Nginx直接指向dist则已生效）"
elif [ "$(cd "$DIST" && pwd -P)/" = "$(cd "$(dirname "$WEBROOT")" 2>/dev/null && pwd -P)/$(basename "$WEBROOT")/" ]; then
  echo "Nginx 目录就是构建产物目录，构建即部署，无需复制"
else
  echo "=== 4. 部署到 $WEBROOT ==="
  cp -r "$WEBROOT" "${WEBROOT}.bak_$TS" 2>/dev/null || echo "(备份跳过)"
  \cp -rf "$DIST"/. "$WEBROOT"/
  echo "已同步到 Nginx 目录"
fi

echo "=== 5. 验证 ==="
curl -s -o /dev/null -w "首页HTTP: %{http_code}\n" https://erp.qiuyhang1688.com.cn/
NEWJS=$(curl -s https://erp.qiuyhang1688.com.cn/ | grep -oE 'assets/index-[a-z0-9]+\.js' | head -1)
echo "最新主JS: $NEWJS"
curl -s "https://erp.qiuyhang1688.com.cn/$NEWJS" -o /tmp/_check.js
if grep -q "识别到表头\|零钱通" /tmp/_check.js; then echo "✅ 新流水解析器已上线"; else echo "⚠️ 未检测到新解析器，可能有缓存，请强刷"; fi
if grep -q "销售 小 票\|销 售 小 票\|感谢惠顾" /tmp/_check.js; then echo "✅ 小票打印模块已上线"; else echo "⚠️ 未检测到小票模块（若仅改了文案属正常）"; fi
echo ""
echo "✅ 部署流程完成。手机强制刷新页面（微信右上角···→刷新/清缓存）后：①POS结算出小票 ②资金管理导入微信账单"
