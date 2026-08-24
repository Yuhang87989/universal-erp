import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Button, Drawer, Tooltip, Alert, Select, Divider, Tag } from 'antd';
import {
  DashboardOutlined, ShoppingCartOutlined, ShoppingOutlined,
  DatabaseOutlined, UserOutlined, LogoutOutlined, SettingOutlined,
  BarChartOutlined, ApiOutlined, AccountBookOutlined,
  MenuOutlined, TeamOutlined, BankOutlined, SwapOutlined,
  RobotOutlined, WarningOutlined, HomeOutlined, InboxOutlined,
  ImportOutlined, ExportOutlined, ThunderboltOutlined, LineChartOutlined, CreditCardOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import HelpGuide from '../components/HelpGuide';

const { Header, Content } = Layout;
const { Text } = Typography;

const roleNames: Record<string, string> = {
  owner: '老板', manager: '店长', cashier: '收银员', warehouse: '仓管'
};

// 帐套图标映射
const tenantIcons: Record<string, string> = {
  supply_coop: '🏘️',
  market_vendor: '🥬',
  retail_store: '🏪',
};

// 每个菜单项附带操作指引说明
const guideMap: Record<string, string> = {
  '/dashboard': '查看今日经营数据、待办事项，一目了然掌握门店运营情况',
  '/purchase': '录入采购订单，到货后点"入库"自动增加库存',
  '/suppliers': '管理供应商信息：联系方式、银行账户、历史采购记录',
  '/sales': '创建销售订单，支持POS/线上/批发/电话等多种类型',
  '/pos': '触屏收银：搜索商品→加入购物车→选择支付方式→结账',
  '/inventory': '查看实时库存，按仓库筛选，红色标记低于预警值的商品',
  '/stock-in': '独立入库单管理：采购入库/退货入库/生产入库/调拨入库/其他入库，确认后自动加库存',
  '/stock-out': '独立出库单管理：销售出库/退货出库/生产领料/报损出库，确认后自动扣库存',
  '/transfers': '仓库间库存调拨，一步完成调出仓扣减+调入仓增加',
  '/warehouses': '管理多个仓库，查看各仓库SKU数和库存价值',
  '/stocktake': '库存盘点：支持全盘、抽盘、循环盘，自动计算盘盈盘亏差异',
  '/analytics': '数据分析中心：销售趋势、采购对比、利润分析、库存价值、商品排行等图表',
  '/alerts': '预警中心：自动扫描低库存/零库存/负库存异常，支持语音播报提醒',
  '/finance': '按平台分开记账，总帐目自动汇总所有平台收支',
  '/vouchers': '用友风格记账凭证，借贷必相等，支持审核流程与盖章',
  '/accounts': '会计科目表管理，支持多级科目，预置42个常用科目',
  '/trial-balance': '试算平衡表，自动汇总各科目的期初、本期、期末借贷方余额',
  '/seals': '印章管理：引用公安备案编号，支持新增自定义印章，可在凭证上盖章',
  '/payment-settings': '支付渠道配置：微信支付、支付宝、银行转账（预留接口），配置后可启用',
  '/ai': 'AI智能中心：对话问答、经营诊断、智能补货建议、AI文案生成',
  '/products': '管理商品档案（名称、条码、售价、成本价、预警值）和商品分类',
  '/customers': '管理客户和会员信息：积分、等级、消费记录',
  '/reports': '查看经营日报、利润分析、销售排行等数据报表',
  '/ecommerce': '管理多平台电商店铺，汇总各平台订单和销售额',
  '/settings': '设置门店信息、员工账号权限、基础参数等',
};

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
  ]},
  { type: 'group' as const, label: '仓库管理', children: [
    { key: '/warehouses', icon: <HomeOutlined />, label: '仓库设置' },
    { key: '/inventory', icon: <DatabaseOutlined />, label: '库存查询' },
    { key: '/stock-in', icon: <ImportOutlined />, label: '入库管理' },
    { key: '/stock-out', icon: <ExportOutlined />, label: '出库管理' },
    { key: '/transfers', icon: <SwapOutlined />, label: '库存调拨' },
    { key: '/stocktake', icon: <InboxOutlined />, label: '库存盘点' },
    { key: '/alerts', icon: <WarningOutlined />, label: <span>预警中心</span> },
  ]},
  { type: 'group' as const, label: '财务管理', children: [
    { key: '/finance', icon: <BarChartOutlined />, label: '收支管理' },
    { key: '/vouchers', icon: <AccountBookOutlined />, label: '记账凭证' },
    { key: '/accounts', icon: <BankOutlined />, label: '会计科目' },
    { key: '/trial-balance', icon: <LineChartOutlined />, label: '试算平衡' },
    { key: '/seals', icon: <CreditCardOutlined />, label: '印章管理' },
    { key: '/payment-settings', icon: <CreditCardOutlined />, label: '支付渠道' },
  ]},
  { type: 'group' as const, label: '数据分析', children: [
    { key: '/analytics', icon: <BarChartOutlined />, label: '数据分析中心' },
    { key: '/reports', icon: <BarChartOutlined />, label: '数据报表' },
  ]},
  { type: 'group' as const, label: 'AI智能', children: [
    { key: '/ai', icon: <RobotOutlined />, label: 'AI智能中心' },
  ]},
  { type: 'group' as const, label: '基础数据', children: [
    { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
    { key: '/customers', icon: <TeamOutlined />, label: '往来单位' },
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
  const { user, logout, tenants, switchTenant, loadTenants } = useAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 登录后加载帐套列表
  useEffect(() => {
    if (user) loadTenants();
  }, [user?.id]);

  const handleLogout = () => { logout(); navigate('/login'); };

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key.startsWith('/')) {
      navigate(key);
      if (isMobile) setDrawerVisible(false);
    }
  };

  const handleSwitchTenant = async (tenantId: number) => {
    if (tenantId === user?.tenantId) return;
    try {
      await switchTenant(tenantId);
      // 切换帐套后回到工作台
      navigate('/dashboard');
    } catch (err) {
      console.error('切换帐套失败:', err);
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

  // 帐套切换器
  const tenantSwitcher = (
    <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        <SwapOutlined style={{ fontSize: 12, color: '#1677ff' }} />
        <Text type="secondary" style={{ fontSize: 11 }}>当前帐套</Text>
      </div>
      {tenants.length > 0 ? (
        <Select
          value={user?.tenantId}
          onChange={handleSwitchTenant}
          style={{ width: '100%' }}
          size="small"
          options={tenants.map(t => ({
            value: t.id,
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{tenantIcons[t.business_type] || '🏢'}</span>
                <span>{t.name}</span>
              </span>
            ),
          }))}
        />
      ) : (
        <Text style={{ fontSize: 13 }}>
          {tenantIcons[user?.tenantId ? '' : ''] || '🏢'} {user?.tenantName || '默认帐套'}
        </Text>
      )}
    </div>
  );

  const sidebarContent = (
    <>
      <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Text strong style={{ fontSize: 15 }}>📦 通用电商ERP</Text>
      </div>
      {tenantSwitcher}
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
            {!isMobile && user?.tenantName && (
              <Tag color="blue" style={{ marginRight: 0 }}>
                {tenantIcons[tenants.find(t => t.id === user?.tenantId)?.business_type || ''] || '🏢'} {user.tenantName}
              </Tag>
            )}
            {isMobile && <Text strong style={{ fontSize: 14 }}>{user?.tenantName || 'ERP'}</Text>}
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
