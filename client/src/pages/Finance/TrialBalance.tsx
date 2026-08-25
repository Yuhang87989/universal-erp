import React, { useState, useEffect } from 'react';
import { Card, Table, DatePicker, Tag, Typography, Row, Col, Statistic, Divider } from 'antd';
import { CalculatorOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;

const categoryMap: Record<string, { color: string; label: string }> = {
  asset: { color: 'blue', label: '资产' },
  liability: { color: 'red', label: '负债' },
  equity: { color: 'purple', label: '权益' },
  revenue: { color: 'green', label: '收入' },
  expense: { color: 'orange', label: '费用' },
};

const TrialBalance: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState(dayjs());

  const loadData = async (p?: dayjs.Dayjs) => {
    setLoading(true);
    try {
      const periodStr = (p || period).format('YYYY-MM');
      const res = await request.get('/vouchers/report/trial-balance', { params: { period: periodStr } });
      setData(res.data?.data || res.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handlePeriodChange = (date: dayjs.Dayjs | null) => {
    if (date) {
      setPeriod(date);
      loadData(date);
    }
  };

  const columns = [
    { title: '科目编码', dataIndex: 'code', width: 120, render: (v: string, r: any) => (
      <span style={{ paddingLeft: (r.level - 1) * 12, fontFamily: 'monospace' }}>{v}</span>
    )},
    { title: '科目名称', dataIndex: 'name', width: 180 },
    { title: '类别', dataIndex: 'category', width: 70, render: (v: string) => {
      const c = categoryMap[v] || { color: 'default', label: v };
      return <Tag color={c.color}>{c.label}</Tag>;
    }},
    { title: '方向', dataIndex: 'direction', width: 60, render: (v: string) => v === 'debit' ? '借' : '贷' },
    { title: '期初借方', dataIndex: 'opening_debit', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? `¥${Number(v).toFixed(2)}` : '-' },
    { title: '期初贷方', dataIndex: 'opening_credit', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? `¥${Number(v).toFixed(2)}` : '-' },
    { title: '本期借方', dataIndex: 'current_debit', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: '#cf1322' }}>¥{Number(v).toFixed(2)}</span> : '-' },
    { title: '本期贷方', dataIndex: 'current_credit', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: '#3f8600' }}>¥{Number(v).toFixed(2)}</span> : '-' },
    { title: '期末借方', dataIndex: 'closing_debit', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>¥{Number(v).toFixed(2)}</span> : '-' },
    { title: '期末贷方', dataIndex: 'closing_credit', width: 110, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>¥{Number(v).toFixed(2)}</span> : '-' },
  ];

  const totals = data?.totals || {};
  const isBalanced = totals.is_balanced;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <CalculatorOutlined style={{ marginRight: 8 }} />
          试算平衡表
        </Title>
        <DatePicker picker="month" value={period} onChange={handlePeriodChange} allowClear={false} />
      </div>

      {/* 汇总统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="期初借方合计" value={totals.opening_debit || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="期初贷方合计" value={totals.opening_credit || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="本期借方" value={totals.current_debit || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="本期贷方" value={totals.current_credit || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="期末借方" value={totals.closing_debit || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card size="small">
            <Statistic title="期末贷方" value={totals.closing_credit || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Text strong>会计期间：{period.format('YYYY年MM月')}</Text>
          </Col>
          <Col>
            {isBalanced ? (
              <Tag color="success" style={{ fontSize: 14, padding: '4px 16px' }}>✓ 借贷平衡</Tag>
            ) : (
              <Tag color="error" style={{ fontSize: 14, padding: '4px 16px' }}>
                ✗ 不平衡，差额 ¥{(Math.abs((totals.closing_debit || 0) - (totals.closing_credit || 0))).toFixed(2)}
              </Tag>
            )}
          </Col>
        </Row>
      </Card>

      <Table
        columns={columns}
        dataSource={data?.items || []}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1100 }}
        pagination={false}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row style={{ fontWeight: 700, background: '#fafafa' }}>
              <Table.Summary.Cell index={0} colSpan={4}>
                <Text strong>合计</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">¥{Number(totals.opening_debit || 0).toFixed(2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">¥{Number(totals.opening_credit || 0).toFixed(2)}</Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">
                <Text strong style={{ color: '#cf1322' }}>¥{Number(totals.current_debit || 0).toFixed(2)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={7} align="right">
                <Text strong style={{ color: '#3f8600' }}>¥{Number(totals.current_credit || 0).toFixed(2)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={8} align="right">
                <Text strong>¥{Number(totals.closing_debit || 0).toFixed(2)}</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={9} align="right">
                <Text strong>¥{Number(totals.closing_credit || 0).toFixed(2)}</Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
};

export default TrialBalance;
