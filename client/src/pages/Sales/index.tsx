import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Tag, Space, message, Card, Row, Col, Popconfirm, Descriptions, Typography
} from 'antd';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Option } = Select;
const { Title } = Typography;

const Sales: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [orderForm] = Form.useForm();
  const [orderItems, setOrderItems] = useState([{ productId: null, quantity: 1, unitPrice: 0 }]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: undefined, orderType: undefined });

  const loadOrders = async (page = 1, extraFilters = {}) => {
    setLoading(true);
    try {
      const params: any = { page, pageSize: 20, ...filters, ...extraFilters };
      const res = await request.get('/sales', { params });
      setOrders(res.data?.data || res.data || []);
      setPagination({ current: page, pageSize: 20, total: res.data?.total || res.data?.length || 0 });
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const loadProducts = async () => {
    try {
      const res = await request.get('/products', { params: { pageSize: 200 } });
      setProducts((res.data?.data || res.data || []));
    } catch (e) { /* ignore */ }
  };

  const loadCustomers = async () => {
    try {
      const res = await request.get('/customers', { params: { pageSize: 200 } });
      setCustomers(res.data?.list || res.data || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    loadOrders();
    loadProducts();
    loadCustomers();
  }, []);

  const handleCreateOrder = async () => {
    try {
      const values = await orderForm.validateFields();
      const validItems = orderItems.filter(i => i.productId && i.quantity > 0);
      if (validItems.length === 0) { message.warning('请添加至少一个商品'); return; }
      await request.post('/sales', {
        customerId: values.customerId || null,
        items: validItems,
        orderType: values.orderType || 'pos',
        paymentMethod: values.paymentMethod || 'cash',
        discountAmount: values.discountAmount || 0,
        remark: values.remark
      });
      message.success('销售单创建成功');
      setOrderModal(false);
      orderForm.resetFields();
      setOrderItems([{ productId: null, quantity: 1, unitPrice: 0 }]);
      loadOrders();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '创建失败');
    }
  };

  const handleViewDetail = async (id: number) => {
    try {
      const res = await request.get(`/sales/${id}`);
      setCurrentOrder(res.data?.data || res.data);
      setDetailModal(true);
    } catch (e) { message.error('获取详情失败'); }
  };

  const addItem = () => setOrderItems([...orderItems, { productId: null, quantity: 1, unitPrice: 0 }]);
  const removeItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...orderItems];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'productId' && value) {
      const product = products.find((p: any) => p.id === value);
      if (product?.sell_price) newItems[index].unitPrice = product.sell_price;
    }
    setOrderItems(newItems);
  };

  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待处理', color: 'orange' },
    completed: { text: '已完成', color: 'green' },
    refunded: { text: '已退款', color: 'default' },
    cancelled: { text: '已取消', color: 'default' }
  };

  const typeMap: Record<string, string> = {
    pos: 'POS', online: '线上', wholesale: '批发', phone: '电话'
  };

  const columns = [
    { title: '销售单号', dataIndex: 'order_no', key: 'order_no', width: 150 },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', render: (v: string) => v || '-' },
    { title: '类型', dataIndex: 'order_type', key: 'order_type', width: 80, render: (v: string) => typeMap[v] || v },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '实收', dataIndex: 'actual_amount', key: 'actual_amount', width: 100, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>
    },
    { title: '日期', dataIndex: 'order_date', key: 'order_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Button type="link" icon={<EyeOutlined />} size="small" onClick={() => handleViewDetail(record.id)}>详情</Button>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>销售管理</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="订单类型" allowClear style={{ width: 120 }}
            options={[{ value: 'pos', label: 'POS' }, { value: 'online', label: '线上' }, { value: 'wholesale', label: '批发' }]}
            onChange={v => setFilters(f => ({ ...f, orderType: v }))} />
          <Select placeholder="状态" allowClear style={{ width: 120 }}
            options={[{ value: 'pending', label: '待处理' }, { value: 'completed', label: '已完成' }, { value: 'refunded', label: '已退款' }]}
            onChange={v => setFilters(f => ({ ...f, status: v }))} />
          <Button type="primary" onClick={() => loadOrders(1)}>查询</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { orderForm.resetFields(); setOrderItems([{ productId: null, quantity: 1, unitPrice: 0 }]); setOrderModal(true); }}>
            新建销售单
          </Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={orders} rowKey="id" loading={loading} size="small" scroll={{ x: 800 }}
        pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条`, onChange: p => loadOrders(p) }} />

      {/* 新建销售单 */}
      <Modal title="新建销售单" open={orderModal} onOk={handleCreateOrder} onCancel={() => setOrderModal(false)} width={700} okText="提交" style={{ top: 20 }}>
        <Form form={orderForm} layout="vertical">
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="customerId" label="客户">
                <Select placeholder="选择客户（可选）" allowClear showSearch optionFilterProp="label"
                  options={customers.map((c: any) => ({ label: `${c.name} (${c.phone || ''})`, value: c.id }))} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="orderType" label="类型" initialValue="pos">
                <Select options={[{ value: 'pos', label: 'POS' }, { value: 'online', label: '线上' }, { value: 'wholesale', label: '批发' }, { value: 'phone', label: '电话' }]} />
              </Form.Item>
            </Col>
            <Col xs={12} md={6}>
              <Form.Item name="paymentMethod" label="支付方式" initialValue="cash">
                <Select options={[{ value: 'cash', label: '现金' }, { value: 'wechat', label: '微信' }, { value: 'alipay', label: '支付宝' }, { value: 'card', label: '银行卡' }]} />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细</div>
            {orderItems.map((item, index) => (
              <div key={index} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 6 }}>
                <Row gutter={[8, 8]} align="middle">
                  <Col xs={24} md={10}>
                    <Select style={{ width: '100%' }} placeholder="选择商品" showSearch optionFilterProp="label"
                      value={item.productId} onChange={v => updateItem(index, 'productId', v)}
                      options={products.map((p: any) => ({ label: `${p.name} (¥${p.sell_price})`, value: p.id }))} />
                  </Col>
                  <Col xs={12} md={5}>
                    <InputNumber style={{ width: '100%' }} min={1} placeholder="数量" value={item.quantity} onChange={v => updateItem(index, 'quantity', v)} />
                  </Col>
                  <Col xs={12} md={6}>
                    <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="单价" prefix="¥" value={item.unitPrice} onChange={v => updateItem(index, 'unitPrice', v)} />
                  </Col>
                  <Col xs={24} md={3} style={{ textAlign: 'center' }}>
                    {orderItems.length > 1 && <Button danger size="small" onClick={() => removeItem(index)}>删除</Button>}
                  </Col>
                </Row>
              </div>
            ))}
            <Button type="dashed" block onClick={addItem} icon={<PlusOutlined />}>添加商品</Button>
            <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 600 }}>
              合计：¥{orderItems.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice || 0), 0).toFixed(2)}
            </div>
          </div>
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="discountAmount" label="优惠金额">
                <InputNumber min={0} precision={2} placeholder="0.00" prefix="¥" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情弹窗 */}
      <Modal title={`销售单详情 - ${currentOrder?.order_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={650}>
        {currentOrder && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="销售单号">{currentOrder.order_no}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusMap[currentOrder.status]?.color}>{statusMap[currentOrder.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="客户">{currentOrder.customer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="类型">{typeMap[currentOrder.order_type] || currentOrder.order_type}</Descriptions.Item>
              <Descriptions.Item label="日期">{currentOrder.order_date?.slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="支付方式">{currentOrder.payment_method}</Descriptions.Item>
              <Descriptions.Item label="总金额">¥{Number(currentOrder.total_amount || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="实收">¥{Number(currentOrder.actual_amount || 0).toFixed(2)}</Descriptions.Item>
            </Descriptions>
            <Table size="small" dataSource={currentOrder.items || []} rowKey="id" pagination={false}
              columns={[
                { title: '商品', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '单价', dataIndex: 'unit_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                { title: '小计', dataIndex: 'subtotal', render: (v: number) => `¥${Number(v).toFixed(2)}` }
              ]} />
          </>
        )}
      </Modal>
    </div>
  );
};

export default Sales;
