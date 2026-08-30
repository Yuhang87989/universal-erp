import React, { useState, useEffect } from 'react';
import { Card, Input, Button, List, Tag, Space, Typography, InputNumber, message, Modal, Select } from 'antd';
import { SearchOutlined, PlusOutlined, MinusOutlined, DeleteOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import request from '../../api/request';
import { voiceService } from '../../services/voiceService';
import ReceiptPreviewModal, { printReceipt, ReceiptData } from '../../components/ReceiptPrinter';

const { Title, Text } = Typography;

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
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => { loadProducts(); }, []);

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
      const orderNo = res.data?.data?.orderNo || '';
      message.success(`收款成功！共 ¥${amount.toFixed(2)}`);
      voiceService.speakSale(amount, paymentMethod);
      // 构造小票
      let shopName = '宇航智荟';
      try { const u = JSON.parse(localStorage.getItem('user') || '{}'); shopName = u.tenantName || shopName; } catch {}
      const receiptData: ReceiptData = {
        shopName,
        orderNo: String(orderNo || '-'),
        orderDate: new Date().toISOString(),
        items: cart.map(item => ({ name: item.name, quantity: item.quantity, unit: item.unit, unitPrice: item.price })),
        totalAmount,
        actualAmount: amount,
        paymentMethod,
      };
      const savedCart = cart;
      setCart([]);
      setPaymentVisible(false);
      setReceipt(receiptData);
      loadProducts();
      // 语音播报后自动调起打印窗口
      setTimeout(() => printReceipt(receiptData), 800);
      void savedCart;
    } catch (err: any) {
      message.error(err.message || '收款失败');
    }
  };

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

      <Modal title="确认收款" open={paymentVisible} onOk={handleCheckout} onCancel={() => setPaymentVisible(false)} okText="确认收款">
        <div style={{ margin: '16px 0' }}>
          <Text style={{ fontSize: 20 }}>应收金额：<strong style={{ color: '#ff4d4f' }}>¥{totalAmount.toFixed(2)}</strong></Text>
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
      </Modal>

      <ReceiptPreviewModal open={!!receipt} data={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
};

export default POS;
