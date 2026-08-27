import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Input, Space, Modal, Form, Select, InputNumber, message, Tag, Typography, Tabs, Tree, Row, Col } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined } from '@ant-design/icons';
import request from '../../api/request';
import ProductImport from './ProductImport';

const { Title } = Typography;

const Products: React.FC = () => {
  const [activeTab, setActiveTab] = useState('products');

  // 商品相关
  const [products, setProducts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  // 分类相关
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [catForm] = Form.useForm();
  const [catLoading, setCatLoading] = useState(false);

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
      const payload = res.data?.data || res.data || {};
      setProducts(payload.list || payload || []);
      setTotal(payload.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setCatLoading(true);
    try {
      const res = await request.get('/categories');
      setCategories(res.data?.data || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setCatLoading(false);
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

  // 分类操作
  const handleAddCat = () => {
    setEditingCat(null);
    catForm.resetFields();
    setCatModalVisible(true);
  };

  const handleEditCat = (cat: any) => {
    setEditingCat(cat);
    catForm.setFieldsValue({ name: cat.name, parentId: cat.parent_id, sort_order: cat.sort_order });
    setCatModalVisible(true);
  };

  const handleSaveCat = async () => {
    try {
      const values = await catForm.validateFields();
      if (editingCat) {
        await request.put(`/categories/${editingCat.id}`, values);
        message.success('分类更新成功');
      } else {
        await request.post('/categories', values);
        message.success('分类添加成功');
      }
      setCatModalVisible(false);
      loadCategories();
    } catch (err: any) {
      message.error(err.message || '操作失败');
    }
  };

  const handleDeleteCat = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该分类吗？其下子分类也会被删除。',
      onOk: async () => {
        await request.delete(`/categories/${id}`);
        message.success('已删除');
        loadCategories();
      }
    });
  };

  const columns = [
    { title: '商品名称', dataIndex: 'name', width: 140 },
    { title: '分类', dataIndex: 'category_name', width: 80 },
    { title: '条码', dataIndex: 'barcode', width: 110, render: (v: string) => v || '-' },
    { title: '售价', dataIndex: 'sell_price', width: 80, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '成本', dataIndex: 'cost_price', width: 80, render: (v: any) => `¥${Number(v || 0).toFixed(2)}` },
    { title: '库存', dataIndex: 'stock_quantity', width: 80, render: (v: number, r: any) => (
      <Tag color={v <= r.min_stock ? 'red' : 'green'}>{v} {r.unit}</Tag>
    )},
    { title: '操作', width: 100, render: (_: any, record: any) => (
      <Space>
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
      </Space>
    )}
  ];

  const flattenCategories = (items: any[], level = 0): any[] => {
    return items.reduce((acc: any[], item: any) => {
      acc.push({ ...item, label: ' '.repeat(level) + item.name, value: item.id });
      if (item.children?.length) {
        acc.push(...flattenCategories(item.children, level + 1));
      }
      return acc;
    }, []);
  };

  // 将分类树转换为表格数据
  const flattenCatsForTable = (items: any[], level = 0): any[] => {
    return items.reduce((acc: any[], item: any) => {
      acc.push({ ...item, level, key: item.id });
      if (item.children?.length) {
        acc.push(...flattenCatsForTable(item.children, level + 1));
      }
      return acc;
    }, []);
  };

  const catColumns = [
    {
      title: '分类名称', dataIndex: 'name', key: 'name',
      render: (text: string, record: any) => (
        <span style={{ paddingLeft: record.level * 20 }}>{' '.repeat(record.level * 2)}{text}</span>
      )
    },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order', width: 80 },
    {
      title: '操作', key: 'action', width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditCat(record)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteCat(record.id)}>删除</Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>商品管理</Title>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane tab="商品档案" key="products">
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space wrap style={{ width: '100%' }}>
              <Input
                placeholder="搜索商品名/条码"
                prefix={<SearchOutlined />}
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={() => { setPagination({ ...pagination, current: 1 }); loadProducts(); }}
                style={{ width: '100%', maxWidth: 220 }}
                allowClear
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>添加商品</Button>
              <ProductImport onSuccess={loadProducts} />
            </Space>
          </Card>
          <Table
            columns={columns}
            dataSource={products}
            rowKey="id"
            loading={loading}
            scroll={{ x: 700 }}
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
        </Tabs.TabPane>

        <Tabs.TabPane tab="商品分类" key="categories">
          <Card size="small" style={{ marginBottom: 12 }}>
            <Button type="primary" icon={<AppstoreOutlined />} onClick={handleAddCat}>新增分类</Button>
          </Card>
          <Table
            columns={catColumns}
            dataSource={flattenCatsForTable(categories)}
            loading={catLoading}
            pagination={false}
            size="small"
            scroll={{ x: 500 }}
          />
        </Tabs.TabPane>
      </Tabs>

      {/* 商品弹窗 */}
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
          <Row gutter={[16, 0]}>
            <Col xs={8}>
              <Form.Item name="unit" label="单位" initialValue="个">
                <Select style={{ width: '100%' }} options={[
                  { label: '个', value: '个' }, { label: '斤', value: '斤' },
                  { label: '公斤', value: '公斤' }, { label: '箱', value: '箱' },
                  { label: '袋', value: '袋' }, { label: '瓶', value: '瓶' },
                  { label: '包', value: '包' }, { label: '份', value: '份' }
                ]} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="costPrice" label="成本价">
                <InputNumber min={0} precision={2} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item name="sellPrice" label="售价" rules={[{ required: true, message: '请输入售价' }]}>
                <InputNumber min={0} precision={2} placeholder="0.00" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="minStock" label="库存预警值">
            <InputNumber min={0} placeholder="低于此值时提醒补货" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 分类弹窗 */}
      <Modal
        title={editingCat ? '编辑分类' : '新增分类'}
        open={catModalVisible}
        onOk={handleSaveCat}
        onCancel={() => setCatModalVisible(false)}
      >
        <Form form={catForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="如：蔬菜" />
          </Form.Item>
          <Form.Item name="parentId" label="上级分类">
            <Select placeholder="无（顶级分类）" options={flattenCategories(categories)} allowClear />
          </Form.Item>
          <Form.Item name="sort_order" label="排序" initialValue={0}>
            <InputNumber min={0} placeholder="数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Products;
