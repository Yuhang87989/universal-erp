const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ========== 供应商管理 ==========

// 供应商列表
router.get('/suppliers', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { keyword, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT * FROM suppliers WHERE tenant_id = ? AND is_active = 1`;
    const params = [tenantId];

    if (keyword) {
      sql += ` AND (name LIKE ? OR contact_name LIKE ? OR phone LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    sql += ` ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [rows] = await db.query(sql, params);

    // 统计每个供应商的采购单数
    for (const row of rows) {
      const [[stats]] = await db.query(
        `SELECT COUNT(*) as total_orders, IFNULL(SUM(total_amount), 0) as total_amount FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?`,
        [row.id, tenantId]
      );
      row.totalOrders = stats.total_orders;
      row.totalAmount = stats.total_amount;
    }

    // 总数
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM suppliers WHERE tenant_id = ? AND is_active = 1`,
      [tenantId]
    );

    res.json({ data: rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('获取供应商列表失败:', err);
    res.status(500).json({ message: '获取供应商列表失败' });
  }
});

// 新增供应商
router.post('/suppliers', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, contactName, phone, email, address, bankAccount, notes } = req.body;

    if (!name) return res.status(400).json({ message: '供应商名称不能为空' });

    const [result] = await db.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, email, address, bank_account, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, contactName || null, phone || null, email || null, address || null, bankAccount || null, notes || null]
    );

    // 记录操作日志
    await db.query(
      `INSERT INTO operation_logs (tenant_id, user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, 'create', 'supplier', result.insertId, `新增供应商: ${name}`]
    );

    res.json({ message: '供应商添加成功', id: result.insertId });
  } catch (err) {
    console.error('新增供应商失败:', err);
    res.status(500).json({ message: '新增供应商失败' });
  }
});

// 编辑供应商
router.put('/suppliers/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, contactName, phone, email, address, bankAccount, notes } = req.body;

    await db.query(
      `UPDATE suppliers SET name=?, contact_name=?, phone=?, email=?, address=?, bank_account=?, notes=? WHERE id=? AND tenant_id=?`,
      [name, contactName || null, phone || null, email || null, address || null, bankAccount || null, notes || null, req.params.id, tenantId]
    );

    res.json({ message: '供应商更新成功' });
  } catch (err) {
    console.error('更新供应商失败:', err);
    res.status(500).json({ message: '更新供应商失败' });
  }
});

// 删除供应商（软删除）
router.delete('/suppliers/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    // 检查是否有关联的采购单
    const [[count]] = await db.query(
      `SELECT COUNT(*) as cnt FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    if (count.cnt > 0) {
      return res.status(400).json({ message: '该供应商有关联采购单，无法删除' });
    }

    await db.query(
      `UPDATE suppliers SET is_active = 0 WHERE id=? AND tenant_id=?`,
      [req.params.id, tenantId]
    );

    res.json({ message: '供应商已删除' });
  } catch (err) {
    console.error('删除供应商失败:', err);
    res.status(500).json({ message: '删除供应商失败' });
  }
});

// ========== 采购单管理 ==========

// 采购单列表
router.get('/orders', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { status, keyword, startDate, endDate, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT po.*, s.name as supplier_name, u.real_name as creator_name
               FROM purchase_orders po
               LEFT JOIN suppliers s ON po.supplier_id = s.id
               LEFT JOIN users u ON po.created_by = u.id
               WHERE po.tenant_id = ?`;
    const params = [tenantId];

    if (status) { sql += ` AND po.status = ?`; params.push(status); }
    if (keyword) {
      sql += ` AND (po.order_no LIKE ? OR s.name LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (startDate) { sql += ` AND po.order_date >= ?`; params.push(startDate); }
    if (endDate) { sql += ` AND po.order_date <= ?`; params.push(endDate); }

    // 先查总数
    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [[{ total }]] = await db.query(countSql, params);

    sql += ` ORDER BY po.created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

    const [rows] = await db.query(sql, params);

    // 获取每个采购单的商品明细
    for (const order of rows) {
      const [items] = await db.query(
        `SELECT pi.*, p.name as product_name, p.barcode FROM purchase_items pi LEFT JOIN products p ON pi.product_id = p.id WHERE pi.order_id = ?`,
        [order.id]
      );
      order.items = items;
      order.itemCount = items.length;
    }

    res.json({ data: rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (err) {
    console.error('获取采购单列表失败:', err);
    res.status(500).json({ message: '获取采购单列表失败' });
  }
});

// 采购单详情
router.get('/orders/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const [[order]] = await db.query(
      `SELECT po.*, s.name as supplier_name, s.contact_name as supplier_contact, s.phone as supplier_phone
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ? AND po.tenant_id = ?`,
      [req.params.id, tenantId]
    );

    if (!order) return res.status(404).json({ message: '采购单不存在' });

    const [items] = await db.query(
      `SELECT pi.*, p.name as product_name, p.barcode, p.unit, c.name as category_name
       FROM purchase_items pi
       LEFT JOIN products p ON pi.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE pi.order_id = ?`,
      [order.id]
    );
    order.items = items;

    res.json({ data: order });
  } catch (err) {
    console.error('获取采购单详情失败:', err);
    res.status(500).json({ message: '获取采购单详情失败' });
  }
});

// 创建采购单
router.post('/orders', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const tenantId = req.user.tenantId;
    const { supplierId, orderDate, items, notes } = req.body;

    if (!supplierId || !items || items.length === 0) {
      return res.status(400).json({ message: '请选择供应商并添加商品' });
    }

    await conn.beginTransaction();

    // 生成采购单号
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [[{ cnt }]] = await conn.query(
      `SELECT COUNT(*) as cnt FROM purchase_orders WHERE tenant_id = ? AND DATE(order_date) = CURDATE()`,
      [tenantId]
    );
    const orderNo = `PO${today}${String(cnt + 1).padStart(4, '0')}`;

    // 计算总金额
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += (item.costPrice || 0) * (item.quantity || 0);
    }

    // 插入采购单
    const [result] = await conn.query(
      `INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, order_date, total_amount, status, notes, created_by) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [tenantId, orderNo, supplierId, orderDate || new Date(), totalAmount, notes || null, req.user.id]
    );
    const orderId = result.insertId;

    // 插入采购商品明细
    for (const item of items) {
      await conn.query(
        `INSERT INTO purchase_items (order_id, product_id, quantity, cost_price, subtotal) VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.costPrice, item.quantity * item.costPrice]
      );
    }

    // 记录操作日志
    await conn.query(
      `INSERT INTO operation_logs (tenant_id, user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, 'create', 'purchase_order', orderId, `创建采购单: ${orderNo}`]
    );

    await conn.commit();
    res.json({ message: '采购单创建成功', id: orderId, orderNo });
  } catch (err) {
    await conn.rollback();
    console.error('创建采购单失败:', err);
    res.status(500).json({ message: '创建采购单失败: ' + err.message });
  } finally {
    conn.release();
  }
});

// 确认入库（采购单 -> 库存增加 + 更新成本价）
router.post('/orders/:id/receive', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const tenantId = req.user.tenantId;
    const { actualItems } = req.body; // 可选：实际到货数量（允许部分到货）

    // 查采购单
    const [[order]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
      [req.params.id, tenantId]
    );
    if (!order) return res.status(400).json({ message: '采购单不存在或已入库' });

    // 查采购明细
    const [items] = await conn.query(
      `SELECT * FROM purchase_items WHERE order_id = ?`,
      [order.id]
    );

    await conn.beginTransaction();

    // 逐项入库
    for (const item of items) {
      const actualQty = actualItems
        ? (actualItems.find(a => a.productId === item.product_id) || {}).quantity || item.quantity
        : item.quantity;

      // 增加库存
      await conn.query(
        `UPDATE inventory SET quantity = quantity + ?, cost_price = ?, updated_at = NOW() WHERE product_id = ? AND tenant_id = ?`,
        [actualQty, item.cost_price, item.product_id, tenantId]
      );

      // 如果inventory不存在则创建
      const [invResult] = await conn.query(
        `SELECT id FROM inventory WHERE product_id = ? AND tenant_id = ?`,
        [item.product_id, tenantId]
      );
      if (invResult.length === 0) {
        await conn.query(
          `INSERT INTO inventory (tenant_id, product_id, quantity, cost_price, alert_quantity) VALUES (?, ?, ?, ?, 10)`,
          [tenantId, item.product_id, actualQty, item.cost_price]
        );
      }

      // 记录库存流水
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, type, quantity, before_qty, after_qty, cost_price, reference_type, reference_id, operator_id, notes) VALUES (?, ?, 'in', ?, (SELECT quantity FROM inventory WHERE product_id = ? AND tenant_id = ?) - ?, (SELECT quantity FROM inventory WHERE product_id = ? AND tenant_id = ?), ?, 'purchase', ?, ?, ?)`,
        [tenantId, item.product_id, actualQty, item.product_id, tenantId, actualQty, item.product_id, tenantId, item.cost_price, order.id, req.user.id, `采购入库 - 单号: ${order.order_no}`]
      );

      // 更新商品成本价
      await conn.query(
        `UPDATE products SET cost_price = ? WHERE id = ? AND tenant_id = ?`,
        [item.cost_price, item.product_id, tenantId]
      );
    }

    // 更新采购单状态
    await conn.query(
      `UPDATE purchase_orders SET status = 'received', received_at = NOW(), received_by = ? WHERE id = ?`,
      [req.user.id, order.id]
    );

    // 记录操作日志
    await conn.query(
      `INSERT INTO operation_logs (tenant_id, user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, 'receive', 'purchase_order', order.id, `采购入库: ${order.order_no}`]
    );

    await conn.commit();
    res.json({ message: '入库成功，库存已更新' });
  } catch (err) {
    await conn.rollback();
    console.error('入库操作失败:', err);
    res.status(500).json({ message: '入库操作失败: ' + err.message });
  } finally {
    conn.release();
  }
});

// 删除采购单（仅待入库可删）
router.delete('/orders/:id', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const [[order]] = await db.query(
      `SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
      [req.params.id, tenantId]
    );
    if (!order) return res.status(400).json({ message: '采购单不存在或已入库，无法删除' });

    await db.query(`DELETE FROM purchase_items WHERE order_id = ?`, [order.id]);
    await db.query(`DELETE FROM purchase_orders WHERE id = ?`, [order.id]);

    res.json({ message: '采购单已删除' });
  } catch (err) {
    console.error('删除采购单失败:', err);
    res.status(500).json({ message: '删除采购单失败' });
  }
});

module.exports = router;
