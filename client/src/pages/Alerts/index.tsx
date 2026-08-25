import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, Space, message, Card, Row, Col, Statistic, Typography, Popconfirm, Select, Input, Badge } from 'antd';
import { WarningOutlined, ReloadOutlined, CheckCircleOutlined, BellOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';

const { Title, Text } = Typography;

const alertTypeMap: Record<string, { label: string; color: string; icon: string }> = {
  low_stock: { label: '库存不足', color: 'red', icon: '⚠️' },
  over_stock: { label: '库存积压', color: 'orange', icon: '📦' },
  zero_stock: { label: '零库存', color: 'default', icon: '🚫' },
  negative: { label: '负库存异常', color: 'red', icon: '❗' },
  expiry: { label: '临期预警', color: 'orange', icon: '⏰' }
};
const levelMap: Record<string, { label: string; color: string }> = {
  info: { label: '提示', color: 'blue' }, warning: { label: '警告', color: 'orange' }, critical: { label: '严重', color: 'red' }
};

const Alerts: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [stats, setStats] = useState<any>({ total: 0, breakdown: [] });
  const [filters, setFilters] = useState<any>({ status: 'active', alert_type: undefined, alert_level: undefined });

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        request.get('/alerts', { params: { page, pageSize: 20, ...filters } }),
        request.get('/alerts/stats')
      ]);
      const listData = listRes.data?.data || listRes.data || {};
      setList(listData.list || []);
      setPagination(p => ({ ...p, current: page, total: listData.total || 0 }));
      setStats(statsRes.data?.data || statsRes.data || { total: 0, breakdown: [] });
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(1); }, [filters.status, filters.alert_type, filters.alert_level]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await request.post('/alerts/scan');
      message.success(res.message || '扫描完成');
      load(1);
      // 语音播报
      const critical = ((res.data?.data || res.data || {}).active_alerts || 0);
      if (critical > 0) voiceService.speak(`库存预警扫描完成，当前有${critical}条预警需要处理`, { rate: 0.9 });
    } catch (e: any) { message.error(e.response?.data?.message || '扫描失败'); }
    setScanning(false);
  };

  const handleResolve = async (id: number) => {
    try { await request.put(`/alerts/${id}`, { status: 'resolved' }); message.success('预警已处理'); load(pagination.current); }
    catch (e) { message.error('操作失败'); }
  };

  const handleIgnore = async (id: number) => {
    try { await request.put(`/alerts/${id}`, { status: 'ignored' }); message.success('已忽略'); load(pagination.current); }
    catch (e) { message.error('操作失败'); }
  };

  const criticalCount = stats.breakdown?.filter((b: any) => b.alert_level === 'critical').reduce((s: number, b: any) => s + b.cnt, 0) || 0;
  const warningCount = stats.breakdown?.filter((b: any) => b.alert_level === 'warning').reduce((s: number, b: any) => s + b.cnt, 0) || 0;

  const columns = [
    { title: '级别', dataIndex: 'alert_level', width: 80, render: (v: string) => <Tag color={levelMap[v]?.color}>{levelMap[v]?.label || v}</Tag> },
    { title: '类型', dataIndex: 'alert_type', width: 100, render: (v: string) => <span>{alertTypeMap[v]?.icon} {alertTypeMap[v]?.label || v}</span> },
    { title: '商品', dataIndex: 'product_name' },
    { title: '仓库', dataIndex: 'warehouse_name', width: 100 },
    { title: '当前库存', dataIndex: 'current_value', width: 100, align: 'right' as const, render: (v: number, r: any) => <Text type={r.alert_level === 'critical' ? 'danger' : 'warning'} strong>{v} {r.unit}</Text> },
    { title: '阈值', dataIndex: 'threshold_value', width: 80, align: 'right' as const, render: (v: number) => v || '-' },
    { title: '预警信息', dataIndex: 'message', ellipsis: true },
    { title: '时间', dataIndex: 'created_at', width: 110, render: (v: string) => v?.slice(0, 16).replace('T', ' ') },
    {
      title: '操作', width: 140, render: (_: any, r: any) => r.status === 'active' ? (
        <Space>
          <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleResolve(r.id)}>解决</Button>
          <Button type="link" size="small" onClick={() => handleIgnore(r.id)}>忽略</Button>
        </Space>
      ) : <Tag>{r.status === 'resolved' ? '已解决' : '已忽略'}</Tag>
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>预警中心</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="活跃预警" value={stats.total} prefix={<BellOutlined />} valueStyle={{ color: stats.total > 0 ? '#ff4d4f' : '#52c41a' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="严重预警" value={criticalCount} prefix={<WarningOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small"><Statistic title="警告" value={warningCount} valueStyle={{ color: '#faad14' }} /></Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Button type="primary" icon={<ReloadOutlined />} loading={scanning} onClick={handleScan} style={{ marginTop: 8 }}>
              扫描库存预警
            </Button>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="预警类型" allowClear style={{ width: 130 }}
            options={Object.entries(alertTypeMap).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` }))}
            onChange={v => setFilters((f: any) => ({ ...f, alert_type: v }))} />
          <Select placeholder="预警级别" allowClear style={{ width: 110 }}
            options={Object.entries(levelMap).map(([k, v]) => ({ value: k, label: v.label }))}
            onChange={v => setFilters((f: any) => ({ ...f, alert_level: v }))} />
          <Select value={filters.status} style={{ width: 110 }}
            options={[{ value: 'active', label: '未处理' }, { value: 'resolved', label: '已解决' }, { value: 'ignored', label: '已忽略' }]}
            onChange={v => setFilters((f: any) => ({ ...f, status: v }))} />
          <Button onClick={() => load(1)}>查询</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="small" scroll={{ x: 1100 }}
        pagination={{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showTotal: t => `共 ${t} 条`, onChange: p => load(p) }}
        rowClassName={(r) => r.alert_level === 'critical' ? 'alert-row-critical' : ''} />
    </div>
  );
};

export default Alerts;
