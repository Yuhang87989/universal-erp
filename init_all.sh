#!/bin/bash
set -e
export PATH=/usr/local/bin:$PATH
cd /opt/universal-erp

echo "📦 1/5 拉取最新代码..."
git pull origin main

echo "🔨 2/5 重建数据库..."
mysql -u erp_user -p'Erp@Secure2026' -e "DROP DATABASE IF EXISTS erp_db; CREATE DATABASE erp_db DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "📋 3/5 建表..."
mysql -u erp_user -p'Erp@Secure2026' erp_db < server/prisma/schema.sql

echo "🎬 4/5 生成演示数据..."
cd server && node seed_demo.js

echo "🔄 5/5 重启ERP服务..."
systemctl restart erp-server
sleep 2

echo ""
echo "=========================================="
echo "✅ 全部完成！访问: https://erp.qiuyhang1688.com.cn"
echo "   账号: admin / admin123"
echo "=========================================="
