import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, InputNumber, Select, DatePicker, Space, Tag, message, Tabs, Statistic, Row, Col, Popconfirm } from 'antd';
import { PlusOutlined, WalletOutlined, SwapOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import request from '../../api/request';
import dayjs from 'dayjs';

const { TextArea } = Input;

const accountTypeMap: Record<string, { label: string; color: string }> = {
  cash: { label: '现金', color: 'green' },
  wechat: { label: '微信', color: 'success' },
  alipay: { label: '支付宝', color: 'blue' },
  bank: { label: '银行', color: 'gold' },
  other: { label: '其他', color: 'default' },
};

const businessTypeMap: Record<string, string> = {
  sale_receipt: '销售收款', purchase_payment: '采购付款', salary: '工资',
  rent: '房租', utility: '水电', other_income: '其他收入',
  other_expense: '其他支出', transfer: '内部转账',
};

const FundManagement: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [txList, setTxList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [accModal, setAccModal] = useState(false);
  const [txModal, setTxModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [txDirection, setTxDirection] = useState<'in' | 'out'>('in');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<any>({});
  const [accForm] = Form.useForm();
  const [txForm] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [editingAcc, setEditingAcc] = useState<any>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await request.get('/fund/accounts');
      setAccounts(res.data?.data?.list || []);
    } catch { /* ignore */ }
  }, []);

  const loadTx = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await request.get('/fund/transactions', { params: { page: p, pageSize: 20, ...filters } });
      const d = res.data?.data || {};
      setTxList(d.list || []);
      setTotal(d.total || 0);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadTx(1); setPage(1); }, [loadTx, filters]);

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);

  const saveAccount = async () => {
    try {
      const v = await accForm.validateFields();
      if (editingAcc) {
        await request.put(`/fund/accounts/${editingAcc.id}`, v);
        message.success('已更新');
      } else {
        await request.post('/fund/accounts', v);
        message.success('账户已创建');
      }
      setAccModal(false);
      loadAccounts();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const saveTx = async () => {
    try {
      const v = await txForm.validateFields();
      v.direction = txDirection;
      if (v.tx_date) v.tx_date = dayjs(v.tx_date).format('YYYY-MM-DD');
      await request.post('/fund/transactions', v);
      message.success(txDirection === 'in' ? '收款已登记' : '付款已登记');
      setTxModal(false);
      loadAccounts(); loadTx(page);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const doTransfer = async () => {
    try {
      const v = await transferForm.validateFields();
      if (v.tx_date) v.tx_date = dayjs(v.tx_date).format('YYYY-MM-DD');
      await request.post('/fund/transfer', v);
      message.success('转账成功');
      setTransferModal(false);
      loadAccounts(); loadTx(page);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '转账失败');
    }
  };

  const txColumns = [
    { title: '流水号', dataIndex: 'tx_no', width: 140 },
    { title: '日期', dataIndex: 'tx_date', width: 110, render: (v: string) => v?.slice(0, 10) },
    { title: '账户', dataIndex: 'account_name', width: 110, render: (v: string, r: any) => (
      <Tag color={accountTypeMap[r.account_type]?.color}>{v}</Tag>
    )},
    { title: '类型', dataIndex: 'business_type', width: 100, render: (v: string) => businessTypeMap[v] || v },
    { title: '往来单位', dataIndex: 'counterparty_name', width: 140 },
    { title: '收入', dataIndex: 'amount', width: 110, align: 'right' as const,
      render: (v: any, r: any) => r.direction === 'in'
        ? <span style={{ color: '#52c41a' }}>+¥{Number(v).toFixed(2)}</span>
        : <span style={{ color: '#999' }}>-</span> },
    { title: '支出', dataIndex: 'amount', width: 110, align: 'right' as const,
      render: (v: any, r: any) => r.direction === 'out'
        ? <span style={{ color: '#f5222d' }}>-¥{Number(v).toFixed(2)}</span>
        : <span style={{ color: '#999' }}>-</span> },
    { title: '关联单据', dataIndex: 'reference_no', width: 130, render: (v: string) => v || '-' },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    { title: '经办人', dataIndex: 'operator_name', width: 90 },
  ];

  return (
    <Card>
      <Tabs items={[
        { key: 'accounts', label: '资金账户', children: (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}><Card size="small"><Statistic title="资金总额" value={totalBalance} precision={2} prefix="¥" valueStyle={{ color: '#1890ff' }} /></Card></Col>
              {accounts.slice(0, 3).map((a: any) => (
                <Col span={6} key={a.id}>
                  <Card size="small">
                    <Statistic title={<span><Tag color={accountTypeMap[a.account_type]?.color}>{accountTypeMap[a.account_type]?.label}</Tag>{a.account_name}</span>}
                      value={Number(a.balance).toFixed(2)} prefix="¥"
                      valueStyle={{ fontSize: 20 }} />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                      本月入 ¥{Number(a.month_in || 0).toFixed(0)} / 出 ¥{Number(a.month_out || 0).toFixed(0)}
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
            <Space style={{ marginBottom: 16 }}>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditingAcc(null); accForm.resetFields(); accForm.setFieldsValue({ account_type: 'cash' }); setAccModal(true); }}>
                新建账户
              </Button>
              <Button icon={<ArrowDownOutlined />} onClick={() => { setTxDirection('in'); txForm.resetFields(); txForm.setFieldsValue({ account_id: accounts[0]?.id, tx_date: dayjs() }); setTxModal(true); }}>
                登记收款
              </Button>
              <Button icon={<ArrowUpOutlined />} onClick={() => { setTxDirection('out'); txForm.resetFields(); txForm.setFieldsValue({ account_id: accounts[0]?.id, tx_date: dayjs() }); setTxModal(true); }}>
                登记付款
              </Button>
              <Button icon={<SwapOutlined />} onClick={() => { transferForm.resetFields(); transferForm.setFieldsValue({ tx_date: dayjs() }); setTransferModal(true); }}>
                账户转账
              </Button>
            </Space>
            <Table rowKey="id" dataSource={accounts} pagination={false}
              columns={[
                { title: '账户名称', dataIndex: 'account_name', render: (v: string, r: any) => (
                  <Space><Tag color={accountTypeMap[r.account_type]?.color}>{accountTypeMap[r.account_type]?.label}</Tag><strong>{v}</strong></Space>
                )},
                { title: '账号', dataIndex: 'account_no', render: (v: string) => v || '-' },
                { title: '开户行', dataIndex: 'bank_name', render: (v: string) => v || '-' },
                { title: '余额', dataIndex: 'balance', align: 'right' as const, render: (v: any) => <strong>¥{Number(v).toFixed(2)}</strong> },
                { title: '本月收入', dataIndex: 'month_in', align: 'right' as const, render: (v: any) => <span style={{ color: '#52c41a' }}>¥{Number(v).toFixed(2)}</span> },
                { title: '本月支出', dataIndex: 'month_out', align: 'right' as const, render: (v: any) => <span style={{ color: '#f5222d' }}>¥{Number(v).toFixed(2)}</span> },
                { title: '状态', dataIndex: 'is_enabled', render: (v: number) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
                { title: '操作', render: (_: any, r: any) => (
                  <Button size="small" type="link" onClick={() => { setEditingAcc(r); accForm.setFieldsValue(r); setAccModal(true); }}>编辑</Button>
                )},
              ]} />
          </>
        )},
        { key: 'transactions', label: '资金流水', children: (
          <>
            <Space style={{ marginBottom: 16 }}>
              <Select placeholder="账户" allowClear style={{ width: 140 }} onChange={v => setFilters((f: any) => ({ ...f, account_id: v }))}
                options={accounts.map(a => ({ value: a.id, label: a.account_name }))} />
              <Select placeholder="方向" allowClear style={{ width: 100 }} onChange={v => setFilters((f: any) => ({ ...f, direction: v }))}
                options={[{ value: 'in', label: '收入' }, { value: 'out', label: '支出' }]} />
              <DatePicker picker="month" onChange={d => {
                if (d) setFilters((f: any) => ({ ...f, start_date: d.startOf('month').format('YYYY-MM-DD'), end_date: d.endOf('month').format('YYYY-MM-DD') }));
                else setFilters((f: any) => { const n = { ...f }; delete n.start_date; delete n.end_date; return n; });
              }} allowClear={false} placeholder="月份" />
              <Button icon={<ArrowDownOutlined />} type="primary" onClick={() => { setTxDirection('in'); txForm.resetFields(); txForm.setFieldsValue({ account_id: accounts[0]?.id, tx_date: dayjs() }); setTxModal(true); }}>收款</Button>
              <Button icon={<ArrowUpOutlined />} onClick={() => { setTxDirection('out'); txForm.resetFields(); txForm.setFieldsValue({ account_id: accounts[0]?.id, tx_date: dayjs() }); setTxModal(true); }}>付款</Button>
            </Space>
            <Table rowKey="id" columns={txColumns} dataSource={txList} loading={loading} scroll={{ x: 1200 }}
              pagination={{ current: page, total, pageSize: 20, onChange: p => { setPage(p); loadTx(p); } }} />
          </>
        )},
      ]} />

      {/* 账户弹窗 */}
      <Modal title={editingAcc ? '编辑账户' : '新建资金账户'} open={accModal} onOk={saveAccount} onCancel={() => setAccModal(false)} destroyOnClose>
        <Form form={accForm} layout="vertical">
          <Form.Item name="account_name" label="账户名称" rules={[{ required: true }]}>
            <Input placeholder="如：现金账户、微信收款、工行基本户" />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="account_type" label="账户类型" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={[
                { value: 'cash', label: '现金' }, { value: 'wechat', label: '微信' },
                { value: 'alipay', label: '支付宝' }, { value: 'bank', label: '银行账户' },
                { value: 'other', label: '其他' },
              ]} />
            </Form.Item>
            {!editingAcc && (
              <Form.Item name="balance" label="初始余额" style={{ flex: 1 }}>
                <InputNumber style={{ width: '100%' }} precision={2} prefix="¥" />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="bank_name" label="开户行"><Input placeholder="银行账户时填写" /></Form.Item>
          <Form.Item name="account_no" label="账号"><Input placeholder="银行卡号/商户号" /></Form.Item>
          <Form.Item name="remark" label="备注"><TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 收/付款弹窗 */}
      <Modal title={txDirection === 'in' ? '登记收款' : '登记付款'} open={txModal} onOk={saveTx} onCancel={() => setTxModal(false)} destroyOnClose width={560}>
        <Form form={txForm} layout="vertical">
          <Space style={{ display: 'flex' }}>
            <Form.Item name="account_id" label="资金账户" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={accounts.map(a => ({ value: a.id, label: a.account_name }))} />
            </Form.Item>
            <Form.Item name="amount" label="金额" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} precision={2} prefix="¥" min={0.01} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="tx_date" label="日期" rules={[{ required: true }]} style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="business_type" label="业务类型" rules={[{ required: true }]} style={{ flex: 1 }} initialValue={txDirection === 'in' ? 'sale_receipt' : 'purchase_payment'}>
              <Select options={Object.entries(businessTypeMap).filter(([k]) => k !== 'transfer').map(([k, v]) => ({ value: k, label: v }))} />
            </Form.Item>
          </Space>
          <Form.Item name="counterparty_name" label="往来单位/个人">
            <Input placeholder="客户或供应商名称（可选）" />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input placeholder="款项说明" /></Form.Item>
        </Form>
      </Modal>

      {/* 转账弹窗 */}
      <Modal title="账户转账" open={transferModal} onOk={doTransfer} onCancel={() => setTransferModal(false)} destroyOnClose>
        <Form form={transferForm} layout="vertical">
          <Space style={{ display: 'flex' }}>
            <Form.Item name="from_account_id" label="转出账户" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={accounts.map(a => ({ value: a.id, label: `${a.account_name}（¥${Number(a.balance).toFixed(2)}）` }))} />
            </Form.Item>
            <Form.Item name="to_account_id" label="转入账户" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={accounts.map(a => ({ value: a.id, label: a.account_name }))} />
            </Form.Item>
          </Space>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="amount" label="转账金额" rules={[{ required: true }]} style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} precision={2} prefix="¥" min={0.01} />
            </Form.Item>
            <Form.Item name="tx_date" label="日期" rules={[{ required: true }]} style={{ flex: 1 }} initialValue={dayjs()}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注"><Input placeholder="转账说明" /></Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
export default FundManagement;
