import React, { useState, useEffect } from 'react';
import { Card, Input, Button, List, Tag, Space, Typography, InputNumber, message, Modal, Select, Divider } from 'antd';
import { SearchOutlined, PlusOutlined, MinusOutlined, DeleteOutlined, ShoppingCartOutlined, QrcodeOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';

const { Title, Text } = Typography;

// POS支付方式 → payment_channels channel_code 映射
const METHOD_TO_CHANNEL: Record<string, string> = {
  wechat: 'wechat_pay',
  alipay: 'alipay',
};

const CHANNEL_LABEL: Record<string, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
};

const CHANNEL_COLOR: Record<string, string> = {
  wechat: '#07c160',
  alipay: '#1677ff',
};

interface CartItem {
  productId: number;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  stock: number;
}

const POS: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [channels, setChannels] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
    loadChannels();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await request.get('/products', { params: { pageSize: 200, keyword } });
      const payload = res.data?.data || res.data || {};
      const list = payload.list || payload || [];
      setProducts(list.filter((p: any) => p.stock_quantity > 0));
    } catch (err) {
      console.error(err);
    }
  };

  const loadChannels = async () => {
    try {
      const res = await request.get('/payment/channels');
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.list || []);
      setChannels(list);
    } catch (err) {
      console.error(err);
    }
  };

  // 获取当前支付方式的收款码URL
  const getQrUrl = (): string | null => {
    const channelCode = METHOD_TO_CHANNEL[paymentMethod];
    if (!channelCode) return null;
    const ch = channels.find(c => c.channel_code === channelCode && c.is_enabled);
    return ch?.qrcode_url || null;
  };

  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_quantity) {
          message.warning('库存不足');
          return prev;
        }
        return prev.map(item =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, {
        productId: product.id,
        name: product.name,
        unit: product.unit,
        price: product.sell_price,
        quantity: 1,
        stock: product.stock_quantity
      }];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return item;
        if (newQty > item.stock) { message.warning('库存不足'); return item; }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    if (!cart.length) { message.warning('购物车为空'); return; }

    try {
      const res = await request.post('/sales', {
        orderType: 'pos',
        paymentMethod,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.price
        }))
      });
      const amount = Number(res.data?.data?.actualAmount ?? totalAmount);
      message.success(`收款成功！共 ¥${amount.toFixed(2)}`);
      voiceService.speakSale(amount, paymentMethod);
      setCart([]);
      setPaymentVisible(false);
      loadProducts();
    } catch (err: any) {
      message.error(err.message || '收款失败');
    }
  };

  const qrUrl = getQrUrl();
  const isQrPayment = (paymentMethod === 'wechat' || paymentMethod === 'alipay') && qrUrl;

  return (
    <div>
      <Title level={4}>POS收银</Title>
      <div className="pos-container">
        <div className="pos-products">
          <Input
            placeholder="搜索商品名称/条码"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onPressEnter={loadProducts}
            style={{ marginBottom: 16 }}
            size="large"
            autoFocus
          />
          <div className="pos-product-grid">
            {products.map(p => (
              <div key={p.id} className="pos-product-item" onClick={() => addToCart(p)}>
                <div className="product-name">{p.name}</div>
                <div className="product-price">¥{p.sell_price}/{p.unit}</div>
                <div style={{ fontSize: 11, color: '#999' }}>库存: {p.stock_quantity}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="pos-cart">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <ShoppingCartOutlined style={{ fontSize: 20, marginRight: 8 }} />
            <Title level={5} style={{ margin: 0 }}>购物车</Title>
            <Tag style={{ marginLeft: 'auto' }}>{cart.length} 件</Tag>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                点击左侧商品添加到购物车
              </div>
            ) : (
              <List
                size="small"
                dataSource={cart}
                renderItem={(item: CartItem) => (
                  <List.Item style={{ padding: '8px 0' }}>
                    <div style={{ flex: 1 }}>
                      <Text strong>{item.name}</Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>¥{item.price}/{item.unit}</Text>
                    </div>
                    <Space>
                      <Button size="small" icon={<MinusOutlined />} onClick={() => updateQuantity(item.productId, -1)} />
                      <span style={{ minWidth: 24, textAlign: 'center' }}>{item.quantity}</span>
                      <Button size="small" icon={<PlusOutlined />} onClick={() => updateQuantity(item.productId, 1)} />
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeFromCart(item.productId)} />
                    </Space>
                    <Text style={{ width: 70, textAlign: 'right' }}>¥{(item.price * item.quantity).toFixed(2)}</Text>
                  </List.Item>
                )}
              />
            )}
          </div>

          <div style={{ borderTop: '2px solid #1677ff', paddingTop: 16, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={{ fontSize: 16 }}>合计：</Text>
              <Text style={{ fontSize: 24, fontWeight: 700, color: '#ff4d4f' }}>¥{totalAmount.toFixed(2)}</Text>
            </div>
            <Button type="primary" size="large" block onClick={() => cart.length && setPaymentVisible(true)} disabled={!cart.length}>
              结 算
            </Button>
          </div>
        </div>
      </div>

      <Modal
        title={isQrPayment ? `${CHANNEL_LABEL[paymentMethod]} - 扫码收款` : '确认收款'}
        open={paymentVisible}
        onOk={handleCheckout}
        onCancel={() => setPaymentVisible(false)}
        okText={isQrPayment ? '✅ 确认已到账' : '确认收款'}
        width={isQrPayment ? 480 : 420}
      >
        <div style={{ margin: '16px 0' }}>
          <Text style={{ fontSize: 20 }}>应收金额：<strong style={{ color: '#ff4d4f', fontSize: 28 }}>¥{totalAmount.toFixed(2)}</strong></Text>
        </div>
        <div>
          <Text>支付方式：</Text>
          <Select value={paymentMethod} onChange={setPaymentMethod} style={{ width: 160, marginTop: 8 }}>
            <Select.Option value="cash">现金</Select.Option>
            <Select.Option value="wechat">微信支付</Select.Option>
            <Select.Option value="alipay">支付宝</Select.Option>
            <Select.Option value="card">银行卡</Select.Option>
          </Select>
        </div>

        {/* 二维码展示区域 */}
        {isQrPayment && (
          <div style={{
            marginTop: 20,
            textAlign: 'center',
            padding: 16,
            background: '#fafafa',
            borderRadius: 12,
            border: `2px solid ${CHANNEL_COLOR[paymentMethod]}`
          }}>
            <div style={{ marginBottom: 8 }}>
              <QrcodeOutlined style={{ fontSize: 20, color: CHANNEL_COLOR[paymentMethod] }} />
              <Text strong style={{ fontSize: 16, marginLeft: 8 }}>请顾客扫码支付</Text>
            </div>
            <img
              src={qrUrl!}
              alt={`${CHANNEL_LABEL[paymentMethod]}收款码`}
              style={{
                width: 280,
                height: 280,
                objectFit: 'contain',
                border: '1px solid #e8e8e8',
                borderRadius: 8,
                padding: 8,
                background: '#fff'
              }}
            />
            <div style={{ marginTop: 12, color: '#666', fontSize: 13 }}>
              请让顾客扫描上方二维码完成支付
            </div>
            <div style={{
              marginTop: 8,
              padding: '8px 16px',
              background: CHANNEL_COLOR[paymentMethod],
              color: '#fff',
              borderRadius: 6,
              fontSize: 14,
              display: 'inline-block'
            }}>
              🔔 听到手机到账播报后，点击下方「确认已到账」
            </div>
          </div>
        )}

        {(paymentMethod === 'wechat' || paymentMethod === 'alipay') && !qrUrl && (
          <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591' }}>
            <Text type="warning">⚠️ 尚未上传{CHANNEL_LABEL[paymentMethod]}收款码，请先到「财务 → 支付设置」上传</Text>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default POS;
