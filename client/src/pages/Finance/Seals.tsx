import React, { useState, useEffect } from 'react';
import { Card, Button, Modal, Form, Input, Switch, Space, Tag, message, Typography, Row, Col, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined, SafetyCertificateOutlined, EditOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text } = Typography;

const sealTypeMap: Record<string, string> = {
  company: '公章',
  financial: '财务专用章',
  legal_rep: '法定代表人名章',
  contract: '合同专用章',
  invoice: '发票专用章',
  custom: '自定义',
};

const sealIcons: Record<string, string> = {
  company: '🔴',
  financial: '🔷',
  legal_rep: '🟠',
  contract: '🔵',
  invoice: '🟢',
  custom: '⚪',
};

const SealManagement: React.FC = () => {
  const [seals, setSeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const loadSeals = async () => {
    setLoading(true);
    try {
      const res = await request.get('/seals');
      setSeals(res.data?.data || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSeals(); }, []);

  const handleAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ seal_type: 'company', is_filed: false });
    setModalOpen(true);
  };

  const handleEdit = (seal: any) => {
    setEditing(seal);
    form.setFieldsValue({
      seal_type: seal.seal_type,
      seal_name: seal.seal_name,
      seal_code: seal.seal_code,
      is_filed: seal.is_filed,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (editing) {
        await request.put(`/seals/${editing.id}`, values);
        message.success('印章更新成功');
      } else {
        await request.post('/seals', values);
        message.success('印章添加成功');
      }
      setModalOpen(false);
      loadSeals();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else if (!err.errorFields) message.error('操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/seals/${id}`);
      message.success('印章已删除');
      loadSeals();
    } catch (err: any) {
      message.error(err.response?.data?.message || '删除失败');
    }
  };

  const sealType = Form.useWatch('seal_type', form);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>印章管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增印章</Button>
      </div>

      <Row gutter={[16, 16]}>
        {seals.map(seal => (
          <Col xs={24} sm={12} md={8} key={seal.id}>
            <Card
              hoverable
              actions={[
                <Tooltip title="编辑" key="edit"><EditOutlined onClick={() => handleEdit(seal)} /></Tooltip>,
                seal.usage_count === 0 ? (
                  <Tooltip title="删除" key="delete">
                    <Popconfirm title="确定删除此印章？" onConfirm={() => handleDelete(seal.id)}>
                      <DeleteOutlined style={{ color: '#ff4d4f' }} />
                    </Popconfirm>
                  </Tooltip>
                ) : (
                  <Tooltip title="已被凭证引用，无法删除" key="delete">
                    <DeleteOutlined style={{ color: '#d9d9d9', cursor: 'not-allowed' }} />
                  </Tooltip>
                ),
              ]}
            >
              <Card.Meta
                avatar={
                  <div style={{ fontSize: 36, lineHeight: '48px' }}>
                    {sealIcons[seal.seal_type] || sealIcons.custom}
                  </div>
                }
                title={
                  <span>
                    <Tag color="default">{sealTypeMap[seal.seal_type] || seal.seal_type}</Tag>
                    {seal.is_filed && (
                      <Tag color="green" icon={<SafetyCertificateOutlined />}>已备案</Tag>
                    )}
                  </span>
                }
                description={
                  <div>
                    <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>
                      {seal.seal_name}
                    </Text>
                    {seal.seal_code && (
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>备案编号：</Text>
                        <Text code style={{ fontSize: 12, color: '#cf1322' }}>{seal.seal_code}</Text>
                      </div>
                    )}
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>已使用 {seal.usage_count || 0} 次</Text>
                    </div>
                  </div>
                }
              />
            </Card>
          </Col>
        ))}

        {seals.length === 0 && !loading && (
          <Col span={24}>
            <Card>
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无印章，点击右上角添加
              </div>
            </Card>
          </Col>
        )}
      </Row>

      <Modal title={editing ? '编辑印章' : '新增印章'} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="seal_type" label="印章类型" rules={[{ required: true }]}>
            <Select options={Object.entries(sealTypeMap).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="seal_name" label="印章名称" rules={[{ required: true, message: '请输入印章名称' }]}>
            <Input placeholder="如：武汉市江岸区宇航智荟电商营业部" />
          </Form.Item>
          <Form.Item name="seal_code" label="公安备案编号">
            <Input placeholder="如有请填写，如：42010210450802" />
          </Form.Item>
          <Form.Item name="is_filed" label="是否已备案" valuePropName="checked">
            <Switch checkedChildren="已备案" unCheckedChildren="未备案" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SealManagement;
