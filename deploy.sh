#!/bin/bash
# ================================================
# 通用电商ERP 一键部署脚本
# 目标服务器: 139.155.129.27 (CentOS 7.6)
# 用法: bash deploy.sh
# ================================================
set -e

APP_DIR="/opt/universal-erp"
DB_NAME="erp_db"
DB_USER="erp_user"
DB_PASS="Erp@Secure2026"
NODE_VER=20

echo "=========================================="
echo "  通用电商ERP 一键部署"
echo "=========================================="

# ---------- 1. 安装基础依赖 ----------
echo "[1/7] 安装基础依赖..."
yum install -y epel-release yum-utils
yum install -y wget git curl

# ---------- 2. 安装 Node.js ----------
echo "[2/7] 安装 Node.js ${NODE_VER}..."
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt $NODE_VER ]]; then
    curl -fsSL https://rpm.nodesource.com/setup_${NODE_VER}.x | bash -
    yum install -y nodejs
fi
echo "  Node: $(node -v)  NPM: $(npm -v)"

# ---------- 3. 安装 MySQL 8.0 ----------
echo "[3/7] 安装 MySQL 8.0..."
if ! command -v mysqld &>/dev/null; then
    yum install -y https://dev.mysql.com/get/mysql80-community-release-el7-11.noarch.rpm 2>/dev/null || true
    yum install -y mysql-community-server --enablerepo=mysql80-community
fi
systemctl enable mysqld
systemctl start mysqld

# 获取 MySQL 初始密码并修改
if [ -f /var/log/mysqld.log ]; then
    TEMP_PASS=$(grep 'temporary password' /var/log/mysqld.log | tail -1 | awk '{print $NF}')
fi

mysql -u root -e "SELECT 1" &>/dev/null 2>&1 && MYSQL_ROOT_CMD="mysql -u root" || {
    if [ -n "$TEMP_PASS" ]; then
        mysql -u root -p"$TEMP_PASS" --connect-expired-password -e "
            ALTER USER 'root'@'localhost' IDENTIFIED BY 'Root@Secure2026';
            CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
            GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
            FLUSH PRIVILEGES;
        " 2>/dev/null
    else
        echo "  MySQL root已配置，跳过初始化"
    fi
}

# 确保数据库和用户存在（root已改密码的情况）
mysql -u root -p'Root@Secure2026' -e "
    CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
    GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
    FLUSH PRIVILEGES;
" 2>/dev/null || true

echo "  MySQL 8.0 就绪"

# ---------- 4. 拉取代码 ----------
echo "[4/7] 拉取代码..."
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR" && git pull origin main
else
    git clone https://github.com/Yuhang87989/universal-erp.git "$APP_DIR"
    cd "$APP_DIR"
fi

# ---------- 5. 安装后端依赖 & 初始化数据库 ----------
echo "[5/7] 安装后端依赖 & 初始化数据库..."
cd "$APP_DIR/server"
npm install --production

# 写入 .env
cat > .env << EOF
DB_HOST=localhost
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
JWT_SECRET=erp-jwt-secret-$(date +%s | md5sum | head -c 32)
PORT=3000
EOF

# 初始化数据库表
mysql -u ${DB_USER} -p"${DB_PASS}" ${DB_NAME} < prisma/schema.sql 2>/dev/null || echo "  数据库表已存在或已初始化"

# ---------- 6. 安装前端依赖 & 构建 ----------
echo "[6/7] 构建前端..."
cd "$APP_DIR/client"
npm install
npm run build

# ---------- 7. 配置 Systemd 服务 ----------
echo "[7/7] 配置系统服务..."

cat > /etc/systemd/system/erp-server.service << EOF
[Unit]
Description=Universal ERP Server
After=network.target mysqld.service

[Service]
Type=simple
User=root
WorkingDirectory=${APP_DIR}/server
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable erp-server
systemctl restart erp-server

# 配置 Nginx 反向代理（前端静态文件 + API代理）
cat > /etc/nginx/conf.d/erp.conf << 'NGINX'
server {
    listen 80;
    server_name erp.qiuyhang1688.com.cn;

    root /opt/universal-erp/client/dist;
    index index.html;

    # 前端静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

# 如果 nginx 没装
if ! command -v nginx &>/dev/null; then
    yum install -y nginx
fi
systemctl enable nginx
nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
echo "  ✅ 部署完成！"
echo "=========================================="
echo ""
echo "  访问地址: http://erp.qiuyhang1688.com.cn"
echo "  后台API:  http://erp.qiuyhang1688.com.cn/api"
echo "  默认账号: admin / admin123"
echo ""
echo "  管理命令:"
echo "    systemctl status erp-server    # 查看服务状态"
echo "    systemctl restart erp-server   # 重启服务"
echo "    journalctl -u erp-server -f    # 查看日志"
echo "=========================================="
