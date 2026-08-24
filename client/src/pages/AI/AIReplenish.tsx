import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Typography, Row, Col, Statistic, Space, InputNumber, message, Popconfirm } from 'antd';
import { ShoppingCartOutlined, WarningOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text } = Typography;

const AIReplenish: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await request.get('/ai/replenish');
      setList(res.data || []);
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const createPurchaseOrder = async (record: any) => {
    // 跳转到采购单创建（简化：提示）
    message.info(`已为「${record.product_name}」生成采购建议，请到采购管理创建采购单`);
  };

  const urgencyMap: Record<string, { label: string; color: string }> = {
    critical: { label: '紧急', color: 'red' },
    warning: { label: '需关注', color: 'orange' },
    normal: { label: '正常', color: 'blue' }
  };

  const totalCost = list.reduce((s, i) => s + (i.estimated_cost || 0), 0);
  const criticalCount = list.filter(i => i.urgency === 'critical').length;

  const columns = [
    { title: '商品名称', dataIndex: 'product_name' },
    { title: '当前库存', dataIndex: 'current_stock', width: 100, align: 'right' as const, render: (v: number, r: any) => <Text type={v <= r.min_stock ? 'danger' : undefined} strong>{v} {r.unit}</Text> },
    { title: '预警值', dataIndex: 'min_stock', width: 80, align: 'right' as const },
    { title: '7日销量', dataIndex: 'sold_7d', width: 90, align: 'right' as const, render: (v: number) => <Text type="success">{v}</Text> },
    { title: '30日销量', dataIndex: 'sold_30d', width: 90, align: 'right' as const },
    { title: '日均销量', dataIndex: 'daily_rate', width: 90, align: 'right' as const, render: (v: number) => v.toFixed(1) },
    { title: '可售天数', dataIndex: 'stock_days', width: 90, align: 'center' as const,
      render: (v: number | null) => v === null ? <Tag>滞销</Tag> : <Tag color={v <= 3 ? 'red' : v <= 7 ? 'orange' : 'green'}>{v}天</Tag> },
    { title: '建议补货', dataIndex: 'suggest_qty', width: 100, align: 'right' as const,
      render: (v: number, r: any) => <Text strong style={{ color: '#1677ff' }}>{v} {r.unit}</Text> },
    { title: '预计成本', dataIndex: 'estimated_cost', width: 100, align: 'right' as const,
      render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '紧急度', dataIndex: 'urgency', width: 80,
      render: (v: string) => <Tag color={urgencyMap[v]?.color}>{urgencyMap[v]?.label || v}</Tag> },
    { title: '操作', width: 100, render: (_: any, r: any) => (
      <Button type="link" size="small" icon={<ShoppingCartOutlined />} onClick={() => createPurchaseOrder(r)}>去采购</Button>
    )}
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <RiseOutlined style={{ color: '#1677ff' }} /> AI智能补货建议
      </Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card size="small"><Statistic title="需补货商品" value={list.length} suffix="种" valueStyle={{ fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="紧急补货" value={criticalCount} suffix="种" prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f', fontSize: 20 }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Statistic title="预计采购总额" value={totalCost} precision={2} prefix="¥" valueStyle={{ fontSize: 20, color: '#faad14' }} /></Card></Col>
        <Col xs={12} md={6}><Card size="small"><Button type="primary" block onClick={load} style={{ marginTop: 8 }}>刷新建议</Button></Card></Col>
      </Row>

      <Card size="small" title="📦 补货清单（基于近30天销售速度，建议备14天库存）">
        <Table columns={columns} dataSource={list} rowKey="product_id" loading={loading} size="small" scroll={{ x: 1100 }} pagination={{ pageSize: 20, showTotal: t => `共 ${t} 种商品` }} />
      </Card>
    </div>
  );
};

export default AIReplenish;
