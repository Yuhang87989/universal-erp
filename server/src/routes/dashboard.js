const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 获取今日汇总
router.get('/today', async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    // 今日销售额
    const [salesResult] = await pool.query(
      `SELECT COALESCE(SUM(actual_amount), 0) as total_sales, COUNT(*) as order_count
       FROM sales_orders WHERE tenant_id = ? AND DATE(order_date) = ? AND status = 'completed'`,
      [req.tenantId, today]
    );

    // 今日采购额
    const [purchaseResult] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_purchase, COUNT(*) as order_count
       FROM purchase_orders WHERE tenant_id = ? AND DATE(order_date) = ?`,
      [req.tenantId, today]
    );

    // 库存预警数
    const [alertResult] = await pool.query(
      `SELECT COUNT(*) as count FROM inventory i
       JOIN products p ON i.product_id = p.id
       WHERE i.tenant_id = ? AND i.quantity <= p.min_stock AND p.min_stock > 0 AND p.status != 'deleted'`,
      [req.tenantId]
    );

    // 商品总数
    const [productResult] = await pool.query(
      "SELECT COUNT(*) as count FROM products WHERE tenant_id = ? AND status = 'active'",
      [req.tenantId]
    );

    res.json({
      code: 0,
      data: {
        todaySales: parseFloat(salesResult[0].total_sales),
        todaySalesCount: salesResult[0].order_count,
        todayPurchase: parseFloat(purchaseResult[0].total_purchase),
        todayPurchaseCount: purchaseResult[0].order_count,
        stockAlertCount: alertResult[0].count,
        productCount: productResult[0].count,
        todayProfit: parseFloat(salesResult[0].total_sales) - parseFloat(purchaseResult[0].total_purchase)
      }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取概览数据失败' });
  }
});

// 获取近7天销售趋势
router.get('/trend', async (req, res) => {
  try {
    const [trend] = await pool.query(
      `SELECT DATE(order_date) as date,
              COALESCE(SUM(actual_amount), 0) as sales,
              COUNT(*) as order_count
       FROM sales_orders
       WHERE tenant_id = ? AND order_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             AND status = 'completed'
       GROUP BY DATE(order_date)
       ORDER BY date ASC`,
      [req.tenantId]
    );

    res.json({ code: 0, data: trend });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取趋势数据失败' });
  }
});

// 热销商品TOP10
router.get('/top-products', async (req, res) => {
  try {
    const [products] = await pool.query(
      `SELECT p.name, SUM(si.quantity) as total_qty, SUM(si.subtotal) as total_amount
       FROM sale_items si
       JOIN sales_orders so ON si.sales_order_id = so.id
       JOIN products p ON si.product_id = p.id
       WHERE so.tenant_id = ? AND so.status = 'completed'
             AND so.order_date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY si.product_id
       ORDER BY total_amount DESC
       LIMIT 10`,
      [req.tenantId]
    );

    res.json({ code: 0, data: products });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取热销商品失败' });
  }
});

module.exports = router;
