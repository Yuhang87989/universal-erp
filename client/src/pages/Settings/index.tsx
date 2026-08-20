import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, message, Typography, Divider, Row, Col, Tag } from 'antd';
import { SaveOutlined, ShopOutlined, DatabaseOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text } = Typography;

const businessTypeOptions = [
  { value: 'market', label: '菜市场摊位' },
  { value: 'supply_coop', label: '农用供销社' },
  { value: 'ecommerce', label: '电商店铺' },
  { value: 'retail', label: '零售门店' },
  { value: 'other', label: '其他' },
];

const Settings: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<any>({});
  const [user, setUser] = useState<any>({});
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 获取当前用户信息
      const meRes = await request.get('/auth/me');
      const userData = meRes.data;
      setUser(userData);

      // 获取租户信息（从用户信息中取 tenantId）
      const tenantRes = await request.get(`/tenants/${userData.tenantId}`);
      const tenantData = tenantRes.data;
      setTenant(tenantData);
      form.setFieldsValue({
        name: tenantData.name,
        owner_name: tenantData.owner_name,
        phone: tenantData.phone,
        address: tenantData.address,
        business_type: tenantData.business_type,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      await request.put(`/tenants/${user.tenantId}`, values);
      message.success('店铺信息更新成功');
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      const values = await pwdForm.validateFields();
      await request.put('/auth/password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码修改成功');
      pwdForm.resetFields();
    } catch (err: any) {
      if (err.response?.data?.message) message.error(err.response.data.message);
      else message.error('密码修改失败');
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>系统设置</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title={<><ShopOutlined /> 店铺信息</>} loading={loading}>
            <Form form={form} layout="vertical">
              <Form.Item name="name" label="店铺名称" rules={[{ required: true, message: '请输入店铺名称' }]}>
                <Input placeholder="输入店铺/企业名称" />
              </Form.Item>
              <Form.Item name="owner_name" label="经营者">
                <Input placeholder="经营者姓名" />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="phone" label="联系电话">
                    <Input placeholder="联系电话" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="business_type" label="业态类型">
                    <Select options={businessTypeOptions} />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="address" label="地址">
                <Input placeholder="详细地址" />
              </Form.Item>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>保存设置</Button>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title={<><UserOutlined /> 账号信息</>} style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}><Text strong>用户名：</Text><Tag color="blue">{user.username}</Tag></div>
            <div style={{ marginBottom: 8 }}><Text strong>姓名：</Text>{user.realName || '-'}</div>
            <div style={{ marginBottom: 8 }}><Text strong>角色：</Text><Tag color="green">{user.role}</Tag></div>
            <div><Text strong>租户ID：</Text>#{user.tenantId}</div>
          </Card>

          <Card title={<><LockOutlined /> 修改密码</>}>
            <Form form={pwdForm} layout="vertical">
              <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
                <Input.Password placeholder="当前密码" />
              </Form.Item>
              <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '至少6位' }]}>
                <Input.Password placeholder="新密码（至少6位）" />
              </Form.Item>
              <Form.Item name="confirmPassword" label="确认新密码" dependencies={['newPassword']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                      return Promise.reject(new Error('两次密码不一致'));
                    },
                  }),
                ]}>
                <Input.Password placeholder="再次输入新密码" />
              </Form.Item>
              <Button type="primary" icon={<LockOutlined />} onClick={handleChangePassword}>修改密码</Button>
            </Form>
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginTop: 16 }}>
        <Text type="secondary">
          <DatabaseOutlined /> 数据库信息：MySQL 8.0 | 服务器：139.155.129.27 | 数据库：erp_db
        </Text>
      </Card>
    </div>
  );
};

export default Settings;
