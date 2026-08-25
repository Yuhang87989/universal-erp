import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, Select, Tag, Space, message, Card, Row, Col, Popconfirm, Descriptions, Typography } from 'antd';
import { PlusOutlined, CheckOutlined, EyeOutlined, DeleteOutlined, SwapOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';

const { Title } = Typography;
const statusMap: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' }, in_transit: { text: '在途', color: 'blue' },
  completed: { text: '已完成', color: 'green' }, cancelled: { text: '已取消', color: 'red' }
};

const StockTransfer: React.FC = () => {
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
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const res = await request.get('/transfers', { params: { page, pageSize: 20 } });
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
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (values.from_warehouse_id === values.to_warehouse_id) { message.warning('调出和调入仓库不能相同'); return; }
      const validItems = items.filter(i => i.productId && i.quantity > 0);
      if (!validItems.length) { message.warning('请添加至少一个商品'); return; }
      await request.post('/transfers', {
        from_warehouse_id: values.from_warehouse_id,
        to_warehouse_id: values.to_warehouse_id,
        items: validItems.map(i => ({ product_id: i.productId, quantity: i.quantity })),
        remark: values.remark
      });
      message.success('调拨单已创建');
      setModalOpen(false); form.resetFields(); setItems([{ productId: null, quantity: 1 }]); load(1);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '创建失败');
    }
  };

  const handleConfirm = async (record: any) => {
    try {
      await request.post(`/transfers/${record.id}/confirm`);
      message.success('调拨完成，库存已同步');
      voiceService.speakTransfer(record.from_warehouse_name || '', record.to_warehouse_name || '');
      load(pagination.current);
    }
    catch (e: any) { message.error(e.response?.data?.message || '确认失败'); }
  };

  const handleDelete = async (id: number) => {
    try { await request.delete(`/transfers/${id}`); message.success('已删除'); load(pagination.current); }
    catch (e: any) { message.error(e.response?.data?.message || '删除失败'); }
  };

  const viewDetail = async (id: number) => {
    try { const res = await request.get(`/transfers/${id}`); setCurrent(res.data?.data || res.data || {}); setDetailOpen(true); }
    catch (e) { message.error('获取详情失败'); }
  };

  const addItem = () => setItems([...items, { productId: null, quantity: 1 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => { const n = [...items]; n[i] = { ...n[i], [field]: value }; setItems(n); };

  const columns = [
    { title: '调拨单号', dataIndex: 'transfer_no', width: 160 },
    { title: '调出仓库', dataIndex: 'from_warehouse_name', width: 110 },
    { title: '调入仓库', dataIndex: 'to_warehouse_name', width: 110, render: (v: string) => <span><SwapOutlined style={{ color: '#1677ff', marginRight: 4 }} />{v}</span> },
    { title: '商品数', dataIndex: 'item_count', width: 70, align: 'center' as const, render: (v: number) => `${v}种` },
    { title: '总金额', dataIndex: 'total_amount', width: 100, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text || v}</Tag> },
    { title: '日期', dataIndex: 'created_at', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '操作', width: 180, render: (_: any, r: any) => (
      <Space>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r.id)}>详情</Button>
        {r.status === 'draft' && <>
          <Popconfirm title="确认调拨？调出仓扣减，调入仓增加" onConfirm={() => handleConfirm(r)}>
            <Button type="link" size="small" icon={<CheckOutlined />}>确认调拨</Button>
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
      <Title level={4} style={{ marginBottom: 16 }}>库存调拨</Title>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setItems([{ productId: null, quantity: 1 }]); setInventoryMap({}); setModalOpen(true); }}>新建调拨单</Button>
      </Card>
      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" scroll={{ x: 900 }}
        pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条`, onChange: p => load(p) }} />

      <Modal title="新建调拨单" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)} width={680} okText="提交" style={{ top: 20 }}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}><Form.Item name="from_warehouse_id" label="调出仓库" rules={[{ required: true }]}>
              <Select placeholder="选择调出仓库" options={warehouses.map((w: any) => ({ label: w.name, value: w.id }))}
                onChange={(v) => loadInventory(v)} />
            </Form.Item></Col>
            <Col span={12}><Form.Item name="to_warehouse_id" label="调入仓库" rules={[{ required: true }]}>
              <Select placeholder="选择调入仓库" options={warehouses.map((w: any) => ({ label: w.name, value: w.id }))} />
            </Form.Item></Col>
          </Row>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>调拨商品（从调出仓扣减）</div>
            {items.map((item, idx) => (
              <div key={idx} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 6 }}>
                <Row gutter={[8, 8]} align="middle">
                  <Col xs={24} md={12}><Select style={{ width: '100%' }} placeholder="选择商品" showSearch optionFilterProp="label" value={item.productId}
                    onChange={v => updateItem(idx, 'productId', v)}
                    options={products.map((p: any) => ({ label: `${p.name} (调出仓库存${inventoryMap[p.id] ?? 0}${p.unit || ''})`, value: p.id }))} /></Col>
                  <Col xs={12} md={8}><InputNumber style={{ width: '100%' }} min={0.01} placeholder="调拨数量" value={item.quantity} onChange={v => updateItem(idx, 'quantity', v)} /></Col>
                  <Col xs={24} md={4} style={{ textAlign: 'center' }}>{items.length > 1 && <Button danger size="small" onClick={() => removeItem(idx)}>删除</Button>}</Col>
                </Row>
              </div>
            ))}
            <Button type="dashed" block icon={<PlusOutlined />} onClick={addItem}>添加商品</Button>
          </div>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`调拨单详情 - ${current?.transfer_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={600}>
        {current && <>
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="调拨单号">{current.transfer_no}</Descriptions.Item>
            <Descriptions.Item label="状态"><Tag color={statusMap[current.status]?.color}>{statusMap[current.status]?.text}</Tag></Descriptions.Item>
            <Descriptions.Item label="调出仓库">{current.from_warehouse_name}</Descriptions.Item>
            <Descriptions.Item label="调入仓库">{current.to_warehouse_name}</Descriptions.Item>
          </Descriptions>
          <Table size="small" dataSource={current.items || []} rowKey="id" pagination={false}
            columns={[
              { title: '商品', dataIndex: 'product_name' }, { title: '数量', dataIndex: 'quantity', width: 100 },
              { title: '单位成本', dataIndex: 'unit_cost', width: 100, render: (v: number) => `¥${Number(v).toFixed(2)}` },
              { title: '小计', dataIndex: 'subtotal', width: 100, render: (v: number) => `¥${Number(v).toFixed(2)}` }
            ]} />
        </>}
      </Modal>
    </div>
  );
};

export default StockTransfer;
