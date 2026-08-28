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
  date: ['交易时间', '交易创建时间', '记账日期', '交易日期', '时间', 'date', '付款时间'],
  amountIn: ['收入金额', '收入', '收入(元)', '贷方金额', '收款金额'],
  amountOut: ['支出金额', '支出', '支出(元)', '借方金额', '付款金额'],
  amount: ['金额', '交易金额', 'amount', '发生额', '金额(元)'],
  direction: ['收/支', '收支方向', '资金方向', '收支类型', 'direction', '交易类型'],
  counterparty: ['交易对方', '对方户名', '对方名称', '商户名称', '对方账号名称', 'counterparty'],
  remark: ['商品', '商品说明', '备注', '交易摘要', '摘要', '交易说明', 'remark', '附言'],
  status: ['当前状态', '交易状态', '状态'],
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

  const findCol = (keys: string[], row: Record<string, any>): string | null => {
    const lower = {};
    Object.keys(row).forEach(k => { lower[String(k).trim().toLowerCase()] = k; });
    for (const alias of keys) {
      const k = lower[alias.toLowerCase()];
      if (k !== undefined && row[k] !== '' && row[k] !== null) return k;
    }
    return null;
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
      const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      if (!json.length) { message.warning('文件为空'); setLoading(false); return; }

      const sample = json[0] as any;
      const cDate = findCol(HEADER_ALIASES.date, sample);
      const cIn = findCol(HEADER_ALIASES.amountIn, sample);
      const cOut = findCol(HEADER_ALIASES.amountOut, sample);
      const cAmt = findCol(HEADER_ALIASES.amount, sample);
      const cDir = findCol(HEADER_ALIASES.direction, sample);
      const cParty = findCol(HEADER_ALIASES.counterparty, sample);
      const cRemark = findCol(HEADER_ALIASES.remark, sample);
      const cStatus = findCol(HEADER_ALIASES.status, sample);

      if (!cDate) {
        message.error('未识别到日期列，请确认CSV包含"交易时间/日期"等列');
        setLoading(false);
        return;
      }

      const parsed: TxnRow[] = [];
      json.forEach((r: any, idx: number) => {
        const status = cStatus ? String(r[cStatus] || '') : '';
        if (/关闭|失败|退款中/.test(status)) return; // 跳过异常交易
        if (skipRefund && /退款/.test(status)) return;

        let amount = 0;
        let direction: 'in' | 'out';
        if (cIn && cOut) {
          amount = Number(r[cIn]) || Number(r[cOut]);
          direction = Number(r[cIn]) > 0 ? 'in' : 'out';
        } else if (cAmt) {
          amount = Math.abs(Number(r[cAmt]));
          if (cDir) {
            const ds = String(r[cDir]);
            direction = INCOME_KEYWORDS.some(k => ds.includes(k)) && !EXPENSE_KEYWORDS.some(k => ds.includes(k)) ? 'in' : 'out';
          } else {
            direction = Number(r[cAmt]) >= 0 ? 'in' : 'out';
          }
        } else {
          return;
        }

        if (!amount || amount <= 0) return;

        const remark = cRemark ? String(r[cRemark] || '').trim() : '';
        const party = cParty ? String(r[cParty] || '').trim() : '';
        // 跳过转账（微信/支付宝提现到银行卡不算收支）
        if (skipTransfer && /提现|转账|零钱通|余额宝/.test(remark + party)) return;

        parsed.push({
          _row: idx + 2,
          txDate: parseDate(r[cDate]),
          direction,
          amount: Math.round(amount * 100) / 100,
          counterpartyName: party,
          remark,
          businessType: guessBusinessType(remark + party, direction),
          _status: 'pending',
        });
      });

      setRows(parsed);
      if (!parsed.length) message.warning('未解析到有效交易记录，请检查文件格式');
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
