import React from 'react';
import { Tabs, Typography } from 'antd';
import { MessageOutlined, ThunderboltOutlined, ShoppingCartOutlined, EditOutlined, LineChartOutlined, ScanOutlined, SettingOutlined, AccountBookOutlined } from '@ant-design/icons';
import AIChat from './AIChat';
import AIDiagnosis from './AIDiagnosis';
import AIReplenish from './AIReplenish';
import AICopywriting from './AICopywriting';
import AIForecast from './AIForecast';
import OCRReceipt from './OCRReceipt';
import AISettings from './AISettings';
import AIFinanceInsight from './AIFinanceInsight';

const { Title } = Typography;

const AICenter: React.FC = () => {
  const items = [
    {
      key: 'chat',
      label: <span><MessageOutlined /> AI助手对话</span>,
      children: <AIChat />
    },
    {
      key: 'diagnosis',
      label: <span><ThunderboltOutlined /> 智能经营诊断</span>,
      children: <AIDiagnosis />
    },
    {
      key: 'replenish',
      label: <span><ShoppingCartOutlined /> 智能补货建议</span>,
      children: <AIReplenish />
    },
    {
      key: 'forecast',
      label: <span><LineChartOutlined /> 销售预测</span>,
      children: <AIForecast />
    },
    {
      key: 'copywriting',
      label: <span><EditOutlined /> AI文案生成</span>,
      children: <AICopywriting />
    },
    {
      key: 'finance-insight',
      label: <span><AccountBookOutlined /> 财务解读</span>,
      children: <AIFinanceInsight />
    },
    {
      key: 'ocr',
      label: <span><ScanOutlined /> 票据识别</span>,
      children: <OCRReceipt />
    },
    {
      key: 'settings',
      label: <span><SettingOutlined /> AI设置</span>,
      children: <AISettings />
    }
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        🤖 AI智能中心
      </Title>
      <Tabs items={items} defaultActiveKey="chat" size="large"
        tabBarStyle={{ marginBottom: 16 }} />
    </div>
  );
};

export default AICenter;
