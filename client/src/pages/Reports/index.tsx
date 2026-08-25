import React, { useState, useEffect } from 'react';
import {
  Card, Row, Col, Table, Tag, DatePicker, Select, Statistic,
  Tabs, Space, Typography, Segmented
} from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, TrophyOutlined,
  DollarOutlined, ShoppingCartOutlined, RiseOutlined
} from '@ant-design/icons';
import * as echarts from 'echarts';
import request from '../../api/request';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState('revenue');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [groupBy, setGroupBy] = useState('day');

  // 数据状态
  const [revenueData, setRevenueData] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [paymentStats, setPaymentStats] = useState([]);
  const [profitData, setProfitData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const getDateParams = () => {
    if (!dateRange) return {};
    return {
      startDate: dateRange[0].format('YYYY-MM-DD'),
      endDate: dateRange[1].format('YYYY-MM-DD')
    };
  };

  // 加载营收趋势
  const loadRevenue = async () => {
    setLoading(true);
    try {
      const res = await request.get('/reports/revenue', { params: { ...getDateParams(), groupBy } });
      setRevenueData(res.data?.data || res.data || [] || []);
      // 渲染图表
      setTimeout(() => renderRevenueChart(res.data?.data || res.data || [] || []), 100);
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  // 加载商品排行
  const loadTopProducts = async () => {
    try {
      const res = await request.get('/reports/top-products', { params: { ...getDateParams(), limit: 20 } });
      setTopProducts(res.data?.data || res.data || [] || []);
    } catch (e) { /* ignore */ }
  };

  // 加载分类统计
  const loadCategoryStats = async () => {
    try {
      const res = await request.get('/reports/category-stats', { params: getDateParams() });
      setCategoryStats(res.data?.data || res.data || [] || []);
    } catch (e) { /* ignore */ }
  };

  // 加载支付方式统计
  const loadPaymentStats = async () => {
    try {
      const res = await request.get('/reports/payment-stats', { params: getDateParams() });
      setPaymentStats(res.data?.data || res.data || [] || []);
    } catch (e) { /* ignore */ }
  };

  // 加载利润分析
  const loadProfit = async () => {
    try {
      const res = await request.get('/reports/profit', { params: getDateParams() });
      setProfitData(res.data?.data || res.data || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    loadRevenue();
    loadTopProducts();
    loadCategoryStats();
    loadPaymentStats();
    loadProfit();
  }, [dateRange, groupBy]);

  // 渲染营收趋势图
  const renderRevenueChart = (data: any[]) => {
    const chartDom = document.getElementById('revenue-chart');
    if (!chartDom) return;
    const chart = echarts.init(chartDom);
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['营收', '利润', '订单数'] },
      grid: { left: 50, right: 50, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: data.map(d => d.period),
        axisLabel: { rotate: data.length > 15 ? 45 : 0, fontSize: 11 }
      },
      yAxis: [
        { type: 'value', name: '金额(元)', position: 'left' },
        { type: 'value', name: '订单数', position: 'right' }
      ],
      series: [
        {
          name: '营收', type: 'bar', data: data.map(d => Number(d.revenue || 0)),
          itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] }
        },
        {
          name: '利润', type: 'bar', data: data.map(d => Number(d.profit || 0)),
          itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] }
        },
        {
          name: '订单数', type: 'line', yAxisIndex: 1,
          data: data.map(d => d.orderCount),
          lineStyle: { color: '#fa8c16', width: 2 },
          itemStyle: { color: '#fa8c16' },
          smooth: true
        }
      ]
    });
    window.addEventListener('resize', () => chart.resize());
  };

  // 利润卡片
  const profitCards = profitData ? (
    <Row gutter={[12, 12]}>
      <Col xs={12} sm={12} md={6}>
        <Card size="small">
          <Statistic title="总营收" value={profitData.totalRevenue} precision={2} prefix="¥" valueStyle={{ color: '#1677ff' }} />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card size="small">
          <Statistic title="总成本" value={profitData.totalCost} precision={2} prefix="¥" valueStyle={{ color: '#ff4d4f' }} />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card size="small">
          <Statistic title="毛利润" value={profitData.grossProfit} precision={2} prefix="¥"
            valueStyle={{ color: profitData.grossProfit >= 0 ? '#52c41a' : '#ff4d4f' }}
            suffix={profitData.grossProfit >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
          />
        </Card>
      </Col>
      <Col xs={12} sm={12} md={6}>
        <Card size="small">
          <Statistic title="利润率" value={profitData.profitMargin} precision={1} suffix="%"
            valueStyle={{ color: profitData.profitMargin >= 20 ? '#52c41a' : profitData.profitMargin >= 10 ? '#fa8c16' : '#ff4d4f' }}
          />
        </Card>
      </Col>
    </Row>
  ) : null;

  // 商品排行表格
  const topProductColumns = [
    { title: '排名', key: 'rank', width: 60, render: (_: any, __: any, i: number) => {
      const medals = ['🥇', '🥈', '🥉'];
      return i < 3 ? <span style={{ fontSize: 18 }}>{medals[i]}</span> : <Text type="secondary">{i + 1}</Text>;
    }},
    { title: '商品名称', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '分类', dataIndex: 'category_name', key: 'category_name', render: (v: string) => <Tag>{v || '未分类'}</Tag> },
    { title: '销量', dataIndex: 'totalQty', key: 'totalQty', render: (v: number) => <Text strong>{v}</Text> },
    { title: '营收', dataIndex: 'totalRevenue', key: 'totalRevenue', render: (v: number) => `¥${Number(v).toFixed(2)}` },
    { title: '利润', dataIndex: 'totalProfit', key: 'totalProfit', render: (v: number) => (
      <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>¥{Number(v).toFixed(2)}</Text>
    )},
    { title: '毛利率', key: 'margin', render: (_: any, r: any) => {
      const margin = r.totalRevenue > 0 ? (r.totalProfit / r.totalRevenue * 100).toFixed(1) : 0;
      return <Tag color={Number(margin) >= 30 ? 'green' : Number(margin) >= 15 ? 'orange' : 'red'}>{margin}%</Tag>;
    }}
  ];

  // 分类统计表格
  const categoryColumns = [
    { title: '分类', dataIndex: 'name', key: 'name', render: (v: string) => <Tag color="blue">{v || '未分类'}</Tag> },
    { title: '商品数', dataIndex: 'productCount', key: 'productCount' },
    { title: '总销量', dataIndex: 'totalQty', key: 'totalQty', render: (v: number) => <Text strong>{v}</Text> },
    { title: '营收', dataIndex: 'totalRevenue', key: 'totalRevenue', render: (v: number) => `¥${Number(v).toFixed(2)}` },
    { title: '利润', dataIndex: 'totalProfit', key: 'totalProfit', render: (v: number) => (
      <Text style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f' }}>¥{Number(v).toFixed(2)}</Text>
    )},
    { title: '营收占比', key: 'ratio', render: (_: any, r: any) => {
      const total = categoryStats.reduce((sum: number, c: any) => sum + Number(c.totalRevenue || 0), 0);
      const ratio = total > 0 ? (Number(r.totalRevenue) / total * 100).toFixed(1) : 0;
      return <Tag>{ratio}%</Tag>;
    }}
  ];

  // 支付方式表格
  const paymentColumns = [
    {
      title: '支付方式', dataIndex: 'payment_method', key: 'payment_method',
      render: (v: string) => {
        const map: Record<string, string> = { cash: '💵 现金', wechat: '💚 微信', alipay: '💙 支付宝', bank: '💳 银行卡' };
        return map[v] || v;
      }
    },
    { title: '订单数', dataIndex: 'orderCount', key: 'orderCount' },
    { title: '金额', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: number) => `¥${Number(v).toFixed(2)}` },
    { title: '占比', key: 'ratio', render: (_: any, r: any) => {
      const total = paymentStats.reduce((sum: number, p: any) => sum + Number(p.totalAmount || 0), 0);
      const ratio = total > 0 ? (Number(r.totalAmount) / total * 100).toFixed(1) : 0;
      return `${ratio}%`;
    }}
  ];

  return (
    <div>
      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker onChange={(dates) => setDateRange(dates as any)} placeholder={['开始日期', '结束日期']} />
          <Segmented
            options={[
              { label: '按日', value: 'day' },
              { label: '按周', value: 'week' },
              { label: '按月', value: 'month' }
            ]}
            value={groupBy}
            onChange={(v) => setGroupBy(v as string)}
          />
        </Space>
      </Card>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane tab={<span><RiseOutlined /> 营收趋势</span>} key="revenue">
          {profitCards}
          <Card style={{ marginTop: 16 }}>
            <div id="revenue-chart" style={{ height: 400 }} />
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><TrophyOutlined /> 商品排行</span>} key="topProducts">
          <Card>
            <Table
              columns={topProductColumns}
              dataSource={topProducts}
              rowKey="id"
              pagination={false}
              size="small"
            />
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><ShoppingCartOutlined /> 分类统计</span>} key="category">
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="分类销售统计">
                <Table
                  columns={categoryColumns}
                  dataSource={categoryStats}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 500 }}
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="支付方式分布">
                <Table
                  columns={paymentColumns}
                  dataSource={paymentStats}
                  rowKey="payment_method"
                  pagination={false}
                  size="small"
                  scroll={{ x: 300 }}
                />
              </Card>
            </Col>
          </Row>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default Reports;
