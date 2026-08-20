import React, { useState, useEffect } from 'react';
import { Card, Tree, Button, Modal, Form, Input, InputNumber, message, Space, Typography, Empty } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    try {
      const res = await request.get('/categories');
      setCategories(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = (parentId?: number) => {
    setEditingCat(null);
    form.resetFields();
    if (parentId) form.setFieldsValue({ parentId });
    setModalVisible(true);
  };

  const handleEdit = (cat: any) => {
    setEditingCat(cat);
    form.setFieldsValue({ name: cat.name, parentId: cat.parent_id, sortOrder: cat.sort_order });
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editingCat) {
        await request.put(`/categories/${editingCat.id}`, values);
        message.success('分类更新成功');
      } else {
        await request.post('/categories', values);
        message.success('分类添加成功');
      }
      setModalVisible(false);
      loadCategories();
    } catch (err: any) {
      if (err.message) message.error(err.message);
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后不可恢复，确定删除？',
      onOk: async () => {
        try {
          await request.delete(`/categories/${id}`);
          message.success('已删除');
          loadCategories();
        } catch (err: any) {
          message.error(err.message);
        }
      }
    });
  };

  const renderTree = (items: any[]) => {
    if (!items.length) return <Empty description="暂无分类，点击上方添加" />;
    return (
      <div>
        {items.map((item: any) => (
          <div key={item.id}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span style={{ flex: 1, fontWeight: 500 }}>{item.name}</span>
              <Space>
                <Button type="link" size="small" onClick={() => handleAdd(item.id)}>添加子分类</Button>
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(item)} />
                <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} />
              </Space>
            </div>
            {item.children?.length > 0 && (
              <div style={{ paddingLeft: 24 }}>
                {renderTree(item.children)}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <Title level={4}>商品分类</Title>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd()}>添加顶级分类</Button>
        </div>
        {renderTree(categories)}
      </Card>

      <Modal
        title={editingCat ? '编辑分类' : '添加分类'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="分类名称" rules={[{ required: true, message: '请输入分类名称' }]}>
            <Input placeholder="如：蔬菜、水果" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" initialValue={0}>
            <InputNumber min={0} placeholder="数字越小越靠前" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Categories;
