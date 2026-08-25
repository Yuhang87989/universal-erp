import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Modal, Form, Input, Switch, Select, Tag, message, Typography, Row, Col, Popconfirm, Tooltip, Upload, Badge } from 'antd';
import { PlusOutlined, DeleteOutlined, SafetyCertificateOutlined, EditOutlined, InboxOutlined, EyeOutlined, AuditOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import request from '../../api/request';

const { Title, Text } = Typography;

const sealTypeMap: Record<string, string> = {
  company: '公章',
  financial: '财务专用章',
  legal_rep: '法定代表人名章',
  contract: '合同专用章',
  invoice: '发票专用章',
  custom: '自定义印章',
};

const sealTypeColors: Record<string, string> = {
  company: '#c41e1e',
  financial: '#1a5fb4',
  legal_rep: '#c41e1e',
  contract: '#b8860b',
  invoice: '#2d8a4e',
  custom: '#555',
};

interface Seal {
  id: number;
  book_id: number;
  seal_type: string;
  seal_name: string;
  seal_code?: string;
  image_url?: string;
  is_filed: number | boolean;
  is_active: number | boolean;
  usage_count?: number;
}

const SealManagement: React.FC = () => {
  const [seals, setSeals] = useState<Seal[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Seal | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();
  const imageUrlRef = useRef<string>('');

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
    imageUrlRef.current = '';
    form.resetFields();
    form.setFieldsValue({ seal_type: 'company', is_filed: false });
    setModalOpen(true);
  };

  const handleEdit = (seal: Seal) => {
    setEditing(seal);
    imageUrlRef.current = seal.image_url || '';
    form.setFieldsValue({
      seal_type: seal.seal_type,
      seal_name: seal.seal_name,
      seal_code: seal.seal_code,
      is_filed: !!seal.is_filed,
    });
    setModalOpen(true);
  };

  // 自定义上传：把文件二进制PUT/POST到后端
  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: 'image/png,image/jpeg,image/webp',
    showUploadList: false,
    beforeUpload: async (file) => {
      const isImage = file.type.startsWith('image/');
      if (!isImage) { message.error('只能上传图片文件'); return Upload.LIST_IGNORE; }
      const isLt5M = file.size / 1024 / 1024 < 5;
      if (!isLt5M) { message.error('图片不能超过5MB'); return Upload.LIST_IGNORE; }

      setUploading(true);
      try {
        // 读取文件为ArrayBuffer
        const buf = await file.arrayBuffer();
        const res = await request.post('/seals/upload', buf, {
          headers: { 'Content-Type': file.type },
        });
        const url = res.data?.data?.url;
        if (url) {
          imageUrlRef.current = url;
          form.setFieldsValue({ image_url: url });
          message.success('图片上传成功');
        }
      } catch (err: any) {
        message.error('上传失败: ' + (err.message || ''));
      } finally {
        setUploading(false);
      }
      return false; // 阻止antd默认上传
    },
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        image_url: imageUrlRef.current || values.image_url || null,
      };
      if (editing) {
        await request.put(`/seals/${editing.id}`, payload);
        message.success('印章更新成功');
      } else {
        await request.post('/seals', payload);
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

  // 一键盖章到账套所有凭证
  const handleBatchStamp = async (seal: Seal) => {
    try {
      const res = await request.post(`/seals/${seal.id}/batch-stamp`);
      const data = res.data?.data || res.data;
      message.success(res.data?.message || `已盖章到 ${data?.stamped || 0} 张凭证`);
      loadSeals();
    } catch (err: any) {
      message.error(err.response?.data?.message || '批量盖章失败');
    }
  };

  // 印章图片URL（兼容相对路径）
  const sealImageSrc = (url?: string) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return url; // 相对路径，nginx会代理或vite dev proxy
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ color: '#c41e1e', marginRight: 8 }} />
          印章管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增印章</Button>
      </div>

      <Row gutter={[20, 20]}>
        {seals.map(seal => {
          const imgSrc = sealImageSrc(seal.image_url);
          return (
            <Col xs={24} sm={12} md={8} lg={6} key={seal.id}>
              <Card
                hoverable
                loading={loading}
                style={{ borderRadius: 12, overflow: 'hidden' }}
                bodyStyle={{ padding: 0 }}
                cover={
                  <div style={{
                    background: imgSrc ? '#fafafa' : 'linear-gradient(180deg, #fff5f5 0%, #fff 100%)',
                    height: 200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: imgSrc ? 'pointer' : 'default',
                  }}
                    onClick={() => imgSrc && setPreviewUrl(imgSrc)}
                  >
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={seal.seal_name}
                        style={{ maxWidth: '85%', maxHeight: 180, objectFit: 'contain', filter: 'drop-shadow(0 2px 8px rgba(196,30,30,0.15))' }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#bfbfbf' }}>
                        <SafetyCertificateOutlined style={{ fontSize: 48, display: 'block', marginBottom: 8 }} />
                        <Text type="secondary" style={{ fontSize: 13 }}>待上传印章图片</Text>
                      </div>
                    )}
                    {seal.is_filed && (
                      <Tag color="green" icon={<SafetyCertificateOutlined />}
                        style={{ position: 'absolute', top: 8, right: 8, margin: 0, fontSize: 11 }}>
                        已备案
                      </Tag>
                    )}
                    {imgSrc && (
                      <Tooltip title="点击预览">
                        <EyeOutlined style={{ position: 'absolute', bottom: 8, right: 8, color: '#999', fontSize: 16 }} />
                      </Tooltip>
                    )}
                  </div>
                }
                actions={[
                  <Tooltip title="编辑/上传图片" key="edit"><EditOutlined onClick={() => handleEdit(seal)} /></Tooltip>,
                  <Popconfirm
                    key="stamp"
                    title="一键盖章"
                    description="将此印章盖到当前账套所有凭证上？"
                    onConfirm={() => handleBatchStamp(seal)}
                    okText="盖章"
                    cancelText="取消"
                  >
                    <Tooltip title="一键盖章到所有凭证">
                      <AuditOutlined style={{ color: '#c41e1e' }} />
                    </Tooltip>
                  </Popconfirm>,
                  (seal.usage_count === 0) ? (
                    <Tooltip title="删除" key="delete">
                      <Popconfirm title="确定删除此印章？" onConfirm={() => handleDelete(seal.id)}>
                        <DeleteOutlined style={{ color: '#ff4d4f' }} />
                      </Popconfirm>
                    </Tooltip>
                  ) : (
                    <Tooltip title={`已被凭证引用${seal.usage_count}次`} key="delete">
                      <DeleteOutlined style={{ color: '#d9d9d9', cursor: 'not-allowed' }} />
                    </Tooltip>
                  ),
                ]}
              >
                <div style={{ padding: '12px 16px 16px', textAlign: 'center' }}>
                  <Badge color={sealTypeColors[seal.seal_type] || '#999'}
                    text={<Text strong style={{ fontSize: 14 }}>{sealTypeMap[seal.seal_type] || seal.seal_type}</Text>} />
                  <div style={{ marginTop: 6, fontWeight: 500, color: '#333' }}>
                    {seal.seal_name}
                  </div>
                  {seal.seal_code && (
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>备案号：</Text>
                      <Text code style={{ fontSize: 11, color: '#c41e1e', background: '#fff1f0', padding: '0 4px' }}>
                        {seal.seal_code}
                      </Text>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          );
        })}

        {seals.length === 0 && !loading && (
          <Col span={24}>
            <Card>
              <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                <SafetyCertificateOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                <div>暂无印章，点击右上角添加并上传实际印章图片</div>
              </div>
            </Card>
          </Col>
        )}
      </Row>

      <Modal
        title={editing ? '编辑印章' : '新增印章'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="seal_type" label="印章类型" rules={[{ required: true }]}>
            <Select options={Object.entries(sealTypeMap).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="seal_name" label="印章名称/单位名称"
            rules={[{ required: true, message: '请输入印章名称' }]}
            tooltip="公章请填写单位全称，如：武汉市江岸区宇航智荟电商营业部；法人章填写姓名">
            <Input placeholder="如：龚集供销社" />
          </Form.Item>
          <Form.Item name="seal_code" label="公安备案编号">
            <Input placeholder="如有请填写，如：42010210450802" />
          </Form.Item>

          {/* 图片上传区 */}
          <Form.Item label="印章图片" name="image_url">
            <Upload.Dragger {...uploadProps} style={{ padding: 16 }}>
              {imageUrlRef.current ? (
                <div style={{ textAlign: 'center' }}>
                  <img src={imageUrlRef.current} alt="印章预览" style={{ maxHeight: 100, marginBottom: 8 }} />
                  <div style={{ fontSize: 12, color: '#1677ff' }}>点击或拖拽更换图片</div>
                </div>
              ) : (
                <>
                  <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                  <p className="ant-upload-text" style={{ fontSize: 13 }}>
                    {uploading ? '上传中...' : '点击或拖拽上传实际印章图片'}
                  </p>
                  <p className="ant-upload-hint" style={{ fontSize: 11 }}>
                    支持 PNG/JPG/WEBP，不超过5MB。没有实际印章可留空。
                  </p>
                </>
              )}
            </Upload.Dragger>
          </Form.Item>

          <Form.Item name="is_filed" label="是否已备案" valuePropName="checked">
            <Switch checkedChildren="已备案" unCheckedChildren="未备案" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 图片预览弹窗 */}
      <Modal open={!!previewUrl} onCancel={() => setPreviewUrl(null)} footer={null} width={600} closable>
        {previewUrl && (
          <img src={previewUrl} alt="印章预览" style={{ width: '100%' }} />
        )}
      </Modal>
    </div>
  );
};

export default SealManagement;
