#!/bin/bash
export PATH=/usr/local/bin:$PATH
cd /opt/universal-erp/server

echo "Cleaning tables..."
mysql -u erp_user -pErp@Secure2026 erp_db <<'SQLEOF'
SET FOREIGN_KEY_CHECKS=0;
TRUNCATE TABLE sale_items;
TRUNCATE TABLE purchase_items;
TRUNCATE TABLE ecommerce_platforms;
TRUNCATE TABLE finance_records;
TRUNCATE TABLE purchase_orders;
TRUNCATE TABLE sales_orders;
TRUNCATE TABLE inventory;
TRUNCATE TABLE products;
TRUNCATE TABLE categories;
TRUNCATE TABLE customers;
TRUNCATE TABLE suppliers;
SET FOREIGN_KEY_CHECKS=1;
SQLEOF
echo "Tables cleaned."

echo "Running seed_demo.js..."
node seed_demo.js

echo "Restarting erp-server..."
systemctl restart erp-server
echo "ALL DONE"
