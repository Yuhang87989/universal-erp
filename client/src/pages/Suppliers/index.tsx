import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, Tag, message, Typography, Popconfirm, Descriptions, Divider } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Suppliers: React.FC = () => {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (keyword) params.keyword = keyword;
      const res = await request.get('/suppliers', { params });
      const data = res.data?.data || res.data || {};
      setSuppliers(data?.list || data?.data || data || []);
      setTotal(data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleViewDetail = async (id: number) => {
    try {
      const res = await request.get(`/suppliers/${id}`);
      setDetail(res.data?.data || res.data);
      setDetailModal(true);
    } catch (e) {
      message.error('获取详情失败');
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await request.put(`/suppliers/${editing.id}`, values);
        message.success('供应商更新成功');
      } else {
        await request.post('/suppliers', values);
        message.success('供应商添加成功');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/suppliers/${id}`);
      message.success('已删除');
      loadData();
    } catch (e) {
      message.error('删除失败');
    }
  };

  const columns = [
    { title: '供应商名称', dataIndex: 'name', key: 'name', width: 160 },
    { title: '联系人', dataIndex: 'contact_name', key: 'contact_name', width: 100, render: (v: string) => v || '-' },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 130, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'active' ? 'green' : 'default'}>{v === 'active' ? '启用' : '停用'}</Tag>
    },
    { title: '地址', dataIndex: 'address', key: 'address', ellipsis: true },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" onClick={() => handleViewDetail(record.id)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除该供应商？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>供应商管理</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索供应商名称/联系人/电话"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => { setPage(1); loadData(); }}
            style={{ width: 240 }}
            allowClear
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增供应商</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={suppliers} rowKey="id" loading={loading} size="small" scroll={{ x: 800 }}
        pagination={{ current: page, pageSize: 20, total, showTotal: t => `共 ${t} 家供应商`, onChange: p => setPage(p) }} />

      {/* 新增/编辑弹窗 */}
      <Modal title={editing ? '编辑供应商' : '新增供应商'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input placeholder="如：张记蔬菜批发" />
          </Form.Item>
          <Form.Item name="contactName" label="联系人">
            <Input placeholder="联系人姓名" />
          </Form.Item>
          <Form.Item name="phone" label="联系电话">
            <Input placeholder="联系电话" />
          </Form.Item>
          <Form.Item name="address" label="地址">
            <Input placeholder="供应商地址" />
          </Form.Item>
          <Form.Item name="bankName" label="开户银行">
            <Input placeholder="开户银行" />
          </Form.Item>
          <Form.Item name="bankAccount" label="银行账号">
            <Input placeholder="银行账号" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="结算方式、配送说明等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal title={`供应商详情 - ${detail?.name || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={500}>
        {detail && (
          <>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="名称">{detail.name}</Descriptions.Item>
              <Descriptions.Item label="联系人">{detail.contact_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="电话">{detail.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="地址">{detail.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="开户银行">{detail.bank_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="银行账号">{detail.bank_account || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={detail.status === 'active' ? 'green' : 'default'}>{detail.status === 'active' ? '启用' : '停用'}</Tag></Descriptions.Item>
              <Descriptions.Item label="备注">{detail.notes || '-'}</Descriptions.Item>
            </Descriptions>
            {detail.recentOrders && detail.recentOrders.length > 0 && (
              <>
                <Divider>近期采购记录</Divider>
                <Table size="small" dataSource={detail.recentOrders} pagination={false} rowKey="id"
                  columns={[
                    { title: '单号', dataIndex: 'order_no' },
                    { title: '日期', dataIndex: 'order_date', render: (v: string) => v?.slice(0, 10) },
                    { title: '金额', dataIndex: 'total_amount', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag color={v === 'received' ? 'green' : v === 'pending' ? 'orange' : 'default'}>{v}</Tag> }
                  ]}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default Suppliers;
