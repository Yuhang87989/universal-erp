import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Popconfirm, Descriptions, Divider, Rate, InputNumber, DatePicker, Tabs } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, BankOutlined } from '@ant-design/icons';
import request from '../../api/request';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Title } = Typography;

const Suppliers: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [form] = Form.useForm();

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (keyword) params.keyword = keyword;
      if (filterType) params.supplier_type = filterType;
      const res = await request.get('/suppliers', { params });
      const d = res.data?.data || res.data || {};
      setList(d.list || []);
      setTotal(d.total || 0);
    } catch (e) { message.error('加载失败'); }
    finally { setLoading(false); }
  }, [keyword, filterType]);

  useEffect(() => { load(1); setPage(1); }, [keyword, filterType]);

  const handleSave = async () => {
    try {
      const v = await form.validateFields();
      if (v.cooperation_start_date) v.cooperation_start_date = dayjs(v.cooperation_start_date).format('YYYY-MM-DD');
      if (editing) {
        await request.put(`/suppliers/${editing.id}`, v);
        message.success('已更新');
      } else {
        await request.post('/suppliers', v);
        message.success('已添加');
      }
      setModalOpen(false);
      load(page);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '保存失败');
    }
  };

  const openEdit = (r: any) => {
    setEditing(r);
    form.setFieldsValue({
      ...r,
      cooperation_start_date: r.cooperation_start_date ? dayjs(r.cooperation_start_date) : undefined,
    });
    setModalOpen(true);
  };

  const viewDetail = async (id: number) => {
    try {
      const res = await request.get(`/suppliers/${id}`);
      setDetail(res.data?.data || res.data);
      setDetailOpen(true);
    } catch { message.error('获取详情失败'); }
  };

  const typeTag = (t: string) => t === 'company'
    ? <Tag color="blue">企业</Tag>
    : <Tag color="orange">个体</Tag>;

  const columns = [
    { title: '供应商名称', dataIndex: 'name', width: 200, render: (v: string, r: any) => (
      <a onClick={() => viewDetail(r.id)}>
        <BankOutlined style={{ marginRight: 6 }} />{v}
        {r.enabled === 0 && <Tag color="default" style={{ marginLeft: 6 }}>已停用</Tag>}
      </a>
    )},
    { title: '类型', dataIndex: 'supplier_type', width: 80, render: (v: string) => typeTag(v) },
    { title: '联系人', dataIndex: 'contact_name', width: 100 },
    { title: '电话', dataIndex: 'phone', width: 130 },
    { title: '评级', dataIndex: 'rating', width: 120, render: (v: number) => <Rate disabled value={v || 0} style={{ fontSize: 12 }} /> },
    { title: '采购总额', dataIndex: 'totalAmount', width: 120, align: 'right' as const, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '未付金额', dataIndex: 'unpaidAmount', width: 120, align: 'right' as const, render: (v: any) => v > 0 ? <span style={{ color: '#f5222d' }}>¥{Number(v).toFixed(2)}</span> : <span style={{ color: '#999' }}>-</span> },
    { title: '操作', width: 160, fixed: 'right' as const, render: (_: any, r: any) => (
      <Space size="small">
        <Button size="small" type="link" onClick={() => openEdit(r)}>编辑</Button>
        <Popconfirm title={r.totalOrders > 0 ? '该供应商有采购记录，将设为停用' : '确认删除？'} onConfirm={async () => {
          await request.delete(`/suppliers/${r.id}`);
          message.success('已处理'); load(page);
        }}>
          <Button size="small" type="link" danger>{r.enabled === 0 || r.totalOrders > 0 ? '停用' : '删除'}</Button>
        </Popconfirm>
      </Space>
    )},
  ];

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Input placeholder="搜索名称/联系人/电话/信用代码" value={keyword} onChange={e => setKeyword(e.target.value)}
            style={{ width: 280 }} prefix={<SearchOutlined />} allowClear />
          <Select placeholder="类型" allowClear style={{ width: 100 }} value={filterType || undefined} onChange={setFilterType}
            options={[{ value: 'company', label: '企业' }, { value: 'individual', label: '个体' }]} />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); form.resetFields(); setModalOpen(true); }}>
          新增供应商
        </Button>
      </Space>

      <Table rowKey="id" columns={columns} dataSource={list} loading={loading}
        scroll={{ x: 1100 }}
        pagination={{ current: page, total, pageSize: 20, onChange: p => { setPage(p); load(p); } }} />

      <Modal title={editing ? '编辑供应商' : '新增供应商'} open={modalOpen} onOk={handleSave}
        onCancel={() => setModalOpen(false)} width={780} destroyOnClose>
        <Form form={form} layout="vertical">
          <Tabs items={[
            { key: 'basic', label: '基本信息', children: (
              <>
                <Form.Item name="name" label="供应商名称" rules={[{ required: true }]}>
                  <Input placeholder="公司全称或个体工商户名称" />
                </Form.Item>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name="supplier_type" label="类型" initialValue="company" style={{ flex: 1 }}>
                    <Select options={[{ value: 'company', label: '企业' }, { value: 'individual', label: '个体工商户' }]} />
                  </Form.Item>
                  <Form.Item name="credit_code" label="统一社会信用代码" style={{ flex: 2 }}>
                    <Input placeholder="18位信用代码" maxLength={18} />
                  </Form.Item>
                </Space>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name="contact_name" label="联系人" style={{ flex: 1 }}><Input /></Form.Item>
                  <Form.Item name="contact_position" label="职位" style={{ flex: 1 }}><Input placeholder="如：采购经理" /></Form.Item>
                </Space>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name="phone" label="电话" style={{ flex: 1 }}><Input placeholder="手机或座机" /></Form.Item>
                  <Form.Item name="email" label="邮箱" style={{ flex: 1 }}><Input /></Form.Item>
                </Space>
                <Form.Item name="address" label="地址"><Input /></Form.Item>
                <Form.Item name="remark" label="备注"><TextArea rows={2} /></Form.Item>
              </>
            )},
            { key: 'finance', label: '财务信息', children: (
              <>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name="tax_number" label="税号" style={{ flex: 1 }}><Input /></Form.Item>
                  <Form.Item name="invoice_title" label="开票抬头" style={{ flex: 1 }}><Input /></Form.Item>
                </Space>
                <Form.Item name="bank_name" label="开户行"><Input placeholder="如：中国工商银行武汉分行" /></Form.Item>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name="bank_account_name" label="开户名" style={{ flex: 1 }}><Input /></Form.Item>
                  <Form.Item name="bank_account" label="银行账号" style={{ flex: 1 }}><Input /></Form.Item>
                </Space>
                <Form.Item name="bank_branch" label="开户支行"><Input /></Form.Item>
                <Space style={{ display: 'flex' }}>
                  <Form.Item name="payment_terms" label="账期/付款条件" style={{ flex: 1 }}>
                    <Input placeholder="如：月结30天" />
                  </Form.Item>
                  <Form.Item name="cooperation_start_date" label="合作开始日期" style={{ flex: 1 }}>
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Space>
                <Form.Item name="rating" label="评级" initialValue={5}>
                  <Rate />
                </Form.Item>
              </>
            )},
          ]} />
        </Form>
      </Modal>

      <Modal title="供应商详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={720}>
        {detail && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="名称" span={2}>{detail.name}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.supplier_type === 'company' ? '企业' : '个体'}</Descriptions.Item>
              <Descriptions.Item label="信用代码">{detail.credit_code || '-'}</Descriptions.Item>
              <Descriptions.Item label="联系人">{detail.contact_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="职位">{detail.contact_position || '-'}</Descriptions.Item>
              <Descriptions.Item label="电话">{detail.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detail.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="地址" span={2}>{detail.address || '-'}</Descriptions.Item>
              <Descriptions.Item label="税号">{detail.tax_number || '-'}</Descriptions.Item>
              <Descriptions.Item label="开票抬头">{detail.invoice_title || '-'}</Descriptions.Item>
              <Descriptions.Item label="开户行">{detail.bank_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="开户名">{detail.bank_account_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="银行账号" span={2}>{detail.bank_account || '-'}</Descriptions.Item>
              <Descriptions.Item label="账期">{detail.payment_terms || '-'}</Descriptions.Item>
              <Descriptions.Item label="合作开始">{detail.cooperation_start_date ? dayjs(detail.cooperation_start_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
            </Descriptions>
            <Divider>采购统计</Divider>
            <Descriptions bordered column={3} size="small">
              <Descriptions.Item label="采购单数">{detail.stats?.total_orders || 0}</Descriptions.Item>
              <Descriptions.Item label="采购总额">¥{Number(detail.stats?.total_amount || 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="已付金额">¥{Number(detail.stats?.paid_amount || 0).toFixed(2)}</Descriptions.Item>
            </Descriptions>
            {detail.recentOrders?.length > 0 && (
              <>
                <Divider>近期采购单</Divider>
                <Table size="small" rowKey="id" pagination={false} dataSource={detail.recentOrders}
                  columns={[
                    { title: '单号', dataIndex: 'order_no' },
                    { title: '日期', dataIndex: 'order_date', render: (v: string) => v?.slice(0, 10) },
                    { title: '金额', dataIndex: 'total_amount', align: 'right' as const, render: (v: any) => `¥${Number(v).toFixed(2)}` },
                    { title: '状态', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                  ]} />
              </>
            )}
          </>
        )}
      </Modal>
    </Card>
  );
};
export default Suppliers;
