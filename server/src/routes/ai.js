const express = require('express');
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

// 调用DeepSeek
async function callDeepSeek(messages, options = {}) {
  const cfg = options.config || { api_key: DEFAULT_API_KEY, api_url: DEFAULT_API_URL, model: DEFAULT_MODEL };
  if (!cfg.api_key) {
    throw new Error('AI服务未配置，请在"AI设置"中填写DeepSeek API Key');
  }
  const response = await fetch(cfg.api_url || DEFAULT_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.api_key}` },
    body: JSON.stringify({
      model: options.model || cfg.model || DEFAULT_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens || 2000,
      stream: false
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`AI服务调用失败: ${response.status} ${err}`);
  }
  const data = await response.json();
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

module.exports = router;
