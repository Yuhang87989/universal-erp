const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 生成销售单号
const generateOrderNo = async (tenantId, type = 'S') => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `${type}${today}`;
  const [lastOrder] = await pool.query(
    "SELECT order_no FROM sales_orders WHERE tenant_id = ? AND order_no LIKE ? ORDER BY id DESC LIMIT 1",
    [tenantId, `${prefix}%`]
  );
  const seq = lastOrder.length ? parseInt(lastOrder[0].order_no.slice(-4)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// 获取销售单列表
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, status, orderType, paymentMethod, startDate, endDate, keyword, minAmount, maxAmount } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE so.tenant_id = ?';
    const params = [req.tenantId];

    if (status) { where += ' AND so.status = ?'; params.push(status); }
    if (orderType) { where += ' AND so.order_type = ?'; params.push(orderType); }
    if (paymentMethod) { where += ' AND so.payment_method = ?'; params.push(paymentMethod); }
    if (startDate) { where += ' AND so.order_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND so.order_date <= ?'; params.push(endDate + ' 23:59:59'); }
    if (minAmount) { where += ' AND so.actual_amount >= ?'; params.push(parseFloat(minAmount)); }
    if (maxAmount) { where += ' AND so.actual_amount <= ?'; params.push(parseFloat(maxAmount)); }
    if (keyword) {
      where += ' AND (so.order_no LIKE ? OR c.name LIKE ? OR EXISTS (SELECT 1 FROM sale_items si JOIN products p2 ON si.product_id = p2.id WHERE si.sales_order_id = so.id AND p2.name LIKE ?))';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    const [countResult] = await pool.query(`SELECT COUNT(DISTINCT so.id) as total FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id ${where}`, params);

    let sql = `SELECT so.*, c.name as customer_name, c.phone as customer_phone, u.real_name as operator_name
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.id
       LEFT JOIN users u ON so.operator_id = u.id
       ${where}`;
    sql += ` ORDER BY so.order_date DESC, so.id DESC LIMIT ? OFFSET ?`;

    const [orders] = await pool.query(sql, [...params, parseInt(pageSize), offset]);

    res.json({
      code: 0,
      data: { list: orders, total: countResult[0].total, page: parseInt(page), pageSize: parseInt(pageSize) }
    });
  } catch (err) {
    console.error('销售列表错误:', err);
    res.status(500).json({ code: 500, message: '获取销售单列表失败' });
  }
});

// 创建销售单（POS收银/手动录入）
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { customerId, items, orderType = 'pos', paymentMethod = 'cash', discountAmount = 0, remark } = req.body;
    if (!items || !items.length) throw new Error('销售明细不能为空');

    const orderNo = await generateOrderNo(req.tenantId);
    let totalAmount = 0;
    items.forEach(item => { totalAmount += item.quantity * item.unitPrice; });
    const actualAmount = totalAmount - discountAmount;

    // 创建销售单
    const [orderResult] = await conn.query(
      `INSERT INTO sales_orders (tenant_id, order_no, order_type, customer_id, total_amount, discount_amount, actual_amount, paid_amount, payment_method, status, remark, operator_id, order_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, NOW())`,
      [req.tenantId, orderNo, orderType, customerId || null, totalAmount, discountAmount, actualAmount, actualAmount, paymentMethod, remark || null, req.user.id]
    );

    // 添加明细 & 扣减库存（按加权平均成本结转）
    let totalCost = 0;
    for (const item of items) {
      const outQty = parseFloat(item.quantity);
      // 查库存（取该商品所有仓库合计，优先默认仓库）
      const [invList] = await conn.query(
        'SELECT id, quantity, avg_cost, warehouse_id FROM inventory WHERE tenant_id = ? AND product_id = ? AND quantity > 0 ORDER BY warehouse_id ASC',
        [req.tenantId, item.productId]
      );
      const totalStock = invList.reduce((s, r) => s + parseFloat(r.quantity), 0);
      if (totalStock < outQty) {
        throw new Error('商品库存不足，无法销售');
      }

      // 加权平均成本（跨仓库加权）
      const totalStockCost = invList.reduce((s, r) => s + parseFloat(r.quantity) * parseFloat(r.avg_cost || 0), 0);
      const weightedAvgCost = totalStock > 0 ? totalStockCost / totalStock : 0;
      const lineCost = weightedAvgCost * outQty;
      totalCost += lineCost;

      // 插入销售明细（含单位成本和成本小计）
      await conn.query(
        'INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price, unit_cost, cost_amount, discount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [orderResult.insertId, item.productId, outQty, item.unitPrice, weightedAvgCost.toFixed(4), lineCost.toFixed(2), item.discount || 0]
      );

      // 按仓库依次扣减库存（FIFO跨仓扣减，avg_cost不变）
      let remaining = outQty;
      for (const inv of invList) {
        if (remaining <= 0) break;
        const qtyInWh = parseFloat(inv.quantity);
        const deduct = Math.min(qtyInWh, remaining);
        const afterQty = qtyInWh - deduct;
        await conn.query(
          'UPDATE inventory SET quantity = ? WHERE id = ?',
          [afterQty, inv.id]
        );
        await conn.query(
          `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id, remark)
           VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, 'sales_order', ?, ?, '销售出库')`,
          [req.tenantId, item.productId, inv.warehouse_id, -deduct, qtyInWh, afterQty, weightedAvgCost.toFixed(4), orderResult.insertId, req.user.id]
        );
        remaining -= deduct;
      }
    }

    // 更新销售单成本合计
    await conn.query(
      'UPDATE sales_orders SET total_cost = ? WHERE id = ?',
      [totalCost.toFixed(2), orderResult.insertId]
    );

    // 更新客户累计消费
    if (customerId) {
      await conn.query(
        'UPDATE customers SET total_spent = total_spent + ? WHERE id = ?',
        [actualAmount, customerId]
      );
    }

    await conn.commit();
    res.json({ code: 0, message: '销售单创建成功', data: { id: orderResult.insertId, orderNo, actualAmount } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
