import React, { useState, useRef, useCallback } from 'react';
import { Card, Button, Spin, Typography, Row, Col, Upload, Alert, Table, Tag, Space, Modal, Input, message, Divider } from 'antd';
import { ScanOutlined, CameraOutlined, UploadOutlined, CheckCircleOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text, Paragraph } = Typography;

// 动态加载Tesseract
const loadTesseract = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).Tesseract) {
      resolve((window as any).Tesseract);
      return;
    }
    const existing = document.getElementById('tesseract-script');
    if (existing) {
      const check = setInterval(() => {
        if ((window as any).Tesseract) { clearInterval(check); resolve((window as any).Tesseract); }
      }, 200);
      setTimeout(() => reject(new Error('Tesseract加载超时')), 30000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'tesseract-script';
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = () => reject(new Error('Tesseract脚本加载失败，请检查网络'));
    document.head.appendChild(script);
  });
};

const OCRReceipt: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [manualModal, setManualModal] = useState(false);
  const [manualText, setManualText] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recognizeImage = useCallback(async (file: File) => {
    setLoading(true);
    setOcrProgress(0);
    setOcrText('');
    setParsed(null);
    try {
      // 显示图片预览
      const reader = new FileReader();
      reader.onload = (e) => setImageUrl(e.target?.result as string);
      reader.readAsDataURL(file);

      // 加载Tesseract
      const Tesseract = await loadTesseract();
      const { data } = await Tesseract.recognize(file, 'chi_sim+eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        }
      });

      const text = data.text || '';
      setOcrText(text);

      if (!text.trim()) {
        message.warning('未识别到文字，请尝试更清晰的图片或手动输入');
        return;
      }

      // 用DeepSeek解析结构化数据
      await parseWithAI(text);
    } catch (e: any) {
      message.error(e.message || '识别失败');
    }
    setLoading(false);
  }, []);

  const parseWithAI = async (text: string) => {
    try {
      const res = await request.post('/ai/quick-entry', { text: `票据内容：\n${text}` });
      const data = res.data?.data || res.data;
      if (data && data.type !== 'unknown') {
        setParsed(data);
      } else {
        message.info('已识别文字，但AI未能自动归类，可手动确认');
      }
    } catch (e: any) {
      message.warning('AI解析失败，可查看原文后手动录入');
    }
  };

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);
    try {
      await request.post('/ai/quick-entry/confirm', { parsed, text: ocrText.slice(0, 200) });
      message.success('单据已创建成功！');
      setParsed(null);
      setOcrText('');
      setImageUrl('');
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    }
    setSaving(false);
  };

  const beforeUpload = (file: File) => {
    recognizeImage(file);
    return false; // 阻止自动上传
  };

  const handleManualParse = async () => {
    if (!manualText.trim()) return;
    setManualModal(false);
    setOcrText(manualText);
    await parseWithAI(manualText);
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>
        <ScanOutlined style={{ color: '#13c2c2' }} /> 票据识别
      </Title>

      <Alert
        message="拍照或上传票据图片，自动识别并录入"
        description="支持采购发票、费用小票、收据等。系统通过OCR识别文字，再由AI自动归类为采购单、销售单或收支记录。识别准确率取决于图片清晰度。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16}>
        <Col xs={24} md={10}>
          <Card
            style={{ textAlign: 'center', minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '2px dashed #d9d9d9' }}
            styles={{ body: { padding: 24, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) recognizeImage(f);
                e.target.value = '';
              }}
            />
            {!imageUrl && !loading && (
              <Space direction="vertical" size={12}>
                <CameraOutlined style={{ fontSize: 48, color: '#1677ff' }} />
                <div>
                  <Button type="primary" icon={<CameraOutlined />} onClick={() => fileInputRef.current?.click()} style={{ marginRight: 8 }}>
                    拍照
                  </Button>
                  <Upload beforeUpload={beforeUpload} showUploadList={false} accept="image/*">
                    <Button icon={<UploadOutlined />}>相册选择</Button>
                  </Upload>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>支持 JPG/PNG，建议光线充足、文字清晰</Text>
                <Button type="link" onClick={() => setManualModal(true)}>
                  或手动输入票据文字
                </Button>
              </Space>
            )}
            {imageUrl && (
              <div>
                <img src={imageUrl} alt="票据" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, marginBottom: 12 }} />
                {!loading && (
                  <Button size="small" onClick={() => { setImageUrl(''); setOcrText(''); setParsed(null); }}>
                    重新拍照
                  </Button>
                )}
              </div>
            )}
            {loading && (
              <div style={{ marginTop: 12 }}>
                <Spin size="large" />
                <Paragraph style={{ marginTop: 12 }}>
                  <Text type="secondary">
                    {ocrProgress > 0 ? `OCR识别中... ${ocrProgress}%` : '正在加载识别引擎...'}
                  </Text>
                </Paragraph>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} md={14}>
          {!ocrText && !loading && (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                <FileTextOutlined style={{ fontSize: 40, marginBottom: 12 }} />
                <p>识别结果将显示在这里</p>
              </div>
            </Card>
          )}

          {ocrText && (
            <>
              <Card size="small" title="识别文字" style={{ marginBottom: 12 }}
                extra={<Button size="small" icon={<ReloadOutlined />} onClick={() => parseWithAI(ocrText)}>重新解析</Button>}>
                <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace', background: '#fafafa', padding: 8, borderRadius: 4 }}>
                  {ocrText}
                </div>
              </Card>

              {parsed && (
                <Card
                  size="small"
                  title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /> AI已解析</Space>}
                  extra={
                    <Button type="primary" size="small" loading={saving} onClick={handleSave}>
                      确认录入
                    </Button>
                  }
                >
                  {parsed.type === 'purchase' && (
                    <div>
                      <Tag color="blue">采购单</Tag>
                      {parsed.supplier_name && <Text>供应商：{parsed.supplier_name}</Text>}
                      <Table
                        size="small"
                        style={{ marginTop: 8 }}
                        pagination={false}
                        dataSource={parsed.items || []}
                        rowKey={(_, i) => String(i)}
                        columns={[
                          { title: '商品', dataIndex: 'name' },
                          { title: '数量', dataIndex: 'quantity', width: 60 },
                          { title: '单价', dataIndex: 'cost_price', width: 80, render: (v) => `¥${v}` },
                        ]}
                      />
                      {parsed.total_amount > 0 && (
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                          <Text strong>合计：¥{parsed.total_amount}</Text>
                        </div>
                      )}
                    </div>
                  )}
                  {parsed.type === 'sale' && (
                    <div>
                      <Tag color="green">销售单</Tag>
                      {parsed.customer_name && <Text>客户：{parsed.customer_name}</Text>}
                      <Table
                        size="small"
                        style={{ marginTop: 8 }}
                        pagination={false}
                        dataSource={parsed.items || []}
                        rowKey={(_, i) => String(i)}
                        columns={[
                          { title: '商品', dataIndex: 'name' },
                          { title: '数量', dataIndex: 'quantity', width: 60 },
                          { title: '单价', dataIndex: 'price', width: 80, render: (v) => `¥${v}` },
                        ]}
                      />
                      {parsed.total_amount > 0 && (
                        <div style={{ marginTop: 8, textAlign: 'right' }}>
                          <Text strong>合计：¥{parsed.total_amount}</Text>
                        </div>
                      )}
                    </div>
                  )}
                  {parsed.type === 'finance' && (
                    <div>
                      <Tag color={parsed.finance_type === 'income' ? 'green' : 'red'}>
                        {parsed.finance_type === 'income' ? '收入' : '支出'}
                      </Tag>
                      <div style={{ marginTop: 8 }}>
                        <p>类别：{parsed.category}</p>
                        <p>金额：<Text strong style={{ fontSize: 16 }}>¥{parsed.amount}</Text></p>
                        {parsed.remark && <p>备注：{parsed.remark}</p>}
                        {parsed.record_date && <p>日期：{parsed.record_date}</p>}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </Col>
      </Row>

      <Modal
        title="手动输入票据文字"
        open={manualModal}
        onOk={handleManualParse}
        onCancel={() => setManualModal(false)}
        okText="AI解析"
      >
        <Input.TextArea
          rows={8}
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="将票据上的文字输入或粘贴到这里，AI会自动识别金额、类别和日期..."
        />
      </Modal>
    </div>
  );
};

export default OCRReceipt;
