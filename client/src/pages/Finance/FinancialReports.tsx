import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, DatePicker, Tabs, Tag, Typography, Row, Col, Statistic, Button, Space, Empty, Spin } from 'antd';
import { FileTextOutlined, FundOutlined, AccountBookOutlined, ReloadOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;

const fmt = (v: any) => {
  const n = Number(v || 0);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const amountStyle = (v: any, highlight?: boolean, negative = false) => {
  const n = Number(v || 0);
  const color = negative && n < 0 ? '#cf1322' : (highlight ? '#1677ff' : 'inherit');
  return <span style={{ color, fontWeight: highlight || (negative && n < 0) ? 600 : 400 }}>¥{fmt(Math.abs(n))}{negative && n < 0 ? '（亏）' : ''}</span>;
};

// ============== 资产负债表 ==============
const BalanceSheet: React.FC<{ period: dayjs.Dayjs }> = ({ period }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/finance/reports/balance-sheet', { params: { period: period.format('YYYY-MM') } });
      setData(res.data?.data || {});
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  if (!data) return <Empty />;

  const a = data.assets || {};
  const l = data.liabilities || {};
  const eq = data.equity || {};

  const SectionCard = ({ title, items, total, totalLabel = '合计', color = '#1677ff' }: any) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ background: '#fafafa', padding: '8px 12px', fontWeight: 600, borderLeft: `3px solid ${color}` }}>{title}</div>
      {(items || []).map((it: any, i: number) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px 6px 24px', borderBottom: '1px solid #f5f5f5' }}>
          <Text>{it.name}</Text>
          <Text>{amountStyle(it.amount, it.bold)}</Text>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f0f5ff', fontWeight: 600 }}>
        <span>{totalLabel}</span>
        <span>¥{fmt(total)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}><Card size="small"><Statistic title="资产总计" value={a.total} precision={2} prefix="¥" valueStyle={{ color: '#1677ff', fontSize: 20 }} /></Card></Col>
        <Col xs={24} md={8}><Card size="small"><Statistic title="负债总计" value={l.total} precision={2} prefix="¥" valueStyle={{ color: '#cf1322', fontSize: 20 }} /></Card></Col>
        <Col xs={24} md={8}><Card size="small"><Statistic title="所有者权益合计" value={eq.total} precision={2} prefix="¥" valueStyle={{ color: '#52c41a', fontSize: 20 }} /></Card></Col>
      </Row>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong>报表日期：{data.endDate}</Text>
          {data.isBalanced ? <Tag color="success" style={{ fontSize: 14, padding: '4px 16px' }}>✓ 资产 = 负债 + 所有者权益</Tag>
            : <Tag color="error" style={{ fontSize: 14, padding: '4px 16px' }}>✗ 不平衡，差额 ¥{fmt(Math.abs(a.total - data.totalLiabilitiesAndEquity))}</Tag>}
        </div>
      </Card>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card size="small" title={<Text strong>资产</Text>}>
            <SectionCard title="流动资产" items={a.currentAssets} total={a.currentAssetsTotal} color="#1677ff" />
            <SectionCard title="非流动资产" items={a.nonCurrentAssets} total={a.nonCurrentAssetsTotal} color="#1677ff" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#e6f4ff', fontWeight: 700, fontSize: 15 }}>
              <span>资产总计</span><span>¥{fmt(a.total)}</span>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={<Text strong>负债及所有者权益</Text>}>
            <SectionCard title="流动负债" items={l.currentLiabilities} total={l.currentLiabilitiesTotal} color="#cf1322" />
            <SectionCard title="非流动负债" items={l.nonCurrentLiabilities} total={l.nonCurrentLiabilitiesTotal} color="#cf1322" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#fff1f0', fontWeight: 600 }}>
              <span>负债合计</span><span>¥{fmt(l.total)}</span>
            </div>
            <SectionCard title="所有者权益" items={eq.items} total={eq.total} totalLabel="所有者权益合计" color="#52c41a" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: '#f6ffed', fontWeight: 700, fontSize: 15 }}>
              <span>负债和所有者权益总计</span><span>¥{fmt(data.totalLiabilitiesAndEquity)}</span>
            </div>
          </Card>
        </Col>
      </Row>
      <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
        注：本报表基于已审核/已过账凭证自动生成；未做期末结转时，未分配利润已含当期损益。
      </Text>
    </div>
  );
};

// ============== 利润表 ==============
const IncomeStatement: React.FC<{ period: dayjs.Dayjs }> = ({ period }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/finance/reports/income-statement', { params: { period: period.format('YYYY-MM') } });
      setData(res.data?.data || {});
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  if (!data) return <Empty />;
  const t = data.totals || {};

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="营业收入" value={t.operatingRevenue} precision={2} prefix="¥" valueStyle={{ fontSize: 18 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="营业成本" value={t.operatingCost} precision={2} prefix="¥" valueStyle={{ color: '#cf1322', fontSize: 18 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="营业利润" value={t.operatingProfit} precision={2} prefix="¥" valueStyle={{ color: t.operatingProfit >= 0 ? '#3f8600' : '#cf1322', fontSize: 18 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="净利润" value={t.netProfit} precision={2} prefix="¥" valueStyle={{ color: t.netProfit >= 0 ? '#1677ff' : '#cf1322', fontSize: 20, fontWeight: 700 }} /></Card></Col>
      </Row>
      <Card size="small" title={<Text strong>利润表（{data.period}）</Text>}>
        {(data.items || []).map((it: any) => {
          const bg = it.highlight ? '#e6f4ff' : (it.bold ? '#fafafa' : 'transparent');
          return (
            <div key={it.line} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: it.indent ? '8px 12px 8px 36px' : '10px 12px',
              borderBottom: '1px solid #f5f5f5', background: bg,
              fontWeight: it.bold || it.highlight ? 600 : 400, fontSize: it.highlight ? 15 : 14,
            }}>
              <span>{it.name}</span>
              <span>{amountStyle(it.amount, it.highlight, true)}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
};

// ============== 现金流量表 ==============
const CashFlow: React.FC<{ period: dayjs.Dayjs }> = ({ period }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/finance/reports/cash-flow', { params: { period: period.format('YYYY-MM') } });
      setData(res.data?.data || {});
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [period]);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Spin style={{ display: 'block', margin: '60px auto' }} />;
  if (!data) return <Empty />;
  const t = data.totals || {};

  const colorFor = (v: any) => Number(v || 0) >= 0 ? '#3f8600' : '#cf1322';

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}><Card size="small"><Statistic title="经营活动净额" value={t.netOperating} precision={2} prefix="¥" valueStyle={{ color: colorFor(t.netOperating), fontSize: 18 }} /></Card></Col>
        <Col xs={24} md={8}><Card size="small"><Statistic title="投资活动净额" value={t.netInvesting} precision={2} prefix="¥" valueStyle={{ color: colorFor(t.netInvesting), fontSize: 18 }} /></Card></Col>
        <Col xs={24} md={8}><Card size="small"><Statistic title="现金净增加额" value={t.netIncrease} precision={2} prefix="¥" valueStyle={{ color: colorFor(t.netIncrease), fontSize: 20, fontWeight: 700 }} /></Card></Col>
      </Row>
      <Card size="small" title={<Text strong>现金流量表（{data.period}）</Text>}>
        {(data.items || []).map((it: any, i: number) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: it.subtotal || it.highlight ? '10px 12px' : (it.type === 'header' ? '10px 12px' : '8px 12px 8px 36px'),
            paddingLeft: it.type === 'header' ? 12 : (it.indent ? 36 : 12),
            background: it.highlight ? '#e6f4ff' : (it.subtotal ? '#fafafa' : (it.type === 'header' ? '#f0f5ff' : 'transparent')),
            borderBottom: '1px solid #f5f5f5',
            fontWeight: it.bold || it.highlight || it.type === 'header' ? 600 : 400,
          }}>
            <span>{it.name}</span>
            {it.amount !== undefined && <span style={{ color: colorFor(it.amount) }}>¥{fmt(Math.abs(it.amount))}</span>}
          </div>
        ))}
      </Card>
      <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
        注：简化版现金流量表，按现金科目（库存现金/银行存款/其他货币资金）对应分录的对方科目自动分类。
      </Text>
    </div>
  );
};

const FinancialReports: React.FC = () => {
  const [period, setPeriod] = useState(dayjs());
  const [tab, setTab] = useState('balance');
  const [refreshKey, setRefreshKey] = useState(0);

  const handlePrint = () => window.print();

  return (
    <div className="no-print">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          <FundOutlined style={{ marginRight: 8 }} />财务报表
        </Title>
        <Space>
          <DatePicker picker="month" value={period} onChange={(d) => d && setPeriod(d)} allowClear={false} />
          <Button icon={<ReloadOutlined />} onClick={() => setRefreshKey(k => k + 1)}>刷新</Button>
          <Button icon={<PrinterOutlined />} onClick={handlePrint}>打印</Button>
        </Space>
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'balance', label: <span><AccountBookOutlined /> 资产负债表</span>, children: <BalanceSheet key={`b-${refreshKey}-${period.format('YYYYMM')}`} period={period} /> },
          { key: 'income', label: <span><FileTextOutlined /> 利润表</span>, children: <IncomeStatement key={`i-${refreshKey}-${period.format('YYYYMM')}`} period={period} /> },
          { key: 'cashflow', label: <span><FundOutlined /> 现金流量表</span>, children: <CashFlow key={`c-${refreshKey}-${period.format('YYYYMM')}`} period={period} /> },
        ]}
      />
    </div>
  );
};

export default FinancialReports;
