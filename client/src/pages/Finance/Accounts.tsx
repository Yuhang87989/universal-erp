import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Select, Space, Tag, message, Typography, Popconfirm, TreeSelect, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BookOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text } = Typography;

const categoryMap: Record<string, { color: string; label: string }> = {
  asset: { color: 'blue', label: '资产' },
  liability: { color: 'red', label: '负债' },
  equity: { color: 'purple', label: '权益' },
  revenue: { color: 'green', label: '收入' },
  expense: { color: 'orange', label: '费用' },
};

const standardOptions = [
  { value: 'small_enterprise', label: '小企业会计准则' },
  { value: 'business', label: '企业会计准则' },
  { value: 'civil_nonprofit', label: '民间非营利组织会计制度' },
];

const entityTypeOptions = [
  { value: 'individual', label: '个体工商户' },
  { value: 'company', label: '有限责任公司' },
  { value: 'partnership', label: '合伙企业' },
  { value: 'sole', label: '个人独资企业' },
];

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [currentBookId, setCurrentBookId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterCategory, setFilterCategory] = useState<string | undefined>();
  const [form] = Form.useForm();
  const [bookForm] = Form.useForm();

  const loadBooks = async () => {
    try {
      const res = await request.get('/accounts/books');
      const list = res.data?.data || res.data || [];
      setBooks(list);
      if (list.length && !currentBookId) {
        setCurrentBookId(list[0].id);
      }
    } catch (e) { console.error(e); }
  };

  const loadAccounts = async () => {
    if (!currentBookId) return;
    setLoading(true);
    try {
      const params: any = { book_id: currentBookId };
      if (filterCategory) params.category = filterCategory;
      const res = await request.get('/accounts', { params });
      setAccounts(res.data?.data || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBooks(); }, []);
  useEffect(() => { if (currentBookId) loadAccounts(); }, [currentBookId, filterCategory]);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: 'asset', direction: 'debit' });
    setModalOpen(true);
  };

  const handleCreateBook = async () => {
    try {
      const values = await bookForm.validateFields();
      const res = await request.post('/accounts/books', values);
      message.success('账套创建成功，已自动初始化会计科目');
      setBookModalOpen(false);
      bookForm.resetFields();
      const newId = res.data?.data?.id;
      await loadBooks();
      if (newId) setCurrentBookId(newId);
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else if (!err.errorFields) message.error('创建失败');
    }
  };

  const handleDeleteBook = async (id: number) => {
    try {
      await request.delete(`/accounts/books/${id}`);
      message.success('账套已停用');
      if (currentBookId === id) setCurrentBookId(undefined);
      await loadBooks();
    } catch (err: any) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      category: record.category,
      parent_id: record.parent_id,
      direction: record.direction,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      values.book_id = currentBookId;
      if (editing) {
        await request.put(`/accounts/${editing.id}`, values);
        message.success('科目更新成功');
      } else {
        await request.post('/accounts', values);
        message.success('科目添加成功');
      }
      setModalOpen(false);
      loadAccounts();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else if (!err.errorFields) message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/accounts/${id}`);
      message.success('科目已删除');
      loadAccounts();
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const categoryValue = Form.useWatch('category', form);
  const treeData = accounts.filter(a => !editing || a.id !== editing.id).map(a => ({
    value: a.id,
    title: `${a.code} ${a.name}`,
  }));

  const currentBook = books.find(b => b.id === currentBookId);

  const columns = [
    { title: '编码', dataIndex: 'code', width: 120, render: (v: string, r: any) => (
      <span style={{ paddingLeft: (r.level - 1) * 16 }}>{v}</span>
    )},
    { title: '科目名称', dataIndex: 'name', width: 200 },
    { title: '类别', dataIndex: 'category', width: 80, render: (v: string) => {
      const c = categoryMap[v] || { color: 'default', label: v };
      return <Tag color={c.color}>{c.label}</Tag>;
    }},
    { title: '余额方向', dataIndex: 'direction', width: 90, render: (v: string) => v === 'debit' ? '借方' : '贷方' },
    { title: '层级', dataIndex: 'level', width: 60 },
    { title: '状态', dataIndex: 'is_enabled', width: 70, render: (v: boolean) => (
      <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '停用'}</Tag>
    )},
    { title: '已用凭证', dataIndex: 'usage_count', width: 80 },
    { title: '操作', key: 'action', width: 100, render: (_: any, record: any) => (
      <Space size="small">
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        {record.child_count === 0 && record.usage_count === 0 && (
          <Popconfirm title="确定删除此科目？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <Title level={4}>会计科目表</Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={12} align="middle">
          <Col>
            <Space>
              <BookOutlined />
              <Text strong>当前账套：</Text>
              <Select
                style={{ minWidth: 200 }}
                value={currentBookId}
                onChange={setCurrentBookId}
                options={books.map(b => ({
                  value: b.id,
                  label: `${b.book_name}（${b.account_count}个科目）`,
                }))}
              />
            </Space>
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space wrap>
              <Select placeholder="类别筛选" allowClear style={{ width: 120 }}
                options={Object.entries(categoryMap).map(([k, v]) => ({ value: k, label: v.label }))}
                value={filterCategory} onChange={v => setFilterCategory(v)}
              />
              <Button icon={<PlusOutlined />} onClick={handleAdd}>新增科目</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { bookForm.resetFields(); setBookModalOpen(true); }}>
                新建账套
              </Button>
              {currentBook && books.length > 1 && (
                <Popconfirm title="确定停用该账套？" onConfirm={() => handleDeleteBook(currentBook.id)}>
                  <Button danger size="small">停用当前账套</Button>
                </Popconfirm>
              )}
            </Space>
          </Col>
        </Row>
        {currentBook && (
          <div style={{ marginTop: 8, color: '#666', fontSize: 12 }}>
            主体：{currentBook.entity_name || '-'} |
            会计准则：{standardOptions.find(s => s.value === currentBook.accounting_standard)?.label || currentBook.accounting_standard} |
            科目数：{currentBook.account_count} | 凭证数：{currentBook.voucher_count}
          </div>
        )}
      </Card>

      <Table columns={columns} dataSource={accounts} rowKey="id" loading={loading} size="small"
        pagination={false} scroll={{ x: 800 }}
      />

      <Modal title={editing ? '编辑科目' : '新增科目'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="code" label="科目编码" rules={[{ required: true, message: '请输入科目编码' }]}>
            <Input placeholder="如：1001 或 1002.01" disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="科目名称" rules={[{ required: true, message: '请输入科目名称' }]}>
            <Input placeholder="如：库存现金" />
          </Form.Item>
          <Form.Item name="category" label="科目类别" rules={[{ required: true }]}>
            <Select options={Object.entries(categoryMap).map(([k, v]) => ({ value: k, label: v.label }))}
              onChange={() => { form.setFieldsValue({ direction: undefined }); }}
            />
          </Form.Item>
          <Form.Item name="direction" label="余额方向">
            <Select allowClear placeholder="自动根据类别判断"
              options={[{ value: 'debit', label: '借方' }, { value: 'credit', label: '贷方' }]}
            />
          </Form.Item>
          <Form.Item name="parent_id" label="上级科目">
            <TreeSelect treeData={treeData} placeholder="无（顶级科目）" allowClear treeDefaultExpandAll />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新建账套" open={bookModalOpen} onOk={handleCreateBook} onCancel={() => setBookModalOpen(false)}
        okText="创建" cancelText="取消">
        <Form form={bookForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="book_name" label="账套名称" rules={[{ required: true, message: '请输入账套名称' }]}>
            <Input placeholder="如：龚集供销社2026账套" />
          </Form.Item>
          <Form.Item name="entity_name" label="经营主体名称">
            <Input placeholder="如：武汉市江岸区宇航智荟电商营业部" />
          </Form.Item>
          <Form.Item name="credit_code" label="统一社会信用代码">
            <Input placeholder="18位信用代码（选填）" />
          </Form.Item>
          <Form.Item name="entity_type" label="主体类型" initialValue="individual">
            <Select options={entityTypeOptions} />
          </Form.Item>
          <Form.Item name="accounting_standard" label="会计准则" initialValue="small_enterprise">
            <Select options={standardOptions} />
          </Form.Item>
          <Form.Item name="fiscal_year_start" label="会计年度起始月份" initialValue={1}>
            <Select options={Array.from({length:12},(_,i)=>({value:i+1,label:`${i+1}月`}))} />
          </Form.Item>
          <Form.Item name="currency" label="本位币" initialValue="CNY">
            <Select options={[{value:'CNY',label:'人民币(CNY)'},{value:'USD',label:'美元(USD)'}]} />
          </Form.Item>
        </Form>
        <div style={{ color: '#999', fontSize: 12 }}>创建后将自动初始化标准会计科目表。</div>
      </Modal>
    </div>
  );
};

export default Accounts;
