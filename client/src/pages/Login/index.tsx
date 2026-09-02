import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import request from '../../api/request';

const { Text } = Typography;

interface TenantOption {
  id: number;
  name: string;
  business_type: string;
}

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // 加载公开帐套列表（无需登录）
    request.get('/auth/tenants').then((res: any) => {
      const list = res.data?.data || res.data || [];
      setTenants(list);
    }).catch(() => {});
  }, []);

  const onFinish = async (values: { username: string; password: string; tenantId?: number }) => {
    setLoading(true);
    try {
      await login(values.username, values.password, values.tenantId);
      message.success('登录成功');
      navigate('/');
    } catch (err: any) {
      message.error(err?.response?.data?.message || err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card className="login-card">
        <div className="login-logo"><img src="/erp-logo.png" alt="ERP" style={{width: 64, height: 64, borderRadius: 12, objectFit: "cover"}} /></div>
        <div className="login-title">宇航智荟 ERP</div>
        <div className="login-subtitle">进销存 · 财务 · AI助手</div>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="tenantId" rules={[{ required: true, message: '请选择帐套' }]}>
            <Select
              prefix={<ShopOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="选择帐套"
              allowClear
              showSearch
              optionFilterProp="children"
              options={tenants.map(t => ({ value: t.id, label: t.name }))}
            />
          </Form.Item>
          <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
            <Input prefix={<UserOutlined style={{ color: '#bfbfbf' }} />} placeholder="账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#bfbfbf' }} />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{ height: 44, fontSize: 16, fontWeight: 600, borderRadius: 8 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>
        <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12 }}>
          请选择对应帐套后登录
        </Text>
      </Card>
    </div>
  );
};

export default Login;
