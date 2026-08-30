import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Space, Typography, Button, Drawer, Tooltip, Alert, Select, Tag } from 'antd';
import {
  DashboardOutlined, ShoppingCartOutlined, ShoppingOutlined,
  DatabaseOutlined, UserOutlined, LogoutOutlined, SettingOutlined, InfoCircleOutlined,
  BarChartOutlined, ApiOutlined, AccountBookOutlined,
  MenuOutlined, TeamOutlined, BankOutlined, SwapOutlined,
  RobotOutlined, WarningOutlined, HomeOutlined, InboxOutlined,
  ImportOutlined, ExportOutlined, ThunderboltOutlined, LineChartOutlined,
  SafetyCertificateOutlined, WalletOutlined, ShopOutlined, LockOutlined,
  FileTextOutlined, AuditOutlined, AppstoreOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import HelpGuide from '../components/HelpGuide';

const { Header, Content } = Layout;
const { Text } = Typography;

const roleNames: Record<string, string> = {
  owner: '老板', manager: '店长', cashier: '收银员', warehouse: '仓管'
};

const tenantIcons: Record<string, string> = {
  supply_coop: '🏘️',
  market_vendor: '🥬',
  retail_store: '🏪',
};

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
  '/accounts': '会计科目表管理，支持多级科目，预置标准会计科目',
  '/trial-balance': '试算平衡表，自动汇总各科目的期初、本期、期末借贷方余额',
  '/seals': '印章管理：真实印章预览，公安备案编号，支持在凭证上盖章',
  '/finance-reports': '资产负债表、利润表、现金流量表，按月自动生成，可打印导出',
  '/receivables': '应收账款与应付账款管理，账龄分析（0-30/31-60/61-90/91-180/180天以上），支持收付款登记',
  '/period-close': '期末结转损益：自动生成结转凭证，将收入费用转入本年利润，结账后锁定期间',
  '/payment-settings': '支付渠道配置：微信支付、支付宝、银行转账（预留接口），配置后可启用',
  '/ai': 'AI智能中心：对话问答、经营诊断、智能补货建议、AI文案生成',
  '/products': '管理商品档案（名称、条码、售价、成本价、预警值）和商品分类',
  '/customers': '管理客户和往来单位信息：联系方式、应收应付、交易记录',
  '/reports': '查看经营日报、利润分析、销售排行等数据报表',
  '/ecommerce': '管理多平台电商店铺，汇总各平台订单和销售额',
  '/settings': '设置门店信息、员工账号权限、基础参数等',
};

// 路由key到权限key的映射
const routePermMap: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/purchase': 'purchase:order',
  '/suppliers': 'purchase:suppliers',
  '/sales': 'sales:order',
  '/pos': 'sales:pos',
  '/warehouses': 'warehouse:warehouses',
  '/inventory': 'warehouse:inventory',
  '/stock-in': 'warehouse:stock-in',
  '/stock-out': 'warehouse:stock-out',
  '/transfers': 'warehouse:transfers',
  '/stocktake': 'warehouse:stocktake',
  '/alerts': 'warehouse:alerts',
  '/finance': 'finance:records',
  '/vouchers': 'finance:vouchers',
  '/accounts': 'finance:accounts',
  '/trial-balance': 'finance:trial-balance',
  '/seals': 'finance:seals',
  '/payment-settings': 'finance:payment',
  '/finance-reports': 'finance:reports',
  '/receivables': 'finance:receivables',
  '/period-close': 'finance:period-close',
  '/fixed-assets': 'finance:assets',
  '/fund': 'finance:fund',
  '/analytics': 'analytics:overview',
  '/reports': 'analytics:reports',
  '/ai': 'ai:chat',
  '/products': 'data:products',
  '/customers': 'data:customers',
  '/ecommerce': 'data:ecommerce',
  '/settings': 'system:settings',
};

const allMenuItems = [
  { type: 'group' as const, label: '业务管理', children: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
    { key: 'purchase-group', icon: <AccountBookOutlined />, label: '采购管理', children: [
      { key: '/purchase', label: '采购订单', icon: <FileTextOutlined /> },
      { key: '/suppliers', label: '供应商管理', icon: <TeamOutlined /> },
    ]},
    { key: 'sales-group', icon: <ShoppingCartOutlined />, label: '销售管理', children: [
      { key: '/sales', label: '销售订单', icon: <FileTextOutlined /> },
      { key: '/pos', label: 'POS收银', icon: <ThunderboltOutlined /> },
    ]},
  ]},
  { type: 'group' as const, label: '仓库管理', children: [
    { key: '/warehouses', icon: <HomeOutlined />, label: '仓库设置' },
    { key: '/inventory', icon: <DatabaseOutlined />, label: '库存查询' },
    { key: '/stock-in', icon: <ImportOutlined />, label: '入库管理' },
    { key: '/stock-out', icon: <ExportOutlined />, label: '出库管理' },
    { key: '/transfers', icon: <SwapOutlined />, label: '库存调拨' },
    { key: '/stocktake', icon: <InboxOutlined />, label: '库存盘点' },
    { key: '/alerts', icon: <WarningOutlined />, label: '预警中心' },
  ]},
  { type: 'group' as const, label: '财务管理', children: [
    { key: '/finance', icon: <WalletOutlined />, label: '收支管理' },
    { key: '/vouchers', icon: <AuditOutlined />, label: '记账凭证' },
    { key: '/accounts', icon: <BankOutlined />, label: '会计科目' },
    { key: '/trial-balance', icon: <LineChartOutlined />, label: '试算平衡' },
    { key: '/finance-reports', icon: <BarChartOutlined />, label: '财务报表' },
    { key: '/receivables', icon: <WalletOutlined />, label: '应收应付' },
    { key: '/fund', icon: <WalletOutlined />, label: '资金账户' },
    { key: '/fixed-assets', icon: <BankOutlined />, label: '固定资产' },
    { key: '/period-close', icon: <LockOutlined />, label: '期末结转' },
    { key: '/seals', icon: <SafetyCertificateOutlined />, label: '印章管理' },
    { key: '/payment-settings', icon: <WalletOutlined />, label: '支付渠道' },
  ]},
  { type: 'group' as const, label: '数据分析', children: [
    { key: '/analytics', icon: <BarChartOutlined />, label: '数据分析中心' },
    { key: '/reports', icon: <AppstoreOutlined />, label: '数据报表' },
  ]},
  { type: 'group' as const, label: 'AI智能', children: [
    { key: '/ai', icon: <RobotOutlined />, label: 'AI智能中心' },
  ]},
  { type: 'group' as const, label: '基础数据', children: [
    { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
    { key: '/customers', icon: <TeamOutlined />, label: '往来单位' },
    { key: '/ecommerce', icon: <ShopOutlined />, label: '电商管理' },
  ]},
  { type: 'group' as const, label: '系统', children: [
    { key: '/settings', icon: <SettingOutlined />, label: '系统管理' },
    { key: '/about', icon: <InfoCircleOutlined />, label: '关于' },
  ]}
];

// 个人记账账套（随手记）精简菜单：纯流水记账，无进销存/复式记账
const personalMenuItems = [
  { type: 'group' as const, label: '记账', children: [
    { key: '/dashboard', icon: <DashboardOutlined />, label: '我的账本' },
    { key: '/fund', icon: <WalletOutlined />, label: '收支流水' },
  ] },
  { type: 'group' as const, label: 'AI助手', children: [
    { key: '/ai', icon: <RobotOutlined />, label: 'AI智能记账' },
  ] },
  { type: 'group' as const, label: '系统', children: [
    { key: '/settings', icon: <SettingOutlined />, label: '设置' },
    { key: '/about', icon: <InfoCircleOutlined />, label: '关于' },
  ] },
];

// 权限过滤：根据用户权限过滤菜单项
const filterMenuByPerm = (items: any[], perms: string[] | null | undefined): any[] => {
  if (perms === null || perms === undefined) return items; // owner全部
  const has = (key: string) => {
    if (key.startsWith('/')) {
      const pk = routePermMap[key];
      if (!pk) return true;
      if (perms.includes(pk)) return true;
      const parent = pk.split(':')[0];
      return perms.includes(parent);
    }
    return true; // group key不过滤
  };
  return items
    .map(item => {
      if (item.type === 'group') {
        const children = filterMenuByPerm(item.children || [], perms);
        return children.length ? { ...item, children } : null;
      }
      if (item.children) {
        // 子菜单（采购管理、销售管理）
        const children = item.children.filter((c: any) => has(c.key));
        return children.length ? { ...item, children } : null;
      }
      return has(item.key) ? item : null;
    })
    .filter(Boolean);
};

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
  const isPersonalBook = user?.business_type === 'personal' || user?.business_type === 'other';
  const menuItems = useMemo(
    () => isPersonalBook ? personalMenuItems : filterMenuByPerm(allMenuItems, user?.permissions),
    [user?.permissions, isPersonalBook]
  );
  const [isMobile, setIsMobile] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  const tenantSwitcher = (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
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
          🏢 {user?.tenantName || '默认帐套'}
        </Text>
      )}
    </div>
  );

  const sidebarContent = (
    <>
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid #f0f0f0',
        flexShrink: 0,
        background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/erp-logo.png" alt="ERP" style={{
            width: 28, height: 28, borderRadius: 6, objectFit: 'cover',
          }} />
          <Text strong style={{ fontSize: 15, color: '#fff', letterSpacing: 0.5 }}>宇航智荟 ERP</Text>
        </div>
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
        <Layout.Sider width={210} theme="light" style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}>
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
        <Header style={{
          background: '#fff',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          height: 52,
          lineHeight: '52px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined style={{ fontSize: 18 }} />} onClick={() => setDrawerVisible(true)} />
            )}
            {!isMobile && user?.tenantName && (
              <Tag color="blue" style={{ marginRight: 0, borderRadius: 4, padding: '2px 10px' }}>
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
        <Content style={{
          margin: isMobile ? 8 : 16,
          padding: isMobile ? 12 : 20,
          background: '#f5f7fa',
          minHeight: 280,
          borderRadius: 8,
        }}>
          {currentGuide && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: isMobile ? 12 : 16, borderRadius: 8 }}
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
