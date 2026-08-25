import React, { useState } from 'react';
import { Card, Button, Spin, Typography, Row, Col, Statistic, List, Tag, Alert, Space, Empty, Progress } from 'antd';
import { ThunderboltOutlined, CheckCircleOutlined, WarningOutlined, RiseOutlined, BulbOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import request from '../../api/request';

const { Title, Text, Paragraph } = Typography;

const AIDiagnosis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [rawData, setRawData] = useState<any>(null);

  const runDiagnosis = async () => {
    setLoading(true);
    try {
      const res = await request.get('/ai/diagnosis');
      setDiagnosis(res.data?.data?.diagnosis || res.data?.diagnosis);
      setRawData(res.data?.data?.raw_data || res.data?.raw_data);
    } catch (e: any) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <ThunderboltOutlined style={{ color: '#722ed1' }} /> AI智能诊断
      </Title>

      {!diagnosis && !loading && (
        <Card>
          <Empty description="点击下方按钮，AI将基于您的经营数据生成诊断报告">
            <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={runDiagnosis}>
              开始AI诊断
            </Button>
          </Empty>
        </Card>
      )}

      {loading && (
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>
            <Text type="secondary">AI正在分析您的经营数据，请稍候...</Text>
          </Paragraph>
        </Card>
      )}

      {diagnosis && !loading && (
        <>
          <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,0.85)' }}>整体评价</Text>}
              value={diagnosis.overall_evaluation || diagnosis.raw || '暂无评价'}
              valueStyle={{ color: '#fff', fontSize: 16 }}
            />
          </Card>

          {rawData && (
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={12} md={6}><Card size="small"><Statistic title="今日营收" value={rawData.today?.amount || 0} prefix="¥" precision={2} valueStyle={{ fontSize: 18 }} /></Card></Col>
              <Col xs={12} md={6}><Card size="small"><Statistic title="本月利润" value={rawData.month?.profit || 0} prefix="¥" precision={2} valueStyle={{ fontSize: 18, color: (rawData.month?.profit || 0) >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
              <Col xs={12} md={6}><Card size="small"><Statistic title="库存SKU" value={rawData.inventory?.skus || 0} valueStyle={{ fontSize: 18 }} /></Card></Col>
              <Col xs={12} md={6}><Card size="small"><Statistic title="库存预警" value={rawData.low_stock?.length || 0} prefix={<WarningOutlined />} valueStyle={{ fontSize: 18, color: (rawData.low_stock?.length || 0) > 0 ? '#ff4d4f' : '#52c41a' }} /></Card></Col>
            </Row>
          )}

          {diagnosis.issues?.length > 0 && (
            <Card title="🔍 发现的问题与建议" style={{ marginBottom: 16 }}>
              <List
                dataSource={diagnosis.issues}
                renderItem={(item: any, idx: number) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Tag color={idx < 2 ? 'red' : 'orange'} style={{ minWidth: 28, textAlign: 'center' }}>{idx + 1}</Tag>}
                      title={<Text strong>{item.problem}</Text>}
                      description={<div style={{ marginTop: 4 }}><BulbOutlined style={{ color: '#52c41a' }} /> <Text>{item.suggestion}</Text></div>}
                    />
                  </List.Item>
                )}
              />
            </Card>
          )}

          {diagnosis.next_actions?.length > 0 && (
            <Card title="🎯 下一步行动" style={{ marginBottom: 16 }}>
              <List
                dataSource={diagnosis.next_actions}
                renderItem={(action: string, idx: number) => (
                  <List.Item>
                    <Space>
                      <Tag color="blue" icon={<RiseOutlined />}>行动{idx + 1}</Tag>
                      <Text>{action}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          )}

          {diagnosis.raw && !diagnosis.issues && (
            <Card><Paragraph>{diagnosis.raw}</Paragraph></Card>
          )}

          <div style={{ textAlign: 'center' }}>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={runDiagnosis} loading={loading}>
              重新诊断
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default AIDiagnosis;
