const express = require('express');
const pool = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 获取分类列表（树形结构）
router.get('/', async (req, res) => {
  try {
    const [categories] = await pool.query(
      'SELECT * FROM categories WHERE tenant_id = ? AND status = ? ORDER BY sort_order ASC, id ASC',
      [req.tenantId, 'active']
    );

    // 构建树形结构
    const tree = [];
    const map = {};
    categories.forEach(cat => {
      map[cat.id] = { ...cat, children: [] };
    });
    categories.forEach(cat => {
      if (cat.parent_id && map[cat.parent_id]) {
        map[cat.parent_id].children.push(map[cat.id]);
      } else {
        tree.push(map[cat.id]);
      }
    });

    res.json({ code: 0, data: tree });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取分类失败' });
  }
});

// 新增分类
router.post('/', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, parentId, sortOrder } = req.body;
    if (!name) throw new Error('分类名称不能为空');

    const [result] = await pool.query(
      'INSERT INTO categories (tenant_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?)',
      [req.tenantId, parentId || null, name, sortOrder || 0]
    );

    res.json({ code: 0, message: '分类添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 更新分类
router.put('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, parentId, sortOrder } = req.body;
    await pool.query(
      'UPDATE categories SET name=?, parent_id=?, sort_order=? WHERE id=? AND tenant_id=?',
      [name, parentId || null, sortOrder || 0, req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '分类更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除分类
router.delete('/:id', requireRole('owner', 'manager'), async (req, res) => {
  try {
    // 检查是否有子分类
    const [children] = await pool.query(
      'SELECT id FROM categories WHERE parent_id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    if (children.length) {
      return res.status(400).json({ code: 400, message: '请先删除子分类' });
    }

    // 检查是否有商品使用该分类
    const [products] = await pool.query(
      'SELECT id FROM products WHERE category_id = ? AND tenant_id = ? AND status != ?',
      [req.params.id, req.tenantId, 'deleted']
    );
    if (products.length) {
      return res.status(400).json({ code: 400, message: '该分类下还有商品，无法删除' });
    }

    await pool.query('DELETE FROM categories WHERE id=? AND tenant_id=?', [req.params.id, req.tenantId]);
    res.json({ code: 0, message: '分类已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败' });
  }
});

module.exports = router;
