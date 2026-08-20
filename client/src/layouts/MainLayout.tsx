import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Button, Drawer, Tooltip, Alert } from 'antd';
import {
  DashboardOutlined, ShoppingCartOutlined, ShoppingOutlined,
  DatabaseOutlined, UserOutlined, LogoutOutlined, SettingOutlined,
  BarChartOutlined, ApiOutlined, AccountBookOutlined,
  MenuOutlined, TeamOutlined, BankOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import HelpGuide from '../components/HelpGuide';

const { Header, Content } = Layout;
const { Text } = Typography;

const roleNames: Record<string, string> = {
  owner: '老板', manager: '店长', cashier: '收银员', warehouse: '仓管'
};

// 每个菜单项附带操作指引说明
const guideMap: Record<string, string> = {
  '/dashboard': '查看今日经营数据、待办事项，一目了然掌握门店运营情况',
  '/purchase': '录入采购订单，到货后点"入库"自动增加库存',
  '/suppliers': '管理供应商信息：联系方式、结算方式、历史采购记录',
  '/sales': '创建销售订单，支持POS/线上/批发/电话等多种类型',
  '/pos': '触屏收银：搜索商品→加入购物车→选择支付方式→结账',
  '/inventory': '查看实时库存，红色标记低于预警值的商品，及时补货',
  '/finance': '记录每笔收入和支出，自动计算利润，支持按类别筛选',
  '/products': '管理商品档案（名称、条码、售价）和商品分类',
  '/customers': '管理客户和会员信息：积分、等级、消费记录',
  '/reports': '查看经营日报、利润分析、销售排行等数据报表',
  '/ecommerce': '管理多平台电商店铺，汇总各平台订单和销售额',
  '/settings': '设置门店信息、员工账号权限、基础参数等',
};

// 菜单数据 - 带指引
const menuItems = [
  { type: 'group' as const, label: '业务管理', children: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: 'purchase-group', icon: <AccountBookOutlined />, label: '采购管理', children: [
      { key: '/purchase', label: '采购订单' },
      { key: '/suppliers', label: '供应商管理' },
    ]},
    { key: 'sales-group', icon: <ShoppingCartOutlined />, label: '销售管理', children: [
      { key: '/sales', label: '销售订单' },
      { key: '/pos', label: 'POS收银' },
    ]},
    { key: '/inventory', icon: <DatabaseOutlined />, label: '库存管理' },
    { key: 'finance-group', icon: <BankOutlined />, label: '财务管理', children: [
      { key: '/finance', label: '收支管理' },
    ]},
  ]},
  { type: 'group' as const, label: '基础数据', children: [
    { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
    { key: '/customers', icon: <TeamOutlined />, label: '往来单位' },
    { key: '/reports', icon: <BarChartOutlined />, label: '数据报表' },
    { key: '/ecommerce', icon: <ApiOutlined />, label: '电商管理' },
  ]},
  { type: 'group' as const, label: '系统', children: [
    { key: '/settings', icon: <SettingOutlined />, label: '系统管理' },
  ]}
];

// 递归为菜单项注入 Tooltip
const injectTooltips = (items: any[]): any[] => {
  return items.map(item => {
    if (item.type === 'group') {
      return { ...item, children: injectTooltips(item.children || []) };
    }
    const desc = guideMap[item.key];
    if (item.children) {
      return { ...item, children: injectTooltips(item.children) };
    }
    if (desc) {
      return {
        ...item,
        label: (
          <Tooltip title={desc} placement="right" mouseEnterDelay={0.5}>
            <span style={{ display: 'block' }}>{item.label as string}</span>
          </Tooltip>
        )
      };
    }
    return item;
  });
};

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key.startsWith('/')) {
      navigate(key);
      if (isMobile) setDrawerVisible(false);
    }
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
      else if (key === 'settings') { navigate('/settings'); if (isMobile) setDrawerVisible(false); }
    }
  };

  const currentGuide = guideMap[location.pathname];

  const sidebarContent = (
    <>
      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Text strong style={{ fontSize: 15 }}>📦 通用电商ERP</Text>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={isMobile ? [] : ['purchase-group', 'sales-group', 'finance-group']}
          items={injectTooltips(menuItems)}
          onClick={handleMenuClick}
          style={{ border: 'none' }}
        />
      </div>
    </>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Layout.Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          {sidebarContent}
        </Layout.Sider>
      )}
      {isMobile && (
        <Drawer
          placement="left"
          onClose={() => setDrawerVisible(false)}
          open={drawerVisible}
          width={260}
          styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
        >
          {sidebarContent}
        </Drawer>
      )}
      <Layout>
        <Header style={{ background: '#fff', padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0', height: 48, lineHeight: '48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined style={{ fontSize: 18 }} />} onClick={() => setDrawerVisible(true)} />
            )}
            {isMobile && <Text strong style={{ fontSize: 14 }}>电商ERP</Text>}
          </div>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" style={{ backgroundColor: '#1677ff' }} icon={<UserOutlined />} />
              <span style={{ fontSize: 13 }}>{user?.realName || user?.username}</span>
              {!isMobile && <Text type="secondary" style={{ fontSize: 12 }}>{roleNames[user?.role || ''] || ''}</Text>}
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: isMobile ? 8 : 16, padding: isMobile ? 12 : 20, background: '#f5f5f5', minHeight: 280 }}>
          {/* 手机端操作指引卡片 */}
          {isMobile && currentGuide && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={currentGuide}
              closable
            />
          )}
          {/* 桌面端操作指引 */}
          {!isMobile && currentGuide && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={currentGuide}
              closable
            />
          )}
          <Outlet />
          <HelpGuide />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
