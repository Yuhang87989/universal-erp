import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Tabs, Tag, Typography, Row, Col, Statistic, Button, Modal, InputNumber, Input, message, Space, Empty } from 'antd';
import { WalletOutlined, DollarOutlined, RedoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;

const fmt = (v: any) => Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const bucketColors: Record<string, string> = {
  b30: 'green', b60: 'blue', b90: 'gold', b180: 'orange', b365: 'red',
};

const Receivables: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [settleModal, setSettleModal] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/finance/receivables');
      setData(res.data?.data || {});
    } catch (e: any) { message.error(e.message || '加载失败'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSettle = async () => {
    if (!settleAmount || settleAmount <= 0) { message.warning('请输入收款金额'); return; }
    setSubmitting(true);
    try {
      await request.post(`/finance/receivables/${settleModal.id}/settle`, { amount: settleAmount });
      message.success('收款登记成功');
      setSettleModal(null);
      setSettleAmount(0);
      load();
    } catch (e: any) { message.error(e.message || '操作失败'); } finally { setSubmitting(false); }
  };

  const columns = [
    { title: '销售单号', dataIndex: 'order_no', width: 130 },
    { title: '客户', dataIndex: 'customer_name', width: 130, ellipsis: true },
    { title: '单据日期', dataIndex: 'order_date', width: 110, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '单据金额', dataIndex: 'actual_amount', align: 'right' as const, width: 110, render: (v: any) => `¥${fmt(v)}` },
    { title: '已收', dataIndex: 'paid_amount', align: 'right' as const, width: 100, render: (v: any) => <Text type="success">¥{fmt(v)}</Text> },
    { title: '未收', dataIndex: 'receivable', align: 'right' as const, width: 110, render: (v: any) => <Text strong style={{ color: '#cf1322' }}>¥{fmt(v)}</Text> },
    { title: '账龄', dataIndex: 'overdue_days', width: 100, render: (d: number, r: any) => <Tag color={bucketColors[r.bucket]}>{d}天 · {r.bucket_label}</Tag> },
    { title: '操作', width: 90, render: (_: any, r: any) => (
      <Button type="link" size="small" onClick={() => { setSettleModal(r); setSettleAmount(Number((r.receivable).toFixed(2))); }}>收款</Button>
    )},
  ];

  if (!data) return null;
  const b = data.aging_buckets || {};
  const labels = data.aging_labels || {};

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="应收账款总额" value={data.total_receivable} precision={2} prefix="¥" valueStyle={{ color: '#cf1322', fontSize: 18 }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="未结清单据" value={data.total_orders} suffix="笔" valueStyle={{ fontSize: 18 }} /></Card></Col>
        {Object.keys(b).map(k => (
          <Col xs={8} md={4} key={k}>
            <Card size="small">
              <Statistic title={labels[k]} value={b[k]} precision={2} prefix="¥" valueStyle={{ color: k === 'b365' ? '#cf1322' : 'inherit', fontSize: 15 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card size="small" title="按客户汇总" style={{ marginBottom: 16 }}>
        <Table
          size="small" rowKey="customer_id" pagination={false}
          dataSource={data.by_customer || []}
          columns={[
            { title: '客户', dataIndex: 'customer_name' },
            { title: '电话', dataIndex: 'phone', width: 130 },
            { title: '单据数', dataIndex: 'order_count', width: 80, align: 'right' as const },
            { title: '应收合计', dataIndex: 'total_receivable', align: 'right' as const, width: 130, render: (v: any) => <Text strong style={{ color: '#cf1322' }}>¥{fmt(v)}</Text> },
          ]}
        />
      </Card>

      <Card size="small" title="未收清单">
        <Table
          size="small" rowKey="id" loading={loading}
          dataSource={data.list || []} columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal title="收款登记" open={!!settleModal} onOk={handleSettle} confirmLoading={submitting} onCancel={() => setSettleModal(null)}>
        {settleModal && (
          <div>
            <p><Text type="secondary">销售单：</Text>{settleModal.order_no} <Text type="secondary">客户：</Text>{settleModal.customer_name}</p>
            <p><Text type="secondary">未收余额：</Text><Text strong style={{ color: '#cf1322' }}>¥{fmt(settleModal.receivable)}</Text></p>
            <div style={{ marginTop: 12 }}>
              <Text>本次收款金额：</Text>
              <InputNumber style={{ width: 200, marginLeft: 8 }} min={0.01} max={settleModal.receivable} precision={2} value={settleAmount} onChange={(v) => setSettleAmount(v || 0)} prefix="¥" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const Payables: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [settleModal, setSettleModal] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/finance/payables');
      setData(res.data?.data || {});
    } catch (e: any) { message.error(e.message || '加载失败'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSettle = async () => {
    if (!settleAmount || settleAmount <= 0) { message.warning('请输入付款金额'); return; }
    setSubmitting(true);
    try {
      await request.post(`/finance/payables/${settleModal.id}/settle`, { amount: settleAmount });
      message.success('付款登记成功');
      setSettleModal(null);
      setSettleAmount(0);
      load();
    } catch (e: any) { message.error(e.message || '操作失败'); } finally { setSubmitting(false); }
  };

  const columns = [
    { title: '采购单号', dataIndex: 'order_no', width: 130 },
    { title: '供应商', dataIndex: 'supplier_name', width: 140, ellipsis: true },
    { title: '单据日期', dataIndex: 'order_date', width: 110, render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '单据金额', dataIndex: 'total_amount', align: 'right' as const, width: 110, render: (v: any) => `¥${fmt(v)}` },
    { title: '已付', dataIndex: 'paid_amount', align: 'right' as const, width: 100, render: (v: any) => <Text type="success">¥{fmt(v)}</Text> },
    { title: '未付', dataIndex: 'payable', align: 'right' as const, width: 110, render: (v: any) => <Text strong style={{ color: '#cf1322' }}>¥{fmt(v)}</Text> },
    { title: '账龄', dataIndex: 'overdue_days', width: 100, render: (d: number, r: any) => <Tag color={bucketColors[r.bucket]}>{d}天 · {r.bucket_label}</Tag> },
    { title: '操作', width: 90, render: (_: any, r: any) => (
      <Button type="link" size="small" onClick={() => { setSettleModal(r); setSettleAmount(Number((r.payable).toFixed(2))); }}>付款</Button>
    )},
  ];

  if (!data) return null;
  const b = data.aging_buckets || {};
  const labels = data.aging_labels || {};

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={4}><Card size="small"><Statistic title="应付账款总额" value={data.total_payable} precision={2} prefix="¥" valueStyle={{ color: '#cf1322', fontSize: 18 }} /></Card></Col>
        <Col xs={12} md={4}><Card size="small"><Statistic title="未结清单据" value={data.total_orders} suffix="笔" valueStyle={{ fontSize: 18 }} /></Card></Col>
        {Object.keys(b).map(k => (
          <Col xs={8} md={4} key={k}>
            <Card size="small">
              <Statistic title={labels[k]} value={b[k]} precision={2} prefix="¥" valueStyle={{ color: k === 'b365' ? '#cf1322' : 'inherit', fontSize: 15 }} />
            </Card>
          </Col>
        ))}
      </Row>

      <Card size="small" title="按供应商汇总" style={{ marginBottom: 16 }}>
        <Table
          size="small" rowKey="supplier_id" pagination={false}
          dataSource={data.by_supplier || []}
          columns={[
            { title: '供应商', dataIndex: 'supplier_name' },
            { title: '联系人', dataIndex: 'contact_name', width: 100 },
            { title: '单据数', dataIndex: 'order_count', width: 80, align: 'right' as const },
            { title: '应付合计', dataIndex: 'total_payable', align: 'right' as const, width: 130, render: (v: any) => <Text strong style={{ color: '#cf1322' }}>¥{fmt(v)}</Text> },
          ]}
        />
      </Card>

      <Card size="small" title="未付清单">
        <Table
          size="small" rowKey="id" loading={loading}
          dataSource={data.list || []} columns={columns}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal title="付款登记" open={!!settleModal} onOk={handleSettle} confirmLoading={submitting} onCancel={() => setSettleModal(null)}>
        {settleModal && (
          <div>
            <p><Text type="secondary">采购单：</Text>{settleModal.order_no} <Text type="secondary">供应商：</Text>{settleModal.supplier_name}</p>
            <p><Text type="secondary">未付余额：</Text><Text strong style={{ color: '#cf1322' }}>¥{fmt(settleModal.payable)}</Text></p>
            <div style={{ marginTop: 12 }}>
              <Text>本次付款金额：</Text>
              <InputNumber style={{ width: 200, marginLeft: 8 }} min={0.01} max={settleModal.payable} precision={2} value={settleAmount} onChange={(v) => setSettleAmount(v || 0)} prefix="¥" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const ReceivablesPage: React.FC = () => {
  const [tab, setTab] = useState('receivable');
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <WalletOutlined style={{ marginRight: 8 }} />应收应付管理
        </Title>
      </div>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'receivable', label: <span><DollarOutlined /> 应收账款</span>, children: <Receivables /> },
          { key: 'payable', label: <span><RedoOutlined /> 应付账款</span>, children: <Payables /> },
        ]}
      />
    </div>
  );
};

export default ReceivablesPage;
