const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 辅助：获取当前租户的默认账套ID
async function getDefaultBookId(tenantId, bookId) {
  if (bookId) return bookId;
  const [books] = await pool.query(
    'SELECT id FROM accounting_books WHERE tenant_id = ? AND is_active = TRUE ORDER BY id ASC LIMIT 1',
    [tenantId]
  );
  if (!books.length) throw new Error('当前租户暂无账套，请先创建账套');
  return books[0].id;
}

// 获取当前租户所有账套
router.get('/books', async (req, res) => {
  try {
    const [books] = await pool.query(
      `SELECT ab.*, 
        (SELECT COUNT(*) FROM accounting_accounts WHERE book_id = ab.id) as account_count,
        (SELECT COUNT(*) FROM vouchers WHERE book_id = ab.id) as voucher_count
       FROM accounting_books ab
       WHERE ab.tenant_id = ? AND ab.is_active = TRUE
       ORDER BY ab.id ASC`,
      [req.tenantId]
    );
    res.json({ code: 0, data: books });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取账套列表失败: ' + err.message });
  }
});

// 获取科目列表
router.get('/', async (req, res) => {
  try {
    const { book_id, category, is_enabled } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    let where = 'WHERE a.book_id = ?';
    const params = [bid];

    if (category) { where += ' AND a.category = ?'; params.push(category); }
    if (is_enabled !== undefined) { where += ' AND a.is_enabled = ?'; params.push(is_enabled === 'true' ? 1 : 0); }

    const [accounts] = await pool.query(
      `SELECT a.*, 
        (SELECT COUNT(*) FROM accounting_accounts WHERE parent_id = a.id) as child_count,
        (SELECT COUNT(*) FROM voucher_items WHERE account_id = a.id) as usage_count
       FROM accounting_accounts a ${where}
       ORDER BY a.code ASC`,
      params
    );
    res.json({ code: 0, data: accounts, book_id: bid });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取科目列表失败: ' + err.message });
  }
});

// 获取科目树形结构
router.get('/tree', async (req, res) => {
  try {
    const { book_id } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);
    const [accounts] = await pool.query(
      'SELECT * FROM accounting_accounts WHERE book_id = ? AND is_enabled = TRUE ORDER BY code ASC',
      [bid]
    );

    // 构建树
    const map = {};
    const tree = [];
    accounts.forEach(a => { map[a.id] = { ...a, children: [] }; });
    accounts.forEach(a => {
      if (a.parent_id && map[a.parent_id]) {
        map[a.parent_id].children.push(map[a.id]);
      } else {
        tree.push(map[a.id]);
      }
    });

    res.json({ code: 0, data: tree });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取科目树失败: ' + err.message });
  }
});

// 新增科目
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { book_id, code, name, category, parent_id, direction, remark } = req.body;
    if (!code || !name || !category) throw new Error('科目编码、名称和类别不能为空');

    const bid = await getDefaultBookId(req.tenantId, book_id);

    // 校验科目编码格式
    if (!/^\d{4}(\.\d{2,})?$/.test(code)) {
      throw new Error('科目编码格式不正确，如：1001 或 1002.01');
    }

    // 检查编码唯一性
    const [exists] = await conn.query(
      'SELECT id FROM accounting_accounts WHERE book_id = ? AND code = ?',
      [bid, code]
    );
    if (exists.length) throw new Error(`科目编码 ${code} 已存在`);

    // 确定层级和方向
    let level = 1;
    let dir = direction;
    if (parent_id) {
      const [parent] = await conn.query(
        'SELECT level, category, direction FROM accounting_accounts WHERE id = ?',
        [parent_id]
      );
      if (!parent.length) throw new Error('上级科目不存在');
      level = parent[0].level + 1;
      if (!dir) dir = parent[0].direction;
      if (parent[0].category !== category) throw new Error('子科目类别必须与上级科目一致');
    }

    // 默认余额方向
    if (!dir) {
      dir = (category === 'asset' || category === 'expense') ? 'debit' : 'credit';
    }

    const [result] = await conn.query(
      `INSERT INTO accounting_accounts (book_id, code, name, category, parent_id, direction, level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bid, code, name, category, parent_id || null, dir, level]
    );

    await conn.commit();
    res.json({ code: 0, message: '科目添加成功', data: { id: result.insertId } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 修改科目
router.put('/:id', async (req, res) => {
  try {
    const { name, is_enabled, sort_order } = req.body;
    await pool.query(
      'UPDATE accounting_accounts SET name = COALESCE(?, name), is_enabled = COALESCE(?, is_enabled), sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [name || null, is_enabled !== undefined ? is_enabled : null, sort_order !== undefined ? sort_order : null, req.params.id]
    );
    res.json({ code: 0, message: '科目更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除科目
router.delete('/:id', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    // 检查是否有子科目
    const [children] = await conn.query('SELECT COUNT(*) as cnt FROM accounting_accounts WHERE parent_id = ?', [req.params.id]);
    if (children[0].cnt > 0) throw new Error('请先删除下级科目');

    // 检查是否有凭证引用
    const [usage] = await conn.query('SELECT COUNT(*) as cnt FROM voucher_items WHERE account_id = ?', [req.params.id]);
    if (usage[0].cnt > 0) throw new Error('该科目已被凭证引用，无法删除');

    await conn.query('DELETE FROM accounting_accounts WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.json({ code: 0, message: '科目已删除' });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
