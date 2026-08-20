import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, message, Typography, Tabs, Row, Col, Statistic } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title } = Typography;

const levelOptions = [
  { value: 'normal', label: '普通会员', color: 'default' },
  { value: 'silver', label: '银卡会员', color: 'blue' },
  { value: 'gold', label: '金卡会员', color: 'gold' },
  { value: 'vip', label: 'VIP会员', color: 'purple' },
];

const genderOptions = [
  { value: 'unknown', label: '未知' },
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
];

const Customers: React.FC = () => {
  const [activeTab, setActiveTab] = useState('customers');

  // 客户相关
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  // 供应商相关
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierLoading, setSupplierLoading] = useState(false);

  const loadCustomers = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (keyword) params.keyword = keyword;
      const res = await request.get('/customers', { params });
      setCustomers(res.data?.list || res.data || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const loadSuppliers = useCallback(async (p = 1) => {
    setSupplierLoading(true);
    try {
      const res = await request.get('/suppliers', { params: { page: p, pageSize: 20 } });
      setSuppliers(res.data?.list || []);
      setSupplierTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setSupplierLoading(false);
    }
  }, []);

  useEffect(() => { loadCustomers(); loadSuppliers(); }, [loadCustomers, loadSuppliers]);

  const handleAdd = () => { setEditing(null); form.resetFields(); setModalOpen(true); };
  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      birthday: record.birthday ? dayjs(record.birthday) : null,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = { ...values, birthday: values.birthday?.format('YYYY-MM-DD') };
      if (editing) {
        await request.put(`/customers/${editing.id}`, payload);
        message.success('客户更新成功');
      } else {
        await request.post('/customers', payload);
        message.success('客户添加成功');
      }
      setModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const customerColumns = [
    { title: '客户名称', dataIndex: 'name', key: 'name', width: 120 },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130, render: (v: string) => v || '-' },
    { title: '性别', dataIndex: 'gender', key: 'gender', width: 70, render: (v: string) => genderOptions.find(g => g.value === v)?.label || '-' },
    {
      title: '等级', dataIndex: 'level', key: 'level', width: 100,
      render: (v: string) => { const opt = levelOptions.find(l => l.value === v); return opt ? <Tag color={opt.color}>{opt.label}</Tag> : v || '普通'; }
    },
    { title: '累计消费', dataIndex: 'total_spent', key: 'total_spent', width: 100, render: (v: number) => v ? `¥${Number(v).toFixed(2)}` : '¥0.00' },
    { title: '生日', dataIndex: 'birthday', key: 'birthday', width: 100, render: (v: string) => v?.slice(0, 10) || '-' },
    { title: '备注', dataIndex: 'notes', key: 'notes', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 100,
      render: (_: any, record: any) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
      )
    }
  ];

  const supplierColumns = [
    { title: '供应商名称', dataIndex: 'name', key: 'name', width: 140 },
    { title: '联系人', dataIndex: 'contact_name', key: 'contact_name', width: 100, render: (v: string) => v || '-' },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130, render: (v: string) => v || '-' },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 80,
      render: () => <Tag>去供应商管理页编辑</Tag>
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>往来单位</Title>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane tab={<span><UserOutlined />客户档案</span>} key="customers">
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space wrap>
              <Input
                placeholder="搜索客户名称/电话"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={() => { setPage(1); loadCustomers(); }}
                style={{ width: 200 }}
                allowClear
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增客户</Button>
            </Space>
          </Card>
          <Table columns={customerColumns} dataSource={customers} rowKey="id" loading={loading} size="small" scroll={{ x: 800 }}
            pagination={{ current: page, total, showTotal: t => `共 ${t} 位客户`, onChange: p => setPage(p) }} />
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><TeamOutlined />供应商档案</span>} key="suppliers">
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space>
              <Tag color="blue">共 {supplierTotal} 家供应商</Tag>
              <Button type="primary" href="/suppliers" icon={<TeamOutlined />}>去供应商管理</Button>
            </Space>
          </Card>
          <Table columns={supplierColumns} dataSource={suppliers} rowKey="id" loading={supplierLoading} size="small" scroll={{ x: 600 }}
            pagination={{ current: supplierPage, total: supplierTotal, showTotal: t => `共 ${t} 家`, onChange: p => { setSupplierPage(p); loadSuppliers(p); } }} />
        </Tabs.TabPane>
      </Tabs>

      {/* 客户弹窗 */}
      <Modal title={editing ? '编辑客户' : '新增客户'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="客户名称" rules={[{ required: true, message: '请输入客户名称' }]}>
            <Input placeholder="客户姓名或单位名称" />
          </Form.Item>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="手机号码" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="gender" label="性别" initialValue="unknown">
                <Select options={genderOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="level" label="会员等级" initialValue="normal">
                <Select options={levelOptions} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="birthday" label="生日">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="偏好、结算方式等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Customers;
