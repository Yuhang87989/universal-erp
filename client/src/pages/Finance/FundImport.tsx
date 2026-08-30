import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, Button, Upload, Table, Tag, Alert, Space, Typography, message, Progress, Select, DatePicker, Switch } from 'antd';
import { ImportOutlined, UploadOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

// 动态加载SheetJS：优先本地同源文件，失败回退多个CDN
const XLSX_SRC_LIST = [
  '/vendor/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
const loadXLSX = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
    let idx = 0;
    const tryNext = () => {
      if (idx >= XLSX_SRC_LIST.length) { reject(new Error('SheetJS加载失败，请刷新重试')); return; }
      const src = XLSX_SRC_LIST[idx++];
      const old = document.getElementById('xlsx-script');
      if (old) old.remove();
      const s = document.createElement('script');
      s.id = 'xlsx-script';
      s.src = src;
      s.async = true;
      s.onload = () => { if ((window as any).XLSX) resolve((window as any).XLSX); else tryNext(); };
      s.onerror = () => { s.remove(); tryNext(); };
      document.head.appendChild(s);
    };
    tryNext();
  });
};

interface TxnRow {
  _row: number;
  txDate: string;
  direction: 'in' | 'out';
  amount: number;
  counterpartyName: string;
  remark: string;
  businessType: string;
  _status: 'pending' | 'ok' | 'err';
  _msg?: string;
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['交易时间', '交易创建时间', '记账日期', '交易日期', '付款时间', '入账时间', '完成时间', '日期', 'date'],
  amountIn: ['收入金额', '收入(元)', '收入（元）', '贷方金额', '收款金额', '收入'],
  amountOut: ['支出金额', '支出(元)', '支出（元）', '借方金额', '付款金额', '支出'],
  amount: ['交易金额', '金额(元)', '金额（元）', '发生额', '金额(人民币)', '金额（人民币）', 'amount', '金额'],
  direction: ['收/支', '收支方向', '资金方向', '收支类型', '资金动向', '收支', 'direction'],
  counterparty: ['交易对方', '对方户名', '对方名称', '商户名称', '对方账号名称', '对方姓名', '交易对象', 'counterparty'],
  remark: ['商品说明', '商品名称', '交易摘要', '交易说明', '备注信息', '附言', '摘要', '说明', '备注', '商品', 'remark'],
  status: ['当前状态', '交易状态', '状态'],
};

// 列名归一化：去空格和星号、全角括号转半角、转小写
const normHeader = (v: any): string =>
  String(v == null ? '' : v)
    .replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/[\s*]/g, '').toLowerCase();

// 列匹配：归一化后精确匹配；表头包含别名（如表头"交易创建时间"类）放行；
// 别名包含表头仅当表头>=3字（防"金额/类型"等2字短表头被"收入金额/收支类型"误中）
const matchColName = (header: any, aliases: string[]): boolean => {
  const h = normHeader(header);
  if (h.length < 2) return false;
  const normed = aliases.map(normHeader).filter(a => a.length >= 2);
  if (normed.includes(h)) return true;
  return normed.some(a => h.includes(a) || (h.length >= 3 && a.includes(h)));
};

// 金额解析：去￥¥逗号空格；括号或负号表示负数
const parseAmountVal = (v: any): number => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[￥¥,，\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -n : n;
};

const INCOME_KEYWORDS = ['收入', '收款', '退款', '还款', '工资', '分红', '利息', '收'];
const EXPENSE_KEYWORDS = ['支出', '付款', '消费', '转账', '扣费', '缴费', '提现', '采购', '付'];

const guessBusinessType = (text: string, direction: 'in' | 'out'): string => {
  const t = text || '';
  if (direction === 'in') {
    if (/销售|货款|收款|订单|商品/.test(t)) return 'sales_receipt';
    if (/退款/.test(t)) return 'refund_in';
    return 'other_income';
  } else {
    if (/采购|进货|供应商|货款/.test(t)) return 'purchase_pay';
    if (/工资|薪/.test(t)) return 'salary';
    if (/房租|租金|物业/.test(t)) return 'rent';
    if (/水电|电费|水费|燃气|网费|话费/.test(t)) return 'utilities';
    if (/运费|快递|物流/.test(t)) return 'freight';
    if (/差旅|交通|打车|加油/.test(t)) return 'travel';
    if (/手续费|利息/.test(t)) return 'finance';
    if (/广告|推广/.test(t)) return 'marketing';
    return 'other_expense';
  }
};

const FundImport: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState<number | undefined>();
  const [skipRefund, setSkipRefund] = useState(false);
  const [skipTransfer, setSkipTransfer] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const openModal = async () => {
    setOpen(true);
    setRows([]);
    setProgress(0);
    try {
      const res = await request.get('/fund/accounts');
      const list = res.data?.data?.list || res.data?.list || [];
      setAccounts(list);
      if (list.length) setAccountId(list[0].id);
    } catch {}
  };

  // 在 aoa 二维数组里探测表头行：官方账单（微信/支付宝/银行）前面有多行说明，
  // 真正的表头行含"日期/时间"+金额/收支关键词，得分最高
  const findHeaderRow = (aoa: any[][]): { rowIdx: number; cols: Record<string, number> } => {
    const weights: Record<string, number> = { date: 3, amountIn: 2, amountOut: 2, amount: 2, direction: 2, counterparty: 1, remark: 1, status: 1 };
    let best = { rowIdx: -1, score: 0, cols: {} as Record<string, number> };
    const scanLimit = Math.min(aoa.length, 30);
    for (let i = 0; i < scanLimit; i++) {
      const row = aoa[i] || [];
      const cols: Record<string, number> = {};
      const occupied = new Set<number>(); // 列互斥：一列只归一个字段
      let score = 0;
      row.forEach((cell, ci) => {
        if (occupied.has(ci)) return;
        for (const field of Object.keys(HEADER_ALIASES)) {
          if (cols[field] !== undefined) continue;
          if (!matchColName(cell, HEADER_ALIASES[field])) continue;
          // 方向列双保险：下方数据单元格必须真的是"收入/支出/收/支"类值
          if (field === 'direction') {
            const vals = [];
            for (let k = i + 1; k < Math.min(i + 7, aoa.length); k++) {
              const v = String((aoa[k] || [])[ci] || '').trim();
              if (v) vals.push(v);
            }
            const ok = vals.some(v => v.length <= 6 && /^(收|支)/.test(v));
            if (!ok) continue;
          }
          cols[field] = ci;
          occupied.add(ci);
          score += weights[field] || 1;
          break;
        }
      });
      if (score > best.score) best = { rowIdx: i, score, cols };
    }
    return { rowIdx: best.rowIdx, cols: best.cols };
  };

  const parseDate = (v: any): string => {
    if (!v) return dayjs().format('YYYY-MM-DD');
    if (v instanceof Date) return dayjs(v).format('YYYY-MM-DD');
    if (typeof v === 'number') {
      // Excel serial date
      const d = XLSXdate(v);
      return dayjs(d).format('YYYY-MM-DD');
    }
    const s = String(v).trim();
    // 常见格式：2026-08-28 12:34:56 / 2026/08/28 / 2026.08.28
    const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const d = dayjs(s);
    return d.isValid() ? d.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
  };

  const XLSXdate = (serial: number): Date => {
    const utcDays = Math.floor(serial - 25569);
    const utcVal = utcDays * 86400;
    const dateInfo = new Date(utcVal * 1000);
    const totalSeconds = (serial - Math.floor(serial)) * 86400;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds - hours * 3600) / 60);
    dateInfo.setUTCHours(hours, minutes, 0, 0);
    return dateInfo;
  };

  const parseFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // 用二维数组读取：官方账单表头前有多行说明，sheet_to_json 会错把说明行当表头
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) || [];
      if (!aoa.length) { message.warning('文件为空'); setLoading(false); return; }

      const { rowIdx: headerIdx, cols } = findHeaderRow(aoa);
      const iDate = cols.date;
      const iIn = cols.amountIn;
      const iOut = cols.amountOut;
      const iAmt = cols.amount;
      const iDir = cols.direction;
      const iParty = cols.counterparty;
      const iRemark = cols.remark;
      const iStatus = cols.status;

      if (headerIdx < 0 || iDate === undefined) {
        message.error('未识别到日期列，请确认文件包含"交易时间/日期"列；也可点"下载模板"按模板填写');
        setLoading(false);
        return;
      }

      const cell = (r: any[], i: number) => (i === undefined ? '' : r[i]);
      const parsed: TxnRow[] = [];
      for (let idx = headerIdx + 1; idx < aoa.length; idx++) {
        const r = aoa[idx] || [];
        const status = String(cell(r, iStatus) || '');
        if (/关闭|失败|退款中|交易关闭/.test(status)) continue; // 跳过异常交易
        if (skipRefund && /退款/.test(status)) continue;

        let amount = 0;
        let direction: 'in' | 'out' = 'in';
        const inAmt = parseAmountVal(cell(r, iIn));
        const outAmt = parseAmountVal(cell(r, iOut));
        const amtVal = parseAmountVal(cell(r, iAmt));
        if (iIn !== undefined || iOut !== undefined) {
          // 微信/支付宝/银行账单：收入、支出两列
          amount = Math.abs(inAmt) || Math.abs(outAmt);
          direction = Math.abs(inAmt) > 0 ? 'in' : 'out';
        } else if (iAmt !== undefined) {
          // 单列金额 + 收支方向（模板格式）
          amount = Math.abs(amtVal);
          if (iDir !== undefined) {
            const ds = String(cell(r, iDir) || '');
            direction = INCOME_KEYWORDS.some(k => ds.includes(k)) && !EXPENSE_KEYWORDS.some(k => ds.includes(k)) ? 'in' : 'out';
          } else {
            direction = amtVal >= 0 ? 'in' : 'out';
          }
        } else {
          continue;
        }

        if (!amount || amount <= 0) continue;

        const remark = String(cell(r, iRemark) || '').trim();
        const party = String(cell(r, iParty) || '').trim();
        // 跳过内部划转：零钱提现/零钱通/余额宝（钱在自己账户间搬，不算收支）；
        // 用整行文本判断，因为微信"零钱提现"字样在交易类型列。注意"转账"不跳——收到转账是收入
        const rowText = r.map(x => String(x == null ? '' : x)).join(' ');
        if (skipTransfer && /提现|零钱通|余额宝|信用卡还款|余额转入|余额转出/.test(rowText)) continue;

        const dv = cell(r, iDate);
        if (!dv || !String(dv).trim()) continue; // 说明行/汇总行跳过

        parsed.push({
          _row: idx + 1,
          txDate: parseDate(dv),
          direction,
          amount: Math.round(amount * 100) / 100,
          counterpartyName: party,
          remark,
          businessType: guessBusinessType(remark + party, direction),
          _status: 'pending',
        });
      }

      setRows(parsed);
      if (!parsed.length) message.warning(`未解析到有效交易记录（识别到表头在第${headerIdx + 1}行但数据行为空/均被过滤），请检查文件内容`);
    } catch (e: any) {
      message.error(e.message || '解析失败');
    }
    setLoading(false);
  }, [skipRefund, skipTransfer]);

  const downloadTemplate = async () => {
    let XLSX;
    try { XLSX = await loadXLSX(); } catch { message.warning('解析引擎加载失败，请刷新重试'); return; }
    const data = [
      ['交易时间', '收入金额', '支出金额', '交易对方', '商品/备注', '当前状态'],
      ['2026-08-28 10:30:00', 199.00, '', '张三', '销售订单#SO001', '支付成功'],
      ['2026-08-28 14:20:00', '', 50.00, '顺丰速运', '快递费', '支付成功'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 24 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '流水模板');
    XLSX.writeFile(wb, '资金流水导入模板.xlsx');
  };

  const doImport = async () => {
    if (!accountId) { message.warning('请选择目标资金账户'); return; }
    const valid = rows.filter(r => r._status !== 'err');
    if (!valid.length) { message.warning('没有可导入的数据'); return; }

    setImporting(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r._status === 'err') continue;
      try {
        await request.post('/fund/transactions', {
          account_id: accountId,
          direction: r.direction,
          amount: r.amount,
          counterparty_name: r.counterpartyName || '',
          counterparty_type: 'other',
          business_type: r.businessType,
          remark: r.remark || (r.direction === 'in' ? '流水导入-收入' : '流水导入-支出'),
          tx_date: r.txDate,
        });
        r._status = 'ok';
        r._msg = '已导入';
        ok++;
      } catch (e: any) {
        r._status = 'err';
        r._msg = e?.response?.data?.message || e?.message || '失败';
        fail++;
      }
      setRows([...rows]);
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }
    setImporting(false);
    if (ok) message.success(`成功导入 ${ok} 笔${fail ? `，失败 ${fail} 笔` : ''}`);
    if (ok) onSuccess();
  };

  const stats = {
    in: rows.filter(r => r.direction === 'in' && r._status !== 'err').reduce((s, r) => s + r.amount, 0),
    out: rows.filter(r => r.direction === 'out' && r._status !== 'err').reduce((s, r) => s + r.amount, 0),
    count: rows.filter(r => r._status !== 'err').length,
  };

  const columns = [
    { title: '行', dataIndex: '_row', width: 50 },
    { title: '日期', dataIndex: 'txDate', width: 100 },
    {
      title: '方向', dataIndex: 'direction', width: 60,
      render: (d: string) => d === 'in' ? <Tag color="green">收入</Tag> : <Tag color="red">支出</Tag>
    },
    { title: '金额', dataIndex: 'amount', width: 90, render: (v: number) => `¥${v.toFixed(2)}` },
    { title: '对方', dataIndex: 'counterpartyName', width: 130, ellipsis: true },
    { title: '摘要', dataIndex: 'remark', ellipsis: true },
    { title: '业务类型', dataIndex: 'businessType', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    {
      title: '状态', dataIndex: '_status', width: 90, fixed: 'right' as const,
      render: (s: string, r: TxnRow) => {
        if (s === 'ok') return <Tag color="success" icon={<CheckCircleOutlined />}>{r._msg}</Tag>;
        if (s === 'err') return <Tag color="error" icon={<CloseCircleOutlined />}>{r._msg}</Tag>;
        return <Tag>待导入</Tag>;
      }
    },
  ];

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={openModal}>导入流水</Button>
      <Modal
        title="导入资金流水"
        open={open}
        onCancel={() => !importing && setOpen(false)}
        width={920}
        footer={[
          <Button key="tpl" icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>,
          <Button key="cancel" onClick={() => setOpen(false)} disabled={importing}>关闭</Button>,
          <Button key="ok" type="primary" icon={<UploadOutlined />} loading={importing}
            disabled={!rows.length || !accountId} onClick={doImport}>
            导入 {stats.count} 笔
          </Button>,
        ]}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="支持微信/支付宝/银行导出的CSV或Excel，自动识别列名和方向。可在各平台「账单/交易记录」中导出。"
        />
        <Space wrap style={{ marginBottom: 12 }}>
          <Upload accept=".csv,.xlsx,.xls" showUploadList={false} beforeUpload={(f) => { parseFile(f); return false; }}>
            <Button type="primary" ghost icon={<UploadOutlined />} loading={loading}>选择流水文件</Button>
          </Upload>
          <span>目标账户：</span>
          <Select
            value={accountId}
            onChange={setAccountId}
            style={{ width: 180 }}
            placeholder="选择资金账户"
            options={accounts.map(a => ({ value: a.id, label: `${a.account_name}（${a.account_type}）` }))}
          />
          <Switch size="small" checked={skipTransfer} onChange={setSkipTransfer} />
          <Text type="secondary">跳过提现/转账</Text>
          <Switch size="small" checked={skipRefund} onChange={setSkipRefund} />
          <Text type="secondary">跳过退款</Text>
        </Space>

        {rows.length > 0 && (
          <Space style={{ marginBottom: 12, width: '100%' }} size="large">
            <Text>共 <b>{stats.count}</b> 笔</Text>
            <Text style={{ color: '#52c41a' }}>收入 ¥{stats.in.toFixed(2)}</Text>
            <Text style={{ color: '#ff4d4f' }}>支出 ¥{stats.out.toFixed(2)}</Text>
          </Space>
        )}

        {importing && <Progress percent={progress} style={{ marginBottom: 12 }} />}

        {rows.length > 0 && (
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="_row"
            size="small"
            scroll={{ x: 820, y: 340 }}
            pagination={false}
          />
        )}
      </Modal>
    </>
  );
};

export default FundImport;
