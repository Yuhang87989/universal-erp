const express = require('express');
const https = require('https');
const { URL } = require('url');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const dayjs = require('dayjs');

const router = express.Router();
router.use(authenticate);

// DeepSeek API 默认配置（环境变量作为兜底）
const DEFAULT_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEFAULT_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// 获取租户AI配置（优先数据库，兜底环境变量）
async function getTenantAIConfig(tenantId) {
  try {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM tenant_settings WHERE tenant_id=? AND setting_key LIKE "ai_%"',
      [tenantId]
    );
    const cfg = { api_key: DEFAULT_API_KEY, api_url: DEFAULT_API_URL, model: DEFAULT_MODEL };
    rows.forEach(r => {
      const k = r.setting_key.replace('ai_', '');
      if (r.setting_value) cfg[k] = r.setting_value;
    });
    return cfg;
  } catch (e) {
    return { api_key: DEFAULT_API_KEY, api_url: DEFAULT_API_URL, model: DEFAULT_MODEL };
  }
}

// 调用DeepSeek（使用Node内置https，兼容Node16）
function httpPostJSON(urlStr, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => JSON.parse(data), text: () => data }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(new Error('AI请求超时')); });
    req.write(body);
    req.end();
  });
}

async function callDeepSeek(messages, options = {}) {
  const cfg = options.config || { api_key: DEFAULT_API_KEY, api_url: DEFAULT_API_URL, model: DEFAULT_MODEL };
  if (!cfg.api_key) {
    throw new Error('AI服务未配置，请在"AI设置"中填写DeepSeek API Key');
  }
  const response = await httpPostJSON(
    cfg.api_url || DEFAULT_API_URL,
    { 'Authorization': `Bearer ${cfg.api_key}` },
    {
      model: options.model || cfg.model || DEFAULT_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 2000,
      stream: false
    }
  );
  if (!response.ok) {
    const err = response.text();
    throw new Error(`AI服务调用失败: ${response.status} ${err}`);
  }
  const data = response.json();
  return data.choices?.[0]?.message?.content || '';
}

// 收集经营数据上下文（供AI分析）
async function gatherBusinessContext(tenantId) {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const last30 = dayjs().subtract(30, 'day').format('YYYY-MM-DD');

  const [todaySales] = await pool.query(
    `SELECT COUNT(*) as orders, COALESCE(SUM(actual_amount),0) as amount FROM sales_orders
     WHERE tenant_id=? AND DATE(order_date)=? AND status!='cancelled'`, [tenantId, today]);
  const [monthSales] = await pool.query(
    `SELECT COUNT(*) as orders, COALESCE(SUM(actual_amount),0) as amount FROM sales_orders
     WHERE tenant_id=? AND order_date>=? AND status!='cancelled'`, [tenantId, monthStart]);
  const [monthPurchase] = await pool.query(
    `SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as amount FROM purchase_orders
     WHERE tenant_id=? AND order_date>=? AND status!='cancelled'`, [tenantId, monthStart]);
  const [inventory] = await pool.query(
    `SELECT COUNT(DISTINCT i.product_id) as skus, COALESCE(SUM(i.quantity*p.cost_price),0) as cost_value,
            COALESCE(SUM(i.quantity*p.sell_price),0) as sell_value
     FROM inventory i JOIN products p ON i.product_id=p.id
     WHERE i.tenant_id=? AND p.status!='deleted'`, [tenantId]);
  const [lowStock] = await pool.query(
    `SELECT p.name, i.quantity, p.min_stock, p.unit FROM inventory i
     JOIN products p ON i.product_id=p.id
     WHERE i.tenant_id=? AND p.min_stock>0 AND i.quantity<=p.min_stock
     ORDER BY i.quantity ASC LIMIT 10`, [tenantId]);
  const [topProducts] = await pool.query(
    `SELECT p.name, COALESCE(SUM(si.quantity),0) as qty, COALESCE(SUM(si.subtotal),0) as amount
     FROM sale_items si JOIN sales_orders so ON si.sales_order_id=so.id
     JOIN products p ON si.product_id=p.id
     WHERE so.tenant_id=? AND so.order_date>=? AND so.status!='cancelled'
     GROUP BY p.id ORDER BY amount DESC LIMIT 5`, [tenantId, last30]);
  const [finance] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
     FROM finance_records WHERE tenant_id=? AND record_date>=?`, [tenantId, monthStart]);

  return {
    today: { orders: todaySales[0].orders, amount: parseFloat(todaySales[0].amount) },
    month: { sales_orders: monthSales[0].orders, sales_amount: parseFloat(monthSales[0].amount),
             purchase_orders: monthPurchase[0].orders, purchase_amount: parseFloat(monthPurchase[0].amount),
             income: parseFloat(finance[0].income), expense: parseFloat(finance[0].expense),
             profit: parseFloat(finance[0].income) - parseFloat(finance[0].expense) },
    inventory: { skus: inventory[0].skus, cost_value: parseFloat(inventory[0].cost_value), sell_value: parseFloat(inventory[0].sell_value) },
    low_stock: lowStock,
    top_products: topProducts
  };
}

// ========== AI 智能对话 ==========
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ code: 400, message: '请输入问题' });

    const ctx = await gatherBusinessContext(req.tenantId);
    const systemPrompt = `你是一个专业的电商ERP助手，名叫"小智"。你可以帮助老板分析经营数据、回答业务问题、提供决策建议。
请用简洁、专业、友好的中文回答。当前店铺的经营数据如下：

【今日数据】订单${ctx.today.orders}笔，营收¥${ctx.today.amount.toFixed(2)}
【本月数据】销售${ctx.month.sales_orders}笔共¥${ctx.month.sales_amount.toFixed(2)}，采购${ctx.month.purchase_orders}笔共¥${ctx.month.purchase_amount.toFixed(2)}，收入¥${ctx.month.income.toFixed(2)}，支出¥${ctx.month.expense.toFixed(2)}，利润¥${ctx.month.profit.toFixed(2)}
【库存】${ctx.inventory.skus}个SKU，成本总值¥${ctx.inventory.cost_value.toFixed(2)}，销售总值¥${ctx.inventory.sell_value.toFixed(2)}
【库存预警】${ctx.low_stock.length > 0 ? ctx.low_stock.map(s => `${s.name}(${s.quantity}${s.unit}/预警${s.min_stock})`).join('、') : '无'}
【近30天热销】${ctx.top_products.map(p => `${p.name}(${p.qty}件/¥${Number(p.amount).toFixed(2)})`).join('、')}

请基于以上数据回答问题。如果需要更详细的数据，告诉用户可以在"数据分析中心"查看。回答控制在300字以内。`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content: message }
    ];

    const reply = await callDeepSeek(messages, { temperature: 0.7, max_tokens: 800, config: await getTenantAIConfig(req.tenantId) });

    // 保存对话记录（可选）
    await pool.query(
      `INSERT INTO ai_chat_history (tenant_id, user_id, user_message, ai_reply, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [req.tenantId, req.user.id, message, reply]
    ).catch(() => {}); // 表可能不存在，忽略

    res.json({ code: 0, data: { reply, context: ctx } });
  } catch (err) {
    console.error('AI对话失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ========== AI 经营诊断 ==========
router.get('/diagnosis', async (req, res) => {
  try {
    const ctx = await gatherBusinessContext(req.tenantId);
    const prompt = `你是一位资深零售/电商经营顾问。请根据以下经营数据，给出一份简明扼要的经营诊断报告，包含：
1. 整体评价（1-2句）
2. 发现的问题（列出3-5个关键问题）
3. 改进建议（针对每个问题给出具体可执行的建议）
4. 下一步行动（最应该先做的1-2件事）

数据：
${JSON.stringify(ctx, null, 2)}

请用JSON格式返回，字段为：overall_evaluation, issues(数组，每项含problem和suggestion), next_actions(数组)。只返回JSON，不要其他文字。`;

    const reply = await callDeepSeek([{ role: 'user', content: prompt }], { temperature: 0.5, max_tokens: 1500, config: await getTenantAIConfig(req.tenantId) });
    let diagnosis;
    try {
      // 提取JSON
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      diagnosis = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: reply };
    } catch {
      diagnosis = { raw: reply };
    }

    res.json({ code: 0, data: { diagnosis, raw_data: ctx } });
  } catch (err) {
    console.error('AI诊断失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ========== AI 智能补货建议 ==========
router.get('/replenish', async (req, res) => {
  try {
    // 获取近期销售速度 + 当前库存
    const [products] = await pool.query(
      `SELECT p.id, p.name, p.unit, p.cost_price, p.min_stock,
              i.quantity as current_stock,
              COALESCE(sales_30d.total_qty, 0) as sold_30d,
              COALESCE(sales_7d.total_qty, 0) as sold_7d
       FROM products p
       LEFT JOIN inventory i ON i.product_id=p.id AND i.tenant_id=p.tenant_id
       LEFT JOIN (
         SELECT si.product_id, SUM(si.quantity) as total_qty
         FROM sale_items si JOIN sales_orders so ON si.sales_order_id=so.id
         WHERE so.tenant_id=? AND so.order_date>=DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND so.status!='cancelled'
         GROUP BY si.product_id
       ) sales_30d ON sales_30d.product_id=p.id
       LEFT JOIN (
         SELECT si.product_id, SUM(si.quantity) as total_qty
         FROM sale_items si JOIN sales_orders so ON si.sales_order_id=so.id
         WHERE so.tenant_id=? AND so.order_date>=DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND so.status!='cancelled'
         GROUP BY si.product_id
       ) sales_7d ON sales_7d.product_id=p.id
       WHERE p.tenant_id=? AND p.status='active'
       HAVING current_stock IS NOT NULL
       ORDER BY sold_30d DESC`,
      [req.tenantId, req.tenantId, req.tenantId]
    );

    // 计算建议
    const suggestions = products.map(p => {
      const dailyRate = parseFloat(p.sold_30d) / 30; // 日均销量
      const weeklyRate = parseFloat(p.sold_7d) / 7;
      const stockDays = dailyRate > 0 ? parseFloat(p.current_stock) / dailyRate : 999; // 可售天数
      const suggestQty = Math.max(0, Math.ceil(dailyRate * 14 - parseFloat(p.current_stock))); // 建议补到14天量
      let urgency = 'normal';
      if (stockDays <= 3) urgency = 'critical';
      else if (stockDays <= 7) urgency = 'warning';
      else if (parseFloat(p.current_stock) <= parseFloat(p.min_stock)) urgency = 'warning';

      return {
        product_id: p.id, product_name: p.name, unit: p.unit,
        current_stock: parseFloat(p.current_stock), min_stock: parseFloat(p.min_stock),
        daily_rate: parseFloat(dailyRate.toFixed(2)),
        sold_30d: parseFloat(p.sold_30d), sold_7d: parseFloat(p.sold_7d),
        stock_days: stockDays === 999 ? null : parseFloat(stockDays.toFixed(1)),
        suggest_qty: suggestQty,
        estimated_cost: suggestQty * parseFloat(p.cost_price),
        urgency
      };
    }).filter(s => s.suggest_qty > 0 || s.urgency !== 'normal');

    res.json({ code: 0, data: suggestions.slice(0, 50) });
  } catch (err) {
    console.error('补货建议失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ========== AI 文案生成（商品描述/营销话术） ==========
router.post('/copywriting', async (req, res) => {
  try {
    const { type, productInfo, tone = 'professional' } = req.body;
    const prompts = {
      product_desc: `请为以下商品写一段吸引人的商品描述（150字以内），突出卖点：\n${productInfo}`,
      promotion: `请为以下商品/活动写一段促销文案（100字以内），语气要${tone === 'casual' ? '活泼亲切' : tone === 'luxury' ? '高端大气' : '专业可信'}：\n${productInfo}`,
      purchase_tip: `请为以下商品写一段采购建议/验货要点（100字以内）：\n${productInfo}`,
      customer_reply: `请为客户的以下评价/问题写一段礼貌得体的回复（80字以内）：\n${productInfo}`
    };
    const prompt = prompts[type] || prompts.product_desc;
    const reply = await callDeepSeek([{ role: 'user', content: prompt }], { temperature: 0.8, max_tokens: 500, config: await getTenantAIConfig(req.tenantId) });
    res.json({ code: 0, data: { text: reply } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ========== AI 销售预测 ==========
router.get('/forecast', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    // 取近90天销售数据
    const [dailySales] = await pool.query(
      `SELECT DATE(order_date) as date, COALESCE(SUM(actual_amount),0) as amount, COUNT(*) as orders
       FROM sales_orders
       WHERE tenant_id=? AND order_date>=DATE_SUB(CURDATE(), INTERVAL 90 DAY) AND status!='cancelled'
       GROUP BY DATE(order_date) ORDER BY date ASC`,
      [req.tenantId]
    );

    const prompt = `你是销售预测分析师。以下是某店铺近90天的每日销售数据（日期,销售额,订单数）：
${dailySales.map(d => `${d.date.toISOString().slice(0,10)},¥${Number(d.amount).toFixed(2)},${d.orders}单`).join('\n')}

请预测未来${days}天的每日销售额和订单数。用JSON数组格式返回，每项含date(从明天开始的YYYY-MM-DD),amount(预测金额),orders(预测订单数),confidence(高/中/低)。只返回JSON数组。`;

    const reply = await callDeepSeek([{ role: 'user', content: prompt }], { temperature: 0.4, max_tokens: 1000, config: await getTenantAIConfig(req.tenantId) });
    let forecast;
    try {
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      forecast = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      forecast = [];
    }

    res.json({ code: 0, data: { forecast, history: dailySales } });
  } catch (err) {
    console.error('销售预测失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ========== AI 票据识别（预留接口） ==========
router.post('/ocr/receipt', async (req, res) => {
  // TODO: 对接OCR服务（百度OCR/腾讯OCR/PaddleOCR）
  // 接收图片base64，返回结构化票据数据
  res.json({
    code: 0,
    data: {
      message: 'OCR票据识别接口预留',
      supported_types: ['采购发票', '销售小票', '银行回单', '费用报销单'],
      status: 'pending_integration'
    }
  });
});

// AI配置获取
router.get('/config', async (req, res) => {
  try {
    const cfg = await getTenantAIConfig(req.tenantId);
    res.json({
      code: 0,
      data: {
        provider: 'deepseek',
        api_url: cfg.api_url,
        model: cfg.model,
        has_api_key: !!cfg.api_key,
        api_key_preview: cfg.api_key ? cfg.api_key.slice(0, 6) + '****' + cfg.api_key.slice(-4) : '',
        using_env: cfg.api_key === DEFAULT_API_KEY && !!DEFAULT_API_KEY
      }
    });
  } catch (err) {
    res.json({ code: 0, data: { provider: 'deepseek', has_api_key: !!DEFAULT_API_KEY } });
  }
});

// AI配置保存（用户可自助更换API Key/接口地址/模型）
router.put('/config', async (req, res) => {
  try {
    const { api_key, api_url, model } = req.body;
    const settings = {};
    if (api_key !== undefined) settings.api_key = api_key.trim();
    if (api_url !== undefined) settings.api_url = api_url.trim();
    if (model !== undefined) settings.model = model.trim();

    for (const [k, v] of Object.entries(settings)) {
      const settingKey = `ai_${k}`;
      if (v === '' ) {
        // 清空：删除租户级配置，回退到环境变量
        await pool.query('DELETE FROM tenant_settings WHERE tenant_id=? AND setting_key=?', [req.tenantId, settingKey]);
      } else {
        await pool.query(
          `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, created_at, updated_at)
           VALUES (?, ?, ?, NOW(), NOW())
           ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), updated_at=NOW()`,
          [req.tenantId, settingKey, v]
        );
      }
    }
    const cfg = await getTenantAIConfig(req.tenantId);
    res.json({
      code: 0,
      message: 'AI配置已保存',
      data: { has_api_key: !!cfg.api_key, api_url: cfg.api_url, model: cfg.model }
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: '保存失败：' + err.message });
  }
});

// 测试AI连接（验证API Key是否可用）
router.post('/test', async (req, res) => {
  try {
    const cfg = await getTenantAIConfig(req.tenantId);
    const reply = await callDeepSeek(
      [{ role: 'user', content: '回复"连接成功"四个字' }],
      { temperature: 0, max_tokens: 20, config: cfg }
    );
    res.json({ code: 0, message: '连接成功', data: { reply } });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// ========== AI 自然语言快速录入 ==========
router.post('/quick-entry', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ code: 400, message: '请输入业务描述' });

    // 获取租户商品和供应商列表用于匹配
    const [products] = await pool.query('SELECT id, name, unit, cost_price, sell_price FROM products WHERE tenant_id=? AND status="active"', [req.tenantId]);
    const [suppliers] = await pool.query('SELECT id, name FROM suppliers WHERE tenant_id=?', [req.tenantId]);

    const prompt = `你是电商ERP数据录入助手。根据以下自然语言描述，识别业务类型并提取结构化数据，只返回JSON。

可用商品：${products.map(p => `${p.name}(${p.unit},进价${p.cost_price},售价${p.sell_price})`).join('、') || '无'}
可用供应商：${suppliers.map(s => s.name).join('、') || '无'}

业务描述："${text}"

判断类型并返回对应JSON（三选一）：

采购单：
{"type":"purchase","supplier_name":"供应商名（无则null）","items":[{"name":"商品名","quantity":数量,"unit":"单位","cost_price":单价}],"total_amount":总金额,"order_date":"YYYY-MM-DD（无则今天）"}

销售单：
{"type":"sale","customer_name":"客户名（无则散客）","items":[{"name":"商品名","quantity":数量,"unit":"单位","price":单价}],"total_amount":总金额,"payment_method":"wechat/alipay/cash/bank","order_date":"YYYY-MM-DD"}

收支记录：
{"type":"finance","finance_type":"income/expense","category":"类别（如采购支出、房租、工资、销售收入等）","amount":金额,"remark":"备注","record_date":"YYYY-MM-DD","payment_method":"wechat/alipay/cash/bank"}

只返回JSON，不要任何其他文字。如果描述无法识别，返回{"type":"unknown","message":"无法识别业务类型"}。`;

    const reply = await callDeepSeek(
      [{ role: 'user', content: prompt }],
      { temperature: 0.1, max_tokens: 800, config: await getTenantAIConfig(req.tenantId) }
    );

    let parsed;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { type: 'unknown', raw: reply };
    } catch {
      return res.status(400).json({ code: 400, message: 'AI解析结果格式异常，请重新描述' });
    }

    if (parsed.type === 'unknown') {
      return res.status(400).json({ code: 400, message: parsed.message || '无法识别业务类型，请更详细描述' });
    }

    // 对采购/销售单，匹配商品ID
    if (parsed.items && Array.isArray(parsed.items)) {
      parsed.items = parsed.items.map(item => {
        const matched = products.find(p => p.name.includes(item.name) || item.name.includes(p.name));
        return { ...item, product_id: matched?.id || null, unit: item.unit || matched?.unit || '件' };
      });
    }
    if (parsed.supplier_name) {
      const matchedSupplier = suppliers.find(s => s.name.includes(parsed.supplier_name) || parsed.supplier_name.includes(s.name));
      if (matchedSupplier) parsed.supplier_id = matchedSupplier.id;
    }

    res.json({ code: 0, data: parsed });
  } catch (err) {
    console.error('AI快速录入失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 确认AI录入
router.post('/quick-entry/confirm', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { parsed, text } = req.body;
    if (!parsed || !parsed.type) return res.status(400).json({ code: 400, message: '数据不完整' });
    await conn.beginTransaction();

    if (parsed.type === 'purchase') {
      // 创建采购单
      const orderNo = 'PO' + Date.now().toString().slice(-10);
      const [result] = await conn.query(
        'INSERT INTO purchase_orders (tenant_id, supplier_id, order_no, order_date, total_amount, status, remark, operator_id, created_at) VALUES (?, ?, ?, ?, ?, "draft", ?, ?, NOW())',
        [req.tenantId, parsed.supplier_id || null, orderNo, parsed.order_date || new Date().toISOString().slice(0, 10), parsed.total_amount || 0, text || 'AI录入', req.user.id]
      );
      const orderId = result.insertId;
      // 插入明细
      for (const item of parsed.items || []) {
        if (!item.product_id) continue;
        const product = await conn.query('SELECT cost_price FROM products WHERE id=?', [item.product_id]);
        const cost = item.cost_price || product[0]?.[0]?.cost_price || 0;
        await conn.query(
          'INSERT INTO purchase_items (purchase_order_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, cost]
        );
      }
      await conn.commit();
      return res.json({ code: 0, message: '采购单已创建（待入库）', data: { id: orderId, type: 'purchase' } });
    }

    if (parsed.type === 'sale') {
      const orderNo = 'SO' + Date.now().toString().slice(-10);
      const orderDate = parsed.order_date ? parsed.order_date + ' 12:00:00' : new Date().toISOString().slice(0, 19).replace('T', ' ');
      const [result] = await conn.query(
        'INSERT INTO sales_orders (tenant_id, order_no, order_date, total_amount, actual_amount, payment_method, status, remark, operator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, "completed", ?, ?, NOW())',
        [req.tenantId, orderNo, orderDate, parsed.total_amount || 0, parsed.total_amount || 0, parsed.payment_method || 'cash', text || 'AI录入', req.user.id]
      );
      const orderId = result.insertId;
      for (const item of parsed.items || []) {
        if (!item.product_id) continue;
        const [prods] = await conn.query('SELECT sell_price FROM products WHERE id=?', [item.product_id]);
        const price = item.price || prods[0]?.sell_price || 0;
        await conn.query(
          'INSERT INTO sale_items (sales_order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, price]
        );
        // 扣减库存
        await conn.query('UPDATE inventory SET quantity = quantity - ? WHERE product_id=? AND tenant_id=?', [item.quantity, item.product_id, req.tenantId]);
      }
      await conn.commit();
      return res.json({ code: 0, message: '销售单已创建', data: { id: orderId, type: 'sale' } });
    }

    if (parsed.type === 'finance') {
      await conn.query(
        'INSERT INTO finance_records (tenant_id, type, category, amount, payment_method, remark, record_date, operator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [req.tenantId, parsed.finance_type || 'expense', parsed.category || '其他', parsed.amount, parsed.payment_method || null, parsed.remark || text, parsed.record_date || new Date().toISOString().slice(0, 10), req.user.id]
      );
      await conn.commit();
      return res.json({ code: 0, message: '收支记录已录入', data: { type: 'finance' } });
    }

    await conn.rollback();
    res.status(400).json({ code: 400, message: '不支持的类型' });
  } catch (err) {
    await conn.rollback();
    console.error('确认录入失败:', err);
    res.status(500).json({ code: 500, message: '录入失败: ' + err.message });
  } finally {
    conn.release();
  }
});

// ========== AI 财务报告解读 ==========
router.get('/finance-insight', async (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    const tenantId = req.tenantId;

    // 并发拉取三张报表
    const [bsRows, isRows, cfRows] = await Promise.all([
      pool.query(
        `SELECT ac.id, ac.code, ac.name, ac.category,
          COALESCE(SUM(CASE WHEN vi.debit>0 THEN vi.debit ELSE 0 END),0) as debit,
          COALESCE(SUM(CASE WHEN vi.credit>0 THEN vi.credit ELSE 0 END),0) as credit
         FROM accounting_accounts ac
         LEFT JOIN voucher_items vi ON vi.account_id=ac.id
         LEFT JOIN vouchers v ON v.id=vi.voucher_id AND v.status='posted'
           AND (v.voucher_date BETWEEN ? AND LAST_DAY(?))
         WHERE ac.book_id=(SELECT id FROM accounting_books WHERE tenant_id=? LIMIT 1)
           AND ac.is_enabled=1
         GROUP BY ac.id`,
        [`${period}-01`, `${period}-01`, tenantId]
      ).then(([r]) => r).catch(() => []),
      pool.query(
        `SELECT ac.code, ac.name, ac.category,
          COALESCE(SUM(vi.credit),0) as credit,
          COALESCE(SUM(vi.debit),0) as debit
         FROM accounting_accounts ac
         JOIN voucher_items vi ON vi.account_id=ac.id
         JOIN vouchers v ON v.id=vi.voucher_id AND v.status='posted'
           AND v.voucher_date BETWEEN ? AND LAST_DAY(?)
         WHERE ac.book_id=(SELECT id FROM accounting_books WHERE tenant_id=? LIMIT 1)
           AND ac.is_enabled=1 AND ac.category IN ('income','cost','expense')
         GROUP BY ac.id`,
        [`${period}-01`, `${period}-01`, tenantId]
      ).then(([r]) => r).catch(() => []),
      pool.query(
        `SELECT COALESCE(SUM(CASE WHEN ft.direction='in' THEN ft.amount ELSE 0 END),0) as total_in,
          COALESCE(SUM(CASE WHEN ft.direction='out' THEN ft.amount ELSE 0 END),0) as total_out,
          ft.business_type
         FROM fund_transactions ft
         WHERE ft.tenant_id=? AND ft.tx_date BETWEEN ? AND LAST_DAY(?)
         GROUP BY ft.business_type`,
        [tenantId, `${period}-01`, `${period}-01`]
      ).then(([r]) => r).catch(() => []),
    ]);

    // 组装简化报表数据供AI分析
    const bs = { assets: 0, liabilities: 0, equity: 0, details: [] };
    bsRows.forEach((r) => {
      const bal = parseFloat(r.debit) - parseFloat(r.credit);
      if (r.category === 'asset') bs.assets += bal;
      else if (r.category === 'liability') bs.liabilities += bal;
      else if (r.category === 'equity') bs.equity += bal;
      if (Math.abs(bal) > 0.01) bs.details.push({ code: r.code, name: r.name, category: r.category, balance: Number(bal.toFixed(2)) });
    });

    const ist = { income: 0, cost: 0, expense: 0, details: [] };
    isRows.forEach((r) => {
      // 收入：贷方-借方；成本费用：借方-贷方
      let amount = 0;
      if (r.category === 'income') amount = parseFloat(r.credit) - parseFloat(r.debit);
      else amount = parseFloat(r.debit) - parseFloat(r.credit);
      if (r.category === 'income') ist.income += amount;
      else if (r.category === 'cost') ist.cost += amount;
      else if (r.category === 'expense') ist.expense += amount;
      if (Math.abs(amount) > 0.01) ist.details.push({ name: r.name, category: r.category, amount: Number(amount.toFixed(2)) });
    });
    const grossProfit = ist.income - ist.cost;
    const netProfit = grossProfit - ist.expense;

    const cf = { total_in: 0, total_out: 0, net: 0, byType: cfRows };
    cfRows.forEach((r) => {
      cf.total_in += parseFloat(r.total_in);
      cf.total_out += parseFloat(r.total_out);
    });
    cf.net = cf.total_in - cf.total_out;

    const reportData = {
      period,
      balance_sheet: {
        total_assets: Number(bs.assets.toFixed(2)),
        total_liabilities: Number(bs.liabilities.toFixed(2)),
        total_equity: Number(bs.equity.toFixed(2)),
        key_accounts: bs.details.slice(0, 20),
      },
      income_statement: {
        total_income: Number(ist.income.toFixed(2)),
        total_cost: Number(ist.cost.toFixed(2)),
        gross_profit: Number(grossProfit.toFixed(2)),
        total_expense: Number(ist.expense.toFixed(2)),
        net_profit: Number(netProfit.toFixed(2)),
        profit_margin: ist.income > 0 ? Number((netProfit / ist.income * 100).toFixed(1)) : 0,
        breakdown: ist.details,
      },
      cash_flow: {
        total_inflow: Number(cf.total_in.toFixed(2)),
        total_outflow: Number(cf.total_out.toFixed(2)),
        net_cash: Number(cf.net.toFixed(2)),
        by_business_type: cf.byType,
      },
    };

    const prompt = `你是一位资深的小微企业财务顾问。请用老板听得懂的大白话，解读以下${period}的财务数据，给出简明扼要的经营分析。

报表数据（JSON）：
${JSON.stringify(reportData, null, 2)}

请按以下结构返回，用中文，总字数控制在500字以内：
1. **一句话总结**：这个月经营整体怎么样
2. **赚钱能力**：收入、成本、费用、净利润、利润率分析，指出最大的开支项
3. **财务健康**：资产负债情况，是否有偿债压力，现金是否充裕
4. **风险提醒**：发现的1-3个需要关注的问题
5. **行动建议**：下个月最应该做的1-3件具体事情

注意：
- 不要使用专业术语堆砌，要像跟老板聊天一样
- 如果数据为0或为空，如实说明"本月暂无相关数据"
- 数字要引用具体金额
- 不要返回JSON，直接返回Markdown格式的文字`;

    const reply = await callDeepSeek(
      [{ role: 'user', content: prompt }],
      { temperature: 0.6, max_tokens: 1200, config: await getTenantAIConfig(tenantId) }
    );

    res.json({ code: 0, data: { insight: reply, report: reportData } });
  } catch (err) {
    console.error('AI财务解读失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 商品销售洞察：畅销榜/滞销榜/毛利分析 + AI选品补货建议
router.get('/product-insight', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const days = parseInt(req.query.days) || 30;
    const since = dayjs().subtract(days, 'day').format('YYYY-MM-DD');

    // 1. 商品销量排行（近N天，已完成订单）
    const [topRows] = await pool.query(
      `SELECT p.id, p.name, p.sku, p.cost_price, p.sell_price,
              COALESCE(SUM(si.quantity),0) as qty,
              COALESCE(SUM(si.subtotal),0) as revenue
       FROM sale_items si
       JOIN sales_orders so ON so.id = si.sales_order_id
       JOIN products p ON p.id = si.product_id
       WHERE so.tenant_id=? AND so.status='completed' AND DATE(so.order_date)>=?
       GROUP BY p.id
       ORDER BY qty DESC
       LIMIT 50`,
      [tenantId, since]
    );

    // 2. 滞销商品：近N天无销量的在售商品
    const [slowRows] = await pool.query(
      `SELECT p.id, p.name, p.sku, p.sell_price, p.cost_price,
              COALESCE((SELECT SUM(quantity) FROM inventory WHERE tenant_id=p.tenant_id AND product_id=p.id),0) as stock
       FROM products p
       WHERE p.tenant_id=? AND p.status='active'
         AND p.id NOT IN (
           SELECT DISTINCT si.product_id FROM sale_items si
           JOIN sales_orders so ON so.id=si.sales_order_id
           WHERE so.tenant_id=? AND so.status='completed' AND DATE(so.order_date)>=?
         )
       HAVING stock > 0
       ORDER BY stock DESC
       LIMIT 30`,
      [tenantId, tenantId, since]
    );

    // 3. 当前库存 & 低库存预警
    const [stockRows] = await pool.query(
      `SELECT p.id, p.name, p.min_stock,
              COALESCE((SELECT SUM(quantity) FROM inventory WHERE tenant_id=p.tenant_id AND product_id=p.id),0) as stock
       FROM products p
       WHERE p.tenant_id=? AND p.status='active'
       GROUP BY p.id`,
      [tenantId]
    );

    // 组装畅销榜（带毛利）
    const topProducts = topRows.map(r => {
      const cost = parseFloat(r.cost_price) || 0;
      const qty = parseFloat(r.qty) || 0;
      const revenue = parseFloat(r.revenue) || 0;
      const gross = revenue - cost * qty;
      return {
        name: r.name, sku: r.sku,
        qty: Number(qty.toFixed(1)),
        revenue: Number(revenue.toFixed(2)),
        gross_profit: Number(gross.toFixed(2)),
        margin: revenue > 0 ? Number((gross / revenue * 100).toFixed(1)) : 0
      };
    });

    const slowProducts = slowRows.map(r => ({
      name: r.name, sku: r.sku,
      stock: Number((parseFloat(r.stock)||0).toFixed(1)),
      cost_value: Number(((parseFloat(r.stock)||0) * (parseFloat(r.cost_price)||0)).toFixed(2))
    }));

    const lowStock = stockRows
      .filter(r => {
        const stock = parseFloat(r.stock)||0;
        const min = parseFloat(r.min_stock)||0;
        return min > 0 && stock <= min;
      })
      .map(r => ({ name: r.name, stock: Number((parseFloat(r.stock)||0).toFixed(1)), min_stock: r.min_stock }));

    // 汇总
    const totalRevenue = topProducts.reduce((s,r)=>s+r.revenue,0);
    const totalGross = topProducts.reduce((s,r)=>s+r.gross_profit,0);
    const slowStockValue = slowProducts.reduce((s,r)=>s+r.cost_value,0);

    const reportData = {
      period_days: days,
      summary: {
        active_products: topProducts.length,
        total_revenue: Number(totalRevenue.toFixed(2)),
        total_gross_profit: Number(totalGross.toFixed(2)),
        gross_margin: totalRevenue > 0 ? Number((totalGross/totalRevenue*100).toFixed(1)) : 0,
        slow_moving_count: slowProducts.length,
        slow_stock_value: Number(slowStockValue.toFixed(2)),
        low_stock_count: lowStock.length
      },
      top_products: topProducts.slice(0, 15),
      slow_products: slowProducts.slice(0, 15),
      low_stock: lowStock.slice(0, 15)
    };

    const prompt = `你是一位电商选品和库存管理专家。以下是一家电商店铺近${days}天的商品销售数据，请用老板听得懂的大白话给出经营建议。

数据（JSON）：
${JSON.stringify(reportData, null, 2)}

请按以下结构返回，中文，500字以内：
1. **一句话总结**：近${days}天商品销售整体情况
2. **爆款分析**：哪些商品卖得好、毛利高，建议怎么加大投入（补货/主推/捆绑）
3. **滞销预警**：哪些商品压库存、占用资金，建议清仓促销还是下架
4. **补货提醒**：哪些商品库存告急需要尽快补货
5. **行动建议**：最应该马上做的2-3件具体事

注意：
- 像跟店主聊天，不要堆砌术语
- 数字引用具体金额/数量
- 如果某类数据为空，如实说明，不要编造
- 直接返回Markdown文字，不要返回JSON`;

    const reply = await callDeepSeek(
      [{ role: 'user', content: prompt }],
      { temperature: 0.6, max_tokens: 1200, config: await getTenantAIConfig(tenantId) }
    );

    res.json({ code: 0, data: { insight: reply, report: reportData } });
  } catch (err) {
    console.error('AI商品洞察失败:', err);
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;

