import React from 'react';
import { Card, Typography, Row, Col, Tag, Divider, Space } from 'antd';
import {
  ShoppingCartOutlined, AccountBookOutlined, DatabaseOutlined,
  WalletOutlined, BarChartOutlined, RobotOutlined, ShopOutlined,
  TeamOutlined, SafetyCertificateOutlined, ThunderboltOutlined,
  HomeOutlined, ImportOutlined, ExportOutlined, SwapOutlined,
  InboxOutlined, WarningOutlined, AuditOutlined, BankOutlined,
  LineChartOutlined, LockOutlined, AppstoreOutlined, SettingOutlined,
  FundOutlined, FileTextOutlined, CloudSyncOutlined
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const featureGroups = [
  {
    title: '采购管理',
    icon: <AccountBookOutlined />,
    color: '#1677ff',
    features: [
      { name: '采购订单', desc: '录入采购单，支持多商品明细、供应商关联、备注说明' },
      { name: '采购入库', desc: '到货确认后自动入库，移动加权平均成本自动计算' },
      { name: '供应商管理', desc: '供应商档案、联系方式、银行账户、信用代码、历史采购记录' },
    ]
  },
  {
    title: '销售管理',
    icon: <ShoppingCartOutlined />,
    color: '#52c41a',
    features: [
      { name: '销售订单', desc: '多类型销售（POS/线上/批发/电话），自动扣减库存' },
      { name: 'POS收银', desc: '触屏收银，搜索商品→购物车→选支付方式→结账，快速开单' },
      { name: '小票打印', desc: '收银结算自动出票，支持58/80mm热敏小票机、手机蓝牙打印，历史单据可补打' },
      { name: '客户管理', desc: '客户档案、联系方式、累计消费、应收余额' },
    ]
  },
  {
    title: '仓库管理',
    icon: <HomeOutlined />,
    color: '#722ed1',
    features: [
      { name: '多仓库设置', desc: '支持多仓库管理，各仓库独立库存，地址信息维护' },
      { name: '入库/出库', desc: '采购入库、退货入库、生产入库、调拨入库等多种类型' },
      { name: '库存调拨', desc: '仓库间调拨一步完成，调出仓扣减+调入仓增加' },
      { name: '库存盘点', desc: '全盘/抽盘/循环盘，自动计算盘盈盘亏差异' },
      { name: '库存预警', desc: '低库存/零库存自动预警，支持语音播报提醒' },
    ]
  },
  {
    title: '财务管理',
    icon: <WalletOutlined />,
    color: '#fa8c16',
    features: [
      { name: '记账凭证', desc: '用友风格凭证录入，借贷必相等，支持审核与盖章' },
      { name: '自动凭证', desc: '销售/采购/收付款自动生成会计凭证，业务财务一体化' },
      { name: '会计科目', desc: '预置小企业会计准则科目，支持多级科目和自定义' },
      { name: '财务报表', desc: '资产负债表、利润表、现金流量表，按月自动生成' },
      { name: '试算平衡', desc: '自动汇总各科目的期初、本期、期末借贷方余额' },
      { name: '应收应付', desc: '往来账款管理，账龄分析（0-30/31-60/61-90/91-180/180+天）' },
      { name: '资金账户', desc: '现金/微信/支付宝/银行多账户管理，收支流水登记' },
      { name: '账单智能导入', desc: '微信/支付宝/银行账单一键导入，自动识别表头与收支方向，编码乱码自适应，流水秒级落库并生成凭证' },
      { name: '固定资产', desc: '资产卡片、折旧方法设置、月度自动计提折旧' },
      { name: '期末结转', desc: '自动生成结转凭证，收入费用转入本年利润，结账后锁定' },
      { name: '印章管理', desc: '公章/财务章/法人章管理，公安备案编号，凭证盖章' },
    ]
  },
  {
    title: '成本核算',
    icon: <FundOutlined />,
    color: '#eb2f96',
    features: [
      { name: '移动加权平均', desc: '每次采购入库自动重新计算加权平均成本' },
      { name: '销售成本结转', desc: '销售出库时按加权成本自动结转，收入成本配比' },
      { name: '库存价值', desc: '实时库存金额=数量×加权成本，利润核算更准确' },
    ]
  },
  {
    title: '数据分析',
    icon: <BarChartOutlined />,
    color: '#13c2c2',
    features: [
      { name: '数据看板', desc: '今日销售/支出/利润、待办事项、经营趋势一览' },
      { name: '数据分析中心', desc: '销售趋势、采购对比、利润分析、商品排行等图表' },
      { name: '经营报表', desc: '经营日报、利润分析、销售排行等多维度报表' },
    ]
  },
  {
    title: 'AI智能',
    icon: <RobotOutlined />,
    color: '#2f54eb',
    features: [
      { name: 'AI对话问答', desc: '自然语言查询经营数据，AI助手解答业务问题' },
      { name: '经营诊断', desc: 'AI自动分析经营状况，发现问题并给出建议' },
      { name: '智能补货', desc: '基于销售趋势和库存水平，AI推荐补货数量' },
      { name: 'AI文案', desc: '商品描述、营销文案AI一键生成' },
    ]
  },
  {
    title: '系统管理',
    icon: <SettingOutlined />,
    color: '#595959',
    features: [
      { name: '多账套隔离', desc: '一套系统多个独立账套，分公司/分行业各用各的，数据完全隔离，老板一键切换' },
      { name: '随手记', desc: '内置个人日常收支账套，收入消费随手记一笔，与公司经营账完全分开' },
      { name: '角色权限', desc: '老板/店长/收银员/仓管四种角色，精细权限控制' },
      { name: '员工管理', desc: '员工账号创建、角色分配、状态管理' },
      { name: '电商管理', desc: '多平台电商店铺管理，汇总订单和销售额' },
      { name: '操作日志', desc: '关键操作自动记录，可追溯' },
    ]
  },
];

const About: React.FC = () => {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* 头部 */}
      <Card style={{ marginBottom: 24, textAlign: 'center', background: 'linear-gradient(135deg, #1677ff 0%, #722ed1 100%)', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
          <img src="/erp-logo.png" alt="ERP" style={{ width: 64, height: 64, borderRadius: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} />
          <div style={{ textAlign: 'left' }}>
            <Title level={2} style={{ color: '#fff', margin: 0 }}>宇航智荟 ERP</Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 15 }}>AI智能进销存 · 财务一体化管理系统</Text>
          </div>
        </div>
        <Space size={[8, 8]} wrap style={{ justifyContent: 'center' }}>
          <Tag color="white" style={{ color: '#1677ff', fontWeight: 500 }}>进销存</Tag>
          <Tag color="white" style={{ color: '#722ed1', fontWeight: 500 }}>财务核算</Tag>
          <Tag color="white" style={{ color: '#fa8c16', fontWeight: 500 }}>成本管理</Tag>
          <Tag color="white" style={{ color: '#13c2c2', fontWeight: 500 }}>数据分析</Tag>
          <Tag color="white" style={{ color: '#2f54eb', fontWeight: 500 }}>AI智能</Tag>
          <Tag color="white" style={{ color: '#52c41a', fontWeight: 500 }}>多租户</Tag>
        </Space>
      </Card>

      {/* 简介 */}
      <Card style={{ marginBottom: 24 }}>
        <Paragraph style={{ fontSize: 15, lineHeight: 1.8, marginBottom: 0 }}>
          宇航智荟ERP是一款面向中小商贸企业的智能管理系统，将<strong>采购、销售、库存、财务、成本核算</strong>融为一体。
          系统采用移动加权平均法自动核算成本，业务单据自动生成会计凭证，实现业务与财务的无缝衔接。
          内置AI助手提供经营诊断、智能补货和文案生成能力，帮助企业用数据驱动决策，提升经营效率。
        </Paragraph>
      </Card>

      {/* 功能模块 */}
      <Title level={4} style={{ marginBottom: 16 }}>
        <AppstoreOutlined style={{ marginRight: 8 }} />功能模块
      </Title>
      <Row gutter={[16, 16]}>
        {featureGroups.map((group) => (
          <Col xs={24} sm={12} lg={8} key={group.title}>
            <Card
              size="small"
              title={
                <Space>
                  <span style={{ color: group.color, fontSize: 18 }}>{group.icon}</span>
                  <span>{group.title}</span>
                </Space>
              }
              styles={{ header: { borderBottom: `2px solid ${group.color}20` } }}
              style={{ height: '100%' }}
            >
              {group.features.map((f) => (
                <div key={f.name} style={{ marginBottom: 10 }}>
                  <Text strong style={{ fontSize: 13, color: group.color }}>{f.name}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>{f.desc}</Text>
                </div>
              ))}
            </Card>
          </Col>
        ))}
      </Row>

      {/* 核心特性 */}
      <Divider />
      <Title level={4} style={{ marginBottom: 16 }}>
        <CloudSyncOutlined style={{ marginRight: 8 }} />核心特性
      </Title>
      <Row gutter={[16, 16]}>
        {[
          { icon: <CloudSyncOutlined />, title: '业务财务一体化', desc: '销售/采购/收付款自动生成凭证，无需手工重复录入' },
          { icon: <FundOutlined />, title: '实时成本核算', desc: '移动加权平均法，每笔出入库自动更新成本和库存价值' },
          { icon: <SafetyCertificateOutlined />, title: '规范财务核算', desc: '预置小企业会计准则，资产负债表/利润表/现金流量表自动生成' },
          { icon: <RobotOutlined />, title: 'AI赋能经营', desc: 'AI对话查数据、经营诊断、智能补货，降低决策门槛' },
        ].map((item) => (
          <Col xs={24} sm={12} key={item.title}>
            <Card size="small">
              <Space align="start">
                <span style={{ fontSize: 24, color: '#1677ff', marginTop: 2 }}>{item.icon}</span>
                <div>
                  <Text strong>{item.title}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 版本信息 */}
      <Divider />
      <Card style={{ textAlign: 'center', background: '#fafafa', border: 'none' }}>
        <div style={{ marginBottom: 12 }}>
          <img src="/erp-logo.png" alt="宇航智荟" style={{ width: 40, height: 40, borderRadius: 10, verticalAlign: 'middle', marginRight: 10 }} />
          <Text strong style={{ fontSize: 18, color: '#1677ff', verticalAlign: 'middle' }}>宇航智荟 ERP v2.1</Text>
        </div>
        <Paragraph style={{ marginBottom: 4, fontSize: 13 }}>
          <Text strong>武汉市江岸区宇航智荟电商营业部</Text>
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 4, fontSize: 12 }}>
          统一社会信用代码：92420102MAKJME5F3R
        </Paragraph>
        <Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
          技术支持：18667887138@163.com · QQ 392430818
        </Paragraph>
        <Space size={16} wrap style={{ justifyContent: 'center' }}>
          <Tag color="blue">React + Ant Design</Tag>
          <Tag color="green">Node.js</Tag>
          <Tag color="orange">MySQL</Tag>
          <Tag color="purple">手机 / 电脑多端通用</Tag>
        </Space>
        <Divider style={{ margin: '12px 0' }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          © 2026 武汉市江岸区宇航智荟电商营业部 · 保留所有权利
        </Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>
          v2.1 更新：微信/支付宝账单智能导入 · 小票打印 · 多行业账套 · 随手记个人记账
        </Text>
      </Card>
    </div>
  );
};

export default About;
