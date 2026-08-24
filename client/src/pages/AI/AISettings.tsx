import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, Alert, Space, message, Divider, Tag } from 'antd';
import { KeyOutlined, ApiOutlined, ThunderboltOutlined, CheckCircleFilled, ExclamationCircleFilled } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text, Paragraph } = Typography;

const AISettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<any>(null);

  const load = async () => {
    try {
      const res = await request.get('/ai/config');
      const data = res.data || {};
      setConfig(data);
      form.setFieldsValue({
        api_url: data.api_url || 'https://api.deepseek.com/v1/chat/completions',
        model: data.model || 'deepseek-chat',
        api_key: ''
      });
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const payload: any = {
        api_url: values.api_url,
        model: values.model
      };
      // API Key 留空则不修改
      if (values.api_key && values.api_key.trim()) {
        payload.api_key = values.api_key.trim();
      }
      await request.put('/ai/config', payload);
      message.success('AI配置已保存');
      form.setFieldValue('api_key', '');
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '保存失败');
    }
    setLoading(false);
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      // 先保存再测试，确保最新配置生效
      const values = await form.validateFields();
      const payload: any = { api_url: values.api_url, model: values.model };
      if (values.api_key && values.api_key.trim()) payload.api_key = values.api_key.trim();
      await request.put('/ai/config', payload);
      const res = await request.post('/ai/test');
      message.success(res.message || '连接成功');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || '连接失败，请检查API Key');
    }
    setTesting(false);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <ApiOutlined style={{ color: '#722ed1' }} /> AI接口设置
      </Title>

      {config?.has_api_key ? (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleFilled />}
          message="AI服务已配置"
          description={
            <Space direction="vertical" size={2}>
              <Text>当前Key：<Tag color="green">{config.api_key_preview}</Tag>{config.using_env && <Tag>系统默认</Tag>}</Text>
              <Text type="secondary">模型：{config.model}　接口：{config.api_url}</Text>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          icon={<ExclamationCircleFilled />}
          message="尚未配置API Key"
          description="请前往 platform.deepseek.com 注册并获取API Key，填入下方保存后即可使用AI功能。"
          style={{ marginBottom: 16 }}
        />
      )}

      <Card title="DeepSeek 接口配置" size="small">
        <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
          <Form.Item name="api_url" label="接口地址" rules={[{ required: true, message: '请输入接口地址' }]}>
            <Input prefix={<ApiOutlined />} placeholder="https://api.deepseek.com/v1/chat/completions" />
          </Form.Item>
          <Form.Item name="model" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
            <Input prefix={<ThunderboltOutlined />} placeholder="deepseek-chat" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key"
            tooltip="填写新的Key将覆盖原有配置；留空则不修改。清空请使用下方按钮。">
            <Input.Password prefix={<KeyOutlined />} placeholder="sk-..." autoComplete="new-password" />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={handleSave} loading={loading}>保存配置</Button>
            <Button onClick={handleTest} loading={testing}>测试连接</Button>
          </Space>
        </Form>

        <Divider />

        <Alert
          type="info"
          showIcon
          message="使用说明"
          description={
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>API Key 保存在您的租户配置中，加密存储，不会明文返回前端</li>
              <li>支持随时更换为您自己的DeepSeek账号Key，费用由您的DeepSeek账户承担</li>
              <li>也可更换兼容OpenAI格式的其他接口地址和模型名称</li>
              <li>如服务器已配置系统级Key（环境变量），不填则默认使用系统Key</li>
              <li>获取API Key：<a href="https://platform.deepseek.com" target="_blank" rel="noreferrer">platform.deepseek.com</a></li>
            </ul>
          }
        />
      </Card>
    </div>
  );
};

export default AISettings;
