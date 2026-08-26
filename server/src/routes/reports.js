const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// 综合报表 - 营收趋势
router.get('/revenue', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, groupBy = 'day' } = req.query;

    let dateFormat;
    switch (groupBy) {
      case 'week': dateFormat = '%x-W%v'; break;
      case 'month': dateFormat = '%Y-%m'; break;
      default: dateFormat = '%Y-%m-%d';
    }

    let dateFilter = '';
    const params = [tenantId];
    if (startDate) { dateFilter += ' AND DATE(so.created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(so.created_at) <= ?'; params.push(endDate); }
    if (!startDate && !endDate) {
      dateFilter = ' AND so.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(
      `SELECT DATE_FORMAT(so.created_at, ?) as period,
              COUNT(*) as orderCount,
              SUM(so.total_amount) as revenue,
              AVG(so.total_amount) as avgOrderAmount
       FROM sales_orders so
       WHERE so.tenant_id = ? ${dateFilter}
       GROUP BY period ORDER BY period`,
      [dateFormat, ...params]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('营收报表查询失败:', err);
    res.status(500).json({ message: '查询失败' });
  }
});

// 商品销售排行
router.get('/top-products', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = 20 } = req.query;

    let dateFilter = '';
    const params = [tenantId];
    if (startDate) { dateFilter += ' AND DATE(so.created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(so.created_at) <= ?'; params.push(endDate); }
    if (!startDate && !endDate) {
      dateFilter = ' AND so.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(
      `SELECT p.id, p.name, p.barcode, p.category_id, c.name as category_name,
              SUM(si.quantity) as totalQty,
              SUM(si.quantity * si.unit_price) as totalRevenue,
              AVG(si.unit_price) as avgPrice,
              COUNT(DISTINCT so.id) as orderCount
       FROM sale_items si
       JOIN sales_orders so ON si.sales_order_id = so.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE so.tenant_id = ? ${dateFilter}
       GROUP BY p.id ORDER BY totalRevenue DESC LIMIT ?`,
      [...params, Number(limit)]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('商品排行查询失败:', err);
    res.status(500).json({ message: '查询失败' });
  }
});

// 分类销售统计
router.get('/category-stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [tenantId];
    if (startDate) { dateFilter += ' AND DATE(so.created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(so.created_at) <= ?'; params.push(endDate); }
    if (!startDate && !endDate) {
      dateFilter = ' AND so.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(
      `SELECT c.id, c.name,
              COUNT(DISTINCT p.id) as productCount,
              SUM(si.quantity) as totalQty,
              SUM(si.quantity * si.unit_price) as totalRevenue
       FROM sale_items si
       JOIN sales_orders so ON si.sales_order_id = so.id
       JOIN products p ON si.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE so.tenant_id = ? ${dateFilter}
       GROUP BY c.id ORDER BY totalRevenue DESC`,
      [...params]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('分类统计查询失败:', err);
    res.status(500).json({ message: '查询失败' });
  }
});

// 客户消费分析
router.get('/customer-stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate, limit = 50 } = req.query;

    let dateFilter = '';
    const params = [tenantId];
    if (startDate) { dateFilter += ' AND DATE(so.created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(so.created_at) <= ?'; params.push(endDate); }
    if (!startDate && !endDate) {
      dateFilter = ' AND so.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(
      `SELECT cu.id, cu.name, cu.phone,
              COUNT(so.id) as orderCount,
              SUM(so.total_amount) as totalSpend,
              AVG(so.total_amount) as avgOrderAmount,
              MIN(so.created_at) as firstOrder,
              MAX(so.created_at) as lastOrder
       FROM sales_orders so
       LEFT JOIN customers cu ON so.customer_id = cu.id
       WHERE so.tenant_id = ? AND so.customer_id IS NOT NULL ${dateFilter}
       GROUP BY cu.id ORDER BY totalSpend DESC LIMIT ?`,
      [...params, Number(limit)]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('客户分析查询失败:', err);
    res.status(500).json({ message: '查询失败' });
  }
});

// 支付方式统计
router.get('/payment-stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate } = req.query;

    let dateFilter = '';
    const params = [tenantId];
    if (startDate) { dateFilter += ' AND DATE(created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(created_at) <= ?'; params.push(endDate); }
    if (!startDate && !endDate) {
      dateFilter = ' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    }

    const [rows] = await db.query(
      `SELECT payment_method,
              COUNT(*) as orderCount,
              SUM(total_amount) as totalAmount
       FROM sales_orders
       WHERE tenant_id = ? ${dateFilter}
       GROUP BY payment_method ORDER BY totalAmount DESC`,
      [tenantId, ...params]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('支付方式统计失败:', err);
    res.status(500).json({ message: '查询失败' });
  }
});

// 库存周转分析
router.get('/inventory-turnover', async (req, res) => {
  try {
    const tenantId = req.tenantId;

    const [rows] = await db.query(
      `SELECT p.id, p.name, p.barcode, c.name as category_name,
              i.quantity as stockQty,
              p.cost_price,
              i.quantity * p.cost_price as stockValue,
              COALESCE(sold.totalSold, 0) as soldQty30d,
              CASE WHEN i.quantity > 0 THEN COALESCE(sold.totalSold, 0) / i.quantity ELSE 0 END as turnoverRate,
              CASE
                WHEN i.quantity = 0 THEN '无库存'
                WHEN COALESCE(sold.totalSold, 0) = 0 THEN '滞销'
                WHEN COALESCE(sold.totalSold, 0) / i.quantity < 0.5 THEN '偏慢'
                WHEN COALESCE(sold.totalSold, 0) / i.quantity > 3 THEN '畅销'
                ELSE '正常'
              END as status
       FROM products p
       JOIN inventory i ON p.id = i.product_id AND i.tenant_id = ?
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN (
         SELECT si.product_id, SUM(si.quantity) as totalSold
         FROM sale_items si
         JOIN sales_orders so ON si.sales_order_id = so.id
         WHERE so.tenant_id = ? AND so.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY si.product_id
       ) sold ON p.id = sold.product_id
       WHERE p.tenant_id = ?
       ORDER BY stockValue DESC`,
      [tenantId, tenantId, tenantId]
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('库存周转分析失败:', err);
    res.status(500).json({ message: '查询失败' });
  }
});

// 利润分析
router.get('/profit', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { startDate, endDate } = req.query;

    let dateFilter = ' AND so.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
    const params = [tenantId];
    if (startDate) { dateFilter = ' AND so.created_at >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND so.created_at <= ?'; params.push(endDate); }

    // 总营收
    const [[revenue]] = await db.query(
      `SELECT IFNULL(SUM(total_amount), 0) as total FROM sales_orders WHERE tenant_id = ? ${dateFilter}`,
      params
    );

    // 总销售成本（用商品成本价计算）
    const [[cost]] = await db.query(
      `SELECT IFNULL(SUM(si.quantity * p.cost_price), 0) as total
       FROM sale_items si
       JOIN sales_orders so ON si.sales_order_id = so.id
       JOIN products p ON si.product_id = p.id
       WHERE so.tenant_id = ? ${dateFilter}`,
      params
    );

    // 总采购金额
    const [[purchaseCost]] = await db.query(
      `SELECT IFNULL(SUM(total_amount), 0) as total FROM purchase_orders WHERE tenant_id = ? AND status = 'received'`,
      [tenantId]
    );

    const totalRevenue = revenue.total;
    const totalCost = cost.total;
    const grossProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue * 100).toFixed(1) : 0;

    res.json({
      data: {
        totalRevenue: Number(totalRevenue),
        totalCost: Number(totalCost),
        grossProfit: Number(grossProfit),
        profitMargin: Number(profitMargin),
        purchaseCost: Number(purchaseCost.total)
      }
    });
  } catch (err) {
    console.error('利润分析失败:', err);
    res.status(500).json({ message: '查询失败: ' + err.message });
  }
});

module.exports = router;
