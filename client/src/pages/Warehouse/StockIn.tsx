import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Card, Row, Col, Popconfirm, Descriptions, Typography, DatePicker } from 'antd';
import { PlusOutlined, CheckOutlined, EyeOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';

const { Title } = Typography;

const inTypeOptions = [
  { value: 'purchase', label: '采购入库' }, { value: 'return', label: '退货入库' },
  { value: 'production_in', label: '生产入库' }, { value: 'transfer_in', label: '调拨入库' },
  { value: 'adjust_in', label: '调整入库' }, { value: 'other', label: '其他入库' }
];
const statusMap: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' }, confirmed: { text: '已入库', color: 'green' }, cancelled: { text: '已取消', color: 'red' }
};

const StockIn: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);
  const [form] = Form.useForm();
  const [items, setItems] = useState([{ productId: null, quantity: 1, unit_cost: 0 }]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [filters, setFilters] = useState<any>({ status: undefined, in_type: undefined });

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const res = await request.get('/stock-in', { params: { page, pageSize: 20, ...filters } });
      const d = res.data?.data || res.data || {}; setList(d.list || []);
      setPagination(p => ({ ...p, current: page, total: (res.data?.data || res.data || {}).total || 0 }));
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    load(1);
    request.get('/products', { params: { pageSize: 500 } }).then(r => setProducts((r.data?.data || r.data || {}).list || r.data?.data || r.data || []));
    request.get('/warehouses').then(r => setWarehouses((r.data?.data || r.data || {}).list || r.data?.data || r.data || []));
    request.get('/suppliers', { params: { pageSize: 200 } }).then(r => setSuppliers((r.data?.data || r.data || {}).list || r.data?.data || r.data || []));
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const validItems = items.filter(i => i.productId && i.quantity > 0);
      if (!validItems.length) { message.warning('请添加至少一个商品'); return; }
      await request.post('/stock-in', {
        warehouse_id: values.warehouse_id,
        in_type: values.in_type,
        supplier_id: values.supplier_id,
        items: validItems.map(i => ({ product_id: i.productId, quantity: i.quantity, unit_cost: i.unit_cost })),
        remark: values.remark
      });
      message.success('入库单已创建');
      setModalOpen(false); form.resetFields(); setItems([{ productId: null, quantity: 1, unit_cost: 0 }]); load(1);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '创建失败');
    }
  };

  const handleConfirm = async (record: any) => {
    try {
      await request.post(`/stock-in/${record.id}/confirm`);
      message.success('入库确认成功，库存已更新');
      // 取详情用于语音播报数量和金额
      try {
        const detail = await request.get(`/stock-in/${record.id}`);
        const order = detail.data?.data || detail.data;
        voiceService.speakStockIn(order?.items?.length || 0, parseFloat(order?.total_amount || record.total_amount || 0));
      } catch { voiceService.speakStockIn(0, parseFloat(record.total_amount || 0)); }
      load(pagination.current);
    }
    catch (e: any) { message.error(e.response?.data?.message || '确认失败'); }
  };

  const handleDelete = async (id: number) => {
    try { await request.delete(`/stock-in/${id}`); message.success('已删除'); load(pagination.current); }
    catch (e: any) { message.error(e.response?.data?.message || '删除失败'); }
  };

  const viewDetail = async (id: number) => {
    try { const res = await request.get(`/stock-in/${id}`); setCurrent(res.data?.data || res.data || {}); setDetailOpen(true); }
    catch (e) { message.error('获取详情失败'); }
  };

  const addItem = () => setItems([...items, { productId: null, quantity: 1, unit_cost: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const n = [...items]; n[i] = { ...n[i], [field]: value };
    if (field === 'productId' && value) {
      const p = products.find((x: any) => x.id === value);
      if (p?.cost_price) n[i].unit_cost = p.cost_price;
    }
    setItems(n);
  };

  const columns = [
    { title: '入库单号', dataIndex: 'order_no', width: 160 },
    { title: '类型', dataIndex: 'in_type', width: 100, render: (v: string) => inTypeOptions.find(o => o.value === v)?.label || v },
    { title: '仓库', dataIndex: 'warehouse_name', width: 100 },
    { title: '供应商', dataIndex: 'supplier_name', render: (v: string) => v || '-' },
    { title: '金额', dataIndex: 'total_amount', width: 100, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag> },
    { title: '日期', dataIndex: 'created_at', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '操作', width: 200, render: (_: any, r: any) => (
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r.id)}>详情</Button>
        {r.status === 'draft' && <>
          <Popconfirm title="确认入库？库存将增加" onConfirm={() => handleConfirm(r)}>
            <Button type="link" size="small" icon={<CheckOutlined />}>确认入库</Button>
          </Popconfirm>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </>}
      </Space>
    )}
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>入库管理</Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="入库类型" allowClear style={{ width: 120 }} options={inTypeOptions} onChange={v => setFilters(f => ({ ...f, in_type: v }))} />
          <Select placeholder="状态" allowClear style={{ width: 100 }}
            options={[{ value: 'draft', label: '草稿' }, { value: 'confirmed', label: '已入库' }]}
            onChange={v => setFilters(f => ({ ...f, status: v }))} />
          <Button type="primary" onClick={() => load(1)}>查询</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setItems([{ productId: null, quantity: 1, unit_cost: 0 }]); setModalOpen(true); }}>新建入库单</Button>
        </Space>
      </Card>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
        pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条`, onChange: p => load(p) }} />

      <Modal title="新建入库单" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={720} okText="提交" style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}><Form.Item name="warehouse_id" label="入库仓库" rules={[{ required: true, message: '请选择仓库' }]}>
              <Select placeholder="选择仓库" options={warehouses.map((w: any) => ({ label: w.name, value: w.id }))} />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="in_type" label="入库类型" initialValue="purchase">
              <Select options={inTypeOptions} />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="supplier_id" label="供应商">
              <Select allowClear showSearch optionFilterProp="label" placeholder="选择供应商" options={suppliers.map((s: any) => ({ label: s.name, value: s.id }))} />
            </Form.Item></Col>
          </Row>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细</div>
            {items.map((item, idx) => (
              <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 6 }}>
                <Row gutter={[8, 8]} align="middle">
                  <Col xs={24} md={10}><Select style={{ width: '100%' }} placeholder="选择商品" showSearch optionFilterProp="label" value={item.productId}
                    onChange={v => updateItem(idx, 'productId', v)}
                    options={products.map((p: any) => ({ label: `${p.name} (成本¥${p.cost_price})`, value: p.id }))} /></Col>
                  <Col xs={12} md={5}><InputNumber style={{ width: '100%' }} min={0.01} placeholder="数量" value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} /></Col>
                  <Col xs={12} md={6}><InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="单位成本" prefix="¥" value={item.unit_cost} onChange={v => updateItem(idx, 'unit_cost', v)} /></Col>
                  <Col xs={24} md={3} style={{ textAlign: 'center' }}>{items.length > 1 && <Button danger size="small" onClick={() => removeItem(idx)}>删除</Button>}</Col>
                </Row>
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={addItem}>添加商品</Button>
            <div style={{ textAlign: 'right', marginTop: 8, fontWeight: 600 }}>
              合计：¥{items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0).toFixed(2)}
            </div>
          </div>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`入库单详情 - ${current?.order_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={650}>
        {current && <>
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="入库单号">{current.order_no}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusMap[current.status]?.color}>{statusMap[current.status]?.text}</Tag></Descriptions.Item>
            <Descriptions.Item label="入库类型">{inTypeOptions.find(o => o.value === current.in_type)?.label}</Descriptions.Item>
            <Descriptions.Item label="仓库">{current.warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="供应商">{current.supplier_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="总金额">¥{Number(current.total_amount || 0).toFixed(2)}</Descriptions.Item>
          </Descriptions>
          <Table size="small" dataSource={current.items || []} rowKey="id" pagination={false}
            columns={[
              { title: '商品', dataIndex: 'product_name' }, { title: '数量', dataIndex: 'quantity', width: 80 },
              { title: '单位成本', dataIndex: 'unit_cost', width: 100, render: (v: number) => `¥${Number(v).toFixed(2)}` },
              { title: '小计', dataIndex: 'subtotal', width: 100, render: (v: number) => `¥${Number(v).toFixed(2)}` }
            ]} />
        </>}
      </Modal>
    </div>
  );
};

export default StockIn;
