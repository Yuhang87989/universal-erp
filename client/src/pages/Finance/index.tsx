import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, message, Typography, Row, Col, Statistic, Tabs, Tooltip } from 'antd';
import { PlusOutlined, ArrowUpOutlined, ArrowDownOutlined, AccountBookOutlined, ShopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;

// 平台列表（含"总帐目"）
const platformList = [
  { value: '', label: '总帐目', color: '#1677ff', icon: <AccountBookOutlined /> },
  { value: 'offline', label: '线下门店', color: '#faad14' },
  { value: 'douyin', label: '抖音', color: '#111' },
  { value: 'xiaohongshu', label: '小红书', color: '#fe2c55' },
  { value: 'kuaishou', label: '快手', color: '#ff4900' },
  { value: 'wechat_shop', label: '微信小程序', color: '#07c160' },
  { value: 'pinduoduo', label: '拼多多', color: '#e02020' },
  { value: 'taobao', label: '淘宝', color: '#ff5000' },
  { value: 'other', label: '其他', color: '#888' },
];

const typeOptions = [
  { value: 'income', label: '收入', color: 'green' },
  { value: 'expense', label: '支出', color: 'red' }
];

// 通用类别（所有平台共用）
const incomeCategoryOptions = [
  { value: '销售收入', label: '销售收入' },
  { value: '平台收入', label: '平台收入' },
  { value: '其他收入', label: '其他收入' },
];

const expenseCategoryOptions = [
  { value: '采购支出', label: '采购支出' },
  { value: '物流费用', label: '物流费用' },
  { value: '平台佣金', label: '平台佣金' },
  { value: '推广费用', label: '推广费用' },
  { value: '包装费用', label: '包装费用' },
  { value: '人工成本', label: '人工成本' },
  { value: '水电费', label: '水电费' },
  { value: '租金', label: '租金' },
  { value: '退款支出', label: '退款支出' },
  { value: '其他支出', label: '其他支出' },
];

const paymentOptions = [
  { value: 'cash', label: '现金' },
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'bank', label: '银行卡' },
  { value: 'platform', label: '平台结算' },
];

const Finance: React.FC = () => {
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [currentPlatform, setCurrentPlatform] = useState(''); // '' = 总帐目
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();

  // 汇总数据
  const [summary, setSummary] = useState({ income: 0, expense: 0 });
  // 各平台汇总
  const [platformSummary, setPlatformSummary] = useState<any[]>([]);

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (typeFilter) params.type = typeFilter;
      if (currentPlatform) params.platform = currentPlatform;
      const res = await request.get('/finance', { params });
      const data = res.data?.data || res.data || {};
      setRecords(data?.list || data?.records || []);
      setTotal(data?.total || 0);
      if (data?.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, currentPlatform]);

  // 加载各平台汇总（用于总帐目视图）
  const loadPlatformSummary = useCallback(async () => {
    try {
      const res = await request.get('/finance/platform-summary');
      setPlatformSummary(res.data?.data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadPlatformSummary(); }, [loadPlatformSummary]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'expense',
      platform: currentPlatform || 'offline',
      recordDate: dayjs()
    });
    setModalOpen(true);
  };

  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      recordDate: record.record_date ? dayjs(record.record_date) : dayjs()
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        recordDate: values.recordDate?.format('YYYY-MM-DD'),
      };
      if (editing) {
        await request.put(`/finance/${editing.id}`, payload);
        message.success('记录更新成功');
      } else {
        await request.post('/finance', payload);
        message.success('记录添加成功');
      }
      setModalOpen(false);
      loadData();
      loadPlatformSummary();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const getPlatformInfo = (val: string) => platformList.find(p => p.value === val) || { label: val || '未分类', color: '#888' };

  const netProfit = (summary.income || 0) - (summary.expense || 0);
  const viewLabel = currentPlatform ? getPlatformInfo(currentPlatform).label : '总帐目';

  const columns = [
    {
      title: '类型', dataIndex: 'type', key: 'type', width: 70,
      render: (v: string) => {
        const opt = typeOptions.find(t => t.value === v);
        return <Tag color={opt?.color} icon={v === 'income' ? <ArrowUpOutlined /> : <ArrowDownOutlined />}>{opt?.label}</Tag>;
      }
    },
    { title: '类别', dataIndex: 'category', key: 'category', width: 90 },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 110,
      render: (v: number, r: any) => (
        <span style={{ color: r.type === 'income' ? '#3f8600' : '#cf1322', fontWeight: 500 }}>
          {r.type === 'income' ? '+' : '-'}¥{Number(v || 0).toFixed(2)}
        </span>
      )
    },
    // 总帐目视图下显示平台列
    ...(!currentPlatform ? [{
      title: '平台', dataIndex: 'platform', key: 'platform', width: 100,
      render: (v: string) => {
        const info = getPlatformInfo(v);
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    }] : []),
    { title: '支付方式', dataIndex: 'payment_method', key: 'payment_method', width: 90, render: (v: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    { title: '日期', dataIndex: 'record_date', key: 'record_date', width: 100, render: (v: string) => v?.slice(0, 10) },
    {
      title: '操作', key: 'action', width: 60,
      render: (_: any, record: any) => (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
      )
    }
  ];

  // 平台卡片（总帐目视图下显示）
  const renderPlatformCards = () => {
    const totalIncome = platformSummary.reduce((s: number, r: any) => s + parseFloat(r.income || 0), 0);
    const totalExpense = platformSummary.reduce((s: number, r: any) => s + parseFloat(r.expense || 0), 0);

    return (
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {platformSummary.map((item: any) => {
          const info = getPlatformInfo(item.platform);
          const inc = parseFloat(item.income || 0);
          const exp = parseFloat(item.expense || 0);
          const profit = inc - exp;
          return (
            <Col xs={12} sm={8} md={6} key={item.platform}>
              <Card
                size="small"
                hoverable
                style={{ borderLeft: `3px solid ${info.color}`, cursor: 'pointer' }}
                onClick={() => { setCurrentPlatform(item.platform); setPage(1); }}
              >
                <Text strong style={{ fontSize: 13 }}>{info.label}</Text>
                <div style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: '#3f8600' }}>收 ¥{inc.toFixed(0)}</Text>
                </div>
                <div>
                  <Text style={{ fontSize: 12, color: '#cf1322' }}>支 ¥{exp.toFixed(0)}</Text>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13, color: profit >= 0 ? '#3f8600' : '#cf1322' }}>
                    利润 ¥{profit.toFixed(0)}
                  </Text>
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    );
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>财务管理</Title>

      {/* 汇总统计 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small">
            <Statistic title={`${viewLabel} · 总收入`} value={summary.income || 0} precision={2} prefix="¥" valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic title={`${viewLabel} · 总支出`} value={summary.expense || 0} precision={2} prefix="¥" valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small">
            <Statistic
              title={`${viewLabel} · 净利润`}
              value={netProfit}
              precision={2}
              prefix="¥"
              valueStyle={{ color: netProfit >= 0 ? '#3f8600' : '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 总帐目：显示各平台卡片 */}
      {!currentPlatform && platformSummary.length > 0 && (
        <Card size="small" title={<span><ShopOutlined /> 各平台帐目（点击可筛选）</span>} style={{ marginBottom: 16 }}>
          {renderPlatformCards()}
        </Card>
      )}

      {/* 操作栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          {currentPlatform && (
            <Tag
              color="blue"
              style={{ cursor: 'pointer', fontSize: 13, padding: '4px 12px' }}
              onClick={() => { setCurrentPlatform(''); setPage(1); }}
            >
              📊 返回总帐目
            </Tag>
          )}
          {!currentPlatform && (
            <Select
              placeholder="筛选平台"
              allowClear
              style={{ width: 130 }}
              value={currentPlatform || undefined}
              options={platformList.filter(p => p.value !== '')}
              onChange={v => { setCurrentPlatform(v || ''); setPage(1); }}
            />
          )}
          <Select
            placeholder="类型筛选"
            allowClear
            style={{ width: 100 }}
            options={typeOptions}
            value={typeFilter}
            onChange={v => { setTypeFilter(v); setPage(1); }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            记一笔{currentPlatform ? `（${getPlatformInfo(currentPlatform).label}）` : ''}
          </Button>
        </Space>
      </Card>

      {/* 明细表格 */}
      <Table
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 700 }}
        pagination={{
          current: page,
          total,
          showTotal: t => `共 ${t} 条`,
          onChange: p => setPage(p)
        }}
      />

      {/* 记一笔弹窗 */}
      <Modal
        title={editing ? '编辑收支' : `记一笔${currentPlatform ? ` - ${getPlatformInfo(currentPlatform).label}` : ''}`}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <Select options={typeOptions} onChange={() => form.setFieldsValue({ category: undefined })} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="platform" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
                <Select options={platformList.filter(p => p.value !== '')} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
                {({ getFieldValue }) => {
                  const type = getFieldValue('type');
                  const options = type === 'income' ? incomeCategoryOptions : expenseCategoryOptions;
                  return (
                    <Form.Item name="category" label="类别" rules={[{ required: true, message: '请选择类别' }]}>
                      <Select options={options} placeholder="选择类别" />
                    </Form.Item>
                  );
                }}
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="amount" label="金额" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber min={0.01} precision={2} placeholder="0.00" prefix="¥" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="recordDate" label="日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="paymentMethod" label="支付方式">
                <Select allowClear placeholder="选择支付方式" options={paymentOptions} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="备注信息（选填）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Finance;
