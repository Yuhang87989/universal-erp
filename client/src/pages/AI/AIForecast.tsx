import React, { useState, useMemo } from 'react';
import { Card, Button, Spin, Typography, Row, Col, Statistic, Empty, Select, Space, Tag, Alert, Table } from 'antd';
import { LineChartOutlined, RiseOutlined, FallOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import request from '../../api/request';

const { Title, Text, Paragraph } = Typography;

interface ForecastItem {
  date: string;
  amount: number;
  orders: number;
  confidence: string;
}

const AIForecast: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [days, setDays] = useState(7);
  const [error, setError] = useState('');

  // 前端移动平均兜底（AI不可用时）
  const movingAverageForecast = (data: any[], n: number): ForecastItem[] => {
    if (!data.length) return [];
    const recent = data.slice(-14);
    const avgAmount = recent.reduce((s, d) => s + Number(d.amount), 0) / recent.length;
    const avgOrders = Math.round(recent.reduce((s, d) => s + Number(d.orders), 0) / recent.length);
    const lastDate = new Date(data[data.length - 1].date);
    // 简单趋势：近7天vs前7天
    const last7 = data.slice(-7).reduce((s, d) => s + Number(d.amount), 0) / 7;
    const prev7 = data.slice(-14, -7).reduce((s, d) => s + Number(d.amount), 0) / 7;
    const trend = prev7 > 0 ? (last7 - prev7) / prev7 : 0;
    const dailyDecay = trend / 14;

    const result: ForecastItem[] = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      const projected = Math.max(0, avgAmount * (1 + dailyDecay * i));
      result.push({
        date: d.toISOString().slice(0, 10),
        amount: Math.round(projected * 100) / 100,
        orders: Math.max(1, Math.round(avgOrders * (1 + dailyDecay * i))),
        confidence: Math.abs(dailyDecay) < 0.02 ? '中' : Math.abs(dailyDecay) < 0.05 ? '中' : '低',
      });
    }
    return result;
  };

  const runForecast = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await request.get(`/ai/forecast?days=${days}`);
      const data = res.data?.data || res.data;
      const hist = data.history || [];
      let fc = data.forecast || [];

      // AI返回空或异常时用移动平均兜底
      if ((!fc || !fc.length) && hist.length) {
        fc = movingAverageForecast(hist, days);
      }

      setHistory(hist);
      setForecast(fc);
    } catch (e: any) {
      // 完全失败时尝试无AI的本地预测（需要历史数据，但没拿到，直接报错）
      setError(e?.message || '预测失败，请稍后重试');
    }
    setLoading(false);
  };

  const chartOption = useMemo(() => {
    if (!history.length && !forecast.length) return null;
    const histDates = history.map(h => h.date);
    const histAmounts = history.map(h => Number(h.amount));
    const fcDates = forecast.map(f => f.date);
    const fcAmounts = forecast.map(f => f.amount);
    // 连接线：最后一个历史点到第一个预测点
    const connectLine = history.length ? [Number(history[history.length - 1].amount), ...fcAmounts] : fcAmounts;

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          return params.map((p: any) =>
            `${p.seriesName}<br/>${p.axisValue}: ¥${Number(p.value).toFixed(2)}`
          ).join('<br/>');
        }
      },
      legend: { data: ['历史销售额', '预测销售额'] },
      grid: { left: 60, right: 20, top: 40, bottom: 40 },
      xAxis: {
        type: 'category',
        data: [...histDates, ...fcDates],
        axisLabel: { rotate: 45, fontSize: 11 }
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v }
      },
      series: [
        {
          name: '历史销售额',
          type: 'line',
          data: [...histAmounts, ...new Array(fcDates.length).fill(null)],
          smooth: true,
          showSymbol: false,
          lineStyle: { color: '#1677ff', width: 2 },
          areaStyle: { color: 'rgba(22,119,255,0.1)' }
        },
        {
          name: '预测销售额',
          type: 'line',
          data: [...new Array(histDates.length - 1).fill(null), ...connectLine],
          smooth: true,
          showSymbol: true,
          symbolSize: 6,
          lineStyle: { color: '#fa8c16', width: 2, type: 'dashed' },
          itemStyle: { color: '#fa8c16' },
          areaStyle: { color: 'rgba(250,140,22,0.08)' }
        }
      ]
    };
  }, [history, forecast]);

  const summary = useMemo(() => {
    if (!forecast.length) return null;
    const totalAmount = forecast.reduce((s, f) => s + f.amount, 0);
    const totalOrders = forecast.reduce((s, f) => s + f.orders, 0);
    const avgDaily = totalAmount / forecast.length;
    const last7 = history.slice(-7).reduce((s, h) => s + Number(h.amount), 0) / Math.max(1, Math.min(7, history.length));
    const change = last7 > 0 ? ((avgDaily - last7) / last7 * 100) : 0;
    return { totalAmount, totalOrders, avgDaily, change };
  }, [forecast, history]);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <LineChartOutlined style={{ color: '#fa8c16' }} /> 销售预测
      </Title>

      {!forecast.length && !loading && (
        <Card>
          <Empty description="基于近90天销售数据，AI预测未来销售额走势">
            <Space>
              <Select value={days} onChange={setDays} style={{ width: 120 }}>
                <Select.Option value={7}>未来7天</Select.Option>
                <Select.Option value={14}>未来14天</Select.Option>
                <Select.Option value={30}>未来30天</Select.Option>
              </Select>
              <Button type="primary" size="large" icon={<ThunderboltOutlined />} onClick={runForecast}>
                开始预测
              </Button>
            </Space>
          </Empty>
          <Paragraph style={{ marginTop: 16, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              预测基于历史销售趋势和季节性规律，仅供参考。AI不可用时自动使用移动平均算法。
            </Text>
          </Paragraph>
        </Card>
      )}

      {loading && (
        <Card style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>
            <Text type="secondary">AI正在分析近90天销售数据并预测未来{days}天走势...</Text>
          </Paragraph>
        </Card>
      )}

      {error && (
        <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />
      )}

      {forecast.length > 0 && !loading && (
        <>
          {summary && (
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="预测总销售额"
                    value={summary.totalAmount}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 18, color: '#1677ff' }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="预测总订单数"
                    value={summary.totalOrders}
                    suffix="单"
                    valueStyle={{ fontSize: 18, color: '#52c41a' }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="日均销售额"
                    value={summary.avgDaily}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card size="small">
                  <Statistic
                    title="较近7日均"
                    value={Math.abs(summary.change)}
                    precision={1}
                    suffix="%"
                    prefix={summary.change >= 0 ? <RiseOutlined style={{ color: '#52c41a' }} /> : <FallOutlined style={{ color: '#ff4d4f' }} />}
                    valueStyle={{ fontSize: 18, color: summary.change >= 0 ? '#52c41a' : '#ff4d4f' }}
                  />
                </Card>
              </Col>
            </Row>
          )}

          {chartOption && (
            <Card style={{ marginBottom: 16 }}>
              <ReactECharts option={chartOption} style={{ height: 340 }} />
            </Card>
          )}

          <Card size="small" title={`未来${days}天预测明细`}>
            <Table
              dataSource={forecast}
              rowKey="date"
              size="small"
              pagination={false}
              scroll={{ y: 300 }}
              columns={[
                { title: '日期', dataIndex: 'date', width: 120 },
                {
                  title: '预测销售额', dataIndex: 'amount', width: 120,
                  render: (v: number) => <Text strong>¥{Number(v).toFixed(2)}</Text>
                },
                { title: '预测订单', dataIndex: 'orders', width: 100, render: (v: number) => `${v}单` },
                {
                  title: '置信度', dataIndex: 'confidence', width: 80,
                  render: (v: string) => {
                    const color = v === '高' ? 'green' : v === '中' ? 'orange' : 'red';
                    return <Tag color={color}>{v || '中'}</Tag>;
                  }
                },
              ]}
            />
          </Card>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Space>
              <Select value={days} onChange={setDays} style={{ width: 120 }}>
                <Select.Option value={7}>未来7天</Select.Option>
                <Select.Option value={14}>未来14天</Select.Option>
                <Select.Option value={30}>未来30天</Select.Option>
              </Select>
              <Button onClick={runForecast}>重新预测</Button>
            </Space>
          </div>
        </>
      )}
    </div>
  );
};

export default AIForecast;
