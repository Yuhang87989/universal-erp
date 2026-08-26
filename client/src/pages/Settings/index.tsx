import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Select, message, Typography, Divider, Row, Col, Tag, Tabs, Table, Space, Modal, Popconfirm, Tree, Checkbox, Tooltip, Alert } from 'antd';
import { SaveOutlined, ShopOutlined, DatabaseOutlined, LockOutlined, UserOutlined, TeamOutlined, FileTextOutlined, SettingOutlined, CloudSyncOutlined, ReloadOutlined, CheckCircleOutlined, ExclamationCircleOutlined, SafetyOutlined, PlusCircleOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text } = Typography;

const roleOptions = [
  { value: 'owner', label: '老板（全部权限）' },
  { value: 'manager', label: '店长（业务+财务+数据）' },
  { value: 'accountant', label: '会计（财务模块）' },
  { value: 'cashier', label: '收银员（销售+收支）' },
  { value: 'warehouse', label: '仓管（仓库+库存）' },
];

const roleMap: Record<string, { text: string; color: string }> = {
  owner: { text: '老板', color: 'red' },
  manager: { text: '店长', color: 'blue' },
  accountant: { text: '会计', color: 'purple' },
  cashier: { text: '收银员', color: 'green' },
  warehouse: { text: '仓管', color: 'orange' },
};

const statusMap: Record<string, { text: string; color: string }> = {
  active: { text: '启用', color: 'green' },
  disabled: { text: '停用', color: 'default' },
};

// 权限树配置
const permTreeData = [
  {
    title: '业务管理', key: 'grp-biz', disableCheckbox: true, children: [
      { title: '工作台', key: 'dashboard' },
      { title: '采购管理', key: 'purchase', children: [
        { title: '采购订单', key: 'purchase:order' },
        { title: '供应商管理', key: 'purchase:suppliers' },
      ]},
      { title: '销售管理', key: 'sales', children: [
        { title: '销售订单', key: 'sales:order' },
        { title: 'POS收银', key: 'sales:pos' },
      ]},
    ]
  },
  {
    title: '仓库管理', key: 'grp-wh', disableCheckbox: true, children: [
      { title: '仓库设置', key: 'warehouse:warehouses' },
      { title: '库存查询', key: 'warehouse:inventory' },
      { title: '入库管理', key: 'warehouse:stock-in' },
      { title: '出库管理', key: 'warehouse:stock-out' },
      { title: '库存调拨', key: 'warehouse:transfers' },
      { title: '库存盘点', key: 'warehouse:stocktake' },
      { title: '预警中心', key: 'warehouse:alerts' },
    ]
  },
  {
    title: '财务管理', key: 'grp-fin', disableCheckbox: true, children: [
      { title: '收支管理', key: 'finance:records' },
      { title: '记账凭证', key: 'finance:vouchers' },
      { title: '会计科目', key: 'finance:accounts' },
      { title: '试算平衡', key: 'finance:trial-balance' },
      { title: '印章管理', key: 'finance:seals' },
      { title: '支付渠道', key: 'finance:payment' },
    ]
  },
  {
    title: '数据分析', key: 'grp-an', disableCheckbox: true, children: [
      { title: '数据分析中心', key: 'analytics:overview' },
      { title: '数据报表', key: 'analytics:reports' },
    ]
  },
  { title: 'AI智能中心', key: 'ai' },
  {
    title: '基础数据', key: 'grp-data', disableCheckbox: true, children: [
      { title: '商品管理', key: 'data:products' },
      { title: '往来单位', key: 'data:customers' },
      { title: '电商管理', key: 'data:ecommerce' },
    ]
  },
  { title: '系统管理', key: 'system' },
];

// 提取所有叶子权限key（不含group和父节点）
const getAllLeafKeys = (nodes: any[]): string[] => {
  let keys: string[] = [];
  for (const n of nodes) {
    if (n.disableCheckbox) {
      keys = keys.concat(getAllLeafKeys(n.children || []));
    } else if (n.children) {
      keys.push(n.key);
      keys = keys.concat(getAllLeafKeys(n.children));
    } else {
      keys.push(n.key);
    }
  }
  return keys;
};

const ALL_PERMS = getAllLeafKeys(permTreeData);

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('store');
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tenant, setTenant] = useState<any>(null);

  const [users, setUsers] = useState<any[]>([]);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm] = Form.useForm();

  // 权限弹窗
  const [permModal, setPermModal] = useState(false);
  const [permUser, setPermUser] = useState<any>(null);
  const [checkedPerms, setCheckedPerms] = useState<string[]>([]);
  const [savingPerm, setSavingPerm] = useState(false);

  const [sysInfo, setSysInfo] = useState<any>(null);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [dbCheck, setDbCheck] = useState<any>(null);
  const [newTenantModal, setNewTenantModal] = useState(false);
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [newTenantForm] = Form.useForm();

  const loadSysInfo = async () => {
    try { const res = await request.get('/system/info'); setSysInfo(res.data?.data || res.data); } catch {}
  };
  const checkUpdate = async () => {
    try { const res = await request.get('/system/check'); setUpdateInfo(res.data?.data || res.data); }
    catch (e: any) { message.error('检查更新失败: ' + (e.response?.data?.message || e.message)); }
  };
  const doUpdate = async () => {
    setUpdating(true);
    try { await request.post('/system/update'); message.success('更新完成，服务将重启'); setTimeout(() => window.location.reload(), 3000); }
    catch (e: any) { message.error(e.response?.data?.message || '更新失败'); }
    finally { setUpdating(false); }
  };
  const loadDbCheck = async () => {
    try { const res = await request.get('/system/db-check'); setDbCheck(res.data?.data || res.data); } catch {}
  };
  const handleCreateTenant = async () => {
    try {
      const values = await newTenantForm.validateFields();
      setCreatingTenant(true);
      const res = await request.post('/tenants', values);
      message.success(res.data?.message || '帐套创建成功！管理员: admin / admin123');
      setNewTenantModal(false);
      newTenantForm.resetFields();
      loadTenant();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || '创建失败');
    } finally { setCreatingTenant(false); }
  };

  const loadTenant = async () => {
    try {
      const res = await request.get('/tenants');
      const list = res.data?.data || res.data || [];
      const stored = localStorage.getItem('user');
      const currentTenantId = stored ? JSON.parse(stored).tenantId : null;
      const current = list.find((t: any) => t.id === currentTenantId) || list[0];
      if (current) {
        setTenant(current);
        form.setFieldsValue({ name: current.name, ownerName: current.owner_name, phone: current.phone, address: current.address, businessType: current.business_type, businessDesc: current.business_desc });
      }
    } catch {}
  };

  const loadUsers = async () => {
    try {
      const res = await request.get('/tenants/users');
      const ud = res.data?.data || res.data || {};
      setUsers(ud.list || ud || []);
    } catch {}
  };

  useEffect(() => { loadTenant(); loadUsers(); loadSysInfo(); }, []);

  const handleSaveStore = async () => {
    if (!tenant?.id) { message.error('未找到当前帐套'); return; }
    setLoading(true);
    try {
      const values = await form.validateFields();
      await request.put(`/tenants/${tenant.id}`, values);
      message.success('帐套信息保存成功');
      loadTenant();
    } catch (e: any) { message.error(e.response?.data?.message || '保存失败'); }
    setLoading(false);
  };

  const handleChangePwd = async () => {
    try {
      const values = await pwdForm.validateFields();
      await request.put('/auth/password', values);
      message.success('密码修改成功');
      pwdForm.resetFields();
    } catch (e: any) { message.error(e.response?.data?.message || '修改失败'); }
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
    } catch (e: any) { message.error(e.response?.data?.message || '操作失败'); }
  };

  // 打开权限弹窗
  const openPermModal = async (user: any) => {
    setPermUser(user);
    setPermModal(true);
    try {
      const res = await request.get(`/permissions/user/${user.id}`);
      const data = res.data?.data || res.data;
      const perms = data.effective_permissions;
      if (perms === null) {
        // owner全部
        setCheckedPerms(ALL_PERMS);
      } else {
        // 把父模块权限展开到子节点（Tree需要leaf keys）
        const expanded: string[] = [];
        for (const p of perms) {
          if (p.includes(':')) {
            expanded.push(p);
          } else {
            // 父模块key，找出所有以 p: 开头的子权限
            for (const leaf of ALL_PERMS) {
              if (leaf === p || leaf.startsWith(p + ':')) expanded.push(leaf);
            }
          }
        }
        setCheckedPerms([...new Set(expanded)]);
      }
    } catch (e: any) {
      message.error('获取权限失败');
      setCheckedPerms([]);
    }
  };

  // 保存权限
  const handleSavePerm = async () => {
    if (!permUser) return;
    setSavingPerm(true);
    try {
      // 从checked keys中提取实际权限key（去掉grp-开头的分组节点）
      const perms = checkedPerms.filter(k => !k.startsWith('grp-'));
      await request.put(`/permissions/user/${permUser.id}`, {
        role: permUser.role,
        permissions: perms,
      });
      message.success('权限保存成功');
      setPermModal(false);
      loadUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    } finally {
      setSavingPerm(false);
    }
  };

  // 重置为角色默认
  const handleResetPerm = async () => {
    if (!permUser) return;
    try {
      await request.post(`/permissions/user/${permUser.id}/reset`);
      message.success('已重置为角色默认权限');
      setPermModal(false);
      loadUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '重置失败');
    }
  };

  // 删除/禁用员工
  const handleDeleteUser = async (user: any) => {
    try {
      await request.delete(`/tenants/users/${user.id}`);
      message.success('员工已删除');
      loadUsers();
    } catch (e: any) {
      message.error(e.response?.data?.message || '删除失败');
    }
  };

  const userColumns = [
    { title: '姓名', dataIndex: 'real_name', key: 'real_name', render: (v: string) => v || '-' },
    { title: '账号', dataIndex: 'username', key: 'username' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (v: string) => <Tag color={roleMap[v]?.color}>{roleMap[v]?.text || v}</Tag> },
    { title: '电话', dataIndex: 'phone', key: 'phone', render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={statusMap[v]?.color}>{statusMap[v]?.text}</Tag> },
    {
      title: '操作', key: 'action', width: 200, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => { setEditingUser(record); userForm.setFieldsValue(record); setUserModal(true); }}>编辑</Button>
          {record.role !== 'owner' && (
            <Button type="link" size="small" icon={<SafetyOutlined />} onClick={() => openPermModal(record)}>权限</Button>
          )}
          {record.role !== 'owner' && (
            <Popconfirm title="确定删除该员工？" onConfirm={() => handleDeleteUser(record)} okText="删除" cancelText="取消">
              <Button type="link" size="small" danger>删除</Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>系统管理</Title>

      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane tab={<span><ShopOutlined />帐套信息</span>} key="store">
          <Card>
            {tenant && (
              <div style={{ marginBottom: 16 }}>
                <Tag color="blue">当前帐套ID: {tenant.id}</Tag>
                <Text type="secondary">切换帐套请在左侧边栏顶部操作</Text>
              </div>
            )}
            <Button type="primary" ghost icon={<PlusCircleOutlined />} onClick={() => { newTenantForm.resetFields(); setNewTenantModal(true); }} style={{ marginBottom: 16 }}>
              新建帐套
            </Button>
            <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
              <Form.Item name="name" label="帐套名称" rules={[{ required: true }]}><Input placeholder="如：宇航智荟电商营业部" /></Form.Item>
              <Form.Item name="ownerName" label="经营者"><Input placeholder="经营者姓名" /></Form.Item>
              <Form.Item name="phone" label="联系电话"><Input placeholder="联系电话" /></Form.Item>
              <Form.Item name="address" label="地址"><Input placeholder="详细地址" /></Form.Item>
              <Form.Item name="businessType" label="行业类型">
                <Select options={[
                  { value: 'retail', label: '🏪 零售门店' },
                  { value: 'supply_coop', label: '🏘️ 农村供销社' },
                  { value: 'market', label: '🥬 菜市场商户' },
                  { value: 'ecommerce', label: '🛒 电商' },
                  { value: 'other', label: '其他' }
                ]} />
              </Form.Item>
              <Form.Item name="businessDesc" label="业务描述"><Input.TextArea rows={3} placeholder="描述该帐套的业务范围" /></Form.Item>
              <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveStore} loading={loading}>保存设置</Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><TeamOutlined />员工权限</span>} key="users">
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space>
              <Button type="primary" icon={<UserOutlined />} onClick={() => { setEditingUser(null); userForm.resetFields(); setUserModal(true); }}>添加员工</Button>
              <Text type="secondary" style={{ fontSize: 12 }}>点击"权限"按钮可为每个员工单独设置可访问的模块</Text>
            </Space>
          </Card>
          <Table columns={userColumns} dataSource={users} rowKey="id" pagination={false} size="small" scroll={{ x: 600 }} />
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><SettingOutlined />基础设置</span>} key="base">
          <Card>
            <Title level={5}>打印设置</Title>
            <Form layout="vertical" style={{ maxWidth: 500 }}>
              <Form.Item label="小票打印机"><Select placeholder="选择打印机（待接入）" disabled options={[{ value: 'default', label: '默认蓝牙打印机' }]} /></Form.Item>
              <Divider /><Title level={5}>库存设置</Title>
              <Form.Item label="库存预警默认值"><Input placeholder="默认库存低于多少时预警" suffix="件" /></Form.Item>
              <Divider /><Title level={5}>价格设置</Title>
              <Form.Item label="价格精度"><Select defaultValue={2} options={[{ value: 0, label: '整数' }, { value: 1, label: '1位小数' }, { value: 2, label: '2位小数' }]} /></Form.Item>
            </Form>
            <Text type="secondary">部分设置将在后续版本中完善</Text>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><LockOutlined />修改密码</span>} key="password">
          <Card>
            <Form form={pwdForm} layout="vertical" style={{ maxWidth: 400 }}>
              <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}><Input.Password placeholder="当前密码" /></Form.Item>
              <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}><Input.Password placeholder="新密码（至少6位）" /></Form.Item>
              <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请确认新密码' }]}><Input.Password placeholder="再输一次新密码" /></Form.Item>
              <Button type="primary" icon={<LockOutlined />} onClick={handleChangePwd}>修改密码</Button>
            </Form>
          </Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><FileTextOutlined />操作日志</span>} key="logs">
          <Card><Text type="secondary">操作日志功能将在后续版本中提供</Text></Card>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><CloudSyncOutlined />系统更新</span>} key="update">
          <Card>
            <Row gutter={[16, 16]}>
              <Col span={24}>
                <Text strong>当前版本</Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue">v{sysInfo?.version || '2.0.0'}</Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>Node {sysInfo?.nodeVersion || '未知'}</Text>
                </div>
              </Col>
              <Col span={24}>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={checkUpdate}>检查更新</Button>
                  {updateInfo?.hasUpdate && (
                    <Popconfirm title="确认更新到最新版本？" onConfirm={doUpdate}>
                      <Button type="primary" danger icon={<CloudSyncOutlined />} loading={updating}>立即更新</Button>
                    </Popconfirm>
                  )}
                  <Button icon={<DatabaseOutlined />} onClick={loadDbCheck}>数据库自检</Button>
                </Space>
              </Col>
            </Row>
            {updateInfo && (
              <Card size="small" style={{ marginTop: 16, background: updateInfo.hasUpdate ? '#fffbe6' : '#f6ffed' }}>
                {updateInfo.hasUpdate ? (
                  <div><ExclamationCircleOutlined style={{ color: '#faad14' }} /><Text strong style={{ marginLeft: 8 }}>发现新版本</Text>
                    <div style={{ marginTop: 8 }}>
                      <div>当前: {updateInfo.current?.hash} - {updateInfo.current?.subject}</div>
                      <div>最新: {updateInfo.latest?.hash} - {updateInfo.latest?.subject}</div>
                    </div>
                  </div>
                ) : (
                  <div><CheckCircleOutlined style={{ color: '#52c41a' }} /><Text style={{ marginLeft: 8 }}>已是最新版本 ({updateInfo.current?.hash})</Text></div>
                )}
              </Card>
            )}
            {dbCheck && (
              <Card size="small" title="数据库自检" style={{ marginTop: 16 }}>
                <Row gutter={[8, 8]}>
                  {Object.entries(dbCheck.tables || {}).map(([table, count]: [string, any]) => (
                    <Col span={8} key={table}><Tag>{table}: {count}</Tag></Col>
                  ))}
                </Row>
                <Divider /><Text strong>各账套数据：</Text>
                <Table size="small" rowKey="tenant_id" pagination={false} dataSource={dbCheck.tenants || []}
                  columns={[
                    { title: 'ID', dataIndex: 'tenant_id', width: 50 },
                    { title: '账套名称', dataIndex: 'name' },
                    { title: '账套数', dataIndex: 'book_count', width: 80, render: (v: number) => <Tag color={v > 0 ? 'green' : 'red'}>{v}</Tag> }
                  ]}
                />
              </Card>
            )}
          </Card>
        </Tabs.TabPane>
      </Tabs>

      {/* 员工弹窗 */}
      <Modal title={editingUser ? '编辑员工' : '添加员工'} open={userModal} onOk={handleSaveUser} onCancel={() => setUserModal(false)} destroyOnClose>
        <Form form={userForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="登录账号" rules={[{ required: true }]}><Input placeholder="用于登录的账号名" disabled={!!editingUser} /></Form.Item>
          {!editingUser && <Form.Item name="password" label="登录密码" rules={[{ required: true, min: 6, message: '密码至少6位' }]}><Input.Password placeholder="初始密码" /></Form.Item>}
          <Form.Item name="realName" label="姓名"><Input placeholder="员工姓名" /></Form.Item>
          <Form.Item name="phone" label="手机号"><Input placeholder="联系手机" /></Form.Item>
          <Form.Item name="role" label="角色" initialValue="cashier"><Select options={roleOptions} /></Form.Item>
        </Form>
      </Modal>

      {/* 权限设置弹窗 */}
      <Modal
        title={<span><SafetyOutlined /> 权限设置 - {permUser?.real_name || permUser?.username} <Tag color={roleMap[permUser?.role]?.color} style={{ marginLeft: 8 }}>{roleMap[permUser?.role]?.text}</Tag></span>}
        open={permModal}
        onOk={handleSavePerm}
        onCancel={() => setPermModal(false)}
        confirmLoading={savingPerm}
        width={520}
        okText="保存权限"
        cancelText="取消"
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>勾选该员工可以访问的模块，勾选父级自动包含所有子模块</Text>
        </div>
        <div style={{ maxHeight: 400, overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: '12px 16px' }}>
          <Tree
            checkable
            defaultExpandAll
            checkedKeys={checkedPerms}
            onCheck={(keys: any) => setCheckedPerms(Array.isArray(keys) ? keys : keys.checked)}
            treeData={permTreeData}
          />
        </div>
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button size="small" onClick={handleResetPerm}>重置为角色默认权限</Button>
        </div>
      </Modal>

      <Modal
        title={<span><PlusCircleOutlined /> 新建帐套</span>}
        open={newTenantModal}
        onOk={handleCreateTenant}
        onCancel={() => setNewTenantModal(false)}
        confirmLoading={creatingTenant}
        okText="创建帐套"
        cancelText="取消"
        width={520}
      >
        <Alert message="创建后自动生成管理员账号 admin / admin123，以及38个标准会计科目" type="info" showIcon style={{ marginBottom: 16, marginTop: 16 }} />
        <Form form={newTenantForm} layout="vertical">
          <Form.Item name="name" label="帐套/店铺名称" rules={[{ required: true, message: '请输入名称' }]}><Input placeholder="如：宇航智荟电商营业部" /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="ownerName" label="经营者姓名"><Input placeholder="经营者" /></Form.Item></Col>
            <Col span={12}><Form.Item name="phone" label="联系电话"><Input placeholder="手机号" /></Form.Item></Col>
          </Row>
          <Form.Item name="creditCode" label="统一社会信用代码"><Input placeholder="18位信用代码（可选）" /></Form.Item>
          <Form.Item name="address" label="地址"><Input placeholder="详细地址" /></Form.Item>
          <Form.Item name="businessType" label="行业类型" initialValue="ecommerce">
            <Select options={[{ value: 'retail', label: '零售门店' },{ value: 'supply_coop', label: '农村供销社' },{ value: 'market', label: '菜市场商户' },{ value: 'ecommerce', label: '电商' },{ value: 'other', label: '其他' }]} />
          </Form.Item>
          <Form.Item name="businessDesc" label="业务描述"><Input.TextArea rows={2} placeholder="业务范围（可选）" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings;
