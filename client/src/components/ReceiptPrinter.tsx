import React from 'react';
import { Button, Modal } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';

// 小票数据结构
export interface ReceiptItem {
  name: string;
  quantity: number | string;
  unit?: string;
  unitPrice: number | string;
}
export interface ReceiptData {
  shopName?: string;      // 店铺名（不传则取登录用户的账套名）
  orderNo: string;       // 单号
  orderDate?: string;     // 日期时间
  items: ReceiptItem[];   // 商品明细
  totalAmount: number;     // 总金额
  discountAmount?: number; // 优惠
  actualAmount: number;    // 实收
  paymentMethod?: string;  // 支付方式
  customerName?: string;   // 客户
  operator?: string;       // 收银员
  remark?: string;         // 备注
  thankText?: string;      // 底部提示
}

export const PAY_TEXT: Record<string, string> = {
  cash: '现金', wechat: '微信支付', alipay: '支付宝', card: '银行卡',
};

// 把小票渲染成 58mm 热敏纸 HTML
const buildReceiptHtml = (r: ReceiptData): string => {
  const shop = r.shopName || '购物小票';
  const date = r.orderDate ? new Date(r.orderDate) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dt = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const money = (v: any) => Number(v || 0).toFixed(2);

  const esc = (s: any) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 商品行：名称一行，数量×单价 金额一行（热敏纸窄，这样最稳）
  const itemRows = r.items.map((it) => {
    const subtotal = Number(it.quantity) * Number(it.unitPrice);
    return `
      <div class="r-row">
        <div class="r-name">${esc(it.name)}</div>
        <div class="r-line">
          <span>${Number(it.quantity)}${it.unit ? esc(it.unit) : ''} × ¥${money(it.unitPrice)}</span>
          <span class="r-amt">¥${money(subtotal)}</span>
        </div>
      </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>小票 ${esc(r.orderNo)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color:#000; background:#fff; }
  .receipt { width: 300px; margin: 0 auto; padding: 10px 12px; font-size: 13px; line-height: 1.55; }
  .r-shop { text-align:center; font-size: 17px; font-weight:700; margin-bottom:2px; }
  .r-title { text-align:center; font-size: 14px; margin-bottom: 6px; }
  .r-meta { text-align:center; font-size: 12px; color:#333; margin-bottom: 6px; }
  .r-sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r-head-row { display:flex; justify-content:space-between; font-size:12px; }
  .r-name { font-size: 13px; word-break: break-all; }
  .r-line { display:flex; justify-content:space-between; font-size:12px; color:#222; }
  .r-amt { white-space:nowrap; }
  .r-total { display:flex; justify-content:space-between; font-size:14px; font-weight:700; }
  .r-foot { text-align:center; font-size:12px; margin-top:8px; line-height:1.8; }
  @media print {
    @page { size: 80mm auto; margin: 2mm; }
    body { -webkit-print-color-adjust: exact; }
    .no-print { display:none !important; }
  }
</style></head>
<body>
  <div class="receipt">
    <div class="r-shop">${esc(shop)}</div>
    <div class="r-title">销 售 小 票</div>
    <div class="r-meta">${dt}</div>
    <div class="r-sep"></div>
    <div class="r-head-row"><span>单号：${esc(r.orderNo)}</span><span>${r.paymentMethod ? '付款：' + esc(PAY_TEXT[r.paymentMethod] || r.paymentMethod) : ''}</span></div>
    ${r.customerName ? `<div class="r-head-row"><span>客户：${esc(r.customerName)}</span></div>` : ''}
    ${r.operator ? `<div class="r-head-row"><span>收银员：${esc(r.operator)}</span></div>` : ''}
    <div class="r-sep"></div>
    ${itemRows}
    <div class="r-sep"></div>
    <div class="r-head-row"><span>合计</span><span>¥${money(r.totalAmount)}</span></div>
    ${Number(r.discountAmount) > 0 ? `<div class="r-head-row"><span>优惠</span><span>-¥${money(r.discountAmount)}</span></div>` : ''}
    <div class="r-total"><span>实收</span><span>¥${money(r.actualAmount)}</span></div>
    <div class="r-sep"></div>
    <div class="r-foot">
      ${r.remark ? `<div>${esc(r.remark)}</div>` : ''}
      <div>${esc(r.thankText || '感谢惠顾，欢迎再次光临！')}</div>
    </div>
  </div>
  <div class="no-print" style="text-align:center; margin: 12px 0;">
    <button onclick="window.print()" style="padding:8px 28px;font-size:15px;">🖨️ 打印小票</button>
    <div style="font-size:12px;color:#666;margin-top:8px;">电脑连普通打印机/热敏小票机直接打印；<br>手机选「打印」可连蓝牙小票打印机，或截图发给客户</div>
  </div>
</body></html>`;
};

// 直接调起打印（开新窗口写入小票HTML并打印）
export const printReceipt = (data: ReceiptData) => {
  const html = buildReceiptHtml(data);
  const w = window.open('', '_blank', 'width=360,height=640');
  if (!w) {
    alert('浏览器拦截了弹窗，请允许弹出窗口后重试');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // 等样式渲染完再打印
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* 用户可手动点按钮 */ } }, 350);
};

// 带小票预览的 Modal（可选使用）
export const ReceiptPreviewModal: React.FC<{
  open: boolean;
  data: ReceiptData | null;
  onClose: () => void;
}> = ({ open, data, onClose }) => {
  if (!data) return null;
  return (
    <Modal
      title="小票预览"
      open={open}
      onCancel={onClose}
      width={360}
      footer={[
        <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => printReceipt(data)}>打印小票</Button>,
        <Button key="close" onClick={onClose}>关闭</Button>,
      ]}
    >
      <div style={{ background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
        <div style={{ background: '#fff', width: 260, margin: '0 auto', padding: '10px', fontSize: 12, lineHeight: 1.6, fontFamily: 'Microsoft YaHei' }}>
          <div style={{ textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{data.shopName || '购物小票'}</div>
          <div style={{ textAlign: 'center', margin: '4px 0' }}>销售小票</div>
          <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>单号：{data.orderNo}</span>
          </div>
          <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
          {data.items.map((it, i) => (
            <div key={i}>
              <div>{it.name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#444' }}>
                <span>{it.quantity}{it.unit || ''} × ¥{Number(it.unitPrice).toFixed(2)}</span>
                <span>¥{(Number(it.quantity) * Number(it.unitPrice)).toFixed(2)}</span>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
            <span>实收</span><span>¥{Number(data.actualAmount).toFixed(2)}</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, color: '#666' }}>
            {data.thankText || '感谢惠顾，欢迎再次光临！'}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ReceiptPreviewModal;
