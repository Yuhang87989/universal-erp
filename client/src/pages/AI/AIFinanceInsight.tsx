import React, { useState } from 'react';
import { Card, Button, Spin, Typography, Row, Col, Statistic, Empty, DatePicker, Space, Alert, Tag, Divider } from 'antd';
import { RobotOutlined, ThunderboltOutlined, RiseOutlined, FallOutlined, WalletOutlined, AccountBookOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';
import MarkdownText from '../../components/MarkdownText';

const { Title, Text, Paragraph } = Typography;

const AIFinanceInsight: React.FC = () => {
  const [period, setPeriod] = useState(dayjs());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const runInsight = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request.get('/ai/finance-insight', { params: { period: period.format('YYYY-MM') } });
      setData(res.data?.data || res.data);
    } catch (e: any) {
      setError(e?.message || '解读失败，请确认AI已配置且本月有凭证数据');
    }
    setLoading(false);
  };

  const report = data?.report;
  const insight = data?.insight;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <RobotOutlined style={{ color: '#722ed1' }} /> AI财务解读
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Text>选择月份：</Text>
          <DatePicker
            picker="month"
            value={period}
            onChange={(v) => v && setPeriod(v)}
            allowClear={false}
          />
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={runInsight} loading={loading}>
            AI解读
          </Button>
        </Space>
      </Card>

      {loading && (
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>
            <Text type="secondary">AI正在分析{period.format('YYYY年MM月')}的财务数据...</Text>
          </Paragraph>
        </Card>
      )}

      {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

      {!loading && !data && !error && (
        <Card>
          <Empty description="选择月份后，AI将用大白话解读您的资产负债表、利润表和现金流">
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={runInsight}>
              立即解读本月
            </Button>
          </Empty>
        </Card>
      )}

      {!loading && report && (
        <>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="营业收入"
                  value={report.income_statement.total_income}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ fontSize: 18, color: '#1677ff' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="净利润"
                  value={report.income_statement.net_profit}
                  precision={2}
                  prefix={report.income_statement.net_profit >= 0 ? <RiseOutlined style={{ color: '#52c41a' }} /> : <FallOutlined style={{ color: '#ff4d4f' }} />}
                  valueStyle={{ fontSize: 18, color: report.income_statement.net_profit >= 0 ? '#52c41a' : '#ff4d4f' }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="利润率"
                  value={report.income_statement.profit_margin}
                  suffix="%"
                  valueStyle={{ fontSize: 18 }}
                />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic
                  title="净现金流"
                  value={report.cash_flow.net_cash}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ fontSize: 18, color: report.cash_flow.net_cash >= 0 ? '#52c41a' : '#ff4d4f' }}
                />
              </Card>
            </Col>
          </Row>

          {insight && (
            <Card
              title={<Space><RobotOutlined style={{ color: '#722ed1' }} /> AI老板视角解读</Space>}
              style={{ marginBottom: 16 }}
            >
              <MarkdownText content={insight} />
            </Card>
          )}

          {/* 费用明细 */}
          {report.income_statement.breakdown?.length > 0 && (
            <Card size="small" title={<AccountBookOutlined />} style={{ marginBottom: 16 }}>
              <Row gutter={[8, 8]}>
                {report.income_statement.breakdown
                  .filter((b: any) => b.category !== 'income')
                  .sort((a: any, b: any) => b.amount - a.amount)
                  .slice(0, 8)
                  .map((b: any, i: number) => (
                    <Col xs={12} md={8} key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: i % 2 ? '#fafafa' : 'transparent', borderRadius: 4 }}>
                        <Text ellipsis style={{ maxWidth: '60%' }}>{b.name}</Text>
                        <Text strong>¥{b.amount.toFixed(2)}</Text>
                      </div>
                    </Col>
                  ))}
              </Row>
            </Card>
          )}

          {/* 资产负债 */}
          <Card size="small" title={<WalletOutlined />}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="总资产" value={report.balance_sheet.total_assets} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
              </Col>
              <Col span={8}>
                <Statistic title="总负债" value={report.balance_sheet.total_liabilities} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: '#fa8c16' }} />
              </Col>
              <Col span={8}>
                <Statistic title="所有者权益" value={report.balance_sheet.total_equity} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: '#52c41a' }} />
              </Col>
            </Row>
          </Card>
        </>
      )}
    </div>
  );
};

export default AIFinanceInsight;
