import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Input, Space, Tag, Typography, Modal, InputNumber, message, Select } from 'antd';
import { SearchOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Inventory: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [adjustVisible, setAdjustVisible] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any>(null);
  const [newQuantity, setNewQuantity] = useState<number>(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  useEffect(() => { loadInventory(); }, [pagination.current, pagination.pageSize, lowStockOnly, warehouseId]);

  useEffect(() => {
    request.get('/warehouses').then(r => setWarehouses(r.data?.data || r.data || [])).catch(() => {});
  }, []);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await request.get('/inventory', {
        params: { page: pagination.current, pageSize: pagination.pageSize, keyword, lowStock: lowStockOnly, warehouse_id: warehouseId }
      });
      setItems(res.data.list);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjust = (record: any) => {
    setAdjustProduct(record);
    setNewQuantity(record.quantity);
    setAdjustVisible(true);
  };

  const confirmAdjust = async () => {
    try {
      await request.post('/inventory/adjust', {
        productId: adjustProduct.product_id,
        newQuantity,
        remark: '手动盘点调整'
      });
      message.success('库存已调整');
      setAdjustVisible(false);
      loadInventory();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const columns = [
    { title: '商品名称', dataIndex: 'product_name', width: 160 },
    { title: '分类', dataIndex: 'category_name', width: 80 },
    { title: '条码', dataIndex: 'barcode', width: 120 },
    { title: '单位', dataIndex: 'unit', width: 60 },
    { title: '当前库存', dataIndex: 'quantity', width: 100, render: (v: number, r: any) => (
      <Tag color={v <= r.min_stock && r.min_stock > 0 ? 'red' : 'green'}>{v}</Tag>
    )},
    { title: '预警值', dataIndex: 'min_stock', width: 80 },
    { title: '成本价', dataIndex: 'cost_price', width: 80, render: (v: number) => `¥${v?.toFixed(2)}` },
    { title: '库存价值', width: 100, render: (_: any, r: any) => `¥${(r.quantity * r.cost_price).toFixed(2)}` },
    { title: '操作', width: 80, render: (_: any, record: any) => (
      <Button type="link" icon={<EditOutlined />} onClick={() => handleAdjust(record)}>调整</Button>
    )}
  ];

  return (
    <div>
      <Title level={4}>库存管理</Title>
      <Card>
        <Space wrap style={{ marginBottom: 16, width: '100%' }}>
          <Select
            placeholder="全部仓库"
            allowClear
            style={{ minWidth: 140 }}
            value={warehouseId}
            onChange={(v) => { setWarehouseId(v); setPagination(p => ({ ...p, current: 1 })); }}
            options={warehouses.map((w: any) => ({ label: w.name, value: w.id }))}
          />
          <Input
            placeholder="搜索商品名/条码"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={loadInventory}
            style={{ width: '100%', maxWidth: 280 }}
            allowClear
          />
          <Button type={lowStockOnly ? 'primary' : 'default'} icon={<WarningOutlined />}
            onClick={() => { setLowStockOnly(!lowStockOnly); setPagination({ ...pagination, current: 1 }); }}>
            库存预警
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: 800 }}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showTotal: t => `共 ${t} 条` }}
          onChange={p => setPagination({ current: p.current || 1, pageSize: p.pageSize || 20 })}
          size="small"
        />
      </Card>

      <Modal
        title={`调整库存 - ${adjustProduct?.product_name}`}
        open={adjustVisible}
        onOk={confirmAdjust}
        onCancel={() => setAdjustVisible(false)}
      >
        <div style={{ margin: '16px 0' }}>
          <p>当前库存：<strong>{adjustProduct?.quantity} {adjustProduct?.unit}</strong></p>
          <p>预警值：<strong>{adjustProduct?.min_stock} {adjustProduct?.unit}</strong></p>
        </div>
        <Space>
          <span>调整后数量：</span>
          <InputNumber min={0} value={newQuantity} onChange={v => setNewQuantity(v || 0)} />
          <span>{adjustProduct?.unit}</span>
        </Space>
      </Modal>
    </div>
  );
};

export default Inventory;
