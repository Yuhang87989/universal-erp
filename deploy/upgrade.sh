#!/bin/bash
# ============================================
# ERP一键升级脚本（从GitHub拉取）
# 在8月22日镜像恢复后的服务器上执行
# ============================================
set -o pipefail

APP_DIR="/opt/universal-erp"
PORTAL_DIR="/var/www/portal"
DB_USER="erp_user"
DB_PASS="Erp@Secure2026"
DB_NAME="erp_db"
DEEPSEEK_KEY="${DEEPSEEK_KEY:-}"

if [ -z "$DEEPSEEK_KEY" ]; then
  echo "请输入DeepSeek API Key:"
  read -rs DEEPSEEK_KEY
  echo ""
fi

echo "=========================================="
echo "  ERP + 认知小站 一键升级"
echo "=========================================="

# ========== 第一部分：ERP ==========
if [ ! -d "$APP_DIR" ]; then
  echo "❌ $APP_DIR 不存在，请确认镜像恢复正确"
  exit 1
fi

echo ""
echo "========== [1/7] ERP：备份当前版本 =========="
BACKUP_DIR="/opt/erp_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r "$APP_DIR/server/src" "$BACKUP_DIR/server_src" 2>/dev/null || true
cp -r "$APP_DIR/client/src" "$BACKUP_DIR/client_src" 2>/dev/null || true
echo "✅ 备份到 $BACKUP_DIR"

echo ""
echo "========== [2/7] ERP：从GitHub拉取最新代码 =========="
cd "$APP_DIR"
git fetch --all
git reset --hard origin/main
echo "✅ 代码已更新"

echo ""
echo "========== [3/7] ERP：数据库迁移 =========="
cd "$APP_DIR/server"
for sql in finance_upgrade.sql warehouse_upgrade.sql payment_analytics_upgrade.sql; do
  echo "  → $sql"
  mysql --force -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "db/$sql" 2>&1 || echo "    ⚠️ 表可能已存在，继续"
done
echo "  → demo_seed.sql（4套演示账套）"
mysql --force -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < db/demo_seed.sql 2>&1 || echo "⚠️ seed有警告但已跳过"
echo "✅ 数据库迁移完成"

echo ""
echo "========== [4/7] ERP：验证演示数据 =========="
mysql --force -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < db/verify_demo.sql 2>&1 | head -30


echo ""
echo "========== [3.5/7] ERP：配置环境变量 =========="
cat > "$APP_DIR/server/.env" << 'ENV'
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=erp_db
DB_USER=erp_user
DB_PASSWORD=Erp@Secure2026
JWT_SECRET=erp-jwt-secret-2026-production
JWT_EXPIRES_IN=7d
PORT=3000
ENV
echo "✅ .env 已配置"

echo ""
echo "========== [5/7] ERP：前端构建 =========="
cd "$APP_DIR/client"
npm install 2>&1 | tail -3 || echo '⚠️ npm install有警告，继续'
npm run build 2>&1 | tail -5 || { echo '❌ 前端构建失败'; exit 1; }
echo "✅ 前端构建完成"

echo ""
echo "========== [6/7] ERP：配置环境变量+重启 =========="
SERVICE_FILE="/etc/systemd/system/erp-server.service"
if [ -f "$SERVICE_FILE" ]; then
  if ! grep -q "DEEPSEEK_API_KEY" "$SERVICE_FILE"; then
    sed -i "/\[Service\]/a Environment=\"DEEPSEEK_API_KEY=$DEEPSEEK_KEY\"" "$SERVICE_FILE"
  else
    sed -i "s|Environment=\"DEEPSEEK_API_KEY=.*\"|Environment=\"DEEPSEEK_API_KEY=$DEEPSEEK_KEY\"|" "$SERVICE_FILE"
  fi
  systemctl daemon-reload
  systemctl restart erp-server
  sleep 2
  systemctl status erp-server --no-pager | head -8
else
  pm2 restart erp-server 2>/dev/null || pm2 start src/index.js --name erp-server
fi

# ========== 第二部分：认知小站 ==========
echo ""
echo "========== [7/7] 认知小站：还原no-AI版本 =========="
mkdir -p "$PORTAL_DIR"
if [ "$(ls -A $PORTAL_DIR 2>/dev/null)" ]; then
  cp -r "$PORTAL_DIR" "/var/www/portal_backup_$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
fi
rm -rf "${PORTAL_DIR:?}"/*
cd "$APP_DIR/deploy"
unzip -o cognitive-training-h5-noai.zip -d "$PORTAL_DIR" > /dev/null 2>&1
echo "✅ 认知小站已还原"

# 确保nginx配置
if [ ! -f /etc/nginx/conf.d/erp.conf ]; then
  cat > /etc/nginx/conf.d/erp.conf << 'NGINX'
server {
    listen 80;
    server_name erp.qiuyhang1688.com.cn;
    root /opt/universal-erp/client/dist;
    index index.html;
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location / { try_files $uri $uri/ /index.html; }
}
NGINX
fi
nginx -t 2>&1 && systemctl reload nginx

echo ""
echo "=========================================="
echo "  ✅ 全部完成！"
echo "=========================================="
echo ""
echo "认知小站:  https://qiuyhang1688.com.cn"
echo "ERP系统:   http://erp.qiuyhang1688.com.cn"
echo ""
echo "ERP演示账号（密码 admin123）："
echo "  账套2 - 鲜惠社区生鲜超市（2仓库+调拨）"
echo "  账套3 - 悦选数码电商"
echo "  账套4 - 康美大药房"
echo "  账套5 - 美味烘焙工坊"
