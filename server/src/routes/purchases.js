const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// ========== 供应商管理 ==========

// 供应商列表
router.get('/suppliers', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { keyword, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT * FROM suppliers WHERE tenant_id = ? AND status = 'active'`;
    const params = [tenantId];

    if (keyword) {
      sql += ` AND (name LIKE ? OR contact_name LIKE ? OR phone LIKE ?)`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
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
      `SELECT COUNT(*) as total FROM suppliers WHERE tenant_id = ? AND status = 'active'`,
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
    const tenantId = req.tenantId;
    const { name, contactName, phone, address, bankName, bankAccount, notes } = req.body;

    if (!name) return res.status(400).json({ message: '供应商名称不能为空' });

    const [result] = await db.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, address, bank_name, bank_account, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, name, contactName || null, phone || null, address || null, bankName || null, bankAccount || null, notes || null]
    );

    // 记录操作日志
    await db.query(
      `INSERT INTO operation_logs (tenant_id, user_id, module, action, target_type, target_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, 'supplier', 'create', 'supplier', result.insertId]
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
    const tenantId = req.tenantId;
    const { name, contactName, phone, address, bankName, bankAccount, notes } = req.body;

    await db.query(
      `UPDATE suppliers SET name=?, contact_name=?, phone=?, address=?, bank_name=?, bank_account=?, remark=? WHERE id=? AND tenant_id=?`,
      [name, contactName || null, phone || null, address || null, bankName || null, bankAccount || null, notes || null, req.params.id, tenantId]
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
    const tenantId = req.tenantId;
    // 检查是否有关联的采购单
    const [[count]] = await db.query(
      `SELECT COUNT(*) as cnt FROM purchase_orders WHERE supplier_id = ? AND tenant_id = ?`,
      [req.params.id, tenantId]
    );
    if (count.cnt > 0) {
      return res.status(400).json({ message: '该供应商有关联采购单，无法删除' });
    }

    await db.query(
      `UPDATE suppliers SET status = 'disabled' WHERE id=? AND tenant_id=?`,
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
    const tenantId = req.tenantId;
    const { status, keyword, startDate, endDate, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT po.*, s.name as supplier_name, u.real_name as operator_name
               FROM purchase_orders po
               LEFT JOIN suppliers s ON po.supplier_id = s.id
               LEFT JOIN users u ON po.operator_id = u.id
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
        `SELECT pi.*, p.name as product_name, p.barcode FROM purchase_items pi LEFT JOIN products p ON pi.product_id = p.id WHERE pi.purchase_order_id = ?`,
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
    const tenantId = req.tenantId;
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
       WHERE pi.purchase_order_id = ?`,
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
    const tenantId = req.tenantId;
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
      `INSERT INTO purchase_orders (tenant_id, order_no, supplier_id, order_date, total_amount, status, remark, operator_id) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      [tenantId, orderNo, supplierId, orderDate || new Date(), totalAmount, notes || null, req.user.id]
    );
    const orderId = result.insertId;

    // 插入采购商品明细
    for (const item of items) {
      await conn.query(
        `INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)`,
        [orderId, item.productId, item.quantity, item.costPrice]
      );
    }

    // 记录操作日志
    await conn.query(
      `INSERT INTO operation_logs (tenant_id, user_id, module, action, target_type, target_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, req.user.id, 'purchase', 'create', 'purchase_order', orderId]
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

// 确认入库（采购单 -> 库存增加 + 更新成本价 + 更新已入库数量）
router.post('/orders/:id/receive', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const tenantId = req.tenantId;
    const { warehouseId, actualItems } = req.body;

    // 查采购单（draft=待入库）
    const [[order]] = await conn.query(
      `SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ? AND status IN ('draft','partial_received')`,
      [req.params.id, tenantId]
    );
    if (!order) return res.status(400).json({ message: '采购单不存在或已全部入库' });

    // 确定入库仓库
    let wid = warehouseId;
    if (!wid) {
      // 取该租户第一个仓库
      const [whs] = await conn.query('SELECT id FROM warehouses WHERE tenant_id = ? ORDER BY id ASC LIMIT 1', [tenantId]);
      if (!whs.length) return res.status(400).json({ message: '请先在仓库管理中创建仓库' });
      wid = whs[0].id;
    }

    // 查采购明细
    const [items] = await conn.query(
      `SELECT * FROM purchase_items WHERE purchase_order_id = ?`,
      [order.id]
    );

    await conn.beginTransaction();

    let allReceived = true;
    for (const item of items) {
      // 实际到货数量（允许部分到货）
      const actualQty = actualItems
        ? parseFloat((actualItems.find((a) => a.productId === item.product_id) || {}).quantity) || 0
        : parseFloat(item.quantity) - parseFloat(item.received_quantity || 0);

      if (actualQty <= 0) { allReceived = false; continue; }

      // 移动加权平均成本计算
      const [invRows] = await conn.query(
        `SELECT id, quantity, avg_cost FROM inventory WHERE product_id = ? AND tenant_id = ? AND warehouse_id = ?`,
        [item.product_id, tenantId, wid]
      );
      let beforeQty = 0, beforeAvgCost = 0;
      if (invRows.length) {
        beforeQty = parseFloat(invRows[0].quantity);
        beforeAvgCost = parseFloat(invRows[0].avg_cost || 0);
      }
      const inQty = parseFloat(actualQty);
      const inCost = parseFloat(item.unit_cost || 0);
      const afterQty = beforeQty + inQty;
      // 加权平均单位成本 = (原库存成本 + 本次入库成本) / (原数量 + 本次数量)
      const afterAvgCost = afterQty > 0
        ? (beforeQty * beforeAvgCost + inQty * inCost) / afterQty
        : inCost;

      if (invRows.length) {
        await conn.query(
          `UPDATE inventory SET quantity = ?, avg_cost = ? WHERE id = ?`,
          [afterQty, afterAvgCost.toFixed(4), invRows[0].id]
        );
      } else {
        await conn.query(
          `INSERT INTO inventory (tenant_id, product_id, warehouse_id, quantity, avg_cost) VALUES (?, ?, ?, ?, ?)`,
          [tenantId, item.product_id, wid, afterQty, afterAvgCost.toFixed(4)]
        );
      }

      // 库存流水（带warehouse_id和单位成本）
      await conn.query(
        `INSERT INTO inventory_logs (tenant_id, product_id, warehouse_id, change_type, quantity, before_quantity, after_quantity, unit_cost, reference_type, reference_id, operator_id, remark)
         VALUES (?, ?, ?, 'purchase', ?, ?, ?, ?, 'purchase_order', ?, ?, ?)`,
        [tenantId, item.product_id, wid, inQty, beforeQty, afterQty, inCost, order.id, req.user.id, `采购入库 - 单号: ${order.order_no}`]
      );

      // 更新已入库数量
      const newReceived = parseFloat(item.received_quantity || 0) + inQty;
      await conn.query(
        `UPDATE purchase_items SET received_quantity = ? WHERE id = ?`,
        [newReceived, item.id]
      );
      if (newReceived < parseFloat(item.quantity) - 0.001) allReceived = false;

      // 同步商品主成本价（取所有仓库加权成本的最新值）
      await conn.query(
        `UPDATE products SET cost_price = ? WHERE id = ? AND tenant_id = ?`,
        [afterAvgCost.toFixed(4), item.product_id, tenantId]
      );
    }

    // 更新采购单状态
    const newStatus = allReceived ? 'received' : 'partial_received';
    await conn.query(
      `UPDATE purchase_orders SET status = ?, operator_id = ? WHERE id = ?`,
      [newStatus, req.user.id, order.id]
    );

    await conn.commit();
    res.json({ message: allReceived ? '入库成功，采购单已全部入库' : '部分入库成功', data: { status: newStatus, warehouse_id: wid } });
  } catch (err) {
    await conn.rollback();
    console.error('入库操作失败:', err);
    res.status(500).json({ message: '入库操作失败: ' + err.message });
  } finally {
    conn.release();
  }
});

// 删除采购单（仅草稿可删）
router.delete('/orders/:id', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [[order]] = await db.query(
      `SELECT * FROM purchase_orders WHERE id = ? AND tenant_id = ? AND status = 'draft'`,
      [req.params.id, tenantId]
    );
    if (!order) return res.status(400).json({ message: '采购单不存在或已入库，无法删除' });

    await db.query(`DELETE FROM purchase_items WHERE purchase_order_id = ?`, [order.id]);
    await db.query(`DELETE FROM purchase_orders WHERE id = ?`, [order.id]);

    res.json({ message: '采购单已删除' });
  } catch (err) {
    console.error('删除采购单失败:', err);
    res.status(500).json({ message: '删除采购单失败' });
  }
});

module.exports = router;
