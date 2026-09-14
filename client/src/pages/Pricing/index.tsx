import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Select, Input, InputNumber, Button, Space, message, Alert, Typography, Tag, Tooltip } from 'antd';
import { SaveOutlined, PercentageOutlined, PartitionOutlined, ReloadOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Text } = Typography;

interface Store {
  tenant_id: number;
  tenant_name: string;
  is_group_root: number;
}

interface Prod {
  id: number;
  tenant_id: number;
  name: string;
  barcode: string;
  unit: string;
  cost_price: number;
  sell_price: number;
  stock: number;
  avg_cost: number;
}

const GroupPricing: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Prod[]>([]);
  const [rootProducts, setRootProducts] = useState<Prod[]>([]);
  const [rootTenantId, setRootTenantId] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<number | ''>('');
  const [drafts, setDrafts] = useState<Record<number, string>>({}); // product_id -> new price (string)
  const [selectedRows, setSelectedRows] = useState<React.Key[]>([]);
  const [rate, setRate] = useState<number | null>(null);

  const loadPricing = async () => {
    setLoading(true);
    try {
      const res = await request.get('/pricing');
      const data = res.data || {};
      setStores(data.stores || []);
      setProducts(data.products || []);
      setRootProducts(data.rootProducts || []);
      setRootTenantId(data.rootTenantId || 0);
      // 默认选中总店（集团参考价所在店）或第一个店
      if (!selectedTenant) {
        const root = (data.stores || []).find((s: Store) => s.is_group_root === 1);
        setSelectedTenant(root ? root.tenant_id : ((data.stores || [])[0]?.tenant_id ?? ''));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPricing(); }, []);

  const currentStore = useMemo(() => stores.find((s) => s.tenant_id === selectedTenant), [stores, selectedTenant]);
  const storeProducts = useMemo(
    () => (selectedTenant ? products.filter((p) => p.tenant_id === selectedTenant) : []),
    [products, selectedTenant]
  );

  const handlePriceChange = (pid: number, val: number | null) => {
    setDrafts((d) => ({ ...d, [pid]: val === null ? '' : String(val) }));
  };

  // 按进价×倍率批量应用到选中行（每店独立倍率）
  const applyRate = () => {
    if (!rate || rate <= 0) { message.warning('请输入有效的倍率（如 1.5 表示进价×1.5）'); return; }
    const picked = storeProducts.filter((p) => selectedRows.includes(p.id));
    if (!picked.length) { message.warning('请先勾选要调价的商品'); return; }
    const next: Record<number, string> = { ...drafts };
    const changes: Record<number, number> = {};
    picked.forEach((p) => {
      const base = parseFloat(String(p.cost_price || 0));
      if (!base) { changes[p.id] = p.sell_price; return; } // 无进价则不动
      const np = base * rate;
      next[p.id] = String(Math.round(np * 100) / 100);
      changes[p.id] = np;
    });
    setDrafts(next);
    message.success(`已按进价×${rate} 预填 ${picked.length} 个商品的售价`);
  };

  // 参照总店定价：把选中行按总店同商品名售价填充
  const applyRootPrice = () => {
    const picked = storeProducts.filter((p) => selectedRows.includes(p.id));
    if (!picked.length) { message.warning('请先勾选要参照总店的商品'); return; }
    const rootMap: Record<string, number> = {};
    rootProducts.forEach((rp) => { rootMap[rp.name] = rp.sell_price; });
    const next: Record<number, string> = { ...drafts };
    picked.forEach((p) => {
      const rp = rootMap[p.name];
      if (rp !== undefined) next[p.id] = String(rp);
      else if (!(p.id in next)) message.warning(`总店无同名商品「${p.name}」，跳过`);
    });
    setDrafts(next);
  };

  const clearPrice = (pid: number) => {
    setDrafts((d) => { const n = { ...d }; delete n[pid]; return n; });
  };

  const save = async () => {
    const items = Object.entries(drafts)
      .filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))
      .map(([pid, v]) => ({ product_id: Number(pid), sell_price: parseFloat(v) }));
    if (!items.length || !selectedTenant) { message.warning('没有待保存的价格变更'); return; }
    // 数值合法性
    if (items.some((it) => it.sell_price < 0)) { message.error('售价不能为负数'); return; }
    setSaving(true);
    try {
      const res = await request.put(`/pricing/${selectedTenant}/batch`, { items });
      message.success(`已保存 ${res?.data?.updated || items.length} 个商品售价`);
      setDrafts({});
      setSelectedRows([]);
      loadPricing();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: any[] = [
    {
      title: '商品名称', dataIndex: 'name', key: 'name', width: 200,
      render: (t: string, r: Prod) => <span>{t}{r.unit ? <Text type="secondary" style={{ fontSize: 12 }}> /{r.unit}</Text> : null}</span>
    },
    { title: '条码', dataIndex: 'barcode', key: 'barcode', width: 150, render: (t: string) => t || '-' },
    {
      title: '当前售价', dataIndex: 'sell_price', key: 'sell_price', width: 110,
      render: (v: number, r: Prod) => (
        <span>
          {r.id in drafts && drafts[r.id] !== '' ? <Tag color="orange">{drafts[r.id]}</Tag> : <span>{v}</span>}
        </span>
      )
    },
    {
      title: '新售价', key: 'edit', width: 140,
      render: (_: any, r: Prod) => {
        const val = r.id in drafts ? drafts[r.id] : String(r.sell_price);
        return (
          <Input
            type="number" size="small" style={{ width: 90 }}
            value={val}
            onChange={(e) => handlePriceChange(r.id, e.target.value === '' ? null : Number(e.target.value))}
          />
        );
      }
    },
    { title: '进价', dataIndex: 'cost_price', key: 'cost_price', width: 90, render: (v: number) => v ?? '-' },
    { title: '成本(加权)', dataIndex: 'avg_cost', key: 'avg_cost', width: 100, render: (v: number) => (v && v > 0 ? v.toFixed(2) : '-') },
    { title: '库存量', dataIndex: 'stock', key: 'stock', width: 80, render: (v: number) => (v ?? '-') },
    { title: '毛利空间', key: 'margin', width: 90, render: (_: any, r: Prod) => {
        const cost = r.avg_cost && r.avg_cost > 0 ? r.avg_cost : (r.cost_price || 0);
        const sp = r.id in drafts && drafts[r.id] !== '' ? parseFloat(drafts[r.id]) : r.sell_price;
        return <span>{cost > 0 ? (sp - cost).toFixed(2) : '-'}</span>;
      } },
    {
      title: '操作', key: 'op', width: 70,
      render: (_: any, r: Prod) => (r.id in drafts ? <Button size="small" type="link" onClick={() => clearPrice(r.id)}>撤销</Button> : null)
    }
  ];

  const changedCount = Object.keys(drafts).filter((k) => drafts[Number(k)] !== '').length;

  return (
    <Card
      title={<Space><PartitionOutlined />集团商品定价（总店统一维护各分店售价）</Space>}
      style={{ margin: 12 }}
    >
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="每个账套独立定价，互不影响；总店售价作为各分店调价参考。成本列为集团管理员可见。"
      />
      <Space wrap style={{ marginBottom: 12 }} align="center">
        <Text type="secondary">选择账套：</Text>
        <Select
          style={{ width: 220 }}
          value={selectedTenant || undefined}
          onChange={(v) => { setSelectedTenant(v); setDrafts({}); setSelectedRows([]); }}
          options={stores.map((s) => ({ value: s.tenant_id, label: `${s.tenant_name}${s.is_group_root === 1 ? '（总店·参考价）' : ''}` }))}
          placeholder="选择账套"
        />
        {currentStore?.is_group_root === 1 && <Tag color="gold">总店·参考定价</Tag>}

        <InputNumber
          placeholder="倍率，如1.5" min={0} precision={2} style={{ width: 120 }}
          value={rate} onChange={(v) => setRate(v)}
        />
        <Button icon={<PercentageOutlined />} onClick={applyRate}>按进价×倍率预填选中行</Button>
        <Button onClick={applyRootPrice}>参照总店定价填充选中行</Button>
        <Button icon={<ReloadOutlined />} onClick={loadPricing}>刷新</Button>
      </Space>

      <Space style={{ marginBottom: 12 }}>
        <Text type="secondary">已勾选 {selectedRows.length} 行，待变更 {changedCount} 项</Text>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save} disabled={changedCount === 0}>
          保存售价
        </Button>
      </Space>

      <Table
        rowKey="id" size="small" loading={loading}
        columns={columns} dataSource={storeProducts}
        rowSelection={{ selectedRowKeys: selectedRows, onChange: setSelectedRows }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 个商品` }}
      />
    </Card>
  );
};

export default GroupPricing;