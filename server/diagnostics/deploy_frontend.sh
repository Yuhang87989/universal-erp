#!/bin/bash
# 前端热更新+构建+部署（在服务器执行，nohup bash 跑，日志 /tmp/deploy_fe.log）
set -e
TS=$(date +%Y%m%d%H%M)
WORK=/tmp/erp_fe_$TS
mkdir -p "$WORK" && cd "$WORK"

echo "=== 1. 拉取最新代码 ==="
curl -sL "https://gh-proxy.com/https://github.com/Yuhang87989/universal-erp/archive/refs/heads/main.tar.gz?t=$TS" -o repo.tgz
tar xzf repo.tgz
cd universal-erp-main

echo "=== 2. 同步更新到 /opt/universal-erp ==="
\cp -f client/src/pages/Finance/FundImport.tsx /opt/universal-erp/client/src/pages/Finance/FundImport.tsx
echo "FundImport.tsx 已同步"

echo "=== 3. vite build（限制内存1.5G防OOM）==="
cd /opt/universal-erp/client
NODE_OPTIONS="--max-old-space-size=1536" npx vite build 2>&1 | tail -14

echo "=== 4. 探测 Nginx 前端目录 ==="
WEBROOT=""
for r in $(grep -rhoE "root[[:space:]]+[^;]+" /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf 2>/dev/null | awk '{print $2}' | tr -d ';'); do
  [ -f "$r/index.html" ] && WEBROOT="$r" && break
done
echo "前端目录: ${WEBROOT:-未找到}"
if [ -z "$WEBROOT" ]; then
  echo "⚠️ 未自动找到前端目录，产物在 /opt/universal-erp/client/dist，请手动同步"
  exit 0
fi

echo "=== 5. 备份旧前端并部署 ==="
cp -r "$WEBROOT" "${WEBROOT}.bak_$TS" 2>/dev/null || echo "(备份跳过)"
\cp -rf /opt/universal-erp/client/dist/. "$WEBROOT/"

echo "=== 6. 验证 ==="
curl -s -o /dev/null -w "首页HTTP: %{http_code}\n" https://erp.qiuyhang1688.com.cn/
ls -t "$WEBROOT"/assets/*.js 2>/dev/null | head -3
echo "✅ 前端部署完成。手机浏览器强制刷新页面（微信右上角···→刷新，或清缓存），再重新导入流水"
