import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Select, Space, Spin, Typography, Table, Tag, Button, DatePicker } from 'antd';
import {
  ArrowUpOutlined, ArrowDownOutlined, ShoppingCartOutlined, DollarOutlined,
  InboxOutlined, WarningOutlined, RiseOutlined, FallOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const Analytics: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState('30d');
  const [summary, setSummary] = useState<any>(null);
  const [salesTrend, setSalesTrend] = useState<any[]>([]);
  const [purchaseTrend, setPurchaseTrend] = useState<any[]>([]);
  const [productRank, setProductRank] = useState<any[]>([]);
  const [invValue, setInvValue] = useState<any[]>([]);
  const [profit, setProfit] = useState<any[]>([]);
  const [stockMove, setStockMove] = useState<any>({ stock_in: [], stock_out: [] });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, st, pt, pr, iv, pf, sm] = await Promise.all([
        request.get('/analytics/summary'),
        request.get('/analytics/sales-trend', { params: { period } }),
        request.get('/analytics/purchase-trend', { params: { period } }),
        request.get('/analytics/product-ranking', { params: { limit: 10 } }),
        request.get('/analytics/inventory-value'),
        request.get('/analytics/profit-analysis', { params: { period } }),
        request.get('/analytics/stock-movement', { params: { period } }),
      ]);
      setSummary(s.data?.data || s.data);
      setSalesTrend(st.data?.data || []);
      setPurchaseTrend(pt.data?.data || []);
      setProductRank(pr.data?.data || []);
      setInvValue(iv.data?.data || []);
      setProfit(pf.data?.data || []);
      setStockMove(sm.data?.data || { stock_in: [], stock_out: [] });
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [period]);

  // 销售趋势图
  const salesTrendOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['销售额', '订单数'], top: 0 },
    grid: { left: 50, right: 50, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: salesTrend.map(d => d.date), axisLabel: { rotate: period === '12m' ? 0 : 45, fontSize: 11 } },
    yAxis: [
      { type: 'value', name: '金额(¥)', position: 'left' },
      { type: 'value', name: '订单数', position: 'right' }
    ],
    series: [
      {
        name: '销售额', type: 'line', smooth: true, data: salesTrend.map(d => Number(d.actual_amount || 0)),
        itemStyle: { color: '#1677ff' }, areaStyle: { color: 'rgba(22,119,255,0.1)' }
      },
      {
        name: '订单数', type: 'bar', yAxisIndex: 1, data: salesTrend.map(d => d.order_count),
        itemStyle: { color: '#52c41a', opacity: 0.6 }
      }
    ]
  };

  // 采购vs销售对比
  const compareOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['采购额', '销售额'], top: 0 },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: salesTrend.map(d => d.date), axisLabel: { rotate: 45, fontSize: 11 } },
    yAxis: { type: 'value' },
    series: [
      {
        name: '采购额', type: 'bar', data: purchaseTrend.map(d => Number(d.total_amount || 0)),
        itemStyle: { color: '#faad14' }
      },
      {
        name: '销售额', type: 'bar', data: salesTrend.map(d => Number(d.actual_amount || 0)),
        itemStyle: { color: '#1677ff' }
      }
    ]
  };

  // 库存价值分类饼图
  const invPieOption = {
    tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
    legend: { type: 'scroll', orient: 'vertical', right: 10, top: 20, bottom: 20 },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['40%', '50%'],
      label: { show: false },
      data: invValue.map(d => ({ name: d.category_name || '未分类', value: Number(d.cost_value || 0) })),
      emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' } }
    }]
  };

  // 利润趋势
  const profitOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['收入', '支出', '利润'], top: 0 },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: profit.map(d => d.date), axisLabel: { rotate: 45, fontSize: 11 } },
    yAxis: { type: 'value' },
    series: [
      { name: '收入', type: 'line', smooth: true, data: profit.map(d => Number(d.income || 0)), itemStyle: { color: '#52c41a' } },
      { name: '支出', type: 'line', smooth: true, data: profit.map(d => Number(d.expense || 0)), itemStyle: { color: '#ff4d4f' } },
      {
        name: '利润', type: 'bar', data: profit.map(d => Number(d.profit || 0)),
        itemStyle: { color: (params: any) => params.value >= 0 ? '#1677ff' : '#ff4d4f', opacity: 0.7 }
      }
    ]
  };

  // 出入库趋势
  const moveOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['入库金额', '出库金额'], top: 0 },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: stockMove.stock_in.map((d: any) => d.date), axisLabel: { rotate: 45, fontSize: 11 } },
    yAxis: { type: 'value' },
    series: [
      { name: '入库金额', type: 'line', smooth: true, data: stockMove.stock_in.map((d: any) => Number(d.amount || 0)), itemStyle: { color: '#52c41a' }, areaStyle: { color: 'rgba(82,196,26,0.1)' } },
      { name: '出库金额', type: 'line', smooth: true, data: stockMove.stock_out.map((d: any) => Number(d.amount || 0)), itemStyle: { color: '#ff7a45' }, areaStyle: { color: 'rgba(255,122,69,0.1)' } }
    ]
  };

  const rankColumns = [
    { title: '排名', width: 50, render: (_: any, __: any, i: number) => <Tag color={i < 3 ? ['gold', 'silver', 'orange'][i] : 'default'}>#{i + 1}</Tag> },
    { title: '商品', dataIndex: 'name' },
    { title: '销量', dataIndex: 'total_qty', width: 80, align: 'right' as const, render: (v: number, r: any) => `${v}${r.unit || ''}` },
    { title: '销售额', dataIndex: 'total_amount', width: 100, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
  ];

  if (loading || !summary) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>数据分析中心</Title>
        <Select value={period} onChange={setPeriod} style={{ width: 140 }}
          options={[
            { value: '7d', label: '近7天' }, { value: '30d', label: '近30天' },
            { value: '90d', label: '近90天' }, { value: '12m', label: '近12个月' }
          ]} />
      </div>

      {/* 核心指标 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small" hoverable>
            <Statistic title="今日营收" value={summary.today_sales?.amount || 0} precision={2} prefix={<DollarOutlined />} suffix="元"
              valueStyle={{ color: '#1677ff', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>今日{summary.today_sales?.order_count || 0}笔订单</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" hoverable>
            <Statistic title="本月营收" value={summary.month_sales?.amount || 0} precision={2} prefix="¥"
              valueStyle={{ color: '#52c41a', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>本月{summary.month_sales?.order_count || 0}笔订单</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" hoverable>
            <Statistic title="本月采购" value={summary.month_purchase?.amount || 0} precision={2} prefix="¥"
              valueStyle={{ color: '#faad14', fontSize: 20 }} />
            <Text type="secondary" style={{ fontSize: 12 }}>{summary.month_purchase?.order_count || 0}笔采购单</Text>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" hoverable>
            <Statistic title="库存总值" value={summary.inventory?.cost_value || 0} precision={2} prefix={<InboxOutlined />} suffix="元"
              valueStyle={{ fontSize: 20 }} />
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>{summary.inventory?.sku_count || 0}个SKU</Text>
              {summary.low_stock_count > 0 && <Tag color="red" icon={<WarningOutlined />}>{summary.low_stock_count}预警</Tag>}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 趋势图 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card title="📈 销售趋势" size="small" extra={<Text type="secondary" style={{ fontSize: 12 }}>销售额+订单数</Text>}>
            <ReactECharts option={salesTrendOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="📊 库存价值分布" size="small">
            <ReactECharts option={invPieOption} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="💰 采购 vs 销售对比" size="small">
            <ReactECharts option={compareOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="📊 收支利润分析" size="small">
            <ReactECharts option={profitOption} style={{ height: 260 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card title="📦 出入库趋势" size="small">
            <ReactECharts option={moveOption} style={{ height: 260 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="🏆 商品销售排行TOP10" size="small">
            <Table columns={rankColumns} dataSource={productRank} rowKey="id" size="small" pagination={false} scroll={{ y: 240 }} />
          </Card>
        </Col>
      </Row>

      {/* 分类库存明细 */}
      <Card title="📋 各分类库存明细" size="small">
        <Table size="small" rowKey="id" pagination={false} dataSource={invValue}
          columns={[
            { title: '商品分类', dataIndex: 'category_name', render: (v: string) => v || '未分类' },
            { title: 'SKU数', dataIndex: 'sku_count', width: 80, align: 'right' as const },
            { title: '库存数量', dataIndex: 'total_qty', width: 100, align: 'right' as const, render: (v: number) => Number(v || 0).toFixed(0) },
            { title: '成本价值', dataIndex: 'cost_value', width: 120, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
            { title: '销售价值', dataIndex: 'sell_value', width: 120, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
            {
              title: '预估毛利', width: 120, align: 'right' as const,
              render: (_: any, r: any) => {
                const profit = Number(r.sell_value || 0) - Number(r.cost_value || 0);
                return <span style={{ color: profit >= 0 ? '#52c41a' : '#ff4d4f' }}>¥{profit.toFixed(2)}</span>;
              }
            }
          ]} />
      </Card>
    </div>
  );
};

export default Analytics;
