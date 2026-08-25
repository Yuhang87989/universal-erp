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

// 创建新账套（自动复制默认科目模板）
router.post('/books', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { book_name, fiscal_year, accounting_standard, currency, start_date } = req.body;
    if (!book_name) throw new Error('账套名称不能为空');

    // 1. 创建账套
    const [result] = await conn.query(
      `INSERT INTO accounting_books (tenant_id, book_name, entity_name, credit_code, entity_type, fiscal_year_start, accounting_standard, currency, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [req.tenantId, book_name, req.body.entity_name || book_name, req.body.credit_code || null,
       req.body.entity_type || 'individual', req.body.fiscal_year_start || 1,
       accounting_standard || 'small_enterprise', currency || 'CNY']
    );
    const newBookId = result.insertId;

    // 2. 从该租户第一个账套复制科目模板（如果有），否则用内置标准科目
    const [existingBooks] = await conn.query(
      'SELECT id FROM accounting_books WHERE tenant_id = ? AND id != ? AND is_active = TRUE ORDER BY id ASC LIMIT 1',
      [req.tenantId, newBookId]
    );

    if (existingBooks.length) {
      // 从已有账套复制科目
      await conn.query(
        `INSERT INTO accounting_accounts (book_id, code, name, category, parent_id, direction, level, is_enabled, sort_order)
         SELECT ?, code, name, category, parent_id, direction, level, is_enabled, sort_order
         FROM accounting_accounts WHERE book_id = ?`,
        [newBookId, existingBooks[0].id]
      );
    } else {
      // 内置小企业会计准则标准科目
      const standardAccounts = [
        // 资产类
        ['1001','库存现金','asset',null,'debit',1],
        ['1002','银行存款','asset',null,'debit',1],
        ['1002.01','基本户','asset',null,'debit',2],
        ['1002.02','一般户','asset',null,'debit',2],
        ['1012','其他货币资金','asset',null,'debit',1],
        ['1101','交易性金融资产','asset',null,'debit',1],
        ['1121','应收票据','asset',null,'debit',1],
        ['1122','应收账款','asset',null,'debit',1],
        ['1123','预付账款','asset',null,'debit',1],
        ['1131','应收股利','asset',null,'debit',1],
        ['1132','应收利息','asset',null,'debit',1],
        ['1221','其他应收款','asset',null,'debit',1],
        ['1231','坏账准备','asset',null,'credit',1],
        ['1241','库存商品','asset',null,'debit',1],
        ['1241.01','库存商品-采购','asset',null,'debit',2],
        ['1241.02','库存商品-销售','asset',null,'debit',2],
        ['1401','存货','asset',null,'debit',1],
        ['1402','在途物资','asset',null,'debit',1],
        ['1403','原材料','asset',null,'debit',1],
        ['1405','库存商品','asset',null,'debit',1],
        ['1411','周转材料','asset',null,'debit',1],
        ['1601','固定资产','asset',null,'debit',1],
        ['1602','累计折旧','asset',null,'credit',1],
        ['1606','固定资产清理','asset',null,'debit',1],
        ['1701','无形资产','asset',null,'debit',1],
        ['1702','累计摊销','asset',null,'credit',1],
        ['1801','长期待摊费用','asset',null,'debit',1],
        ['1901','待处理财产损溢','asset',null,'debit',1],
        // 负债类
        ['2001','短期借款','liability',null,'credit',1],
        ['2201','应付票据','liability',null,'credit',1],
        ['2202','应付账款','liability',null,'credit',1],
        ['2203','预收账款','liability',null,'credit',1],
        ['2211','应付职工薪酬','liability',null,'credit',1],
        ['2221','应交税费','liability',null,'credit',1],
        ['2221.01','应交增值税','liability',null,'credit',2],
        ['2221.01.01','进项税额','liability',null,'debit',3],
        ['2221.01.02','销项税额','liability',null,'credit',3],
        ['2221.01.03','已交税金','liability',null,'debit',3],
        ['2221.02','应交所得税','liability',null,'credit',2],
        ['2221.03','应交个人所得税','liability',null,'credit',2],
        ['2221.04','应交城建税','liability',null,'credit',2],
        ['2221.05','教育费附加','liability',null,'credit',2],
        ['2231','应付利息','liability',null,'credit',1],
        ['2232','应付股利','liability',null,'credit',1],
        ['2241','其他应付款','liability',null,'credit',1],
        ['2501','长期借款','liability',null,'credit',1],
        ['2502','长期应付款','liability',null,'credit',1],
        // 权益类
        ['3001','实收资本','equity',null,'credit',1],
        ['3002','资本公积','equity',null,'credit',1],
        ['3101','盈余公积','equity',null,'credit',1],
        ['3103','本年利润','equity',null,'credit',1],
        ['3104','利润分配','equity',null,'credit',1],
        // 收入类
        ['5001','主营业务收入','revenue',null,'credit',1],
        ['5001.01','商品销售收入','revenue',null,'credit',2],
        ['5051','其他业务收入','revenue',null,'credit',2],
        ['5301','营业外收入','revenue',null,'credit',1],
        // 成本/费用类
        ['5401','主营业务成本','expense',null,'debit',1],
        ['5402','其他业务成本','expense',null,'debit',1],
        ['5403','税金及附加','expense',null,'debit',1],
        ['5601','销售费用','expense',null,'debit',1],
        ['5601.01','广告费','expense',null,'debit',2],
        ['5601.02','运费','expense',null,'debit',2],
        ['5601.03','工资','expense',null,'debit',2],
        ['5601.04','办公费','expense',null,'debit',2],
        ['5602','管理费用','expense',null,'debit',1],
        ['5602.01','工资','expense',null,'debit',2],
        ['5602.02','办公费','expense',null,'debit',2],
        ['5602.03','差旅费','expense',null,'debit',2],
        ['5602.04','折旧费','expense',null,'debit',2],
        ['5602.05','业务招待费','expense',null,'debit',2],
        ['5603','财务费用','expense',null,'debit',1],
        ['5603.01','利息支出','expense',null,'debit',2],
        ['5603.02','手续费','expense',null,'debit',2],
        ['5711','营业外支出','expense',null,'debit',1],
        ['5801','所得税费用','expense',null,'debit',1],
      ];
      // 先处理无parent_id的科目
      const idMap = {};
      // 先插顶级科目
      for (const [code, name, cat, parent, dir, level] of standardAccounts.filter(a => !a[3])) {
        const [r] = await conn.query(
          'INSERT INTO accounting_accounts (book_id, code, name, category, parent_id, direction, level) VALUES (?, ?, ?, ?, NULL, ?, ?)',
          [newBookId, code, name, cat, dir, level]
        );
        idMap[code] = r.insertId;
      }
      // 再插子科目（用code前缀匹配parent）
      for (const [code, name, cat, parent, dir, level] of standardAccounts.filter(a => a[3])) {
        // parent字段存储的是null在过滤后，这里用code前缀找parent
        const parts = code.split('.');
        const parentCode = parts.slice(0, parts.length - 1).join('.');
        const parentId = idMap[parentCode];
        if (parentId) {
          const [r] = await conn.query(
            'INSERT INTO accounting_accounts (book_id, code, name, category, parent_id, direction, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newBookId, code, name, cat, parentId, dir, level]
          );
          idMap[code] = r.insertId;
        }
      }
    }

    await conn.commit();
    res.json({ code: 0, message: '账套创建成功', data: { id: newBookId, book_name } });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ code: 400, message: err.message });
  } finally {
    conn.release();
  }
});

// 修改账套信息
router.put('/books/:id', async (req, res) => {
  try {
    const { book_name, entity_name, credit_code, entity_type, fiscal_year_start, accounting_standard, currency, is_active } = req.body;
    await pool.query(
      `UPDATE accounting_books SET
        book_name = COALESCE(?, book_name),
        entity_name = COALESCE(?, entity_name),
        credit_code = COALESCE(?, credit_code),
        entity_type = COALESCE(?, entity_type),
        fiscal_year_start = COALESCE(?, fiscal_year_start),
        accounting_standard = COALESCE(?, accounting_standard),
        currency = COALESCE(?, currency),
        is_active = COALESCE(?, is_active)
       WHERE id = ? AND tenant_id = ?`,
      [book_name || null, entity_name || null, credit_code || null, entity_type || null,
       fiscal_year_start || null, accounting_standard || null, currency || null,
       is_active !== undefined ? is_active : null,
       req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '账套更新成功' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 删除账套（仅停用，不物理删除）
router.delete('/books/:id', async (req, res) => {
  try {
    const [books] = await pool.query(
      'SELECT COUNT(*) as cnt FROM accounting_books WHERE tenant_id = ? AND is_active = TRUE',
      [req.tenantId]
    );
    if (books[0].cnt <= 1) throw new Error('至少保留一个账套');
    await pool.query(
      'UPDATE accounting_books SET is_active = FALSE WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId]
    );
    res.json({ code: 0, message: '账套已停用' });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
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
