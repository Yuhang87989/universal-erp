import React, { useState, useRef, useEffect } from 'react';
import { Card, Input, Button, Avatar, Spin, Typography, Space, Tag, Row, Col, Empty } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, BulbOutlined, BarChartOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Message {
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

const quickQuestions = [
  '今天销售情况怎么样？',
  '本月利润多少？',
  '哪些商品卖得最好？',
  '库存有什么预警？',
  '给我一些经营建议',
  '本月采购花了多少？'
];

const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '您好！我是您的AI经营助手小智 🤖，可以帮您分析经营数据、解答业务问题。试试问我"今天卖了多少"或"库存有什么预警"吧！', time: new Date().toLocaleTimeString() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const send = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    const userMsg: Message = { role: 'user', content, time: new Date().toLocaleTimeString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.filter(m => m.role !== 'assistant' || messages.indexOf(m) > 0).slice(-6).map(m => ({
        role: m.role, content: m.content
      }));
      const res = await request.post('/ai/chat', { message: content, history });
      const reply = res.data?.reply || '抱歉，我暂时无法回答这个问题。';
      const aiMsg: Message = { role: 'assistant', content: reply, time: new Date().toLocaleTimeString() };
      setMessages(prev => [...prev, aiMsg]);
      if (voiceOn) voiceService.speak(reply.slice(0, 200), { rate: 1.0 });
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `出错了：${e.response?.data?.message || e.message}`, time: new Date().toLocaleTimeString() }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
      <Card size="small" style={{ marginBottom: 12, flexShrink: 0 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Avatar icon={<RobotOutlined />} style={{ backgroundColor: '#1677ff' }} />
              <div>
                <Text strong>AI经营助手 · 小智</Text>
                <div><Tag color="green" style={{ fontSize: 11 }}>在线</Tag><Text type="secondary" style={{ fontSize: 11 }}>基于DeepSeek大模型</Text></div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button size="small" type={voiceOn ? 'primary' : 'default'} onClick={() => { setVoiceOn(!voiceOn); voiceService.setEnabled(!voiceOn); }}>
                {voiceOn ? '🔊 语音开' : '🔇 语音关'}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 快捷问题 */}
      {messages.length <= 1 && (
        <Card size="small" style={{ marginBottom: 12, flexShrink: 0 }}>
          <Space wrap>
            {quickQuestions.map((q, i) => (
              <Tag key={i} icon={<BulbOutlined />} color="blue" style={{ cursor: 'pointer', padding: '4px 10px', fontSize: 13 }}
                onClick={() => send(q)}>{q}</Tag>
            ))}
          </Space>
        </Card>
      )}

      {/* 消息列表 */}
      <div ref={listRef} style={{ flex: 1, overflow: 'auto', padding: '0 4px', marginBottom: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 12, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
            <Avatar size="small" icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
              style={{ backgroundColor: msg.role === 'user' ? '#52c41a' : '#1677ff', flexShrink: 0 }} />
            <div style={{ maxWidth: '80%' }}>
              <div style={{
                background: msg.role === 'user' ? '#e6f4ff' : '#f6f8fa',
                padding: '8px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
              }}>
                {msg.content}
              </div>
              <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: msg.role === 'user' ? 'right' : 'left' }}>{msg.time}</Text>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Avatar size="small" icon={<RobotOutlined />} style={{ backgroundColor: '#1677ff' }} />
            <Spin size="small" />
            <Text type="secondary" style={{ fontSize: 12 }}>小智正在思考...</Text>
          </div>
        )}
      </div>

      {/* 输入区 */}
      <Card size="small" style={{ flexShrink: 0 }}>
        <Space.Compact style={{ width: '100%' }}>
          <TextArea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题，Enter发送，Shift+Enter换行..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            disabled={loading}
          />
          <Button type="primary" icon={<SendOutlined />} onClick={() => send()} loading={loading}
            style={{ height: 'auto', minWidth: 72 }}>发送</Button>
        </Space.Compact>
      </Card>
    </div>
  );
};

export default AIChat;
