import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, message, Typography, Row, Col, Statistic, Tabs } from 'antd';
import { PlusOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title } = Typography;

const typeOptions = [
  { value: 'income', label: '收入', color: 'green' },
  { value: 'expense', label: '支出', color: 'red' }
];

const categoryOptions = [
  { value: '销售收入', label: '销售收入' },
  { value: '采购支出', label: '采购支出' },
  { value: '人工成本', label: '人工成本' },
  { value: '水电费', label: '水电费' },
  { value: '租金', label: '租金' },
  { value: '物流费用', label: '物流费用' },
  { value: '平台佣金', label: '平台佣金' },
  { value: '其他收入', label: '其他收入' },
  { value: '其他支出', label: '其他支出' },
];

const Finance: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();

  // 汇总数据
  const [summary, setSummary] = useState({ income: 0, expense: 0 });

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (typeFilter) params.type = typeFilter;
      const res = await request.get('/finance', { params });
      const data = res.data;
      setRecords(data?.list || data?.records || []);
      setTotal(data?.total || 0);
      if (data?.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ type: 'expense', recordDate: dayjs() });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      recordDate: record.record_date ? dayjs(record.record_date) : dayjs()
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        recordDate: values.recordDate?.format('YYYY-MM-DD'),
      };
      if (editing) {
        await request.put(`/finance/${editing.id}`, payload);
        message.success('记录更新成功');
      } else {
        await request.post('/finance', payload);
        message.success('记录添加成功');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 80,
      render: (v: string) => {
        const opt = typeOptions.find(t => t.value === v);
        return <Tag color={opt?.color} icon={v === 'income' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}>{opt?.label}</Tag>;
      }
    },
    { title: '类别', dataIndex: 'category', key: 'category', width: 100 },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 120,
      render: (v: number, r: any) => (
        <span style={{ color: r.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 500 }}>
          {r.type === 'income' ? '+' : '-'}¥{Number(v || 0).toFixed(2)}
        </span>
      )
    },
    { title: '支付方式', dataIndex: 'payment_method', key: 'payment_method', width: 100, render: (v: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '日期', dataIndex: 'record_date', key: 'record_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>财务管理</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="总收入" value={summary.income || 0} precision={2} prefix="¥" valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="总支出" value={summary.expense || 0} precision={2} prefix="¥" valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title="净利润" value={(summary.income || 0) - (summary.expense || 0)} precision={2} prefix="¥" valueStyle={{ color: ((summary.income || 0) - (summary.expense || 0)) >= 0 ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="类型筛选" allowClear style={{ width: 120 }}
            options={typeOptions}
            value={typeFilter} onChange={v => { setTypeFilter(v); setPage(1); }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>记一笔</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={records} rowKey="id" loading={loading} size="small" scroll={{ x: 700 }}
        pagination={{ current: page, total, showTotal: t => `共 ${t} 条`, onChange: p => setPage(p) }} />

      <Modal title={editing ? '编辑收支' : '记一笔'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <Select options={typeOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="类别" rules={[{ required: true, message: '请选择类别' }]}>
                <Select options={categoryOptions} placeholder="选择类别" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber min={0.01} precision={2} placeholder="0.00" prefix="¥" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="recordDate" label="日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="paymentMethod" label="支付方式">
            <Select allowClear placeholder="选择支付方式"
              options={[{ value: 'cash', label: '现金' }, { value: 'wechat', label: '微信' }, { value: 'alipay', label: '支付宝' }, { value: 'bank', label: '银行卡' }]} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Finance;
