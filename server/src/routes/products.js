const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// 所有商品接口需要登录
router.use(authenticate);

// 获取商品列表（支持搜索、分页、筛选）
router.get('/', async (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, categoryId, status } = req.query;
    const offset = (page - 1) * pageSize;
    let where = 'WHERE p.tenant_id = ?';
    const params = [req.tenantId];

    if (keyword) {
      where += ' AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)';
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }
    if (categoryId) {
      where += ' AND p.category_id = ?';
      params.push(categoryId);
    }
    if (status) {
      where += ' AND p.status = ?';
      params.push(status);
    } else {
      where += " AND p.status != 'deleted'";
    }

    // 总数
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM products p ${where}`, params);
    const total = countResult[0].total;

    // 列表
    const [products] = await pool.query(
      `SELECT p.*, c.name as category_name, COALESCE(inv.quantity, 0) as stock_quantity
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.tenant_id = p.tenant_id
       ${where}
       ORDER BY p.sort_order ASC, p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(pageSize), offset]
    );

    res.json({
      code: 0,
      data: {
        list: products,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (err) {
    console.error('获取商品列表失败:', err);
    res.status(500).json({ code: 500, message: '获取商品列表失败' });
  }
});

// 获取单个商品
router.get('/:id', async (req, res) => {
  try {
    const [products] = await pool.query(
      `SELECT p.*, c.name as category_name, COALESCE(inv.quantity, 0) as stock_quantity
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN inventory inv ON inv.product_id = p.id AND inv.tenant_id = p.tenant_id
       WHERE p.id = ? AND p.tenant_id = ?`,
      [req.params.id, req.tenantId]
    );

    if (!products.length) {
      return res.status(404).json({ code: 404, message: '商品不存在' });
    }

    res.json({ code: 0, data: products[0] });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取商品详情失败' });
  }
});

// 新增商品
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { name, categoryId, barcode, sku, unit, costPrice, sellPrice, wholesalePrice, imageUrl, description, isWeigh, isBatch, minStock } = req.body;

    if (!name || !sellPrice) {
      throw new Error('商品名称和售价不能为空');
    }

    // 检查条码唯一性
    if (barcode) {
      const [existing] = await conn.query(
        'SELECT id FROM products WHERE tenant_id = ? AND barcode = ? AND status != ?',
        [req.tenantId, barcode, 'deleted']
      );
      if (existing.length) {
        throw new Error('该条码已被其他商品使用');
      }
    }

    // 插入商品
    const [result] = await conn.query(
      `INSERT INTO products (tenant_id, category_id, name, barcode, sku, unit, cost_price, sell_price, wholesale_price, image_url, description, is_weigh, is_batch, min_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenantId, categoryId || null, name, barcode || null, sku || null, unit || '个', costPrice || 0, sellPrice, wholesalePrice || null, imageUrl || null, description || null, isWeigh || false, isBatch || false, minStock || 0]
    );

    // 初始化库存
    await conn.query(
      'INSERT INTO inventory (tenant_id, product_id, quantity) VALUES (?, ?, 0)',
      [req.tenantId, result.insertId]
    );

    await conn.commit();
    res.json({ code: 0, message: '商品添加成功', data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 更新商品
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, categoryId, barcode, sku, unit, costPrice, sellPrice, wholesalePrice, imageUrl, description, isWeigh, isBatch, minStock } = req.body;

    // 检查商品存在且属于当前租户
    const [existing] = await pool.query(
      'SELECT id FROM products WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (!existing.length) {
      return res.status(404).json({ code: 404, message: '商品不存在' });
    }

    await pool.query(
      `UPDATE products SET name=?, category_id=?, barcode=?, sku=?, unit=?, cost_price=?, sell_price=?, wholesale_price=?, image_url=?, description=?, is_weigh=?, is_batch=?, min_stock=?
       WHERE id=? AND tenant_id=?`,
      [name, categoryId || null, barcode || null, sku || null, unit || '个', costPrice || 0, sellPrice, wholesalePrice || null, imageUrl || null, description || null, isWeigh || false, isBatch || false, minStock || 0, req.params.id, req.tenantId]
    );

    res.json({ code: 0, message: '商品更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除商品（软删除）
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    await pool.query(
      "UPDATE products SET status='deleted' WHERE id=? AND tenant_id=?",
      [req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '商品已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

module.exports = router;
