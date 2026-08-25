import React, { useState } from 'react';
import { Drawer, Button, Typography, Steps, Tag, Collapse, FloatButton, Divider } from 'antd';
import { QuestionCircleOutlined, BulbOutlined, CloseOutlined } from '@ant-design/icons';
import { guides } from '../data/guides';
import { useLocation } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

const HelpGuide: React.FC = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const currentGuide = guides[location.pathname];

  if (!currentGuide) return null;

  return (
    <>
      <FloatButton
        icon={<QuestionCircleOutlined />}
        tooltip="操作指引"
        onClick={() => setOpen(true)}
        style={{ right: 24, bottom: 24 }}
      />
      <Drawer
        title={null}
        placement="right"
        width={400}
        onClose={() => setOpen(false)}
        open={open}
        styles={{ body: { padding: 0 }, header: { display: 'none' } }}
      >
        {/* 标题区 */}
        <div style={{
          background: 'linear-gradient(135deg, #1677ff 0%, #4096ff 100%)',
          padding: '24px 20px',
          color: 'white'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={4} style={{ color: 'white', margin: 0 }}>{currentGuide.title}</Title>
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setOpen(false)}
              style={{ color: 'white' }}
            />
          </div>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, marginBottom: 0 }}>
            {currentGuide.summary}
          </Paragraph>
        </div>

        {/* 操作步骤 */}
        <div style={{ padding: '20px' }}>
          <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
            📋 操作步骤
          </Text>
          <Steps
            direction="vertical"
            size="small"
            current={-1}
            items={currentGuide.steps.map((step, index) => ({
              title: <Text strong>{step.title}</Text>,
              description: (
                <Paragraph
                  type="secondary"
                  style={{ marginBottom: 0, marginTop: 4, fontSize: 13 }}
                >
                  {step.description}
                </Paragraph>
              ),
              status: 'wait' as const
            }))}
          />

          <Divider style={{ margin: '16px 0' }} />

          {/* 实用技巧 */}
          <Text strong style={{ fontSize: 15, marginBottom: 12, display: 'block' }}>
            💡 实用技巧
          </Text>
          <Collapse
            ghost
            items={[
              {
                key: 'tips',
                label: <Text type="secondary">点击展开查看所有技巧</Text>,
                children: (
                  <ul style={{ paddingLeft: 16, margin: 0 }}>
                    {currentGuide.tips.map((tip, index) => (
                      <li key={index} style={{ marginBottom: 8, fontSize: 13 }}>
                        <Text>{tip}</Text>
                      </li>
                    ))}
                  </ul>
                )
              }
            ]}
          />

          <Divider style={{ margin: '16px 0' }} />

          {/* 快捷联系 */}
          <div style={{
            background: '#f6f8fa',
            borderRadius: 8,
            padding: '16px',
            textAlign: 'center'
          }}>
            <BulbOutlined style={{ fontSize: 24, color: '#1677ff', marginBottom: 8 }} />
            <Paragraph style={{ marginBottom: 0, fontSize: 13, color: '#666' }}>
              遇到问题？可以在系统设置中反馈，<br/>我们会尽快帮您解决。
            </Paragraph>
          </div>
        </div>
      </Drawer>
    </>
  );
};

export default HelpGuide;
