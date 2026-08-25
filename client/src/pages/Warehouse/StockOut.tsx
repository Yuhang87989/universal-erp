import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Card, Row, Col, Popconfirm, Descriptions, Typography } from 'antd';
import { PlusOutlined, CheckOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';

const { Title } = Typography;

const outTypeOptions = [
  { value: 'sale', label: '销售出库' }, { value: 'return_out', label: '退货出库' },
  { value: 'production_out', label: '生产领料' }, { value: 'transfer_out', label: '调拨出库' },
  { value: 'adjust_out', label: '调整出库' }, { value: 'scrap', label: '报损出库' },
  { value: 'other', label: '其他出库' }
];
const statusMap: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' }, confirmed: { text: '已出库', color: 'green' }, cancelled: { text: '已取消', color: 'red' }
};

const StockOut: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState<any>(null);
  const [form] = Form.useForm();
  const [items, setItems] = useState([{ productId: null, quantity: 1 }]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<any>({ status: undefined, out_type: undefined });

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const res = await request.get('/stock-out', { params: { page, pageSize: 20, ...filters } });
      const d = res.data?.data || res.data || {}; setList(d.list || []);
      setPagination(p => ({ ...p, current: page, total: (res.data?.data || res.data || {}).total || 0 }));
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  const loadInventory = async (warehouseId: number) => {
    try {
      const res = await request.get('/inventory', { params: { pageSize: 1000, warehouse_id: warehouseId } });
      const map: Record<string, number> = {};
      (res.data?.list || res.data || []).forEach((i: any) => { map[i.product_id] = parseFloat(i.quantity); });
      setInventoryMap(map);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    load(1);
    request.get('/products', { params: { pageSize: 500 } }).then(r => setProducts((r.data?.data || r.data || {}).list || r.data?.data || r.data || []));
    request.get('/warehouses').then(r => setWarehouses((r.data?.data || r.data || {}).list || r.data?.data || r.data || []));
    request.get('/customers', { params: { pageSize: 200 } }).then(r => setCustomers((r.data?.data || r.data || {}).list || r.data?.data || r.data || []));
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const validItems = items.filter(i => i.productId && i.quantity > 0);
      if (!validItems.length) { message.warning('请添加至少一个商品'); return; }
      // 前端库存校验
      const whId = values.warehouse_id;
      for (const i of validItems) {
        const avail = inventoryMap[i.productId] || 0;
        if (avail < i.quantity) {
          const p = products.find((x: any) => x.id === i.productId);
          message.warning(`商品「${p?.name}」库存不足（可用${avail}）`); return;
        }
      }
      await request.post('/stock-out', {
        warehouse_id: whId, out_type: values.out_type, customer_id: values.customer_id,
        items: validItems.map(i => ({ product_id: i.productId, quantity: i.quantity })),
        remark: values.remark
      });
      message.success('出库单已创建');
      setModalOpen(false); form.resetFields(); setItems([{ productId: null, quantity: 1 }]); load(1);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '创建失败');
    }
  };

  const handleConfirm = async (record: any) => {
    try {
      await request.post(`/stock-out/${record.id}/confirm`);
      message.success('出库确认成功，库存已扣减');
      try {
        const detail = await request.get(`/stock-out/${record.id}`);
        const order = detail.data?.data || detail.data;
        voiceService.speakStockOut(order?.items?.length || 0);
      } catch { voiceService.speakStockOut(0); }
      load(pagination.current);
    }
    catch (e: any) { message.error(e.response?.data?.message || '确认失败'); }
  };

  const handleDelete = async (id: number) => {
    try { await request.delete(`/stock-out/${id}`); message.success('已删除'); load(pagination.current); }
    catch (e: any) { message.error(e.response?.data?.message || '删除失败'); }
  };

  const viewDetail = async (id: number) => {
    try { const res = await request.get(`/stock-out/${id}`); setCurrent(res.data?.data || res.data || {}); setDetailOpen(true); }
    catch (e) { message.error('获取详情失败'); }
  };

  const addItem = () => setItems([...items, { productId: null, quantity: 1 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => { const n = [...items]; n[i] = { ...n[i], [field]: value }; setItems(n); };

  const columns = [
    { title: '出库单号', dataIndex: 'order_no', width: 160 },
    { title: '类型', dataIndex: 'out_type', width: 100, render: (v: string) => outTypeOptions.find(o => o.value === v)?.label || v },
    { title: '仓库', dataIndex: 'warehouse_name', width: 100 },
    { title: '客户', dataIndex: 'customer_name', render: (v: string) => v || '-' },
    { title: '成本金额', dataIndex: 'total_amount', width: 100, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag> },
    { title: '日期', dataIndex: 'created_at', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '操作', width: 200, render: (_: any, r: any) => (
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r.id)}>详情</Button>
        {r.status === 'draft' && <>
          <Popconfirm title="确认出库？库存将扣减" onConfirm={() => handleConfirm(r)}>
            <Button type="link" size="small" icon={<CheckOutlined />}>确认出库</Button>
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
      <Title level={4} style={{ marginBottom: 16 }}>出库管理</Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="出库类型" allowClear style={{ width: 120 }} options={outTypeOptions} onChange={v => setFilters(f => ({ ...f, out_type: v }))} />
          <Select placeholder="状态" allowClear style={{ width: 100 }}
            options={[{ value: 'draft', label: '草稿' }, { value: 'confirmed', label: '已出库' }]}
            onChange={v => setFilters(f => ({ ...f, status: v }))} />
          <Button type="primary" onClick={() => load(1)}>查询</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setItems([{ productId: null, quantity: 1 }]); setInventoryMap({}); setModalOpen(true); }}>新建出库单</Button>
        </Space>
      </Card>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" scroll={{ x: 1000 }}
        pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条`, onChange: p => load(p) }} />

      <Modal title="新建出库单" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={720} okText="提交" style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}><Form.Item name="warehouse_id" label="出库仓库" rules={[{ required: true }]}>
              <Select placeholder="选择仓库" options={warehouses.map((w: any) => ({ label: w.name, value: w.id }))}
                onChange={(v) => loadInventory(v)} />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="out_type" label="出库类型" initialValue="other">
              <Select options={outTypeOptions} />
            </Form.Item></Col>
            <Col span={8}><Form.Item name="customer_id" label="客户">
              <Select allowClear showSearch optionFilterProp="label" placeholder="选择客户" options={customers.map((c: any) => ({ label: c.name, value: c.id }))} />
            </Form.Item></Col>
          </Row>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>商品明细（成本价自动带出）</div>
            {items.map((item, idx) => {
              const available = item.productId ? (inventoryMap[item.productId] ?? '—') : '—';
              return (
                <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 6 }}>
                  <Row gutter={[8, 8]} align="middle">
                    <Col xs={24} md={10}><Select style={{ width: '100%' }} placeholder="选择商品" showSearch optionFilterProp="label" value={item.productId}
                      onChange={v => updateItem(idx, 'productId', v)}
                      options={products.map((p: any) => ({ label: `${p.name} (库存${inventoryMap[p.id] ?? 0}${p.unit || ''})`, value: p.id }))} /></Col>
                    <Col xs={12} md={6}><InputNumber style={{ width: '100%' }} min={0.01} placeholder="出库数量" value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} /></Col>
                    <Col xs={12} md={5}><Tag color="blue">可用: {available}</Tag></Col>
                    <Col xs={24} md={3} style={{ textAlign: 'center' }}>{items.length > 1 && <Button danger size="small" onClick={() => removeItem(idx)}>删除</Button>}</Col>
                  </Row>
                </div>
              );
            })}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={addItem}>添加商品</Button>
          </div>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`出库单详情 - ${current?.order_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={650}>
        {current && <>
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="出库单号">{current.order_no}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusMap[current.status]?.color}>{statusMap[current.status]?.text}</Tag></Descriptions.Item>
            <Descriptions.Item label="出库类型">{outTypeOptions.find(o => o.value === current.out_type)?.label}</Descriptions.Item>
            <Descriptions.Item label="仓库">{current.warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="客户">{current.customer_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="成本金额">¥{Number(current.total_amount || 0).toFixed(2)}</Descriptions.Item>
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

export default StockOut;
