import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Switch, Space, message, Card, Tag, Popconfirm, Typography, Row, Col, Statistic } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, HomeOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Warehouses: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await request.get('/warehouses');
      const d = res.data?.data || res.data; setList(Array.isArray(d) ? d : (d?.list || []));
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await request.put(`/warehouses/${editing.id}`, values);
        message.success('仓库已更新');
      } else {
        await request.post('/warehouses', values);
        message.success('仓库已创建');
      }
      setModalOpen(false); setEditing(null); form.resetFields(); load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try { await request.delete(`/warehouses/${id}`); message.success('已删除'); load(); }
    catch (e: any) { message.error(e.response?.data?.message || '删除失败'); }
  };

  const columns = [
    { title: '编码', dataIndex: 'code', width: 100 },
    { title: '仓库名称', dataIndex: 'name', render: (v: string, r: any) => (
      <Space>{r.is_default && <Tag color="blue">默认</Tag>}{v}</Space>
    )},
    { title: '管理员', dataIndex: 'manager', width: 100, render: (v: string) => v || '-' },
    { title: '电话', dataIndex: 'phone', width: 130, render: (v: string) => v || '-' },
    { title: 'SKU数', dataIndex: 'sku_count', width: 80, align: 'center' as const },
    { title: '库存价值', dataIndex: 'total_value', width: 120, render: (v: number) => `¥${Number(v || 0).toFixed(2)}`, align: 'right' as const },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag> },
    { title: '操作', width: 120, render: (_: any, r: any) => (
      <Space>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditing(r); form.setFieldsValue(r); setModalOpen(true); }}>编辑</Button>
        {!r.is_default && <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>}
      </Space>
    )}
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>仓库管理</Title>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card size="small"><Statistic title="仓库总数" value={list.length} prefix={<HomeOutlined />} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="总SKU数" value={list.reduce((s, w) => s + (w.sku_count || 0), 0)} /></Card></Col>
        <Col span={8}><Card size="small"><Statistic title="库存总价值" prefix="¥" value={list.reduce((s, w) => s + Number(w.total_value || 0), 0).toFixed(2)} /></Card></Col>
      </Row>
      <Card size="small" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>新增仓库</Button>}>
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" pagination={false} />
      </Card>

      <Modal title={editing ? '编辑仓库' : '新增仓库'} open={modalOpen} onOk={handleSubmit} onCancel={() => { setModalOpen(false); setEditing(null); }} width={560}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="code" label="仓库编码" rules={[{ required: true }]}><Input placeholder="如 WH002" /></Form.Item></Col>
            <Col span={12}><Form.Item name="name" label="仓库名称" rules={[{ required: true }]}><Input placeholder="如 二号仓" /></Form.Item></Col>
          </Row>
          <Form.Item name="address" label="仓库地址"><Input placeholder="详细地址" /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="manager" label="管理员"><Input placeholder="负责人姓名" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="联系电话"><Input placeholder="手机号" /></Form.Item></Col>
          </Row>
          <Form.Item name="is_default" label="设为默认仓库" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Warehouses;
