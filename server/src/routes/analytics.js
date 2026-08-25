const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 销售趋势（近N天/月）
router.get('/sales-trend', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    let startDate, groupBy;
    if (period === '12m') {
      startDate = dayjs().subtract(12, 'month').format('YYYY-MM-DD');
      groupBy = 'DATE_FORMAT(order_date, "%Y-%m")';
    } else {
      startDate = dayjs().subtract(parseInt(period), 'day').format('YYYY-MM-DD');
      groupBy = 'DATE(order_date)';
    }
    const [rows] = await pool.query(
      `SELECT ${groupBy} as date, COUNT(*) as order_count,
              COALESCE(SUM(total_amount), 0) as total_amount,
              COALESCE(SUM(actual_amount), 0) as actual_amount
       FROM sales_orders WHERE tenant_id = ? AND status != 'cancelled' AND order_date >= ?
       GROUP BY date ORDER BY date ASC`,
      [req.tenantId, startDate]
    );
    res.json({ code: 0, data: rows });
  } catch (err) { res.status(500).json({ code: 500, message: err.message }); }
});

// 采购趋势
router.get('/purchase-trend', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    let startDate, groupBy;
    if (period === '12m') {
      startDate = dayjs().subtract(12, 'month').format('YYYY-MM-DD');
      groupBy = 'DATE_FORMAT(order_date, "%Y-%m")';
    } else {
      startDate = dayjs().subtract(parseInt(period), 'day').format('YYYY-MM-DD');
      groupBy = 'DATE(order_date)';
    }
    const [rows] = await pool.query(
      `SELECT ${groupBy} as date, COUNT(*) as order_count, COALESCE(SUM(total_amount), 0) as total_amount
       FROM purchase_orders WHERE tenant_id = ? AND status != 'cancelled' AND order_date >= ?
       GROUP BY date ORDER BY date ASC`,
      [req.tenantId, startDate]
    );
    res.json({ code: 0, data: rows });
  } catch (err) { res.status(500).json({ code: 500, message: err.message }); }
});

// 商品销售排行
router.get('/product-ranking', async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;
    let where = 'WHERE so.tenant_id = ? AND so.status != "cancelled"';
    const params = [req.tenantId];
    if (startDate) { where += ' AND so.order_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND so.order_date <= ?'; params.push(endDate + ' 23:59:59'); }
    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.unit, p.barcode,
              COALESCE(SUM(si.quantity), 0) as total_qty,
              COALESCE(SUM(si.subtotal), 0) as total_amount
       FROM sale_items si JOIN sales_orders so ON si.sales_order_id = so.id
       JOIN products p ON si.product_id = p.id ${where}
       GROUP BY p.id ORDER BY total_amount DESC LIMIT ?`,
      [...params, parseInt(limit)]
    );
    res.json({ code: 0, data: rows });
  } catch (err) { res.status(500).json({ code: 500, message: err.message }); }
});

// 库存价值分析（按分类汇总）
router.get('/inventory-value', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.name as category_name, COUNT(DISTINCT i.product_id) as sku_count,
              COALESCE(SUM(i.quantity), 0) as total_qty,
              COALESCE(SUM(i.quantity * p.cost_price), 0) as cost_value,
              COALESCE(SUM(i.quantity * p.sell_price), 0) as sell_value
       FROM inventory i JOIN products p ON i.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE i.tenant_id = ? AND p.status != 'deleted'
       GROUP BY c.id ORDER BY cost_value DESC`,
      [req.tenantId]
    );
    res.json({ code: 0, data: rows });
  } catch (err) { res.status(500).json({ code: 500, message: err.message }); }
});

// 收支利润分析
router.get('/profit-analysis', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const startDate = period === '12m'
      ? dayjs().subtract(12, 'month').format('YYYY-MM-DD')
      : dayjs().subtract(parseInt(period), 'day').format('YYYY-MM-DD');
    const groupBy = period === '12m' ? 'DATE_FORMAT(record_date, "%Y-%m")' : 'DATE(record_date)';
    const [rows] = await pool.query(
      `SELECT ${groupBy} as date,
              SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
              SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense,
              SUM(CASE WHEN type='income' THEN amount ELSE -amount END) as profit
       FROM finance_records WHERE tenant_id = ? AND record_date >= ?
       GROUP BY date ORDER BY date ASC`,
      [req.tenantId, startDate]
    );
    res.json({ code: 0, data: rows });
  } catch (err) { res.status(500).json({ code: 500, message: err.message }); }
});

// 入库出库趋势
router.get('/stock-movement', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const startDate = period === '12m'
      ? dayjs().subtract(12, 'month').format('YYYY-MM-DD')
      : dayjs().subtract(parseInt(period), 'day').format('YYYY-MM-DD');
    const groupBy = period === '12m' ? 'DATE_FORMAT(created_at, "%Y-%m")' : 'DATE(created_at)';
    const [inRows] = await pool.query(
      `SELECT ${groupBy} as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as cnt
       FROM stock_in_orders WHERE tenant_id = ? AND status = 'confirmed' AND created_at >= ? GROUP BY date`,
      [req.tenantId, startDate]
    );
    const [outRows] = await pool.query(
      `SELECT ${groupBy} as date, COALESCE(SUM(total_amount), 0) as amount, COUNT(*) as cnt
       FROM stock_out_orders WHERE tenant_id = ? AND status = 'confirmed' AND created_at >= ? GROUP BY date`,
      [req.tenantId, startDate]
    );
    res.json({ code: 0, data: { stock_in: inRows, stock_out: outRows } });
  } catch (err) { res.status(500).json({ code: 500, message: err.message }); }
});

// 核心指标汇总
router.get('/summary', async (req, res) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');

    const [[todaySales]] = await pool.query(
      `SELECT COUNT(*) as order_count, COALESCE(SUM(actual_amount), 0) as amount
       FROM sales_orders WHERE tenant_id = ? AND DATE(order_date) = ? AND status != 'cancelled'`,
      [req.tenantId, today]
    );
    const [[monthSales]] = await pool.query(
      `SELECT COUNT(*) as order_count, COALESCE(SUM(actual_amount), 0) as amount
       FROM sales_orders WHERE tenant_id = ? AND order_date >= ? AND status != 'cancelled'`,
      [req.tenantId, monthStart]
    );
    const [[monthPurchase]] = await pool.query(
      `SELECT COUNT(*) as order_count, COALESCE(SUM(total_amount), 0) as amount
       FROM purchase_orders WHERE tenant_id = ? AND order_date >= ? AND status != 'cancelled'`,
      [req.tenantId, monthStart]
    );
    const [[inventoryValue]] = await pool.query(
      `SELECT COALESCE(SUM(i.quantity * p.cost_price), 0) as cost_value,
              COALESCE(SUM(i.quantity * p.sell_price), 0) as sell_value,
              COUNT(DISTINCT i.product_id) as sku_count
       FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.tenant_id = ? AND p.status != 'deleted'`,
      [req.tenantId]
    );
    const [[lowStock]] = await pool.query(
      `SELECT COUNT(*) as cnt FROM inventory i JOIN products p ON i.product_id = p.id
       WHERE i.tenant_id = ? AND p.min_stock > 0 AND i.quantity <= p.min_stock AND p.status != 'deleted'`,
      [req.tenantId]
    );
    const [[monthFinance]] = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) as income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0) as expense
       FROM finance_records WHERE tenant_id = ? AND record_date >= ?`,
      [req.tenantId, monthStart]
    );
    const [[pendingReceive]] = await pool.query(
      "SELECT COUNT(*) as cnt FROM purchase_orders WHERE tenant_id = ? AND status = 'draft'",
      [req.tenantId]
    );

    res.json({
      code: 0,
      data: {
        today_sales: { order_count: todaySales.order_count, amount: parseFloat(todaySales.amount) },
        month_sales: { order_count: monthSales.order_count, amount: parseFloat(monthSales.amount) },
        month_purchase: { order_count: monthPurchase.order_count, amount: parseFloat(monthPurchase.amount) },
        inventory: {
          sku_count: inventoryValue.sku_count,
          cost_value: parseFloat(inventoryValue.cost_value),
          sell_value: parseFloat(inventoryValue.sell_value)
        },
        low_stock_count: lowStock.cnt,
        month_finance: { income: parseFloat(monthFinance.income), expense: parseFloat(monthFinance.expense) },
        pending_receive: pendingReceive.cnt
      }
    });
  } catch (err) {
    console.error('汇总数据查询失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
