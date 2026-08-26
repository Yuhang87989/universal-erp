import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, message, Popconfirm, Tabs, Statistic, Row, Col, Descriptions, Empty } from 'antd';
import { PlusOutlined, FundOutlined, DeleteOutlined, ThunderboltOutlined, HistoryOutlined } from '@ant-design/icons';
import request from '../../api/request';
import dayjs from 'dayjs';

const categoryMap: Record<string, { label: string; color: string }> = {
  office: { label: '办公设备', color: 'blue' },
  vehicle: { label: '运输设备', color: 'purple' },
  machine: { label: '机器设备', color: 'orange' },
  electronic: { label: '电子设备', color: 'cyan' },
  furniture: { label: '家具器具', color: 'green' },
  building: { label: '房屋建筑', color: 'gold' },
  other: { label: '其他', color: 'default' },
};

const FixedAssets: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('list');
  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/assets');
      setList(res.data?.data || []);
    } catch { message.error('加载失败'); }
    finally { setLoading(false); }
  }, []);

  const loadPreview = useCallback(async () => {
    try {
      const res = await request.get('/assets/depreciation/preview', { params: { period } });
      setPreview(res.data?.data);
    } catch { /* ignore */ }
  }, [period]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await request.get('/assets/depreciation/history', { params: { period } });
      setHistory(res.data?.data?.list || []);
    } catch { /* ignore */ }
  }, [period]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'depreciation') loadPreview(); }, [activeTab, loadPreview]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  const monthlyPreview = Form.useWatch('original_value', form);
  const lifePreview = Form.useWatch('useful_life_months', form);
  const residualPreview = Form.useWatch('estimated_residual', form);
  const calculatedMonthly = (() => {
    if (!monthlyPreview || !lifePreview) return 0;
    return Math.max(0, (Number(monthlyPreview) - Number(residualPreview || 0)) / Number(lifePreview));
  })();

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      v.acquisition_date = dayjs(v.acquisition_date).format('YYYY-MM-DD');
      if (editing) {
        await request.put(`/assets/${editing.id}`, v);
        message.success('已更新');
      } else {
        await request.post('/assets', v);
        message.success('已登记');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const runDepreciation = async () => {
    Modal.confirm({
      title: `确认计提 ${period} 折旧？`,
      content: `共 ${preview?.count || 0} 项资产，合计 ¥${Number(preview?.total || 0).toFixed(2)}。计提后不可撤销。`,
      onOk: async () => {
        const res = await request.post('/assets/depreciation/run', { period });
        message.success(res.data?.message || '计提完成');
        load(); loadPreview(); loadHistory();
      }
    });
  };

  const viewDetail = async (id: number) => {
    try {
      const res = await request.get(`/assets/${id}`);
      setDetail(res.data?.data);
      setDetailOpen(true);
    } catch { message.error('加载失败'); }
  };

  const columns = [
    { title: '资产编号', dataIndex: 'asset_no', width: 120 },
    { title: '资产名称', dataIndex: 'asset_name', width: 180, render: (v: string, r: any) => <a onClick={() => viewDetail(r.id)}>{v}</a> },
    { title: '类别', dataIndex: 'category', width: 100, render: (v: string) => <Tag color={categoryMap[v]?.color}>{categoryMap[v]?.label || v}</Tag> },
    { title: '取得日期', dataIndex: 'acquisition_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '原值', dataIndex: 'original_value', width: 120, align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
    { title: '月折旧', dataIndex: 'monthly_depreciation', width: 110, align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
    { title: '累计折旧', dataIndex: 'accumulated_depreciation', width: 120, align: 'right' as const, render: (v: any) => <span style={{ color: '#fa8c16' }}>¥{Number(v).toFixed(2)}</span> },
    { title: '净值', dataIndex: 'net_value', width: 120, align: 'right' as const, render: (v: any) => <strong>¥{Number(v).toFixed(2)}</strong> },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => {
      const m: any = { in_use: { t: '使用中', c: 'green' }, idle: { t: '闲置', c: 'orange' }, disposed: { t: '已处置', c: 'default' } };
      return <Tag color={m[v]?.c}>{m[v]?.t || v}</Tag>;
    }},
    { title: '操作', width: 120, render: (_: any, r: any) => (
      <Space size="small">
        <Button size="small" type="link" onClick={() => { setEditing(r); form.setFieldsValue({ ...r, acquisition_date: dayjs(r.acquisition_date) }); setModalOpen(true); }}>编辑</Button>
        {r.status !== 'disposed' && (
          <Popconfirm title="确认处置此资产？" onConfirm={async () => {
            await request.post(`/assets/${r.id}/dispose`, { disposal_date: dayjs().format('YYYY-MM-DD') });
            message.success('已处置'); load();
          }}>
            <Button size="small" type="link" danger>处置</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  const totals = list.reduce((acc, a) => {
    acc.original += Number(a.original_value || 0);
    acc.accumulated += Number(a.accumulated_depreciation || 0);
    acc.net += Number(a.net_value || 0);
    acc.monthly += Number(a.monthly_depreciation || 0);
    return acc;
  }, { original: 0, accumulated: 0, net: 0, monthly: 0 });

  return (
    <Card>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        { key: 'list', label: '资产台账', children: (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}><Card size="small"><Statistic title="资产原值合计" value={totals.original} precision={2} prefix="¥" /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title="累计折旧" value={totals.accumulated} precision={2} prefix="¥" valueStyle={{ color: '#fa8c16' }} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title="账面净值" value={totals.net} precision={2} prefix="¥" valueStyle={{ color: '#52c41a' }} /></Card></Col>
              <Col span={6}><Card size="small"><Statistic title="本月应提折旧" value={totals.monthly} precision={2} prefix="¥" /></Card></Col>
            </Row>
            <Space style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); form.setFieldsValue({ useful_life_months: 36, estimated_residual: 0, category: 'office' }); setModalOpen(true); }}>
                新增固定资产
              </Button>
            </Space>
            <Table rowKey="id" columns={columns} dataSource={list} loading={loading} scroll={{ x: 1300 }} pagination={{ pageSize: 20 }} />
          </>
        )},
        { key: 'depreciation', label: <span><ThunderboltOutlined /> 折旧计提</span>, children: (
          <>
            <Space style={{ marginBottom: 16 }}>
              <span>计提期间：</span>
              <DatePicker picker="month" value={dayjs(period)} onChange={d => d && setPeriod(d.format('YYYY-MM'))} />
              <Button type="primary" onClick={runDepreciation} disabled={!preview?.count}>
                一键计提折旧（{preview?.count || 0}项，¥{Number(preview?.total || 0).toFixed(2)}）
              </Button>
            </Space>
            {preview?.list?.length ? (
              <Table rowKey="id" size="small" pagination={false} dataSource={preview.list}
                columns={[
                  { title: '资产编号', dataIndex: 'asset_no' },
                  { title: '资产名称', dataIndex: 'asset_name' },
                  { title: '原值', dataIndex: 'original_value', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                  { title: '累计折旧', dataIndex: 'accumulated_depreciation', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                  { title: '本月计提', dataIndex: 'amount', align: 'right' as const, render: (v: any) => <strong style={{ color: '#f5222d' }}>¥{Number(v).toFixed(2)}</strong> },
                  { title: '计提后净值', dataIndex: 'net_value', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                ]}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}><strong>合计</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right"><strong style={{ color: '#f5222d' }}>¥{Number(preview.total).toFixed(2)}</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={5} />
                  </Table.Summary.Row>
                )}
              />
            ) : <Empty description={`${period} 无待计提资产（可能已计提或无在用资产）`} />}
          </>
        )},
        { key: 'history', label: <span><HistoryOutlined /> 折旧记录</span>, children: (
          <>
            <Space style={{ marginBottom: 16 }}>
              <span>期间：</span>
              <DatePicker picker="month" value={dayjs(period)} onChange={d => d && setPeriod(d.format('YYYY-MM'))} allowClear={false} />
            </Space>
            <Table rowKey="id" dataSource={history} pagination={{ pageSize: 20 }}
              columns={[
                { title: '期间', dataIndex: 'period', width: 100 },
                { title: '资产编号', dataIndex: 'asset_no' },
                { title: '资产名称', dataIndex: 'asset_name' },
                { title: '本月折旧', dataIndex: 'amount', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                { title: '累计折旧', dataIndex: 'accumulated_after', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                { title: '净值', dataIndex: 'net_value_after', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                { title: '计提时间', dataIndex: 'created_at', render: (v: string) => v?.slice(0, 16).replace('T', ' ') },
              ]} />
          </>
        )},
      ]} />

      <Modal title={editing ? '编辑固定资产' : '新增固定资产'} open={modalOpen} onOk={handleSave}
        onCancel={() => setModalOpen(false)} width={640} destroyOnClose>
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex' }}>
            <Form.Item name="asset_name" label="资产名称" rules={[{ required: true }]} style={{ flex: 2 }}>
              <Input placeholder="如：联想笔记本电脑" />
            </Form.Item>
            <Form.Item name="category" label="类别" initialValue="office" style={{ flex: 1 }}>
              <Select options={Object.entries(categoryMap).map(([k, v]) => ({ value: k, label: v.label }))} />
            </Form.Item>
          </Space>
          <Form.Item name="specification" label="规格型号"><Input placeholder="如：ThinkPad X1 Carbon" /></Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="acquisition_date" label="取得日期" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="original_value" label="原值（元）" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="estimated_residual" label="预计净残值" initialValue={0} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
            <Form.Item name="useful_life_months" label="使用月数" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={1} addonAfter="月" />
            </Form.Item>
          </Space>
          {calculatedMonthly > 0 && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', padding: '8px 12px', borderRadius: 4, marginBottom: 16 }}>
              直线法月折旧额：<strong style={{ color: '#52c41a', fontSize: 16 }}>¥{calculatedMonthly.toFixed(2)}</strong>
              <span style={{ color: '#999', marginLeft: 12 }}>（原值-残值）/使用月数</span>
            </div>
          )}
          <Space style={{ display: 'flex' }}>
            <Form.Item name="department" label="使用部门" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="responsible_person" label="责任人" style={{ flex: 1 }}><Input /></Form.Item>
          </Space>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="固定资产详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={680}>
        {detail && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="资产编号">{detail.asset_no}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={detail.status === 'in_use' ? 'green' : detail.status === 'idle' ? 'orange' : 'default'}>
                  {detail.status === 'in_use' ? '使用中' : detail.status === 'idle' ? '闲置' : '已处置'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="资产名称" span={2}>{detail.asset_name}</Descriptions.Item>
              <Descriptions.Item label="类别">{categoryMap[detail.category]?.label}</Descriptions.Item>
              <Descriptions.Item label="规格型号">{detail.specification || '-'}</Descriptions.Item>
              <Descriptions.Item label="取得日期">{detail.acquisition_date?.slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="折旧方法">直线法</Descriptions.Item>
              <Descriptions.Item label="原值">¥{Number(detail.original_value).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="预计净残值">¥{Number(detail.estimated_residual).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="使用月数">{detail.useful_life_months}个月</Descriptions.Item>
              <Descriptions.Item label="月折旧额">¥{Number(detail.monthly_depreciation).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="累计折旧" span={2}><span style={{ color: '#fa8c16' }}>¥{Number(detail.accumulated_depreciation).toFixed(2)}</span></Descriptions.Item>
              <Descriptions.Item label="账面净值" span={2}><strong style={{ color: '#52c41a', fontSize: 16 }}>¥{Number(detail.net_value).toFixed(2)}</strong></Descriptions.Item>
              <Descriptions.Item label="使用部门">{detail.department || '-'}</Descriptions.Item>
              <Descriptions.Item label="责任人">{detail.responsible_person || '-'}</Descriptions.Item>
            </Descriptions>
            {detail.depreciation_records?.length > 0 && (
              <>
                <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 600 }}>折旧历史（最近记录）</div>
                <Table size="small" rowKey="id" pagination={{ pageSize: 5 }} dataSource={detail.depreciation_records}
                  columns={[
                    { title: '期间', dataIndex: 'period' },
                    { title: '本月折旧', dataIndex: 'amount', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                    { title: '累计折旧', dataIndex: 'accumulated_after', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                    { title: '净值', dataIndex: 'net_value_after', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                  ]} />
              </>
            )}
          </>
        )}
      </Modal>
    </Card>
  );
};
export default FixedAssets;
