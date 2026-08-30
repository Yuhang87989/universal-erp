import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Tag, Space, message, Card, Row, Col, Popconfirm, Descriptions, Typography
} from 'antd';
import { PlusOutlined, EyeOutlined, SearchOutlined, ReloadOutlined, DownloadOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';
import { printReceipt, ReceiptData } from '../../components/ReceiptPrinter';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

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

  // 查询条件
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [payFilter, setPayFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [amountRange, setAmountRange] = useState<[number | null, number | null]>([null, null]);

  const loadOrders = async (page = 1) => {
    setLoading(true);
    try {
      const params: any = { page, pageSize: pagination.pageSize };
      if (keyword) params.keyword = keyword;
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.orderType = typeFilter;
      if (payFilter) params.paymentMethod = payFilter;
      if (dateRange) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      if (amountRange[0] != null) params.minAmount = amountRange[0];
      if (amountRange[1] != null) params.maxAmount = amountRange[1];

      const res = await request.get('/sales', { params });
      const payload = res.data?.data || res.data || {};
      setOrders(payload.list || []);
      setPagination(p => ({ ...p, current: page, total: payload.total || 0 }));
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const loadProducts = async () => {
    try {
      const res = await request.get('/products', { params: { pageSize: 200 } });
      const d = res.data?.data || res.data || {};
      setProducts(d.list || d || []);
    } catch (e) { /* ignore */ }
  };

  const loadCustomers = async () => {
    try {
      const res = await request.get('/customers', { params: { pageSize: 200 } });
      const d = res.data?.data || res.data || {};
      setCustomers(d.list || d || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadOrders(); loadProducts(); loadCustomers(); }, []);

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
      loadOrders(pagination.current);
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

  const handlePrintReceipt = (order: any) => {
    let shopName = '宇航智荟';
    try { const u = JSON.parse(localStorage.getItem('user') || '{}'); shopName = u.tenantName || shopName; } catch {}
    const items = (order.items || []).map((it: any) => ({
      name: it.product_name || it.name || '商品',
      quantity: Number(it.quantity),
      unit: it.unit || '',
      unitPrice: Number(it.unit_price ?? it.unitPrice ?? 0),
    }));
    const data: ReceiptData = {
      shopName,
      orderNo: order.order_no,
      orderDate: order.order_date,
      items,
      totalAmount: Number(order.total_amount || 0),
      discountAmount: Number(order.discount_amount || 0),
      actualAmount: Number(order.actual_amount || order.total_amount || 0),
      paymentMethod: order.payment_method,
      customerName: order.customer_name || '',
      operator: order.operator_name || '',
    };
    printReceipt(data);
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

  const resetFilters = () => {
    setKeyword('');
    setStatusFilter(undefined);
    setTypeFilter(undefined);
    setPayFilter(undefined);
    setDateRange(null);
    setAmountRange([null, null]);
    setTimeout(() => loadOrders(1), 0);
  };

  const exportCSV = () => {
    if (!orders.length) { message.warning('没有可导出的数据'); return; }
    const headers = ['销售单号', '客户', '类型', '总金额', '实收', '支付方式', '状态', '日期'];
    const rows = orders.map((o: any) => [
      o.order_no, o.customer_name || '-', typeMap[o.order_type] || o.order_type,
      Number(o.total_amount || 0).toFixed(2), Number(o.actual_amount || 0).toFixed(2),
      payMap[o.payment_method] || o.payment_method, statusMap[o.status]?.text || o.status,
      o.order_date?.slice(0, 10)
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `销售订单_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const payMap: Record<string, string> = {
    cash: '现金', wechat: '微信', alipay: '支付宝', card: '银行卡'
  };

  const columns = [
    { title: '销售单号', dataIndex: 'order_no', key: 'order_no', width: 150, fixed: 'left' as const },
    { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 100, render: (v: string) => v || '-' },
    { title: '类型', dataIndex: 'order_type', key: 'order_type', width: 70, render: (v: string) => <Tag>{typeMap[v] || v}</Tag> },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 90, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '优惠', dataIndex: 'discount_amount', key: 'discount_amount', width: 80, align: 'right' as const, render: (v: number) => v ? `-¥${Number(v).toFixed(2)}` : '-' },
    { title: '实收', dataIndex: 'actual_amount', key: 'actual_amount', width: 90, align: 'right' as const, render: (v: number) => <Text strong style={{ color: '#ff4d4f' }}>¥{Number(v || 0).toFixed(2)}</Text> },
    { title: '支付', dataIndex: 'payment_method', key: 'payment_method', width: 70, render: (v: string) => payMap[v] || v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>
    },
    { title: '日期', dataIndex: 'order_date', key: 'order_date', width: 100, render: (v: string) => v?.slice(0, 10) },
    { title: '操作员', dataIndex: 'operator_name', key: 'operator_name', width: 80, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 70, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button type="link" icon={<EyeOutlined />} size="small" onClick={() => handleViewDetail(record.id)}>详情</Button>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>销售管理</Title>

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[8, 8]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="搜索单号/客户/商品"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={() => loadOrders(1)}
              allowClear
            />
          </Col>
          <Col xs={12} md={4}>
            <Select placeholder="订单类型" allowClear style={{ width: '100%' }} value={typeFilter} onChange={setTypeFilter}
              options={[{ value: 'pos', label: 'POS' }, { value: 'online', label: '线上' }, { value: 'wholesale', label: '批发' }, { value: 'phone', label: '电话' }]} />
          </Col>
          <Col xs={12} md={4}>
            <Select placeholder="状态" allowClear style={{ width: '100%' }} value={statusFilter} onChange={setStatusFilter}
              options={[{ value: 'pending', label: '待处理' }, { value: 'completed', label: '已完成' }, { value: 'refunded', label: '已退款' }, { value: 'cancelled', label: '已取消' }]} />
          </Col>
          <Col xs={12} md={4}>
            <Select placeholder="支付方式" allowClear style={{ width: '100%' }} value={payFilter} onChange={setPayFilter}
              options={[{ value: 'cash', label: '现金' }, { value: 'wechat', label: '微信' }, { value: 'alipay', label: '支付宝' }, { value: 'card', label: '银行卡' }]} />
          </Col>
          <Col xs={24} md={6}>
            <RangePicker style={{ width: '100%' }} value={dateRange} onChange={v => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs])} />
          </Col>
        </Row>
        <Row gutter={[8, 8]} style={{ marginTop: 8 }}>
          <Col xs={12} md={5}>
            <Input.Group compact>
              <InputNumber
                style={{ width: '50%' }} placeholder="最低金额" min={0} prefix="¥"
                value={amountRange[0]} onChange={v => setAmountRange([v, amountRange[1]])}
              />
              <InputNumber
                style={{ width: '50%' }} placeholder="最高金额" min={0} prefix="¥"
                value={amountRange[1]} onChange={v => setAmountRange([amountRange[0], v])}
              />
            </Input.Group>
          </Col>
          <Col xs={24} md={19} style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={resetFilters}>重置</Button>
              <Button type="primary" onClick={() => loadOrders(1)}>查询</Button>
              <Button icon={<DownloadOutlined />} onClick={exportCSV}>导出</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                orderForm.resetFields();
                setOrderItems([{ productId: null, quantity: 1, unitPrice: 0 }]);
                setOrderModal(true);
              }}>新建销售单</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card size="small">
        <Table columns={columns} dataSource={orders} rowKey="id" loading={loading} size="small" scroll={{ x: 1100 }}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total: pagination.total,
            showSizeChanger: true, showQuickJumper: true,
            showTotal: t => `共 ${t} 条`,
            onChange: (p, ps) => { setPagination(prev => ({ ...prev, current: p, pageSize: ps })); loadOrders(p); }
          }} />
      </Card>

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
      <Modal title={`销售单详情 - ${currentOrder?.order_no || ''}`} open={detailModal} onCancel={() => setDetailModal(false)}
        footer={
          <Space>
            <Button type="primary" icon={<PrinterOutlined />} onClick={() => currentOrder && handlePrintReceipt(currentOrder)}>打印小票</Button>
            <Button onClick={() => setDetailModal(false)}>关闭</Button>
          </Space>
        } width={650}>
        {currentOrder && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="销售单号">{currentOrder.order_no}</Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={statusMap[currentOrder.status]?.color}>{statusMap[currentOrder.status]?.text}</Tag></Descriptions.Item>
              <Descriptions.Item label="客户">{currentOrder.customer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="类型">{typeMap[currentOrder.order_type] || currentOrder.order_type}</Descriptions.Item>
              <Descriptions.Item label="日期">{currentOrder.order_date?.slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="支付方式">{payMap[currentOrder.payment_method] || currentOrder.payment_method}</Descriptions.Item>
              <Descriptions.Item label="总金额">¥{Number(currentOrder.total_amount || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="实收">¥{Number(currentOrder.actual_amount || 0).toFixed(2)}</Descriptions.Item>
            </Descriptions>
            <Table size="small" dataSource={currentOrder.items || []} rowKey="id" pagination={false}
              columns={[
                { title: '商品', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '单价', dataIndex: 'unit_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                { title: '小计', render: (_: any, r: any) => `¥${(Number(r.quantity) * Number(r.unit_price)).toFixed(2)}` }
              ]} />
          </>
        )}
      </Modal>
    </div>
  );
};

export default Sales;
