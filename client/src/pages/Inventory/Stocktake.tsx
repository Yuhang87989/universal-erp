import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Space, Tag, message, Typography, Row, Col, Statistic, Steps, Popconfirm, Descriptions, Divider
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CheckOutlined, EditOutlined,
  AuditOutlined, FileSearchOutlined, ShoppingOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;

const stocktakeTypeMap: Record<string, { color: string; label: string }> = {
  full: { color: 'blue', label: '全盘' },
  partial: { color: 'orange', label: '抽盘' },
  cycle: { color: 'purple', label: '循环盘' },
};

const statusMap: Record<string, { color: string; label: string; step: number }> = {
  draft: { color: 'default', label: '草稿', step: 0 },
  counting: { color: 'processing', label: '盘点中', step: 1 },
  reviewing: { color: 'warning', label: '复核中', step: 2 },
  completed: { color: 'success', label: '已完成', step: 3 },
  cancelled: { color: 'error', label: '已取消', step: -1 },
};

const Stocktake: React.FC = () => {
  const [stocktakes, setStocktakes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [form] = Form.useForm();

  const loadStocktakes = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (filterStatus) params.status = filterStatus;
      const res = await request.get('/inventory/stocktake', { params });
      const data = res.data;
      setStocktakes(data?.list || []);
      setTotal(data?.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { loadStocktakes(); }, [loadStocktakes]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ stocktake_type: 'full', stocktake_date: dayjs() });
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async () => {
    try {
      const values = await form.validateFields();
      await request.post('/inventory/stocktake', {
        stocktake_type: values.stocktake_type,
        stocktake_date: values.stocktake_date?.format('YYYY-MM-DD'),
        remark: values.remark,
      });
      message.success('盘点单创建成功');
      setCreateModalOpen(false);
      loadStocktakes();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else if (!err.errorFields) message.error('创建失败');
    }
  };

  const handleViewDetail = async (record: any) => {
    try {
      const res = await request.get(`/inventory/stocktake/${record.id}`);
      setDetail(res.data);
      setEditItems((res.data.items || []).map((item: any) => ({
        ...item,
        edit_quantity: item.actual_quantity,
      })));
      setDetailModalOpen(true);
    } catch (err) {
      message.error('获取盘点详情失败');
    }
  };

  const handleUpdateItem = (itemId: number, value: number) => {
    setEditItems(editItems.map(i => i.id === itemId ? { ...i, edit_quantity: value } : i));
  };

  const handleSaveItems = async () => {
    try {
      const items = editItems.map(i => ({
        item_id: i.id,
        actual_quantity: i.edit_quantity,
      }));
      await request.put(`/inventory/stocktake/${detail.id}/items`, { items });
      message.success('盘点数据已保存');
      handleViewDetail(detail);
    } catch (err: any) {
      message.error(err.response?.data?.message || '保存失败');
    }
  };

  const handleComplete = async (id: number) => {
    try {
      await request.post(`/inventory/stocktake/${id}/complete`);
      message.success('盘点已完成，进入复核阶段');
      setDetailModalOpen(false);
      loadStocktakes();
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleAdjust = async (id: number) => {
    try {
      await request.post(`/inventory/stocktake/${id}/adjust`);
      message.success('库存已按盘点结果调整');
      setDetailModalOpen(false);
      loadStocktakes();
    } catch (err: any) {
      message.error(err.response?.data?.message || '调整失败');
    }
  };

  const canEdit = detail && ['draft', 'counting'].includes(detail.status);
  const canComplete = detail && ['draft', 'counting'].includes(detail.status);
  const canAdjust = detail && detail.status === 'reviewing';

  // 统计差异
  const diffStats = editItems.reduce((acc, item) => {
    const diff = (item.edit_quantity || 0) - (item.system_quantity || 0);
    if (diff > 0) {
      acc.overCount++;
      acc.overAmount += diff * (item.unit_cost || 0);
    } else if (diff < 0) {
      acc.lossCount++;
      acc.lossAmount += Math.abs(diff) * (item.unit_cost || 0);
    } else {
      acc.matchedCount++;
    }
    return acc;
  }, { overCount: 0, lossCount: 0, matchedCount: 0, overAmount: 0, lossAmount: 0 });

  const columns = [
    { title: '盘点单号', dataIndex: 'stocktake_no', width: 160, render: (v: string, r: any) => (
      <a onClick={() => handleViewDetail(r)}>{v}</a>
    )},
    { title: '类型', dataIndex: 'stocktake_type', width: 80, render: (v: string) => {
      const t = stocktakeTypeMap[v] || { color: 'default', label: v };
      return <Tag color={t.color}>{t.label}</Tag>;
    }},
    { title: '盘点日期', dataIndex: 'stocktake_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => {
      const s = statusMap[v] || { color: 'default', label: v };
      return <Tag color={s.color}>{s.label}</Tag>;
    }},
    { title: '商品数', dataIndex: 'total_items', width: 70, align: 'right' },
    { title: '一致', dataIndex: 'matched_items', width: 60, align: 'right', render: (v: number) => v || '-' },
    { title: '盘盈', dataIndex: 'over_items', width: 60, align: 'right', render: (v: number) => (
      v > 0 ? <span style={{ color: '#3f8600' }}>{v}</span> : (v || '-')
    )},
    { title: '盘亏', dataIndex: 'loss_items', width: 60, align: 'right', render: (v: number) => (
      v > 0 ? <span style={{ color: '#cf1322' }}>{v}</span> : (v || '-')
    )},
    { title: '盘点人', dataIndex: 'operator_name', width: 80 },
    { title: '操作', key: 'action', width: 80, render: (_: any, record: any) => (
      <Button type="link" size="small" onClick={() => handleViewDetail(record)}>查看</Button>
    )},
  ];

  return (
    <div>
      <Title level={4}>
        <ShoppingOutlined style={{ marginRight: 8 }} />
        库存盘点
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }}
            options={Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label }))}
            value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建盘点单</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={stocktakes} rowKey="id" loading={loading} size="small"
        scroll={{ x: 900 }}
        pagination={{ current: page, total, showTotal: t => `共 ${t} 条`, onChange: p => setPage(p) }}
      />

      {/* 创建盘点单弹窗 */}
      <Modal title="新建盘点单" open={createModalOpen} onOk={handleCreateSubmit} onCancel={() => setCreateModalOpen(false)}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="stocktake_type" label="盘点类型" rules={[{ required: true }]}>
            <Select options={Object.entries(stocktakeTypeMap).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
          <Form.Item name="stocktake_date" label="盘点日期" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 盘点详情弹窗 */}
      <Modal
        title={`盘点详情 - ${detail?.stocktake_no || ''}`}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        width={900}
        footer={
          <Space>
            <Button onClick={() => setDetailModalOpen(false)}>关闭</Button>
            {canEdit && <Button type="primary" icon={<CheckOutlined />} onClick={handleSaveItems}>保存盘点数据</Button>}
            {canComplete && (
              <Popconfirm title="确认完成盘点？完成后将进入复核阶段" onConfirm={() => handleComplete(detail.id)}>
                <Button type="primary" icon={<AuditOutlined />}>完成盘点</Button>
              </Popconfirm>
            )}
            {canAdjust && (
              <Popconfirm title="确认按盘点结果调整库存？此操作不可撤销" onConfirm={() => handleAdjust(detail.id)}>
                <Button type="primary" danger icon={<CheckOutlined />}>确认调整库存</Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        {detail && (
          <div>
            {/* 进度条 */}
            <Steps
              current={statusMap[detail.status]?.step || 0}
              size="small"
              style={{ marginBottom: 16 }}
              items={[
                { title: '草稿' },
                { title: '盘点中' },
                { title: '复核中' },
                { title: '已完成' },
              ]}
            />

            {/* 基本信息 */}
            <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="盘点类型">
                <Tag color={stocktakeTypeMap[detail.stocktake_type]?.color}>
                  {stocktakeTypeMap[detail.stocktake_type]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="盘点日期">{detail.stocktake_date?.slice(0, 10)}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[detail.status]?.color}>{statusMap[detail.status]?.label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="盘点人">{detail.operator_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="复核人">{detail.reviewer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="备注">{detail.remark || '-'}</Descriptions.Item>
            </Descriptions>

            {/* 差异统计 */}
            {detail.status !== 'draft' && (
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={8}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <Statistic title="账实一致" value={detail.matched_items || 0} suffix="项" valueStyle={{ color: '#1677ff' }} />
                  </Card>
                </Col>
                <Col xs={8}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <Statistic title="盘盈" value={detail.over_items || 0} suffix={`项 / ¥${Number(detail.total_over_amount || 0).toFixed(0)}`} valueStyle={{ color: '#3f8600' }} />
                  </Card>
                </Col>
                <Col xs={8}>
                  <Card size="small" style={{ textAlign: 'center' }}>
                    <Statistic title="盘亏" value={detail.loss_items || 0} suffix={`项 / ¥${Number(detail.total_loss_amount || 0).toFixed(0)}`} valueStyle={{ color: '#cf1322' }} />
                  </Card>
                </Col>
              </Row>
            )}

            {/* 盘点明细表 */}
            <Divider orientation="left" style={{ margin: '8px 0' }}>盘点明细</Divider>
            <Table
              size="small"
              dataSource={editItems}
              rowKey="id"
              pagination={false}
              scroll={{ y: 300 }}
              columns={[
                { title: '商品', dataIndex: 'product_name', width: 150 },
                { title: '条码', dataIndex: 'barcode', width: 100 },
                { title: '分类', dataIndex: 'category_name', width: 80 },
                { title: '系统库存', dataIndex: 'system_quantity', width: 90, align: 'right' },
                { title: '实盘数量', width: 110, render: (_: any, r: any) => canEdit ? (
                  <InputNumber size="small" value={r.edit_quantity} min={0}
                    onChange={v => handleUpdateItem(r.id, v || 0)} style={{ width: 90 }} />
                ) : (
                  <span>{r.actual_quantity}</span>
                )},
                { title: '差异', width: 80, align: 'right', render: (_: any, r: any) => {
                  const diff = Number(r.edit_quantity || r.actual_quantity || 0) - Number(r.system_quantity || 0);
                  if (diff === 0) return <Tag>0</Tag>;
                  return <Tag color={diff > 0 ? 'success' : 'error'}>{diff > 0 ? '+' : ''}{diff}</Tag>;
                }},
                { title: '差异金额', width: 100, align: 'right', render: (_: any, r: any) => {
                  const diff = Number(r.edit_quantity || r.actual_quantity || 0) - Number(r.system_quantity || 0);
                  const amount = diff * Number(r.unit_cost || 0);
                  if (amount === 0) return '-';
                  return <span style={{ color: amount > 0 ? '#3f8600' : '#cf1322' }}>
                    {amount > 0 ? '+' : ''}¥{amount.toFixed(2)}
                  </span>;
                }},
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Stocktake;
