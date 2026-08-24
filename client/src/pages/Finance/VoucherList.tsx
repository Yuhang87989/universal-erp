import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker,
  Space, Tag, message, Typography, Row, Col, Statistic, Popconfirm, Divider
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CheckOutlined, StopOutlined,
  FileTextOutlined, AuditOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text } = Typography;

const voucherTypeOptions = [
  { value: 'general', label: '记' },
  { value: 'receipt', label: '收' },
  { value: 'payment', label: '付' },
  { value: 'transfer', label: '转' },
];

const statusMap: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  pending_audit: { color: 'processing', label: '待审核' },
  audited: { color: 'success', label: '已审核' },
  posted: { color: 'blue', label: '已过账' },
  void: { color: 'error', label: '已作废' },
};

const VoucherList: React.FC = () => {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [filterType, setFilterType] = useState<string | undefined>();
  const [summary, setSummary] = useState<any>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<any[]>([
    { key: Date.now(), account_id: undefined, summary: '', debit_amount: 0, credit_amount: 0 }
  ]);

  const loadVouchers = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (filterStatus) params.status = filterStatus;
      if (filterType) params.voucher_type = filterType;
      const res = await request.get('/vouchers', { params });
      const data = res.data;
      setVouchers(data?.list || []);
      setTotal(data?.total || 0);
      if (data?.summary) setSummary(data.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterType]);

  const loadAccounts = async () => {
    try {
      const res = await request.get('/accounts');
      setAccounts(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { loadVouchers(); }, [loadVouchers]);
  useEffect(() => { loadAccounts(); }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ voucher_type: 'general', voucher_date: dayjs(), attachment_count: 0 });
    setItems([{ key: Date.now(), account_id: undefined, summary: '', debit_amount: 0, credit_amount: 0 }]);
    setModalOpen(true);
  };

  const handleEdit = async (record: any) => {
    try {
      const res = await request.get(`/vouchers/${record.id}`);
      const data = res.data;
      setEditing(data);
      form.setFieldsValue({
        voucher_type: data.voucher_type,
        voucher_date: dayjs(data.voucher_date),
        attachment_count: data.attachment_count,
        remark: data.remark,
      });
      setItems(data.items.map((item: any, i: number) => ({
        key: i,
        account_id: item.account_id,
        summary: item.summary,
        debit_amount: parseFloat(item.debit_amount) || 0,
        credit_amount: parseFloat(item.credit_amount) || 0,
      })));
      setModalOpen(true);
    } catch (err) {
      message.error('获取凭证详情失败');
    }
  };

  const handleViewDetail = async (record: any) => {
    try {
      const res = await request.get(`/vouchers/${record.id}`);
      setDetail(res.data);
      setDetailOpen(true);
    } catch (err) {
      message.error('获取凭证详情失败');
    }
  };

  const addItem = () => {
    setItems([...items, { key: Date.now(), account_id: undefined, summary: '', debit_amount: 0, credit_amount: 0 }]);
  };

  const removeItem = (key: number) => {
    if (items.length <= 2) { message.warning('至少需要两行分录'); return; }
    setItems(items.filter(i => i.key !== key));
  };

  const updateItem = (key: number, field: string, value: any) => {
    setItems(items.map(i => i.key === key ? { ...i, [field]: value } : i));
  };

  const totalDebit = items.reduce((s, i) => s + (parseFloat(i.debit_amount) || 0), 0);
  const totalCredit = items.reduce((s, i) => s + (parseFloat(i.credit_amount) || 0), 0);
  const isBalanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  const handleSave = async () => {
    try {
      await form.validateFields();
      for (const item of items) {
        if (!item.account_id) { message.warning('请选择科目'); return; }
        if (!item.summary) { message.warning('请填写摘要'); return; }
      }
      if (!isBalanced) { message.error(`借贷不平衡！借方 ¥${totalDebit.toFixed(2)} ≠ 贷方 ¥${totalCredit.toFixed(2)}`); return; }

      const values = form.getFieldsValue();
      const payload = {
        ...values,
        voucher_date: values.voucher_date?.format('YYYY-MM-DD'),
        items: items.map(i => ({
          account_id: i.account_id,
          summary: i.summary,
          debit_amount: parseFloat(i.debit_amount) || 0,
          credit_amount: parseFloat(i.credit_amount) || 0,
        })),
      };

      if (editing) {
        await request.put(`/vouchers/${editing.id}`, payload);
        message.success('凭证更新成功');
      } else {
        await request.post('/vouchers', payload);
        message.success('凭证保存成功');
      }
      setModalOpen(false);
      loadVouchers();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else if (err.errorFields) return;
      else message.error('操作失败');
    }
  };

  const handleAudit = async (id: number) => {
    try {
      await request.post(`/vouchers/${id}/audit`);
      message.success('审核通过');
      loadVouchers();
    } catch (err: any) {
      message.error(err.response?.data?.message || '审核失败');
    }
  };

  const handleVoid = async (id: number) => {
    try {
      await request.post(`/vouchers/${id}/void`);
      message.success('凭证已作废');
      loadVouchers();
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/vouchers/${id}`);
      message.success('凭证已删除');
      loadVouchers();
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const columns = [
    { title: '凭证编号', dataIndex: 'voucher_no', width: 140, render: (v: string, r: any) => (
      <a onClick={() => handleViewDetail(r)}>{v}</a>
    )},
    { title: '类型', dataIndex: 'voucher_type', width: 60, render: (v: string) => {
      const opt = voucherTypeOptions.find(o => o.value === v);
      return <Tag>{opt?.label || v}</Tag>;
    }},
    { title: '日期', dataIndex: 'voucher_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '借方合计', dataIndex: 'total_debit', width: 110, render: (v: number) => (
      <span style={{ color: '#cf1322', fontWeight: 500 }}>¥{Number(v || 0).toFixed(2)}</span>
    )},
    { title: '贷方合计', dataIndex: 'total_credit', width: 110, render: (v: number) => (
      <span style={{ color: '#3f8600', fontWeight: 500 }}>¥{Number(v || 0).toFixed(2)}</span>
    )},
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => {
      const s = statusMap[v] || { color: 'default', label: v };
      return <Tag color={s.color}>{s.label}</Tag>;
    }},
    { title: '制单人', dataIndex: 'creator_name', width: 80 },
    { title: '审核人', dataIndex: 'auditor_name', width: 80, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 150, render: (_: any, record: any) => (
      <Space size="small">
        {record.status === 'draft' && (
          <>
            <Button type="link" size="small" onClick={() => handleEdit(record)}>编辑</Button>
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => handleAudit(record.id)} style={{ color: '#52c41a' }}>审核</Button>
            <Popconfirm title="确定作废此凭证？" onConfirm={() => handleVoid(record.id)}>
              <Button type="link" size="small" danger icon={<StopOutlined />}>作废</Button>
            </Popconfirm>
          </>
        )}
        {record.status !== 'draft' && record.status !== 'void' && (
          <Button type="link" size="small" onClick={() => handleViewDetail(record)}>查看</Button>
        )}
        {record.status === 'draft' && (
          <Popconfirm title="确定删除此凭证？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <Title level={4}>记账凭证</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="凭证总数" value={summary.total_count || 0} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="累计金额" value={summary.total_amount || 0} precision={2} prefix="¥" />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="待审核" value={summary.draft_count || 0} prefix={<AuditOutlined />} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="已审核" value={summary.audited_count || 0} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Select placeholder="状态筛选" allowClear style={{ width: 120 }} options={Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label }))} value={filterStatus} onChange={v => { setFilterStatus(v); setPage(1); }} />
          <Select placeholder="类型筛选" allowClear style={{ width: 100 }} options={voucherTypeOptions} value={filterType} onChange={v => { setFilterType(v); setPage(1); }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新建凭证</Button>
        </Space>
      </Card>

      <Table columns={columns} dataSource={vouchers} rowKey="id" loading={loading} size="small"
        scroll={{ x: 900 }}
        pagination={{ current: page, total, showTotal: t => `共 ${t} 条`, onChange: p => setPage(p) }}
      />

      {/* 新建/编辑凭证弹窗 */}
      <Modal
        title={editing ? `编辑凭证 ${editing.voucher_no}` : '新建记账凭证'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={800}
        okText={isBalanced ? '保存' : '借贷不平，无法保存'}
        okButtonProps={{ disabled: !isBalanced }}
      >
        <Form form={form} layout="inline" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <Form.Item name="voucher_type" label="类型" rules={[{ required: true }]}>
            <Select options={voucherTypeOptions} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item name="voucher_date" label="日期" rules={[{ required: true }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="attachment_count" label="附件数">
            <InputNumber min={0} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input style={{ width: 200 }} />
          </Form.Item>
        </Form>

        <Divider orientation="left" style={{ margin: '8px 0' }}>会计分录</Divider>

        <div style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px 4px', textAlign: 'left', width: 30 }}>#</th>
                <th style={{ padding: '8px 4px', textAlign: 'left' }}>摘要</th>
                <th style={{ padding: '8px 4px', textAlign: 'left', width: 200 }}>会计科目</th>
                <th style={{ padding: '8px 4px', textAlign: 'right', width: 110 }}>借方金额</th>
                <th style={{ padding: '8px 4px', textAlign: 'right', width: 110 }}>贷方金额</th>
                <th style={{ padding: '8px 4px', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '6px 4px' }}>{idx + 1}</td>
                  <td style={{ padding: '6px 4px' }}>
                    <Input size="small" value={item.summary} placeholder="摘要"
                      onChange={e => updateItem(item.key, 'summary', e.target.value)} />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <Select size="small" style={{ width: '100%' }} value={item.account_id}
                      placeholder="选择科目" showSearch optionFilterProp="label"
                      onChange={v => updateItem(item.key, 'account_id', v)}
                      options={accounts.map((a: any) => ({
                        value: a.id,
                        label: `${a.code} ${a.name}`
                      }))}
                    />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <InputNumber size="small" style={{ width: '100%' }} value={item.debit_amount}
                      min={0} precision={2} placeholder="0.00"
                      onChange={v => updateItem(item.key, 'debit_amount', v || 0)}
                      onFocus={() => { if (item.credit_amount > 0) updateItem(item.key, 'credit_amount', 0); }}
                    />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <InputNumber size="small" style={{ width: '100%' }} value={item.credit_amount}
                      min={0} precision={2} placeholder="0.00"
                      onChange={v => updateItem(item.key, 'credit_amount', v || 0)}
                      onFocus={() => { if (item.debit_amount > 0) updateItem(item.key, 'debit_amount', 0); }}
                    />
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(item.key)} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fafafa', fontWeight: 600 }}>
                <td colSpan={3} style={{ padding: '8px 4px', textAlign: 'right' }}>合计</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', color: '#cf1322' }}>¥{totalDebit.toFixed(2)}</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', color: '#3f8600' }}>¥{totalCredit.toFixed(2)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={addItem}>添加分录</Button>
          <Tag color={isBalanced ? 'success' : 'error'} style={{ fontSize: 13, padding: '4px 12px' }}>
            {isBalanced ? '✓ 借贷平衡' : `✗ 借贷差额 ¥${(totalDebit - totalCredit).toFixed(2)}`}
          </Tag>
        </div>
      </Modal>

      {/* 凭证详情弹窗 */}
      <Modal title={`凭证详情 - ${detail?.voucher_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {detail && (
          <div>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={8}><Text type="secondary">类型：</Text><Tag>{voucherTypeOptions.find(o => o.value === detail.voucher_type)?.label}</Tag></Col>
              <Col span={8}><Text type="secondary">日期：</Text>{detail.voucher_date?.slice(0, 10)}</Col>
              <Col span={8}><Text type="secondary">状态：</Text><Tag color={statusMap[detail.status]?.color}>{statusMap[detail.status]?.label}</Tag></Col>
            </Row>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafafa', borderBottom: '2px solid #d9d9d9' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>摘要</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>科目</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>借方</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>贷方</th>
                </tr>
              </thead>
              <tbody>
                {detail.items?.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px' }}>{item.summary}</td>
                    <td style={{ padding: '8px' }}>{item.account_code} {item.account_name}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#cf1322' }}>{parseFloat(item.debit_amount) > 0 ? `¥${parseFloat(item.debit_amount).toFixed(2)}` : ''}</td>
                    <td style={{ padding: '8px', textAlign: 'right', color: '#3f8600' }}>{parseFloat(item.credit_amount) > 0 ? `¥${parseFloat(item.credit_amount).toFixed(2)}` : ''}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600, borderTop: '2px solid #d9d9d9' }}>
                  <td colSpan={2} style={{ padding: '8px', textAlign: 'right' }}>合计</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#cf1322' }}>¥{Number(detail.total_debit).toFixed(2)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', color: '#3f8600' }}>¥{Number(detail.total_credit).toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            {detail.seals?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text type="secondary">盖章：</Text>
                {detail.seals.map((s: any) => (
                  <Tag key={s.id} color="red">{s.seal_name}{s.seal_code ? ` (${s.seal_code})` : ''}</Tag>
                ))}
              </div>
            )}
            <Row gutter={16} style={{ marginTop: 16 }}>
              <Col span={8}><Text type="secondary">制单人：</Text>{detail.creator_name}</Col>
              <Col span={8}><Text type="secondary">审核人：</Text>{detail.auditor_name || '-'}</Col>
              <Col span={8}><Text type="secondary">附件数：</Text>{detail.attachment_count}</Col>
            </Row>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default VoucherList;
