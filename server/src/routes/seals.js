const express = require('express');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// 上传文件存储目录
const UPLOAD_DIR = path.join(__dirname, '../../uploads/seals');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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

// 上传印章图片（接收二进制文件数据）
router.post('/upload', express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'], limit: '5mb' }), async (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ code: 400, message: '未收到文件数据' });
    }
    const contentType = req.headers['content-type'] || 'image/png';
    const extMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg',
    };
    const ext = extMap[contentType] || 'png';
    const fileName = `seal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, req.body);

    // 返回可访问URL（通过nginx或express静态服务）
    const url = `/api/uploads/seals/${fileName}`;
    res.json({ code: 0, data: { url, fileName } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '上传失败: ' + err.message });
  }
});

// 新增印章（创建后自动盖到当前账套所有凭证）
router.post('/', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { book_id, seal_type, seal_name, seal_code, image_url, auto_stamp } = req.body;
    if (!seal_type || !seal_name) throw new Error('印章类型和名称不能为空');

    const bid = await getDefaultBookId(req.tenantId, book_id);

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO seals (book_id, seal_type, seal_name, seal_code, image_url, is_filed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bid, seal_type, seal_name, seal_code || null, image_url || null, seal_code ? true : false]
    );
    const newSealId = result.insertId;

    // 自动盖章到该账套所有凭证（除非显式传auto_stamp=false）
    let stampedCount = 0;
    if (auto_stamp !== false) {
      const [vouchers] = await conn.query(
        'SELECT id FROM vouchers WHERE book_id = ?',
        [bid]
      );
      if (vouchers.length) {
        const values = vouchers.map(v => [v.id, newSealId, req.user.id || 0]);
        await conn.query(
          'INSERT INTO voucher_seals (voucher_id, seal_id, stamped_by) VALUES ?',
          [values]
        );
        stampedCount = vouchers.length;
      }
    }
    await conn.commit();

    res.json({
      code: 0,
      message: stampedCount > 0
        ? `印章添加成功，已自动盖到 ${stampedCount} 张凭证`
        : '印章添加成功',
      data: { id: newSealId, stamped: stampedCount }
    });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 修改印章
router.put('/:id', async (req, res) => {
  try {
    const { seal_name, seal_code, image_url, is_filed, is_active, seal_type } = req.body;
    await pool.query(
      `UPDATE seals SET 
        seal_name = COALESCE(?, seal_name),
        seal_code = COALESCE(?, seal_code),
        image_url = COALESCE(?, image_url),
        seal_type = COALESCE(?, seal_type),
        is_filed = COALESCE(?, is_filed),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [seal_name || null, seal_code !== undefined ? seal_code : null, image_url !== undefined ? image_url : null,
       seal_type || null, is_filed !== undefined ? is_filed : null, is_active !== undefined ? is_active : null, req.params.id]
    );
    res.json({ code: 0, message: '印章更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除印章
router.delete('/:id', async (req, res) => {
  try {
    const [usage] = await pool.query('SELECT COUNT(*) as cnt FROM voucher_seals WHERE seal_id = ?', [req.params.id]);
    if (usage[0].cnt > 0) return res.status(400).json({ code: 400, message: '该印章已被凭证使用，无法删除' });

    // 同时删除图片文件
    const [rows] = await pool.query('SELECT image_url FROM seals WHERE id = ?', [req.params.id]);
    if (rows[0]?.image_url) {
      // image_url形如 /api/uploads/seals/xxx.png，映射到本地 uploads/ 目录
      const imgName = path.basename(rows[0].image_url);
      const imgPath = path.join(__dirname, '../../uploads/seals', imgName);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
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

    const [vouchers] = await pool.query('SELECT id FROM vouchers WHERE id = ?', [voucher_id]);
    if (!vouchers.length) throw new Error('凭证不存在');

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

// 批量盖章：将此印章盖到当前账套下所有未盖此章的凭证
router.post('/:id/batch-stamp', async (req, res) => {
  try {
    const sealId = req.params.id;
    const { book_id, status } = req.body;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);

    const [sealRows] = await pool.query(
      'SELECT id, seal_name, book_id FROM seals WHERE id = ? AND book_id = ?',
      [sealId, bid]
    );
    if (!sealRows.length) return res.status(404).json({ code: 404, message: '印章不存在或不属于当前账套' });

    let sql = `SELECT v.id FROM vouchers v
               WHERE v.book_id = ?
                 AND NOT EXISTS (
                   SELECT 1 FROM voucher_seals vs WHERE vs.voucher_id = v.id AND vs.seal_id = ?
                 )`;
    const params = [bid, sealId];
    if (status) {
      sql += ' AND v.status = ?';
      params.push(status);
    }
    const [vouchers] = await pool.query(sql, params);

    if (!vouchers.length) {
      return res.json({ code: 0, message: '所有凭证已盖过此印章', data: { stamped: 0, skipped: 0 } });
    }

    const values = vouchers.map(v => [v.id, sealId, req.user.id || 0]);
    await pool.query(
      'INSERT INTO voucher_seals (voucher_id, seal_id, stamped_by) VALUES ?',
      [values]
    );

    res.json({
      code: 0,
      message: `成功盖章到 ${vouchers.length} 张凭证`,
      data: { stamped: vouchers.length, seal_id: parseInt(sealId) }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '批量盖章失败: ' + err.message });
  }
});

// 一键取消该印章在当前账套所有凭证上的盖章
router.delete('/:id/batch-stamp', async (req, res) => {
  try {
    const sealId = req.params.id;
    const { book_id } = req.query;
    const bid = await getDefaultBookId(req.tenantId, book_id ? parseInt(book_id) : null);

    const [result] = await pool.query(
      `DELETE vs FROM voucher_seals vs
       INNER JOIN vouchers v ON vs.voucher_id = v.id
       WHERE vs.seal_id = ? AND v.book_id = ?`,
      [sealId, bid]
    );
    res.json({ code: 0, message: `已取消 ${result.affectedRows} 张凭证的盖章`, data: { removed: result.affectedRows } });
  } catch (err) {
    res.status(500).json({ code: 500, message: '取消批量盖章失败: ' + err.message });
  }
});

module.exports = router;
