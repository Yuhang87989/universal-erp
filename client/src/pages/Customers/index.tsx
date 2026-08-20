import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, DatePicker, Space, Tag, message, Typography } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, UserOutlined } from '@ant-design/icons';
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
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/customers', { params: { page, pageSize, keyword } });
      setCustomers(res.data?.list || []);
      setTotal(res.data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ gender: 'unknown', level: 'normal' });
    setModalOpen(true);
  };

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
      const payload = {
        ...values,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : null,
      };
      if (editing) {
        await request.put(`/customers/${editing.id}`, payload);
        message.success('客户更新成功');
      } else {
        await request.post('/customers', payload);
        message.success('客户添加成功');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name', width: 100 },
    { title: '手机号', dataIndex: 'phone', key: 'phone', width: 130 },
    {
      title: '性别', dataIndex: 'gender', key: 'gender', width: 60,
      render: (v: string) => genderOptions.find(g => g.value === v)?.label || '未知',
    },
    {
      title: '等级', dataIndex: 'level', key: 'level', width: 100,
      render: (v: string) => {
        const opt = levelOptions.find(l => l.value === v);
        return <Tag color={opt?.color}>{opt?.label || '普通'}</Tag>;
      },
    },
    {
      title: '累计消费', dataIndex: 'total_spent', key: 'total_spent', width: 110,
      render: (v: number) => `¥${parseFloat(v || 0).toFixed(2)}`,
      sorter: (a: any, b: any) => parseFloat(a.total_spent || 0) - parseFloat(b.total_spent || 0),
    },
    { title: '积分', dataIndex: 'points', key: 'points', width: 80 },
    {
      title: '生日', dataIndex: 'birthday', key: 'birthday', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Button type="link" icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)}>编辑</Button>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>客户会员</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索姓名/手机号"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => { setPage(1); loadData(); }}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="会员等级"
            allowClear
            style={{ width: 130 }}
            options={levelOptions}
            onChange={v => { setPage(1); setKeyword(k => k); /* reload handled by useEffect */ }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增客户</Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={customers}
        loading={loading}
        size="small"
        scroll={{ x: 800 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: t => `共 ${t} 位客户`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />

      <Modal
        title={editing ? '编辑客户' : '新增客户'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input prefix={<UserOutlined />} placeholder="客户姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="gender" label="性别">
              <Select options={genderOptions} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="level" label="会员等级">
              <Select options={levelOptions} style={{ width: 130 }} />
            </Form.Item>
          </Space>
          <Form.Item name="birthday" label="生日">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input placeholder="地址" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Customers;
