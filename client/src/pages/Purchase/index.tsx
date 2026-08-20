import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Tag, Space, message, Card, Row, Col, Popconfirm, Descriptions, Typography
} from 'antd';
import { PlusOutlined, CheckOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Option } = Select;
const { Title } = Typography;

const Purchase: React.FC = () => {
  // 采购单相关
  const [orders, setOrders] = useState<any[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [orderForm] = Form.useForm();
  const [orderItems, setOrderItems] = useState([{ productId: null, quantity: 1, costPrice: 0 }]);
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // 加载供应商
  const loadSuppliers = async () => {
    try {
      const res = await request.get('/suppliers', { params: { pageSize: 200 } });
      setSuppliers(res.data?.list || res.data?.data || []);
    } catch (e) { /* ignore */ }
  };

  // 加载采购单
  const loadOrders = async (page = 1, status = statusFilter) => {
    setOrderLoading(true);
    try {
      const params: any = { page, pageSize: 20 };
      if (status) params.status = status;
      const res = await request.get('/purchases/orders', { params });
      setOrders(res.data?.data || res.data?.list || []);
      setPagination({ current: page, pageSize: 20, total: res.data?.total || 0 });
    } catch (e) { /* ignore */ }
    setOrderLoading(false);
  };

  // 加载商品
  const loadProducts = async () => {
    try {
      const res = await request.get('/products', { params: { pageSize: 200 } });
      setProducts(res.data?.data || res.data || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    loadSuppliers();
    loadOrders();
    loadProducts();
  }, []);

  const handleCreateOrder = async () => {
    try {
      const values = await orderForm.validateFields();
      const validItems = orderItems.filter(i => i.productId && i.quantity > 0);
      if (validItems.length === 0) { message.warning('请添加至少一个商品'); return; }
      await request.post('/purchases/orders', {
        supplierId: values.supplierId,
        orderDate: values.orderDate?.format('YYYY-MM-DD'),
        items: validItems,
        notes: values.notes
      });
      message.success('采购单创建成功');
      setOrderModal(false);
      orderForm.resetFields();
      setOrderItems([{ productId: null, quantity: 1, costPrice: 0 }]);
      loadOrders();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '创建失败');
    }
  };

  const handleReceive = async (id: number) => {
    try {
      await request.post(`/purchases/orders/${id}/receive`);
      message.success('入库成功，库存已更新');
      loadOrders();
    } catch (e) {
      message.error(e.response?.data?.message || '入库失败');
    }
  };

  const handleDeleteOrder = async (id: number) => {
    try {
      await request.delete(`/purchases/orders/${id}`);
      message.success('已删除');
      loadOrders();
    } catch (e) {
      message.error(e.response?.data?.message || '删除失败');
    }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const res = await request.get(`/purchases/orders/${id}`);
      setCurrentOrder(res.data?.data || res.data);
      setDetailModal(true);
    } catch (e) {
      message.error('获取详情失败');
    }
  };

  const addItem = () => setOrderItems([...orderItems, { productId: null, quantity: 1, costPrice: 0 }]);
  const removeItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...orderItems];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'productId' && value) {
      const product = products.find((p: any) => p.id === value);
      if (product?.cost_price) newItems[index].costPrice = product.cost_price;
    }
    setOrderItems(newItems);
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待入库', color: 'orange' },
    received: { text: '已入库', color: 'green' },
    cancelled: { text: '已取消', color: 'default' }
  };

  const columns = [
    { title: '采购单号', dataIndex: 'order_no', key: 'order_no', width: 150 },
    { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name' },
    { title: '商品数', dataIndex: 'itemCount', key: 'itemCount', width: 80, render: (v: number) => `${v}种` },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>
    },
    { title: '日期', dataIndex: 'order_date', key: 'order_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '创建人', dataIndex: 'creator_name', key: 'creator_name', width: 80 },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.id)}>详情</Button>
          {record.status === 'pending' && (
            <>
              <Popconfirm title="确认收货入库？库存将自动增加。" onConfirm={() => handleReceive(record.id)}>
                <Button type="link" size="small" icon={<CheckOutlined />}>入库</Button>
              </Popconfirm>
              <Popconfirm title="确定删除该采购单？" onConfirm={() => handleDeleteOrder(record.id)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>采购订单</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }}
            options={[{ value: 'pending', label: '待入库' }, { value: 'received', label: '已入库' }, { value: 'cancelled', label: '已取消' }]}
            onChange={v => setStatusFilter(v)} />
          <Button type="primary" onClick={() => loadOrders(1)}>查询</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { orderForm.resetFields(); setOrderItems([{ productId: null, quantity: 1, costPrice: 0 }]); setOrderModal(true); }}>
            新建采购单
          </Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={orders} rowKey="id" loading={orderLoading} size="small" scroll={{ x: 900 }}
        pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条`, onChange: p => loadOrders(p) }} />

      {/* 新建采购单 */}
      <Modal title="新建采购单" open={orderModal} onOk={handleCreateOrder} onCancel={() => setOrderModal(false)} width={700} okText="提交">
        <Form form={orderForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="supplierId" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
                <Select placeholder="选择供应商" showSearch optionFilterProp="label"
                  options={suppliers.map((s: any) => ({ label: s.name, value: s.id }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="orderDate" label="采购日期">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细</div>
            {orderItems.map((item, index) => (
              <Row gutter={8} key={index} align="middle" style={{ marginBottom: 8 }}>
                <Col span={10}>
                  <Select style={{ width: '100%' }} placeholder="选择商品" showSearch optionFilterProp="label"
                    value={item.productId} onChange={v => updateItem(index, 'productId', v)}
                    options={products.map((p: any) => ({ label: `${p.name} (¥${p.cost_price})`, value: p.id }))} />
                </Col>
                <Col span={5}>
                  <InputNumber style={{ width: '100%' }} min={1} placeholder="数量" value={item.quantity} onChange={v => updateItem(index, 'quantity', v)} />
                </Col>
                <Col span={6}>
                  <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="进价" prefix="¥" value={item.costPrice} onChange={v => updateItem(index, 'costPrice', v)} />
                </Col>
                <Col span={3}>
                  {orderItems.length > 1 && <Button danger size="small" onClick={() => removeItem(index)}>删除</Button>}
                </Col>
              </Row>
            ))}
            <Button type="dashed" block onClick={addItem} icon={<PlusOutlined />}>添加商品</Button>
            <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 600 }}>
              合计：¥{orderItems.reduce((sum, i) => sum + (i.quantity || 0) * (i.costPrice || 0), 0).toFixed(2)}
            </div>
          </div>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="采购备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal title={`采购单详情 - ${currentOrder?.order_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={650}>
        {currentOrder && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="采购单号">{currentOrder.order_no}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusMap[currentOrder.status]?.color}>{statusMap[currentOrder.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="供应商">{currentOrder.supplier_name}</Descriptions.Item>
              <Descriptions.Item label="联系电话">{currentOrder.supplier_phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="下单日期">{currentOrder.order_date?.slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="总金额">¥{Number(currentOrder.total_amount || 0).toFixed(2)}</Descriptions.Item>
            </Descriptions>
            <Table size="small" dataSource={currentOrder.items || []} rowKey="id" pagination={false}
              columns={[
                { title: '商品', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '进价', dataIndex: 'cost_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                { title: '小计', dataIndex: 'subtotal', render: (v: number) => `¥${Number(v).toFixed(2)}` }
              ]} />
          </>
        )}
      </Modal>
    </div>
  );
};

export default Purchase;
