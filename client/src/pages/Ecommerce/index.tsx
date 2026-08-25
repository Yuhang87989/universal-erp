import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, InputNumber, Space, Tag, message, Typography, Row, Col, Statistic, Popconfirm } from 'antd';
import { PlusOutlined, ShopOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const platformOptions = [
  { value: 'douyin', label: '抖音', color: '#111' },
  { value: 'xiaohongshu', label: '小红书', color: '#fe2c55' },
  { value: 'kuaishou', label: '快手', color: '#ff4900' },
  { value: 'wechat_shop', label: '微信小程序', color: '#07c160' },
  { value: 'pinduoduo', label: '拼多多', color: '#e02020' },
  { value: 'taobao', label: '淘宝', color: '#ff5000' },
  { value: 'tmall', label: '天猫', color: '#ff0036' },
  { value: 'other', label: '其他', color: '#888' },
];

const statusOptions = [
  { value: 'active', label: '启用', color: 'green' },
  { value: 'disabled', label: '停用', color: 'default' },
];

const Ecommerce: React.FC = () => {
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [platRes, sumRes] = await Promise.all([
        request.get('/ecommerce'),
        request.get('/ecommerce/summary'),
      ]);
      setPlatforms(platRes.data?.data || platRes.data || []);
      setSummary(Array.isArray(sumRes.data?.data) ? sumRes.data.data : (sumRes.data?.data ? [sumRes.data.data] : []) );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ platform: 'taobao', status: 'active', commission_rate: 0 });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await request.put(`/ecommerce/${editing.id}`, { ...values, status: values.status || 'active' });
        message.success('平台更新成功');
      } else {
        await request.post('/ecommerce', values);
        message.success('平台添加成功');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/ecommerce/${id}`);
      message.success('平台已删除');
      loadData();
    } catch {
      message.error('删除失败');
    }
  };

  const getPlatformInfo = (val: string) => platformOptions.find(p => p.value === val) || { label: val, color: '#888' };

  // 计算汇总
  const totalOrders = summary.reduce((s: number, r: any) => s + parseInt(r.order_count || 0), 0);
  const totalAmount = summary.reduce((s: number, r: any) => s + parseFloat(r.total_amount || 0), 0);

  const columns = [
    {
      title: '平台', dataIndex: 'platform', key: 'platform', width: 120,
      render: (v: string) => {
        const info = getPlatformInfo(v);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: '店铺名称', dataIndex: 'shop_name', key: 'shop_name', width: 150 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => {
        const info = statusOptions.find(s => s.value === v) || statusOptions[0];
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '佣金比例', dataIndex: 'commission_rate', key: 'commission_rate', width: 100,
      render: (v: number) => `${((v || 0) * 100).toFixed(1)}%`,
    },
    { title: 'API Key', dataIndex: 'api_key', key: 'api_key', width: 150, render: (v: string) => v ? '******' : '-' },
    {
      title: '订单数', key: 'orders', width: 80,
      render: (_: any, record: any) => {
        const s = summary.find((r: any) => r.platform === record.platform);
        return s ? s.order_count : 0;
      },
    },
    {
      title: '销售额', key: 'amount', width: 110,
      render: (_: any, record: any) => {
        const s = summary.find((r: any) => r.platform === record.platform);
        return s ? `¥${parseFloat(s.total_amount).toFixed(2)}` : '¥0.00';
      },
    },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>电商账目</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="接入平台数" value={platforms.length} prefix={<ShopOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="电商总订单" value={totalOrders} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="电商总销售额" value={totalAmount} precision={2} prefix="¥" valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>接入新平台</Button>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={platforms}
        loading={loading}
        size="small"
        scroll={{ x: 900 }}
        pagination={false}
        locale={{ emptyText: '暂无接入平台，点击上方按钮添加' }}
      />

      <Modal
        title={editing ? '编辑平台' : '接入新平台'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="platform" label="平台类型" rules={[{ required: true }]}>
            <Select options={platformOptions} />
          </Form.Item>
          <Form.Item name="shop_name" label="店铺名称" rules={[{ required: true, message: '请输入店铺名称' }]}>
            <Input placeholder="输入店铺名称" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="commission_rate" label="佣金比例">
              <InputNumber min={0} max={1} step={0.01} placeholder="0.05" style={{ width: 120 }} addonAfter="%" />
            </Form.Item>
            {editing && (
              <Form.Item name="status" label="状态">
                <Select options={statusOptions} style={{ width: 100 }} />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="api_key" label="API Key">
            <Input placeholder="平台API Key（选填）" />
          </Form.Item>
          <Form.Item name="api_secret" label="API Secret">
            <Input.Password placeholder="平台API Secret（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Ecommerce;
