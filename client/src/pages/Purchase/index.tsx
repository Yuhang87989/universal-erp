import React, { useState, useEffect } from 'react';
import {
  Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Tag, Space, message, Tabs, Card, Row, Col, Popconfirm, Descriptions
} from 'antd';
import { PlusOutlined, SearchOutlined, CheckOutlined, EyeOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { TabPane } = Tabs;
const { Option } = Select;

const Purchase: React.FC = () => {
  const [activeTab, setActiveTab] = useState('orders');

  // 供应商相关
  const [suppliers, setSuppliers] = useState([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierForm] = Form.useForm();

  // 采购单相关
  const [orders, setOrders] = useState([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderForm] = Form.useForm();
  const [orderItems, setOrderItems] = useState([{ productId: null, quantity: 1, costPrice: 0 }]);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  // 加载供应商
  const loadSuppliers = async () => {
    setSupplierLoading(true);
    try {
      const res = await request.get('/purchases/suppliers', { params: { pageSize: 100 } });
      setSuppliers(res.data.data || []);
    } catch (e) { /* ignore */ }
    setSupplierLoading(false);
  };

  // 加载采购单
  const loadOrders = async (page = 1) => {
    setOrderLoading(true);
    try {
      const res = await request.get('/purchases/orders', { params: { page, pageSize: 20 } });
      setOrders(res.data.data || []);
      setPagination({ current: page, pageSize: 20, total: res.data.total || 0 });
    } catch (e) { /* ignore */ }
    setOrderLoading(false);
  };

  // 加载商品（用于采购单选择）
  const loadProducts = async () => {
    try {
      const res = await request.get('/products', { params: { pageSize: 200 } });
      setProducts(res.data.data || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    loadSuppliers();
    loadOrders();
    loadProducts();
  }, []);

  // 供应商操作
  const handleSaveSupplier = async () => {
    try {
      const values = await supplierForm.validateFields();
      if (editingSupplier) {
        await request.put(`/purchases/suppliers/${editingSupplier.id}`, values);
        message.success('供应商更新成功');
      } else {
        await request.post('/purchases/suppliers', values);
        message.success('供应商添加成功');
      }
      setSupplierModal(false);
      supplierForm.resetFields();
      setEditingSupplier(null);
      loadSuppliers();
    } catch (e) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    try {
      await request.delete(`/purchases/suppliers/${id}`);
      message.success('已删除');
      loadSuppliers();
    } catch (e) {
      message.error(e.response?.data?.message || '删除失败');
    }
  };

  // 采购单操作
  const handleCreateOrder = async () => {
    try {
      const values = await orderForm.validateFields();
      const validItems = orderItems.filter(i => i.productId && i.quantity > 0);
      if (validItems.length === 0) {
        message.warning('请添加至少一个商品');
        return;
      }
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
    } catch (e) {
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
      setCurrentOrder(res.data.data);
      setDetailModal(true);
    } catch (e) {
      message.error('获取详情失败');
    }
  };

  // 采购单商品项操作
  const addItem = () => {
    setOrderItems([...orderItems, { productId: null, quantity: 1, costPrice: 0 }]);
  };
  const removeItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...orderItems];
    newItems[index] = { ...newItems[index], [field]: value };
    // 选择商品时自动填入成本价
    if (field === 'productId' && value) {
      const product = products.find((p: any) => p.id === value);
      if (product?.cost_price) newItems[index].costPrice = product.cost_price;
    }
    setOrderItems(newItems);
  };

  // 状态标签
  const statusMap: Record<string, { text: string; color: string }> = {
    pending: { text: '待入库', color: 'orange' },
    received: { text: '已入库', color: 'green' },
    cancelled: { text: '已取消', color: 'default' }
  };

  // 供应商表格列
  const supplierColumns = [
    { title: '供应商名称', dataIndex: 'name', key: 'name' },
    { title: '联系人', dataIndex: 'contact_name', key: 'contact_name' },
    { title: '电话', dataIndex: 'phone', key: 'phone' },
    { title: '采购单数', dataIndex: 'totalOrders', key: 'totalOrders', render: (v: number) => v || 0 },
    { title: '累计金额', dataIndex: 'totalAmount', key: 'totalAmount', render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    {
      title: '操作', key: 'action', width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => { setEditingSupplier(record); supplierForm.setFieldsValue(record); setSupplierModal(true); }}>编辑</Button>
          <Popconfirm title="确定删除该供应商？" onConfirm={() => handleDeleteSupplier(record.id)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  // 采购单表格列
  const orderColumns = [
    { title: '采购单号', dataIndex: 'order_no', key: 'order_no', width: 160 },
    { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name' },
    { title: '商品数', dataIndex: 'itemCount', key: 'itemCount', render: (v: number) => `${v}种` },
    { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag>
    },
    { title: '下单日期', dataIndex: 'order_date', key: 'order_date', render: (v: string) => v?.slice(0, 10) },
    { title: '创建人', dataIndex: 'creator_name', key: 'creator_name' },
    {
      title: '操作', key: 'action', width: 200,
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.id)}>详情</Button>
          {record.status === 'pending' && (
            <>
              <Popconfirm title="确认收货入库？库存将自动增加。" onConfirm={() => handleReceive(record.id)}>
                <Button size="small" type="primary" icon={<CheckOutlined />}>入库</Button>
              </Popconfirm>
              <Popconfirm title="确定删除该采购单？" onConfirm={() => handleDeleteOrder(record.id)}>
                <Button size="small" danger>删除</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="采购单" key="orders">
          <Card>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <Space>
                <Tag color="blue">共 {pagination.total} 条</Tag>
              </Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOrderModal(true)}>
                新建采购单
              </Button>
            </div>
            <Table
              columns={orderColumns}
              dataSource={orders}
              rowKey="id"
              loading={orderLoading}
              pagination={{
                current: pagination.current,
                pageSize: pagination.pageSize,
                total: pagination.total,
                onChange: (p) => loadOrders(p)
              }}
            />
          </Card>
        </TabPane>

        <TabPane tab="供应商" key="suppliers">
          <Card>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
              <Space>
                <Tag color="green">共 {suppliers.length} 家</Tag>
              </Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingSupplier(null); supplierForm.resetFields(); setSupplierModal(true); }}>
                新增供应商
              </Button>
            </div>
            <Table
              columns={supplierColumns}
              dataSource={suppliers}
              rowKey="id"
              loading={supplierLoading}
              pagination={false}
            />
          </Card>
        </TabPane>
      </Tabs>

      {/* 供应商编辑弹窗 */}
      <Modal
        title={editingSupplier ? '编辑供应商' : '新增供应商'}
        open={supplierModal}
        onOk={handleSaveSupplier}
        onCancel={() => { setSupplierModal(false); setEditingSupplier(null); }}
        width={500}
      >
        <Form form={supplierForm} layout="vertical">
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}>
            <Input placeholder="如：张记蔬菜批发" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactName" label="联系人">
                <Input placeholder="联系人姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="电话">
                <Input placeholder="联系电话" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="地址">
            <Input placeholder="供应商地址" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="结算方式、配送说明等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建采购单弹窗 */}
      <Modal
        title="新建采购单"
        open={orderModal}
        onOk={handleCreateOrder}
        onCancel={() => { setOrderModal(false); orderForm.resetFields(); setOrderItems([{ productId: null, quantity: 1, costPrice: 0 }]); }}
        width={700}
        okText="提交采购单"
      >
        <Form form={orderForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="supplierId" label="供应商" rules={[{ required: true, message: '请选择供应商' }]}>
                <Select placeholder="选择供应商" showSearch optionFilterProp="children">
                  {suppliers.map((s: any) => <Option key={s.id} value={s.id}>{s.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="orderDate" label="采购日期" initialValue={null}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {/* 商品明细 */}
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细</div>
            {orderItems.map((item, index) => (
              <Row gutter={8} key={index} align="middle" style={{ marginBottom: 8 }}>
                <Col span={10}>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="选择商品"
                    showSearch
                    optionFilterProp="children"
                    value={item.productId}
                    onChange={(v) => updateItem(index, 'productId', v)}
                  >
                    {products.map((p: any) => <Option key={p.id} value={p.id}>{p.name}</Option>)}
                  </Select>
                </Col>
                <Col span={5}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={1}
                    placeholder="数量"
                    value={item.quantity}
                    onChange={(v) => updateItem(index, 'quantity', v)}
                  />
                </Col>
                <Col span={6}>
                  <InputNumber
                    style={{ width: '100%' }}
                    min={0}
                    precision={2}
                    placeholder="进价"
                    prefix="¥"
                    value={item.costPrice}
                    onChange={(v) => updateItem(index, 'costPrice', v)}
                  />
                </Col>
                <Col span={3}>
                  {orderItems.length > 1 && (
                    <Button danger size="small" onClick={() => removeItem(index)}>删除</Button>
                  )}
                </Col>
              </Row>
            ))}
            <Button type="dashed" block onClick={addItem} icon={<PlusOutlined />}>
              添加商品
            </Button>
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 14, color: '#666' }}>
              合计：¥{orderItems.reduce((sum, i) => sum + (i.quantity || 0) * (i.costPrice || 0), 0).toFixed(2)}
            </div>
          </div>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} placeholder="采购备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 采购单详情弹窗 */}
      <Modal
        title={`采购单详情 - ${currentOrder?.order_no || ''}`}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        footer={null}
        width={650}
      >
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
            <Table
              size="small"
              dataSource={currentOrder.items}
              rowKey="id"
              pagination={false}
              columns={[
                { title: '商品', dataIndex: 'product_name' },
                { title: '数量', dataIndex: 'quantity' },
                { title: '进价', dataIndex: 'cost_price', render: (v: number) => `¥${Number(v).toFixed(2)}` },
                { title: '小计', dataIndex: 'subtotal', render: (v: number) => `¥${Number(v).toFixed(2)}` }
              ]}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default Purchase;
