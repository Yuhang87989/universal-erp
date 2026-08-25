/**
 * 语音播报服务
 * 使用浏览器 Web Speech API (SpeechSynthesis)
 * 支持中文语音播报，可开关控制
 */

let enabled = true;
let voice: SpeechSynthesisVoice | null = null;

// 初始化中文语音
const initVoice = () => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const voices = window.speechSynthesis.getVoices();
  // 优先选中文语音
  voice = voices.find(v => v.lang.startsWith('zh')) || voices[0] || null;
};

if (typeof window !== 'undefined' && window.speechSynthesis) {
  initVoice();
  window.speechSynthesis.onvoiceschanged = initVoice;
}

export const voiceService = {
  /**
   * 播报文本
   */
  speak(text: string, options?: { rate?: number; pitch?: number; volume?: number }) {
    if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel(); // 停止之前的播报
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = 'zh-CN';
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;
      utterance.volume = options?.volume ?? 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('语音播报失败:', e);
    }
  },

  /**
   * 播报销售订单
   */
  speakSale(amount: number, paymentMethod?: string) {
    const methodMap: Record<string, string> = { cash: '现金', wechat: '微信', alipay: '支付宝', card: '银行卡' };
    const method = paymentMethod ? methodMap[paymentMethod] || paymentMethod : '';
    this.speak(`收款成功，${method ? method + '收款' : ''}${amount.toFixed(2)}元`);
  },

  /**
   * 播报库存预警
   */
  speakAlert(productName: string, quantity: number, unit: string) {
    this.speak(`注意，商品${productName}库存不足，当前库存${quantity}${unit}，请及时补货`, { rate: 0.9 });
  },

  /**
   * 播报入库确认
   */
  speakStockIn(count: number, totalAmount: number) {
    this.speak(`入库确认成功，共${count}种商品，总金额${totalAmount.toFixed(2)}元`);
  },

  /**
   * 播报出库确认
   */
  speakStockOut(count: number) {
    this.speak(`出库确认成功，共${count}种商品`);
  },

  /**
   * 播报调拨
   */
  speakTransfer(fromWarehouse: string, toWarehouse: string) {
    this.speak(`调拨完成，从${fromWarehouse}调入${toWarehouse}`);
  },

  /**
   * 停止播报
   */
  stop() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  },

  /**
   * 开关
   */
  setEnabled(val: boolean) {
    enabled = val;
    if (!val) this.stop();
  },

  isEnabled() { return enabled; },

  /**
   * 检测浏览器是否支持
   */
  isSupported() {
    return typeof window !== 'undefined' && !!window.speechSynthesis;
  }
};
