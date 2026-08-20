import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Alert } from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, WarningOutlined,
  RiseOutlined, FallOutlined, AppstoreOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import request from '../../api/request';

const { Title } = Typography;

const Dashboard: React.FC = () => {
  const [data, setData] = useState<any>({});
  const [trend, setTrend] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      setData(todayRes.data);
      setTrend(trendRes.data);
      setTopProducts(topRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const chartOption = {
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'category' as const, data: trend.map(t => t.date?.slice(5)) },
    yAxis: { type: 'value' as const },
    series: [{
      name: '销售额',
      type: 'line',
      data: trend.map(t => t.sales),
      smooth: true,
      areaStyle: { opacity: 0.15 },
      itemStyle: { color: '#1677ff' }
    }]
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>工作台</Title>

      {data.stockAlertCount > 0 && (
        <Alert
          message={`⚠️ 有 ${data.stockAlertCount} 个商品库存不足，请及时补货`}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="今日销售额" value={data.todaySales || 0} precision={2} prefix={<DollarOutlined />} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="今日订单数" value={data.todaySalesCount || 0} prefix={<ShoppingCartOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="今日采购额" value={data.todayPurchase || 0} precision={2} prefix={<FallOutlined />} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="商品总数" value={data.productCount || 0} prefix={<AppstoreOutlined />} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="近7天销售趋势">
            <ReactECharts option={chartOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="热销商品TOP10">
            {topProducts.length > 0 ? (
              <div>
                {topProducts.map((item: any, index: number) => (
                  <div key={index} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span>
                      <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: '50%', background: index < 3 ? '#1677ff' : '#d9d9d9', color: 'white', textAlign: 'center', lineHeight: '20px', fontSize: 12, marginRight: 8 }}>{index + 1}</span>
                      {item.name}
                    </span>
                    <span style={{ color: '#ff4d4f', fontWeight: 500 }}>¥{parseFloat(item.total_amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>暂无销售数据</div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
