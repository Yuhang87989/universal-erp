const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const inventoryRoutes = require('./routes/inventory');
const purchaseRoutes = require('./routes/purchases');
const salesRoutes = require('./routes/sales');
const customerRoutes = require('./routes/customers');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/reports');
const ecommerceRoutes = require('./routes/ecommerce');
const tenantRoutes = require('./routes/tenants');
const suppliersRoutes = require('./routes/suppliers');
const financeRoutes = require('./routes/finance');
const accountingAccountsRoutes = require('./routes/accounting_accounts');
const voucherRoutes = require('./routes/vouchers');
const sealRoutes = require('./routes/seals');
const stocktakeRoutes = require('./routes/stocktakes');
const warehouseRoutes = require('./routes/warehouses');
const stockInRoutes = require('./routes/stock_in');
const stockOutRoutes = require('./routes/stock_out');
const stockTransferRoutes = require('./routes/stock_transfer');
const paymentRoutes = require('./routes/payment');
const analyticsRoutes = require('./routes/analytics');
const alertRoutes = require('./routes/alerts');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/ecommerce', ecommerceRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/accounts', accountingAccountsRoutes);
app.use('/api/vouchers', voucherRoutes);
app.use('/api/seals', sealRoutes);
app.use('/api/inventory/stocktake', stocktakeRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/stock-in', stockInRoutes);
app.use('/api/stock-out', stockOutRoutes);
app.use('/api/transfers', stockTransferRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/ai', aiRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 统一错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 ERP后端服务启动: http://localhost:${PORT}`);
  console.log(`📋 环境: ${process.env.NODE_ENV || 'development'}`);
});
