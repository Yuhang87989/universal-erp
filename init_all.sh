#!/bin/bash
set -e
export PATH=/usr/local/bin:$PATH
cd /opt/universal-erp/server

echo "📋 1/4 建表..."
mysql -u erp_user -p'Erp@Secure2026' erp_db < prisma/schema.sql 2>/dev/null

echo "🏪 2/4 创建帐套..."
node init_tenants.js

echo "🎬 3/4 生成演示数据..."
node seed_demo.js

echo "🔄 4/4 重启ERP服务..."
systemctl restart erp-server
sleep 2

echo ""
echo "=========================================="
echo "✅ 全部完成！访问: https://erp.qiuyhang1688.com.cn"
echo "   账号: admin / admin123"
echo "=========================================="
