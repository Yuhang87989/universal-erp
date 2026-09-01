import React, { useState, useEffect } from 'react';
import { Card, Button, Form, Input, InputNumber, Switch, Space, message, Tabs, Tag, Descriptions, Spin, Typography, Row, Col, Divider, Alert, Upload } from 'antd';
import { SaveOutlined, ApiOutlined, CheckCircleOutlined, WarningOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Title, Text } = Typography;

const channelMeta: Record<string, { name: string; icon: string; color: string }> = {
  cash: { name: '现金', icon: '💵', color: 'green' },
  wechat_pay: { name: '微信支付', icon: '💚', color: 'success' },
  alipay: { name: '支付宝', icon: '💙', color: 'blue' },
  bank_transfer: { name: '银行转账', icon: '🏦', color: 'gold' }
};

const PaymentSettings: React.FC = () => {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, any>>({});
  const [forms] = [Form.useForm()]; // placeholder

  const load = async () => {
    setLoading(true);
    try {
      const res = await request.get('/payment/channels');
      setChannels(Array.isArray(res.data) ? res.data : (res.data?.list || res.data?.data || []));
    } catch (e) { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (id: number, values: any) => {
    setSaving(true);
    try {
      await request.put(`/payment/channels/${id}`, values);
      message.success('配置已保存');
      load();
    } catch (e: any) {
      message.error(e.response?.data?.message || '保存失败');
    }
    setSaving(false);
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      const res = await request.post(`/payment/channels/${id}/test`);
      setTestResults(prev => ({ ...prev, [id]: res.data || {} }));
      const data = res.data || {};
      if (data?.status === 'ready') message.success('配置检查通过');
      else message.warning('配置不完整，请补充');
    } catch (e: any) {
      message.error('测试失败');
    }
    setTesting(null);
  };

  // 收款码上传处理
  const handleQrUpload = async (file: File, channel: any) => {
    try {
      const buffer = await file.arrayBuffer();
      await request.post(
        `/payment/qrcode/upload?channel=${channel.channel_code}&channel_id=${channel.id}`,
        buffer,
        { headers: { 'Content-Type': file.type || 'image/png' } }
      );
      message.success('收款码上传成功');
      load(); // 刷新数据
    } catch (e: any) {
      message.error('上传失败: ' + (e.message || '未知错误'));
    }
    return false; // 阻止antd默认上传行为
  };

  // 删除收款码
  const handleDeleteQr = async (channel: any) => {
    try {
      await request.put(`/payment/channels/${channel.id}`, { qrcode_url: null });
      message.success('收款码已删除');
      load();
    } catch (e: any) {
      message.error('删除失败');
    }
  };

  // 收款码上传区域组件
  const QrCodeSection = ({ channel, color }: { channel: any; color: string }) => (
    <Card size="small" title={<span style={{ color }}>💳 收款码图片（固定码）</span>} style={{ marginBottom: 16, borderColor: color }}>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="无商户号时使用"
        description="上传微信/支付宝个人收款码图片后，POS收银选择对应支付方式时会展示该二维码。顾客扫码付款后，收银员听到手机到账播报，点击确认即可记账。" />
      {channel.qrcode_url ? (
        <div style={{ textAlign: 'center' }}>
          <img src={channel.qrcode_url} alt="收款码" style={{ maxWidth: 200, maxHeight: 200, border: '1px solid #d9d9d9', borderRadius: 8, padding: 8 }} />
          <div style={{ marginTop: 8 }}>
            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => handleDeleteQr(channel)}>删除收款码</Button>
          </div>
        </div>
      ) : (
        <Upload
          accept="image/png,image/jpeg,image/webp"
          showUploadList={false}
          beforeUpload={(file) => { handleQrUpload(file, channel); return false; }}
        >
          <Button icon={<UploadOutlined />} type="primary" style={{ backgroundColor: color }}>点击上传收款码</Button>
        </Upload>
      )}
    </Card>
  );

  const renderWechatForm = (ch: any) => (
    <Form layout="vertical" initialValues={ch} onFinish={(v) => handleSave(ch.id, v)}>
      <QrCodeSection channel={ch} color="#07c160" />
      <Divider orientation="left">API对接（商户号专用，可选）</Divider>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="wechat_appid" label="AppID（公众号/小程序/APP）"><Input placeholder="wx开头的应用ID" /></Form.Item></Col>
        <Col span={12}><Form.Item name="wechat_mch_id" label="微信商户号"><Input placeholder="如 1600000000" /></Form.Item></Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="wechat_api_key" label="APIv3密钥"><Input.Password placeholder="留空则不修改" /></Form.Item></Col>
        <Col span={12}><Form.Item name="wechat_notify_url" label="支付回调地址"><Input placeholder="https://yourdomain.com/api/payment/callback/wechat_pay" /></Form.Item></Col>
      </Row>
      <Form.Item name="wechat_cert_path" label="商户证书路径（apiclient_cert.pem）"><Input placeholder="/path/to/apiclient_cert.pem" /></Form.Item>
      <Divider orientation="left">手续费设置</Divider>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="fee_rate" label="手续费率"><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} addonAfter="%" formatter={v => v ? `${(Number(v) * 100).toFixed(2)}` : ''} parser={v => Number(v) / 100 as any} /></Form.Item></Col>
        <Col span={12}><Form.Item name="fee_fixed" label="每笔固定手续费"><InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" /></Form.Item></Col>
      </Row>
      <Space>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button>
        <Button icon={<ApiOutlined />} loading={testing === ch.id} onClick={() => handleTest(ch.id)}>测试连接</Button>
        <Form.Item name="is_enabled" valuePropName="checked" noStyle><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
        <Form.Item name="is_default" valuePropName="checked" noStyle><Switch checkedChildren="默认" unCheckedChildren="非默认" /></Form.Item>
      </Space>
      {testResults[ch.id] && (
        <Alert style={{ marginTop: 16 }} type={testResults[ch.id].status === 'ready' ? 'success' : 'warning'}
          message={testResults[ch.id].message}
          description={testResults[ch.id].checks?.map((c: any, i: number) => (
            <div key={i}>{c.ok ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <WarningOutlined style={{ color: '#faad14' }} />} {c.item}: {c.msg}</div>
          ))} />
      )}
      <Alert style={{ marginTop: 12 }} type="info" showIcon message="对接说明"
        description="微信支付需企业资质（营业执照+对公账户）。配置完成后，系统将通过微信支付V3 API统一下单，支持JSAPI/APP/H5/Native扫码。当前为接口预留阶段，部署时填入真实商户凭证即可启用。" />
    </Form>
  );

  const renderAlipayForm = (ch: any) => (
    <Form layout="vertical" initialValues={ch} onFinish={(v) => handleSave(ch.id, v)}>
      <QrCodeSection channel={ch} color="#1677ff" />
      <Divider orientation="left">API对接（商户号专用，可选）</Divider>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="alipay_app_id" label="支付宝应用ID (APPID)"><Input placeholder="如 2021000000000000" /></Form.Item></Col>
        <Col span={12}><Form.Item name="alipay_sandbox" label="沙箱环境" valuePropName="checked"><Switch checkedChildren="沙箱" unCheckedChildren="正式" /></Form.Item></Col>
      </Row>
      <Form.Item name="alipay_private_key" label="应用私钥"><Input.TextArea rows={3} placeholder="留空则不修改（RSA2私钥）" /></Form.Item>
      <Form.Item name="alipay_public_key" label="支付宝公钥"><Input.TextArea rows={3} placeholder="留空则不修改" /></Form.Item>
      <Form.Item name="alipay_notify_url" label="异步回调地址"><Input placeholder="https://yourdomain.com/api/payment/callback/alipay" /></Form.Item>
      <Divider orientation="left">手续费设置</Divider>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="fee_rate" label="手续费率"><InputNumber min={0} max={1} step={0.001} style={{ width: '100%' }} formatter={v => v ? `${(Number(v) * 100).toFixed(2)}%` : ''} parser={v => Number((v as string).replace('%', '')) / 100 as any} /></Form.Item></Col>
        <Col span={12}><Form.Item name="fee_fixed" label="每笔固定手续费"><InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" /></Form.Item></Col>
      </Row>
      <Space>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button>
        <Button icon={<ApiOutlined />} loading={testing === ch.id} onClick={() => handleTest(ch.id)}>测试连接</Button>
        <Form.Item name="is_enabled" valuePropName="checked" noStyle><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
      </Space>
      {testResults[ch.id] && (
        <Alert style={{ marginTop: 16 }} type={testResults[ch.id].status === 'ready' ? 'success' : 'warning'} message={testResults[ch.id].message}
          description={testResults[ch.id].checks?.map((c: any, i: number) => (
            <div key={i}>{c.ok ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <WarningOutlined style={{ color: '#faad14' }} />} {c.item}: {c.msg}</div>
          ))} />
      )}
      <Alert style={{ marginTop: 12 }} type="info" showIcon message="对接说明"
        description="支付宝当面付/电脑网站支付需企业或个体工商户资质。填入APPID+RSA2密钥后即可调用alipay.trade.precreate/create接口。当前为接口预留阶段。" />
    </Form>
  );

  const renderBankForm = (ch: any) => (
    <Form layout="vertical" initialValues={ch} onFinish={(v) => handleSave(ch.id, v)}>
      <Alert type="warning" showIcon style={{ marginBottom: 16 }}
        message="银行转账为线下支付方式"
        description="客户通过网银/柜台转账到指定银行账户，财务确认到账后手动标记收款。系统记录交易流水，不直接对接银行网关（如需银企直联需另行开通）。" />
      <Row gutter={16}>
        <Col span={12}><Form.Item name="bank_name" label="开户银行" rules={[{ required: true }]}><Input placeholder="如 中国建设银行" /></Form.Item></Col>
        <Col span={12}><Form.Item name="bank_account_name" label="账户名称" rules={[{ required: true }]}><Input placeholder="如 武汉市江岸区宇航智荟电商营业部" /></Form.Item></Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}><Form.Item name="bank_account_no" label="银行账号" rules={[{ required: true }]}><Input placeholder="对公银行账号" /></Form.Item></Col>
        <Col span={12}><Form.Item name="bank_branch" label="开户支行"><Input placeholder="如 武汉江岸支行" /></Form.Item></Col>
      </Row>
      <Space>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button>
        <Button icon={<ApiOutlined />} loading={testing === ch.id} onClick={() => handleTest(ch.id)}>验证配置</Button>
        <Form.Item name="is_enabled" valuePropName="checked" noStyle><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
        <Form.Item name="is_default" valuePropName="checked" noStyle><Switch checkedChildren="默认" unCheckedChildren="非默认" /></Form.Item>
      </Space>
      {testResults[ch.id] && (
        <Alert style={{ marginTop: 16 }} type={testResults[ch.id].status === 'ready' ? 'success' : 'warning'} message={testResults[ch.id].message}
          description={testResults[ch.id].checks?.map((c: any, i: number) => (
            <div key={i}>{c.ok ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <WarningOutlined style={{ color: '#faad14' }} />} {c.item}: {c.msg}</div>
          ))} />
      )}
    </Form>
  );

  const renderCashForm = (ch: any) => (
    <Form layout="vertical" initialValues={ch} onFinish={(v) => handleSave(ch.id, v)}>
      <Alert type="success" showIcon style={{ marginBottom: 16 }} message="现金支付无需配置，直接可用" />
      <Form.Item name="is_enabled" label="启用现金支付" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item>
      <Form.Item name="is_default" label="设为默认支付方式" valuePropName="checked"><Switch checkedChildren="默认" unCheckedChildren="非默认" /></Form.Item>
      <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存</Button>
    </Form>
  );

  const tabItems = channels.map(ch => ({
    key: String(ch.id),
    label: <Space>{channelMeta[ch.channel_code]?.icon} {ch.channel_name}
      {ch.is_default && <Tag color="blue">默认</Tag>}
      {ch.is_enabled ? <Tag color="green">已启用</Tag> : <Tag>未启用</Tag>}
    </Space>,
    children: (
      <div>
        <Title level={5}>{channelMeta[ch.channel_code]?.icon} {ch.channel_name} 配置</Title>
        {ch.channel_code === 'wechat_pay' && renderWechatForm(ch)}
        {ch.channel_code === 'alipay' && renderAlipayForm(ch)}
        {ch.channel_code === 'bank_transfer' && renderBankForm(ch)}
        {ch.channel_code === 'cash' && renderCashForm(ch)}
      </div>
    )
  }));

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>支付渠道配置</Title>
      <Card size="small">
        <Tabs items={tabItems} />
      </Card>
    </div>
  );
};

export default PaymentSettings;
