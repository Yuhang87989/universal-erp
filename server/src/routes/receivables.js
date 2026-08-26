const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// 账龄分桶
function bucketOf(days) {
  if (days <= 30) return 'b30';
  if (days <= 60) return 'b60';
  if (days <= 90) return 'b90';
  if (days <= 180) return 'b180';
  return 'b365';
}
const bucketLabels = {
  b30: '0-30天',
  b60: '31-60天',
  b90: '61-90天',
  b180: '91-180天',
  b365: '180天以上',
};
const emptyBuckets = () => ({ b30: 0, b60: 0, b90: 0, b180: 0, b365: 0 });

// =================== 应收账款（客户） ===================
router.get('/receivables', async (req, res) => {
  try {
    // 已确认/已完成但未付清的销售单
    const [orders] = await pool.query(
      `SELECT so.id, so.order_no, so.order_date, so.total_amount, so.discount_amount,
              so.actual_amount, so.paid_amount, so.status, so.payment_method,
              c.id AS customer_id, c.name AS customer_name, c.phone
       FROM sales_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       WHERE so.tenant_id = ?
         AND so.status IN ('pending','completed')
         AND so.actual_amount - so.paid_amount > 0.001
       ORDER BY so.order_date ASC`,
      [req.tenantId]
    );

    const today = dayjs();
    const list = orders.map(o => {
      const receivable = parseFloat(o.actual_amount) - parseFloat(o.paid_amount);
      const days = today.diff(dayjs(o.order_date), 'day');
      return {
        id: o.id,
        order_no: o.order_no,
        order_date: o.order_date,
        customer_id: o.customer_id,
        customer_name: o.customer_name || '散客/未关联',
        phone: o.phone || '',
        total_amount: parseFloat(o.total_amount),
        actual_amount: parseFloat(o.actual_amount),
        paid_amount: parseFloat(o.paid_amount),
        receivable: Math.round(receivable * 100) / 100,
        overdue_days: days,
        bucket: bucketOf(days),
        bucket_label: bucketLabels[bucketOf(days)],
        status: o.status,
      };
    });

    // 按客户汇总
    const byCustomer = {};
    list.forEach(r => {
      const key = r.customer_id || 0;
      if (!byCustomer[key]) {
        byCustomer[key] = {
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          phone: r.phone,
          total_receivable: 0,
          order_count: 0,
          buckets: emptyBuckets(),
          oldest_date: r.order_date,
        };
      }
      byCustomer[key].total_receivable += r.receivable;
      byCustomer[key].order_count += 1;
      byCustomer[key].buckets[r.bucket] += r.receivable;
    });

    const buckets = emptyBuckets();
    list.forEach(r => { buckets[r.bucket] += r.receivable; });
    Object.keys(buckets).forEach(k => { buckets[k] = Math.round(buckets[k] * 100) / 100; });

    const totalReceivable = Math.round(list.reduce((s, r) => s + r.receivable, 0) * 100) / 100;

    res.json({
      code: 0,
      data: {
        total_receivable: totalReceivable,
        total_orders: list.length,
        aging_buckets: buckets,
        aging_labels: bucketLabels,
        by_customer: Object.values(byCustomer).map(c => ({
          ...c,
          total_receivable: Math.round(c.total_receivable * 100) / 100,
        })).sort((a, b) => b.total_receivable - a.total_receivable),
        list,
      }
    });
  } catch (err) {
    console.error('应收账款错误:', err);
    res.status(500).json({ code: 500, message: '获取应收账款失败: ' + err.message });
  }
});

// =================== 应付账款（供应商） ===================
router.get('/payables', async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT po.id, po.order_no, po.order_date, po.total_amount, po.paid_amount, po.status,
              s.id AS supplier_id, s.name AS supplier_name, s.phone, s.contact_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       WHERE po.tenant_id = ?
         AND po.status IN ('confirmed','received','partial_received')
         AND po.total_amount - po.paid_amount > 0.001
       ORDER BY po.order_date ASC`,
      [req.tenantId]
    );

    const today = dayjs();
    const list = orders.map(o => {
      const payable = parseFloat(o.total_amount) - parseFloat(o.paid_amount);
      const days = today.diff(dayjs(o.order_date), 'day');
      return {
        id: o.id,
        order_no: o.order_no,
        order_date: o.order_date,
        supplier_id: o.supplier_id,
        supplier_name: o.supplier_name || '未关联供应商',
        contact_name: o.contact_name || '',
        phone: o.phone || '',
        total_amount: parseFloat(o.total_amount),
        paid_amount: parseFloat(o.paid_amount),
        payable: Math.round(payable * 100) / 100,
        overdue_days: days,
        bucket: bucketOf(days),
        bucket_label: bucketLabels[bucketOf(days)],
        status: o.status,
      };
    });

    const bySupplier = {};
    list.forEach(r => {
      const key = r.supplier_id || 0;
      if (!bySupplier[key]) {
        bySupplier[key] = {
          supplier_id: r.supplier_id,
          supplier_name: r.supplier_name,
          contact_name: r.contact_name,
          phone: r.phone,
          total_payable: 0,
          order_count: 0,
          buckets: emptyBuckets(),
          oldest_date: r.order_date,
        };
      }
      bySupplier[key].total_payable += r.payable;
      bySupplier[key].order_count += 1;
      bySupplier[key].buckets[r.bucket] += r.payable;
    });

    const buckets = emptyBuckets();
    list.forEach(r => { buckets[r.bucket] += r.payable; });
    Object.keys(buckets).forEach(k => { buckets[k] = Math.round(buckets[k] * 100) / 100; });

    const totalPayable = Math.round(list.reduce((s, r) => s + r.payable, 0) * 100) / 100;

    res.json({
      code: 0,
      data: {
        total_payable: totalPayable,
        total_orders: list.length,
        aging_buckets: buckets,
        aging_labels: bucketLabels,
        by_supplier: Object.values(bySupplier).map(s => ({
          ...s,
          total_payable: Math.round(s.total_payable * 100) / 100,
        })).sort((a, b) => b.total_payable - a.total_payable),
        list,
      }
    });
  } catch (err) {
    console.error('应付账款错误:', err);
    res.status(500).json({ code: 500, message: '获取应付账款失败: ' + err.message });
  }
});

// =================== 收/付款登记（更新paid_amount） ===================
router.post('/receivables/:id/settle', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ code: 400, message: '收款金额必须大于0' });
    const [orders] = await pool.query('SELECT id, total_amount, actual_amount, paid_amount FROM sales_orders WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!orders.length) return res.status(404).json({ code: 404, message: '销售单不存在' });
    const o = orders[0];
    const remaining = parseFloat(o.actual_amount) - parseFloat(o.paid_amount);
    if (amount > remaining + 0.01) return res.status(400).json({ code: 400, message: `收款金额超过未收款余额 ¥${remaining.toFixed(2)}` });
    const newPaid = parseFloat(o.paid_amount) + parseFloat(amount);
    await pool.query('UPDATE sales_orders SET paid_amount = ? WHERE id = ?', [newPaid, o.id]);
    res.json({ code: 0, message: '收款登记成功', data: { id: o.id, paid_amount: newPaid, remaining: Math.round((remaining - amount) * 100) / 100 } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '收款登记失败: ' + err.message });
  }
});

router.post('/payables/:id/settle', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ code: 400, message: '付款金额必须大于0' });
    const [orders] = await pool.query('SELECT id, total_amount, paid_amount FROM purchase_orders WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
    if (!orders.length) return res.status(404).json({ code: 404, message: '采购单不存在' });
    const o = orders[0];
    const remaining = parseFloat(o.total_amount) - parseFloat(o.paid_amount);
    if (amount > remaining + 0.01) return res.status(400).json({ code: 400, message: `付款金额超过未付款余额 ¥${remaining.toFixed(2)}` });
    const newPaid = parseFloat(o.paid_amount) + parseFloat(amount);
    await pool.query('UPDATE purchase_orders SET paid_amount = ? WHERE id = ?', [newPaid, o.id]);
    res.json({ code: 0, message: '付款登记成功', data: { id: o.id, paid_amount: newPaid, remaining: Math.round((remaining - amount) * 100) / 100 } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '付款登记失败: ' + err.message });
  }
});

module.exports = router;
