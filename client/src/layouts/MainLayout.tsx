import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Typography } from 'antd';
import {
  DashboardOutlined, ShoppingOutlined, AppstoreOutlined,
  DatabaseOutlined, ShoppingCartOutlined, UserOutlined,
  LogoutOutlined, SettingOutlined, BarChartOutlined,
  ApiOutlined, AccountBookOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import HelpGuide from '../components/HelpGuide';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/pos', icon: <ShoppingCartOutlined />, label: 'POS收银' },
  { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
  { key: '/categories', icon: <AppstoreOutlined />, label: '商品分类' },
  { key: '/inventory', icon: <DatabaseOutlined />, label: '库存管理' },
  { key: '/purchase', icon: <AccountBookOutlined />, label: '采购管理' },
  { key: '/customers', icon: <UserOutlined />, label: '客户会员' },
  { key: '/reports', icon: <BarChartOutlined />, label: '数据报表' },
  { key: '/ecommerce', icon: <ApiOutlined />, label: '电商账目' },
  { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
];

const roleNames: Record<string, string> = {
  owner: '老板',
  manager: '店长',
  cashier: '收银员',
  warehouse: '仓管'
};

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userMenu = {
    items: [
      { key: 'profile', icon: <UserOutlined />, label: '个人信息' },
      { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true }
    ],
    onClick: ({ key }: { key: string }) => {
      if (key === 'logout') handleLogout();
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0' }}>
          <Text strong style={{ fontSize: 16 }}>📦 通用电商ERP</Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 'none', marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: 'white', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', borderBottom: '1px solid #f0f0f0' }}>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
              <span>{user?.realName || user?.username}</span>
              <Text type="secondary" style={{ fontSize: 12 }}>{roleNames[user?.role || ''] || ''}</Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16, padding: 24, background: '#f5f5f5', minHeight: 280 }}>
          <Outlet />
          <HelpGuide />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
