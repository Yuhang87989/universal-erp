import React, { useState } from 'react';
import { Card, Input, Button, Typography, Row, Col, Select, Space, message } from 'antd';
import { EditOutlined, CopyOutlined, BulbOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const AICopywriting: React.FC = () => {
  const [type, setType] = useState('product_desc');
  const [productInfo, setProductInfo] = useState('');
  const [tone, setTone] = useState('professional');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  const typeOptions = [
    { value: 'product_desc', label: '📝 商品描述' },
    { value: 'promotion', label: '🎯 促销文案' },
    { value: 'purchase_tip', label: '📋 采购建议' },
    { value: 'customer_reply', label: '💬 客户回复' }
  ];

  const placeholders: Record<string, string> = {
    product_desc: '例如：有机大米，5kg装，东北黑土地种植，不打蜡不抛光，真空包装...',
    promotion: '例如：双十一活动，全场8折，满200减30，有机大米原价89现价69...',
    purchase_tip: '例如：采购100箱苹果，需要验货要点、存储建议、保质期检查...',
    customer_reply: '例如：客户说"收到的商品有破损"或"能不能便宜一点"...'
  };

  const generate = async () => {
    if (!productInfo.trim()) { message.warning('请输入商品/活动信息'); return; }
    setLoading(true);
    try {
      const res = await request.post('/ai/copywriting', { type, productInfo, tone });
      setResult(res.data?.data?.text || res.data?.text || '生成失败');
    } catch (e: any) {
      message.error(e.response?.data?.message || '生成失败');
    }
    setLoading(false);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <EditOutlined style={{ color: '#eb2f96' }} /> AI文案生成
      </Title>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card title="输入信息" size="small">
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              <div>
                <Text strong>文案类型</Text>
                <Select value={type} onChange={setType} options={typeOptions} style={{ width: '100%', marginTop: 8 }} />
              </div>
              {type === 'promotion' && (
                <div>
                  <Text strong>文案语气</Text>
                  <Select value={tone} onChange={setTone} style={{ width: '100%', marginTop: 8 }}
                    options={[{ value: 'professional', label: '专业可信' }, { value: 'casual', label: '活泼亲切' }, { value: 'luxury', label: '高端大气' }]} />
                </div>
              )}
              <div>
                <Text strong>{type === 'customer_reply' ? '客户评价/问题' : '商品/活动信息'}</Text>
                <TextArea rows={6} style={{ marginTop: 8 }} placeholder={placeholders[type]}
                  value={productInfo} onChange={e => setProductInfo(e.target.value)} />
              </div>
              <Button type="primary" block icon={<BulbOutlined />} onClick={generate} loading={loading}>
                ✨ AI生成文案
              </Button>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="生成结果" size="small"
            extra={result && <Button type="text" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(result); message.success('已复制'); }}>复制</Button>}>
            {result ? (
              <div style={{ minHeight: 200, padding: 12, background: '#fafafa', borderRadius: 8, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {result}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
                <BulbOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <p>输入商品信息，AI帮你生成专业文案</p>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AICopywriting;
