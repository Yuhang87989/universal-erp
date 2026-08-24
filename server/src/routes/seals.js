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
  if (!books.length) throw new Error('当前租户暂无账套');
  return books[0].id;
}

// 获取印章列表
router.get('/', async (req, res) => {
  try {
    const { book_id } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);

    const [seals] = await pool.query(
      `SELECT s.*,
        (SELECT COUNT(*) FROM voucher_seals vs WHERE vs.seal_id = s.id) as usage_count
       FROM seals s
       WHERE s.book_id = ? AND s.is_active = TRUE
       ORDER BY s.id ASC`,
      [bid]
    );
    res.json({ code: 0, data: seals });
  } catch (err) {
    res.status(500).json({ code: 500, message: '获取印章列表失败: ' + err.message });
  }
});

// 新增印章
router.post('/', async (req, res) => {
  try {
    const { book_id, seal_type, seal_name, seal_code, image_url } = req.body;
    if (!seal_type || !seal_name) throw new Error('印章类型和名称不能为空');

    const bid = await getDefaultBookId(req.tenantId, book_id);

    const [result] = await pool.query(
      `INSERT INTO seals (book_id, seal_type, seal_name, seal_code, image_url, is_filed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bid, seal_type, seal_name, seal_code || null, image_url || null, seal_code ? true : false]
    );
    res.json({ code: 0, message: '印章添加成功', data: { id: result.insertId } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 修改印章
router.put('/:id', async (req, res) => {
  try {
    const { seal_name, seal_code, image_url, is_filed, is_active } = req.body;
    await pool.query(
      `UPDATE seals SET 
        seal_name = COALESCE(?, seal_name),
        seal_code = COALESCE(?, seal_code),
        image_url = COALESCE(?, image_url),
        is_filed = COALESCE(?, is_filed),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [seal_name || null, seal_code !== undefined ? seal_code : null, image_url !== undefined ? image_url : null,
       is_filed !== undefined ? is_filed : null, is_active !== undefined ? is_active : null, req.params.id]
    );
    res.json({ code: 0, message: '印章更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除印章
router.delete('/:id', async (req, res) => {
  try {
    // 检查是否有凭证引用
    const [usage] = await pool.query('SELECT COUNT(*) as cnt FROM voucher_seals WHERE seal_id = ?', [req.params.id]);
    if (usage[0].cnt > 0) return res.status(400).json({ code: 400, message: '该印章已被凭证使用，无法删除' });

    await pool.query('DELETE FROM seals WHERE id = ?', [req.params.id]);
    res.json({ code: 0, message: '印章已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '删除失败: ' + err.message });
  }
});

// 给凭证盖章
router.post('/:id/stamp', async (req, res) => {
  try {
    const { voucher_id } = req.body;
    if (!voucher_id) throw new Error('凭证ID不能为空');

    // 检查凭证是否存在
    const [vouchers] = await pool.query('SELECT id FROM vouchers WHERE id = ?', [voucher_id]);
    if (!vouchers.length) throw new Error('凭证不存在');

    // 检查是否已盖过此章
    const [existing] = await pool.query(
      'SELECT id FROM voucher_seals WHERE voucher_id = ? AND seal_id = ?',
      [voucher_id, req.params.id]
    );
    if (existing.length) throw new Error('该凭证已盖过此印章');

    await pool.query(
      'INSERT INTO voucher_seals (voucher_id, seal_id, stamped_by) VALUES (?, ?, ?)',
      [voucher_id, req.params.id, req.user.id]
    );
    res.json({ code: 0, message: '盖章成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 取消盖章
router.delete('/:id/stamp/:voucherId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM voucher_seals WHERE seal_id = ? AND voucher_id = ?',
      [req.params.id, req.params.voucherId]
    );
    res.json({ code: 0, message: '已取消盖章' });
  } catch (err) {
    res.status(500).json({ code: 500, message: '操作失败: ' + err.message });
  }
});

module.exports = router;
