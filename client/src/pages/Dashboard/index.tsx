import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Alert, Tag, Button, Input, Modal, message, Tooltip } from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, WarningOutlined,
  RiseOutlined, FallOutlined, AppstoreOutlined,
  ShoppingOutlined, DatabaseOutlined, BarChartOutlined,
  AccountBookOutlined, RobotOutlined,
  ThunderboltOutlined, InboxOutlined, ArrowRightOutlined,
  WalletOutlined, AuditOutlined, SettingOutlined, RightOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import request from '../../api/request';
import { useAuth } from '../../context/AuthContext';

const { Title, Text } = Typography;
const { TextArea } = Input;

const tenantIcons: Record<string, string> = {
  supply_coop: '🏘️', market_vendor: '🥬', retail_store: '🏪', ecommerce: '🛒'
};

// 九宫格功能入口（按电商个体户日常使用频率排序）
const gridModules = [
  { key: 'pos', icon: <ThunderboltOutlined />, label: 'POS收银', sub: '快速开单收款', path: '/pos', color: '#fa8c16', bg: '#fff7e6' },
  { key: 'sales', icon: <ShoppingCartOutlined />, label: '销售订单', sub: '订单/查询/对账', path: '/sales', color: '#52c41a', bg: '#f6ffed' },
  { key: 'purchase', icon: <AccountBookOutlined />, label: '采购入库', sub: '进货/供应商', path: '/purchase', color: '#1677ff', bg: '#e6f4ff' },
  { key: 'inventory', icon: <DatabaseOutlined />, label: '库存查询', sub: '实时库存/预警', path: '/inventory', color: '#13c2c2', bg: '#e6fffb' },
  { key: 'finance', icon: <WalletOutlined />, label: '收支记账', sub: '日常收支流水', path: '/finance', color: '#eb2f96', bg: '#fff0f6' },
  { key: 'vouchers', icon: <AuditOutlined />, label: '记账凭证', sub: '凭证/审核/盖章', path: '/vouchers', color: '#fa541c', bg: '#fff2e8' },
  { key: 'products', icon: <ShoppingOutlined />, label: '商品管理', sub: '档案/定价/分类', path: '/products', color: '#722ed1', bg: '#f9f0ff' },
  { key: 'analytics', icon: <BarChartOutlined />, label: '经营分析', sub: '趋势/利润/排行', path: '/analytics', color: '#2f54eb', bg: '#f0f5ff' },
  { key: 'settings', icon: <SettingOutlined />, label: '系统设置', sub: '账套/员工/印章', path: '/settings', color: '#595959', bg: '#fafafa' },
];

// 新手操作流程指引（带箭头）
const flowSteps = [
  { label: '建商品', path: '/products', tip: '先录入商品档案和售价' },
  { label: '采购入库', path: '/purchase', tip: '进货后入库增加库存' },
  { label: '收银/销售', path: '/pos', tip: 'POS开单自动扣库存' },
  { label: '收支凭证', path: '/finance', tip: '记账并生成凭证' },
  { label: '看报表', path: '/analytics', tip: '分析利润和经营情况' },
];

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any>({});
  const [trend, setTrend] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiModal, setAiModal] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [todayRes, trendRes, topRes] = await Promise.all([
        request.get('/dashboard/today'),
        request.get('/dashboard/trend'),
        request.get('/dashboard/top-products')
      ]);
      setData(todayRes.data?.data || todayRes.data || {});
      setTrend(trendRes.data?.data || trendRes.data || []);
      setTopProducts(topRes.data?.data || topRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'category' as const, data: trend.map((t: any) => t.date?.slice(5)) },
    yAxis: { type: 'value' as const },
    series: [{
      name: '销售额', type: 'line', data: trend.map((t: any) => t.sales),
      smooth: true, areaStyle: { opacity: 0.15 }, itemStyle: { color: '#1677ff' }
    }]
  };

  // AI快速录入
  const handleAiQuickEntry = async () => {
    if (!aiText.trim()) { message.warning('请输入业务描述'); return; }
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await request.post('/ai/quick-entry', { text: aiText });
      setAiResult(res.data?.data || res.data);
      message.success('AI解析成功，请确认后提交');
    } catch (e: any) {
      message.error(e.response?.data?.message || e.message || 'AI解析失败');
    } finally {
      setAiLoading(false);
    }
  };

  const confirmAiEntry = async () => {
    if (!aiResult) return;
    setAiLoading(true);
    try {
      await request.post('/ai/quick-entry/confirm', { parsed: aiResult, text: aiText });
      message.success('录入成功！');
      setAiModal(false);
      setAiText('');
      setAiResult(null);
      loadData();
    } catch (e: any) {
      message.error(e.response?.data?.message || '录入失败');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16, display: 'flex', alignItems: 'center' }}>
        工作台
        {user?.tenantName && (
          <Tag color="blue" style={{ marginLeft: 8, fontSize: 12 }}>
            {tenantIcons[user.business_type || ''] || '🏢'} {user.tenantName}
          </Tag>
        )}
      </Title>

      {data.stockAlertCount > 0 && (
        <Alert
          message={`⚠️ 有 ${data.stockAlertCount} 个商品库存不足，请及时补货`}
          type="warning" showIcon style={{ marginBottom: 16 }}
        />
      )}

      {/* AI快速录入入口 */}
      <Card size="small" style={{ marginBottom: 16, background: 'linear-gradient(135deg, #f0f5ff 0%, #e6fffb 100%)', border: '1px solid #adc6ff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RobotOutlined style={{ fontSize: 22, color: '#1677ff' }} />
            <div>
              <Text strong>AI 智能录入</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>说一句话，AI自动生成采购单、销售单或记账</Text>
            </div>
          </div>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setAiModal(true)}>
            快速录入
          </Button>
        </div>
      </Card>

      {/* 今日数据 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic title="今日销售额" value={data.todaySales || 0} precision={2} prefix={<DollarOutlined />} valueStyle={{ color: '#3f8600', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic title="今日订单" value={data.todaySalesCount || 0} prefix={<ShoppingCartOutlined />} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic title="今日采购" value={data.todayPurchase || 0} precision={2} prefix={<FallOutlined />} valueStyle={{ color: '#cf1322', fontSize: 20 }} />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic title="商品总数" value={data.productCount || 0} prefix={<AppstoreOutlined />} valueStyle={{ fontSize: 20 }} />
          </Card>
        </Col>
      </Row>

      {/* 新手操作流程指引 */}
      <Card size="small" style={{ marginBottom: 16, background: 'linear-gradient(90deg, #e6f4ff 0%, #f6ffed 100%)', border: '1px solid #91caff' }} bodyStyle={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>📍 标准业务流程：</Text>
          {flowSteps.map((s, i) => (
            <React.Fragment key={s.label}>
              <Tooltip title={s.tip}>
                <a onClick={() => navigate(s.path)} style={{ fontSize: 13, color: '#1677ff', whiteSpace: 'nowrap' }}>{s.label}</a>
              </Tooltip>
              {i < flowSteps.length - 1 && <ArrowRightOutlined style={{ color: '#1677ff', fontSize: 12 }} />}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* 九宫格功能区 */}
      <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: 12 }}>
        <Row gutter={[8, 8]}>
          {gridModules.map(m => (
            <Col xs={8} sm={8} md={8} key={m.key}>
              <Tooltip title={`${m.label}：${m.sub}`} placement="top">
                <div
                  onClick={() => navigate(m.path)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    padding: '14px 8px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                    background: m.bg, border: `1px solid ${m.bg}`, position: 'relative',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
                >
                  <RightOutlined style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, color: m.color, opacity: 0.5 }} />
                  <div style={{ fontSize: 26, color: m.color, marginBottom: 4 }}>{m.icon}</div>
                  <Text strong style={{ fontSize: 13, color: '#333' }}>{m.label}</Text>
                  <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.4 }}>{m.sub}</Text>
                </div>
              </Tooltip>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 趋势 + 热销 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={14}>
          <Card size="small" title="近7天销售趋势">
            <ReactECharts option={chartOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="热销商品TOP10">
            {topProducts.length > 0 ? (
              <div style={{ maxHeight: 280, overflow: 'auto' }}>
                {topProducts.map((item: any, index: number) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span>
                      <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: '50%', background: index < 3 ? '#1677ff' : '#d9d9d9', color: 'white', textAlign: 'center', lineHeight: '20px', fontSize: 12, marginRight: 8 }}>{index + 1}</span>
                      {item.name}
                    </span>
                    <span style={{ color: '#ff4d4f', fontWeight: 500 }}>¥{parseFloat(item.total_amount || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无销售数据</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* AI快速录入弹窗 */}
      <Modal
        title={<><RobotOutlined style={{ color: '#1677ff' }} /> AI智能录入</>}
        open={aiModal} onCancel={() => { setAiModal(false); setAiResult(null); setAiText(''); }}
        footer={null} width={560}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            示例：「今天从阳光果蔬采购了苹果50斤，单价3块5」「卖了2箱牛奶给张三，120元微信支付」「支出房租3000元」
          </Text>
        </div>
        <TextArea
          rows={3} placeholder="用自然语言描述业务，AI自动识别单据类型..."
          value={aiText} onChange={e => setAiText(e.target.value)}
          onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleAiQuickEntry(); } }}
        />
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button onClick={() => setAiModal(false)} style={{ marginRight: 8 }}>取消</Button>
          <Button type="primary" loading={aiLoading} onClick={handleAiQuickEntry} icon={<RobotOutlined />}>
            AI解析
          </Button>
        </div>

        {aiResult && (
          <Card size="small" style={{ marginTop: 16, background: '#f6ffed', borderColor: '#b7eb8f' }}>
            <div style={{ marginBottom: 8 }}>
              <Tag color="blue">{aiResult.type === 'purchase' ? '采购单' : aiResult.type === 'sale' ? '销售单' : '收支记录'}</Tag>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              {aiResult.type === 'purchase' && (
                <>
                  <div>供应商：{aiResult.supplier_name || '待确认'}</div>
                  <div>商品：{aiResult.items?.map((i: any) => `${i.name} ${i.quantity}${i.unit || ''} × ¥${i.cost_price}`).join('；')}</div>
                  <div>总金额：<Text strong>¥{aiResult.total_amount}</Text></div>
                </>
              )}
              {aiResult.type === 'sale' && (
                <>
                  <div>客户：{aiResult.customer_name || '散客'}</div>
                  <div>商品：{aiResult.items?.map((i: any) => `${i.name} ${i.quantity}${i.unit || ''} × ¥${i.price}`).join('；')}</div>
                  <div>支付方式：{aiResult.payment_method}</div>
                  <div>总金额：<Text strong>¥{aiResult.total_amount}</Text></div>
                </>
              )}
              {aiResult.type === 'finance' && (
                <>
                  <div>类型：{aiResult.finance_type === 'income' ? '收入' : '支出'}</div>
                  <div>类别：{aiResult.category}</div>
                  <div>金额：<Text strong>¥{aiResult.amount}</Text></div>
                  {aiResult.remark && <div>备注：{aiResult.remark}</div>}
                </>
              )}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
              <Button type="primary" onClick={confirmAiEntry} loading={aiLoading}>确认录入</Button>
            </div>
          </Card>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
