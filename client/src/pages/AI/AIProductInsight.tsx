import React, { useState } from 'react';
import { Card, Button, Spin, Typography, Row, Col, Statistic, Empty, Segmented, Space, Alert, Table, Tag } from 'antd';
import { RobotOutlined, ThunderboltOutlined, FireOutlined, WarningOutlined, RestOutlined, DollarOutlined } from '@ant-design/icons';
import request from '../../api/request';
import MarkdownText from '../../components/MarkdownText';

const { Title, Text, Paragraph } = Typography;

const marginColor = (m: number) => m >= 50 ? 'green' : m >= 30 ? 'blue' : m >= 15 ? 'orange' : 'red';

const AIProductInsight: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const runInsight = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request.get('/ai/product-insight', { params: { days } });
      setData(res.data?.data || res.data);
    } catch (e: any) {
      setError(e?.message || '洞察失败，请确认AI已配置且近期有销售数据');
    }
    setLoading(false);
  };

  const report = data?.report;
  const insight = data?.insight;
  const s = report?.summary;

  const topCols = [
    { title: '商品', dataIndex: 'name', ellipsis: true },
    { title: '销量', dataIndex: 'qty', width: 80, align: 'right' as const,
      render: (v: number) => <Text strong>{v}</Text> },
    { title: '销售额', dataIndex: 'revenue', width: 100, align: 'right' as const,
      render: (v: number) => `¥${v.toFixed(0)}` },
    { title: '毛利', dataIndex: 'gross_profit', width: 100, align: 'right' as const,
      render: (v: number) => <Text type="success">¥{v.toFixed(0)}</Text> },
    { title: '毛利率', dataIndex: 'margin', width: 90, align: 'center' as const,
      render: (v: number) => <Tag color={marginColor(v)}>{v}%</Tag> },
  ];

  const slowCols = [
    { title: '商品', dataIndex: 'name', ellipsis: true },
    { title: '库存量', dataIndex: 'stock', width: 90, align: 'right' as const,
      render: (v: number) => <Text type="warning">{v}</Text> },
    { title: '占用资金', dataIndex: 'cost_value', width: 110, align: 'right' as const,
      render: (v: number) => <Text type="danger">¥{v.toFixed(0)}</Text> },
  ];

  const lowCols = [
    { title: '商品', dataIndex: 'name', ellipsis: true },
    { title: '当前库存', dataIndex: 'stock', width: 100, align: 'right' as const,
      render: (v: number) => <Tag color="red">{v}</Tag> },
    { title: '预警线', dataIndex: 'min_stock', width: 90, align: 'right' as const },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <FireOutlined style={{ color: '#fa541c' }} /> AI商品洞察
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>统计周期：</Text>
          <Segmented
            value={days}
            onChange={(v) => setDays(v as number)}
            options={[
              { label: '近7天', value: 7 },
              { label: '近30天', value: 30 },
              { label: '近90天', value: 90 },
            ]}
          />
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={runInsight} loading={loading}>
            生成洞察
          </Button>
        </Space>
        <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
          分析畅销/滞销商品、毛利结构和补货需求，由AI给出选品、清仓、补货建议。
        </Paragraph>
      </Card>

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

      {loading && (
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16, color: '#999' }}>AI正在分析商品数据，请稍候…</Paragraph>
        </Card>
      )}

      {!loading && !data && !error && (
        <Empty description="选择周期后点击「生成洞察」" style={{ padding: '40px 0' }} />
      )}

      {!loading && data && (
        <>
          {s && (
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="动销商品" value={s.active_products} prefix={<FireOutlined />} valueStyle={{ fontSize: 20 }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="销售总额" value={s.total_revenue} precision={0} prefix="¥" valueStyle={{ fontSize: 20 }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="毛利总额" value={s.total_gross_profit} precision={0} prefix={<DollarOutlined />} valueStyle={{ fontSize: 20, color: '#52c41a' }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="综合毛利率" value={s.gross_margin} suffix="%" valueStyle={{ fontSize: 20 }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="滞销商品" value={s.slow_moving_count} prefix={<RestOutlined />} valueStyle={{ fontSize: 20, color: '#faad14' }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="压货资金" value={s.slow_stock_value} precision={0} prefix="¥" valueStyle={{ fontSize: 20, color: '#faad14' }} /></Card>
              </Col>
              <Col xs={12} sm={8} md={6}>
                <Card size="small"><Statistic title="待补货" value={s.low_stock_count} prefix={<WarningOutlined />} valueStyle={{ fontSize: 20, color: '#ff4d4f' }} /></Card>
              </Col>
            </Row>
          )}

          {insight && (
            <Card
              size="small"
              title={<span><RobotOutlined style={{ color: '#722ed1' }} /> AI选品与库存建议</span>}
              style={{ marginBottom: 16 }}
            >
              <MarkdownText content={insight} />
            </Card>
          )}

          <Row gutter={[12, 12]}>
            <Col xs={24} lg={12}>
              <Card size="small" title={<span><FireOutlined style={{ color: '#fa541c' }} /> 畅销榜 TOP15</span>}>
                <Table
                  size="small" rowKey="name" columns={topCols}
                  dataSource={report?.top_products || []} pagination={false}
                />
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card size="small" title={<span><RestOutlined style={{ color: '#faad14' }} /> 滞销预警（近{days}天零销量）</span>} style={{ marginBottom: 12 }}>
                <Table
                  size="small" rowKey="name" columns={slowCols}
                  dataSource={report?.slow_products || []} pagination={false}
                />
              </Card>
              <Card size="small" title={<span><WarningOutlined style={{ color: '#ff4d4f' }} /> 库存告急</span>}>
                {report?.low_stock?.length ? (
                  <Table
                    size="small" rowKey="name" columns={lowCols}
                    dataSource={report.low_stock} pagination={false}
                  />
                ) : <Text type="secondary">暂无库存告急商品</Text>}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
};

export default AIProductInsight;
