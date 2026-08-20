import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Input, Space, Modal, Form, Select, InputNumber, message, Tag, Typography } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Products: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [pagination.current, pagination.pageSize]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await request.get('/products', {
        params: { page: pagination.current, pageSize: pagination.pageSize, keyword }
      });
      setProducts(res.data.list);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await request.get('/categories');
      setCategories(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = () => {
    setEditingProduct(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingProduct(record);
    form.setFieldsValue({
      name: record.name,
      categoryId: record.category_id,
      barcode: record.barcode,
      unit: record.unit,
      costPrice: record.cost_price,
      sellPrice: record.sell_price,
      minStock: record.min_stock
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingProduct) {
        await request.put(`/products/${editingProduct.id}`, values);
        message.success('商品更新成功');
      } else {
        await request.post('/products', values);
        message.success('商品添加成功');
      }
      setModalVisible(false);
      loadProducts();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该商品吗？',
      onOk: async () => {
        await request.delete(`/products/${id}`);
        message.success('已删除');
        loadProducts();
      }
    });
  };

  const columns = [
    { title: '商品名称', dataIndex: 'name', width: 160 },
    { title: '分类', dataIndex: 'category_name', width: 80 },
    { title: '条码', dataIndex: 'barcode', width: 120 },
    { title: '售价', dataIndex: 'sell_price', width: 80, render: (v: number) => `¥${v?.toFixed(2)}` },
    { title: '成本', dataIndex: 'cost_price', width: 80, render: (v: number) => `¥${v?.toFixed(2)}` },
    { title: '库存', dataIndex: 'stock_quantity', width: 80, render: (v: number, r: any) => (
      <Tag color={v <= r.min_stock ? 'red' : 'green'}>{v} {r.unit}</Tag>
    )},
    { title: '操作', width: 120, render: (_: any, record: any) => (
      <Space>
        <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
      </Space>
    )}
  ];

  // 扁平化分类树
  const flattenCategories = (items: any[], level = 0): any[] => {
    return items.reduce((acc: any[], item: any) => {
      acc.push({ ...item, label: ' '.repeat(level) + item.name, value: item.id });
      if (item.children?.length) {
        acc.push(...flattenCategories(item.children, level + 1));
      }
      return acc;
    }, []);
  };

  return (
    <div>
      <Title level={4}>商品管理</Title>
      <Card>
        <Space style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索商品名/条码"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={() => { setPagination({ ...pagination, current: 1 }); loadProducts(); }}
            style={{ width: 240 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加商品</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={products}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 个商品`
          }}
          onChange={p => setPagination({ current: p.current || 1, pageSize: p.pageSize || 20 })}
          size="small"
        />
      </Card>

      <Modal
        title={editingProduct ? '编辑商品' : '添加商品'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={500}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="商品名称" rules={[{ required: true, message: '请输入商品名称' }]}>
            <Input placeholder="如：大白菜" />
          </Form.Item>
          <Form.Item name="categoryId" label="分类">
            <Select placeholder="选择分类" options={flattenCategories(categories)} allowClear />
          </Form.Item>
          <Form.Item name="barcode" label="条形码">
            <Input placeholder="扫码或手动输入" />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="unit" label="单位" initialValue="个">
              <Select style={{ width: 100 }} options={[
                { label: '个', value: '个' }, { label: '斤', value: '斤' },
                { label: '公斤', value: '公斤' }, { label: '箱', value: '箱' },
                { label: '袋', value: '袋' }, { label: '瓶', value: '瓶' },
                { label: '包', value: '包' }, { label: '份', value: '份' }
              ]} />
            </Form.Item>
            <Form.Item name="costPrice" label="成本价">
              <InputNumber min={0} precision={2} placeholder="0.00" />
            </Form.Item>
            <Form.Item name="sellPrice" label="售价" rules={[{ required: true, message: '请输入售价' }]}>
              <InputNumber min={0} precision={2} placeholder="0.00" />
            </Form.Item>
          </Space>
          <Form.Item name="minStock" label="库存预警值">
            <InputNumber min={0} placeholder="低于此值时提醒补货" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Products;
