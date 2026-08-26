import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Input, Space, Tag, Typography, Modal, InputNumber, message, Select, Row, Col } from 'antd';
import { SearchOutlined, EditOutlined, WarningOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Inventory: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // 筛选条件
  const [keyword, setKeyword] = useState('');
  const [warehouseId, setWarehouseId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [stockStatus, setStockStatus] = useState<string | undefined>(undefined);
  const [minQty, setMinQty] = useState<number | null>(null);
  const [maxQty, setMaxQty] = useState<number | null>(null);

  // 已提交的查询参数（点查询后才生效）
  const [query, setQuery] = useState<any>({});

  const [adjustVisible, setAdjustVisible] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<any>(null);
  const [newQuantity, setNewQuantity] = useState<number>(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    request.get('/warehouses').then(r => setWarehouses(r.data?.data || r.data || [])).catch(() => {});
    request.get('/categories').then(r => setCategories(r.data?.data || r.data || [])).catch(() => {});
  }, []);

  useEffect(() => { loadInventory(); }, [pagination.current, pagination.pageSize, query]);

  const buildParams = (forExport = false) => {
    const params: any = {};
    if (query.keyword) params.keyword = query.keyword;
    if (query.warehouse_id) params.warehouse_id = query.warehouse_id;
    if (query.category_id) params.category_id = query.category_id;
    if (query.stockStatus) params.stockStatus = query.stockStatus;
    if (query.minQty != null) params.minQty = query.minQty;
    if (query.maxQty != null) params.maxQty = query.maxQty;
    if (!forExport) {
      params.page = pagination.current;
      params.pageSize = pagination.pageSize;
    } else {
      params.page = 1;
      params.pageSize = 10000;
    }
    return params;
  };

  const loadInventory = async () => {
    setLoading(true);
    try {
      const res = await request.get('/inventory', { params: buildParams() });
      const payload = res.data?.data || res.data || {};
      setItems(payload.list || []);
      setTotal(payload.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setPagination(p => ({ ...p, current: 1 }));
    setQuery({
      keyword: keyword.trim() || undefined,
      warehouse_id: warehouseId,
      category_id: categoryId,
      stockStatus,
      minQty, maxQty,
    });
  };

  const handleReset = () => {
    setKeyword('');
    setWarehouseId(undefined);
    setCategoryId(undefined);
    setStockStatus(undefined);
    setMinQty(null);
    setMaxQty(null);
    setPagination(p => ({ ...p, current: 1 }));
    setQuery({});
  };

  // 导出CSV（拉取全部符合条件数据）
  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await request.get('/inventory', { params: buildParams(true) });
      const list = res.data?.data?.list || res.data?.list || [];
      if (!list.length) { message.warning('没有可导出的数据'); return; }
      const header = ['商品名称', '分类', 'SKU', '条码', '单位', '当前库存', '预警值', '成本价', '库存价值', '仓库', '状态'];
      const rows = list.map((r: any) => {
        const qty = Number(r.quantity || 0);
        const cost = Number(r.cost_price || 0);
        const min = Number(r.min_stock || 0);
        let status = '正常';
        if (qty <= 0) status = '缺货';
        else if (min > 0 && qty <= min) status = '预警';
        return [
          r.product_name, r.category_name || '', r.sku || '', r.barcode || '', r.unit || '',
          qty, min, cost.toFixed(2), (qty * cost).toFixed(2), r.warehouse_name || '', status
        ];
      });
      const csv = [header, ...rows].map(row =>
        row.map(cell => {
          const s = String(cell ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      ).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `库存查询_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`已导出 ${list.length} 条记录`);
    } catch (e: any) {
      message.error('导出失败：' + (e.message || ''));
    } finally {
      setExportLoading(false);
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

  const stockStatusTag = (r: any) => {
    const qty = Number(r.quantity || 0);
    const min = Number(r.min_stock || 0);
    if (qty <= 0) return <Tag color="red">缺货</Tag>;
    if (min > 0 && qty <= min) return <Tag color="orange">预警</Tag>;
    return <Tag color="green">正常</Tag>;
  };

  const columns = [
    { title: '商品名称', dataIndex: 'product_name', width: 160, fixed: 'left' as const },
    { title: '分类', dataIndex: 'category_name', width: 90 },
    { title: 'SKU', dataIndex: 'sku', width: 110, ellipsis: true },
    { title: '条码', dataIndex: 'barcode', width: 120, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 60 },
    { title: '当前库存', dataIndex: 'quantity', width: 90, sorter: (a: any, b: any) => Number(a.quantity) - Number(b.quantity), render: (v: number) => <strong>{v}</strong> },
    { title: '状态', width: 80, render: (_: any, r: any) => stockStatusTag(r) },
    { title: '预警值', dataIndex: 'min_stock', width: 80 },
    { title: '售价', dataIndex: 'sell_price', width: 90, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '成本价', dataIndex: 'cost_price', width: 90, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '库存价值', width: 110, sorter: (a: any, b: any) => (Number(a.quantity) * Number(a.cost_price)) - (Number(b.quantity) * Number(b.cost_price)), render: (_: any, r: any) => `¥${(Number(r.quantity) * Number(r.cost_price)).toFixed(2)}` },
    { title: '操作', width: 80, fixed: 'right' as const, render: (_: any, record: any) => (
      <Button type="link" icon={<EditOutlined />} onClick={() => handleAdjust(record)}>调整</Button>
    )}
  ];

  return (
    <div>
      <Title level={4}>库存查询</Title>
      <Card>
        {/* 筛选区 */}
        <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="搜索商品名/条码/SKU"
              prefix={<SearchOutlined />}
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={handleSearch}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="全部仓库"
              allowClear
              style={{ width: '100%' }}
              value={warehouseId}
              onChange={setWarehouseId}
              options={warehouses.map((w: any) => ({ label: w.name, value: w.id }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="全部分类"
              allowClear
              style={{ width: '100%' }}
              value={categoryId}
              onChange={setCategoryId}
              options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="库存状态"
              allowClear
              style={{ width: '100%' }}
              value={stockStatus}
              onChange={setStockStatus}
              options={[
                { label: '缺货（库存为0）', value: 'out' },
                { label: '库存预警', value: 'low' },
                { label: '库存正常', value: 'normal' },
              ]}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <InputNumber
              placeholder="最小库存"
              min={0}
              style={{ width: '100%' }}
              value={minQty}
              onChange={setMinQty}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <InputNumber
              placeholder="最大库存"
              min={0}
              style={{ width: '100%' }}
              value={maxQty}
              onChange={setMaxQty}
            />
          </Col>
        </Row>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
          <Button icon={<WarningOutlined />} onClick={() => { setStockStatus('low'); setCategoryId(undefined); setWarehouseId(undefined); setKeyword(''); setMinQty(null); setMaxQty(null); setPagination(p => ({ ...p, current: 1 })); setQuery({ stockStatus: 'low' }); }}>
            一键查看预警
          </Button>
          <Button type="primary" ghost icon={<ExportOutlined />} loading={exportLoading} onClick={handleExport}>导出CSV</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{ current: pagination.current, pageSize: pagination.pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条` }}
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
