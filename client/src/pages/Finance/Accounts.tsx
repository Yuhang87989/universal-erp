import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Popconfirm, TreeSelect } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const categoryMap: Record<string, { color: string; label: string }> = {
  asset: { color: 'blue', label: '资产' },
  liability: { color: 'red', label: '负债' },
  equity: { color: 'purple', label: '权益' },
  revenue: { color: 'green', label: '收入' },
  expense: { color: 'orange', label: '费用' },
};

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [form] = Form.useForm();

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterCategory) params.category = filterCategory;
      const res = await request.get('/accounts', { params });
      setAccounts(res.data?.data || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccounts(); }, [filterCategory]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: 'asset', direction: 'debit' });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      category: record.category,
      parent_id: record.parent_id,
      direction: record.direction,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await request.put(`/accounts/${editing.id}`, values);
        message.success('科目更新成功');
      } else {
        await request.post('/accounts', values);
        message.success('科目添加成功');
      }
      setModalOpen(false);
      loadAccounts();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else if (!err.errorFields) message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/accounts/${id}`);
      message.success('科目已删除');
      loadAccounts();
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const categoryValue = Form.useWatch('category', form);

  const treeData = accounts.filter(a => !editing || a.id !== editing.id).map(a => ({
    value: a.id,
    title: `${a.code} ${a.name}`,
  }));

  const columns = [
    { title: '编码', dataIndex: 'code', width: 120, render: (v: string, r: any) => (
      <span style={{ paddingLeft: (r.level - 1) * 16 }}>{v}</span>
    )},
    { title: '科目名称', dataIndex: 'name', width: 200 },
    { title: '类别', dataIndex: 'category', width: 80, render: (v: string) => {
      const c = categoryMap[v] || { color: 'default', label: v };
      return <Tag color={c.color}>{c.label}</Tag>;
    }},
    { title: '余额方向', dataIndex: 'direction', width: 90, render: (v: string) => v === 'debit' ? '借方' : '贷方' },
    { title: '层级', dataIndex: 'level', width: 60 },
    { title: '状态', dataIndex: 'is_enabled', width: 70, render: (v: boolean) => (
      <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag>
    )},
    { title: '已用凭证', dataIndex: 'usage_count', width: 80 },
    { title: '操作', key: 'action', width: 100, render: (_: any, record: any) => (
      <Space size="small">
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        {record.child_count === 0 && record.usage_count === 0 && (
          <Popconfirm title="确定删除此科目？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <Title level={4}>会计科目表</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="类别筛选" allowClear style={{ width: 120 }}
            options={Object.entries(categoryMap).map(([k, v]) => ({ value: k, label: v.label }))}
            value={filterCategory} onChange={v => setFilterCategory(v)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增科目</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={accounts} rowKey="id" loading={loading} size="small"
        pagination={false} scroll={{ x: 800 }}
        expandable={{ childrenColumnName: '_none' }}
      />

      <Modal title={editing ? '编辑科目' : '新增科目'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="code" label="科目编码" rules={[{ required: true, message: '请输入科目编码' }]}>
            <Input placeholder="如：1001 或 1002.01" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="科目名称" rules={[{ required: true, message: '请输入科目名称' }]}>
            <Input placeholder="如：库存现金" />
          </Form.Item>
          <Form.Item name="category" label="科目类别" rules={[{ required: true }]}>
            <Select options={Object.entries(categoryMap).map(([k, v]) => ({ value: k, label: v.label }))}
              onChange={() => { form.setFieldsValue({ direction: undefined }); }}
            />
          </Form.Item>
          <Form.Item name="direction" label="余额方向">
            <Select allowClear placeholder="自动根据类别判断"
              options={[{ value: 'debit', label: '借方' }, { value: 'credit', label: '贷方' }]}
            />
          </Form.Item>
          <Form.Item name="parent_id" label="上级科目">
            <TreeSelect treeData={treeData} placeholder="无（顶级科目）" allowClear treeDefaultExpandAll />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Accounts;
