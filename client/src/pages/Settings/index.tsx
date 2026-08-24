import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, message, Typography, Divider, Row, Col, Tag, Tabs, Table, Space, Modal, Popconfirm, Switch } from 'antd';
import { SaveOutlined, ShopOutlined, DatabaseOutlined, LockOutlined, UserOutlined, TeamOutlined, FileTextOutlined, SettingOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title } = Typography;

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('store');
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tenant, setTenant] = useState<any>(null);

  // 员工相关
  const [users, setUsers] = useState<any[]>([]);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm] = Form.useForm();

  const loadTenant = async () => {
    try {
      // 获取帐套列表，找到当前帐套
      const res = await request.get('/tenants');
      const list = res.data?.data || res.data || [];
      const stored = localStorage.getItem('user');
      const currentTenantId = stored ? JSON.parse(stored).tenantId : null;
      const current = list.find((t: any) => t.id === currentTenantId) || list[0];
      if (current) {
        setTenant(current);
        form.setFieldsValue({
          name: current.name,
          ownerName: current.owner_name,
          phone: current.phone,
          address: current.address,
          businessType: current.business_type,
          businessDesc: current.business_desc,
        });
      }
    } catch (e) { /* ignore */ }
  };

  const loadUsers = async () => {
    try {
      const res = await request.get('/tenants/users');
      setUsers(res.data?.list || res.data || []);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadTenant(); loadUsers(); }, []);

  const handleSaveStore = async () => {
    if (!tenant?.id) { message.error('未找到当前帐套'); return; }
    setLoading(true);
    try {
      const values = await form.validateFields();
      await request.put(`/tenants/${tenant.id}`, values);
      message.success('帐套信息保存成功');
      loadTenant();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
    setLoading(false);
  };

  const handleChangePwd = async () => {
    try {
      const values = await pwdForm.validateFields();
      await request.put('/auth/password', values);
      message.success('密码修改成功');
      pwdForm.resetFields();
    } catch (e: any) {
      message.error(e.response?.data?.message || '修改失败');
    }
  };

  const handleSaveUser = async () => {
    try {
      const values = await userForm.validateFields();
      if (editingUser) {
        await request.put(`/tenants/users/${editingUser.id}`, values);
        message.success('员工信息更新成功');
      } else {
        await request.post('/tenants/users', values);
        message.success('员工添加成功');
      }
      setUserModal(false);
      loadUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '操作失败');
    }
  };

  const roleOptions = [
    { value: 'owner', label: '老板' },
    { value: 'manager', label: '店长' },
    { value: 'cashier', label: '收银员' },
    { value: 'warehouse', label: '仓管' },
  ];

  const roleMap: Record<string, string> = { owner: '老板', manager: '店长', cashier: '收银员', warehouse: '仓管' };
  const statusMap: Record<string, { text: string; color: string }> = {
    active: { text: '启用', color: 'green' },
    disabled: { text: '停用', color: 'default' }
  };

  const userColumns = [
    { title: '姓名', dataIndex: 'real_name', key: 'real_name', render: (v: string) => v || '-' },
    { title: '账号', dataIndex: 'username', key: 'username' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (v: string) => <Tag>{roleMap[v] || v}</Tag> },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text}</Tag>
    },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" onClick={() => { setEditingUser(record); userForm.setFieldsValue(record); setUserModal(true); }}>编辑</Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>系统管理</Title>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* 门店信息 */}
        <Tabs.TabPane tab={<span><ShopOutlined />帐套信息</span>} key="store">
          <Card>
            {tenant && (
              <div style={{ marginBottom: 16 }}>
                <Tag color="blue">当前帐套ID: {tenant.id}</Tag>
                <Text type="secondary">切换帐套请在左侧边栏顶部操作</Text>
              </div>
            )}
            <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
              <Form.Item name="name" label="帐套名称" rules={[{ required: true }]}>
                <Input placeholder="如：宇航蔬果超市" />
              </Form.Item>
              <Form.Item name="ownerName" label="经营者">
                <Input placeholder="经营者姓名" />
              </Form.Item>
              <Form.Item name="phone" label="联系电话">
                <Input placeholder="联系电话" />
              </Form.Item>
              <Form.Item name="address" label="地址">
                <Input placeholder="详细地址" />
              </Form.Item>
              <Form.Item name="businessType" label="行业类型">
                <Select options={[
                  { value: 'retail', label: '🏪 零售门店' },
                  { value: 'supply_coop', label: '🏘️ 农村供销社' },
                  { value: 'market', label: '🥬 菜市场商户' },
                  { value: 'ecommerce', label: '🛒 电商' },
                  { value: 'other', label: '其他' }
                ]} />
              </Form.Item>
              <Form.Item name="businessDesc" label="业务描述">
                <Input.TextArea rows={3} placeholder="描述该帐套的业务范围、特点等" />
              </Form.Item>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveStore} loading={loading}>
                保存设置
              </Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        {/* 员工权限 */}
        <Tabs.TabPane tab={<span><TeamOutlined />员工权限</span>} key="users">
          <Card size="small" style={{ marginBottom: 12 }}>
            <Button type="primary" icon={<UserOutlined />} onClick={() => { setEditingUser(null); userForm.resetFields(); setUserModal(true); }}>
              添加员工
            </Button>
          </Card>
          <Table columns={userColumns} dataSource={users} rowKey="id" pagination={false} size="small" scroll={{ x: 600 }} />
        </Tabs.TabPane>

        {/* 基础设置 */}
        <Tabs.TabPane tab={<span><SettingOutlined />基础设置</span>} key="base">
          <Card>
            <Title level={5}>打印设置</Title>
            <Form layout="vertical" style={{ maxWidth: 500 }}>
              <Form.Item label="小票打印机">
                <Select placeholder="选择打印机（待接入）" disabled options={[{ value: 'default', label: '默认蓝牙打印机' }]} />
              </Form.Item>
              <Divider />
              <Title level={5}>库存设置</Title>
              <Form.Item label="库存预警默认值">
                <Input placeholder="默认库存低于多少时预警" suffix="件" />
              </Form.Item>
              <Divider />
              <Title level={5}>价格设置</Title>
              <Form.Item label="价格精度">
                <Select defaultValue={2} options={[{ value: 0, label: '整数' }, { value: 1, label: '1位小数' }, { value: 2, label: '2位小数' }]} />
              </Form.Item>
            </Form>
            <Text type="secondary">部分设置需要在后续版本中完善</Text>
          </Card>
        </Tabs.TabPane>

        {/* 修改密码 */}
        <Tabs.TabPane tab={<span><LockOutlined />修改密码</span>} key="password">
          <Card>
            <Form form={pwdForm} layout="vertical" style={{ maxWidth: 400 }}>
              <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
                <Input.Password placeholder="当前密码" />
              </Form.Item>
              <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
                <Input.Password placeholder="新密码（至少6位）" />
              </Form.Item>
              <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请确认新密码' }]}>
                <Input.Password placeholder="再输一次新密码" />
              </Form.Item>
              <Button type="primary" icon={<LockOutlined />} onClick={handleChangePwd}>
                修改密码
              </Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        {/* 操作日志 */}
        <Tabs.TabPane tab={<span><FileTextOutlined />操作日志</span>} key="logs">
          <Card>
            <Text type="secondary">操作日志功能将在后续版本中提供，届时将记录所有关键操作（登录、采购、销售、库存变动等）供查询追溯。</Text>
          </Card>
        </Tabs.TabPane>
      </Tabs>

      {/* 员工弹窗 */}
      <Modal title={editingUser ? '编辑员工' : '添加员工'} open={userModal} onOk={handleSaveUser} onCancel={() => setUserModal(false)} destroyOnClose>
        <Form form={userForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="登录账号" rules={[{ required: true }]}>
            <Input placeholder="用于登录的账号名" disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item name="password" label="登录密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}>
              <Input.Password placeholder="初始密码（至少6位）" />
            </Form.Item>
          )}
          <Form.Item name="realName" label="姓名">
            <Input placeholder="员工姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="联系手机" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="cashier">
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings;
