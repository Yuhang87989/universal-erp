import React, { useState, useRef, useCallback } from 'react';
import { Modal, Button, Upload, Table, Tag, Alert, Space, Typography, message, Progress } from 'antd';
import { ImportOutlined, UploadOutlined, DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import request from '../../api/request';

const { Text, Paragraph } = Typography;

// 动态加载SheetJS：优先本地同源文件，失败回退CDN
const XLSX_SRC_LIST = [
  '/vendor/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
const loadXLSX = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).XLSX) { resolve((window as any).XLSX); return; }
    const existing = document.getElementById('xlsx-script');
    if (existing && (window as any).XLSX) { resolve((window as any).XLSX); return; }
    let idx = 0;
    const tryNext = () => {
      if (idx >= XLSX_SRC_LIST.length) { reject(new Error('SheetJS加载失败，请刷新重试')); return; }
      const src = XLSX_SRC_LIST[idx++];
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

interface Row {
  _row: number;
  name: string;
  barcode?: string;
  sku?: string;
  category?: string;
  unit?: string;
  costPrice?: number;
  sellPrice?: number;
  wholesalePrice?: number;
  minStock?: number;
  _status: 'pending' | 'ok' | 'err';
  _msg?: string;
}

const HEADER_MAP: Record<string, string> = {
  '商品名称': 'name', '名称': 'name', 'name': 'name',
  '条码': 'barcode', '条形码': 'barcode', 'barcode': 'barcode',
  'SKU': 'sku', '货号': 'sku', 'sku': 'sku',
  '分类': 'category', '分类名': 'category', '类别': 'category',
  '单位': 'unit', 'unit': 'unit',
  '进价': 'costPrice', '成本价': 'costPrice', '采购价': 'costPrice', 'cost_price': 'costPrice',
  '售价': 'sellPrice', '销售价': 'sellPrice', '零售价': 'sellPrice', 'sell_price': 'sellPrice',
  '批发价': 'wholesalePrice', 'wholesale_price': 'wholesalePrice',
  '预警库存': 'minStock', '最低库存': 'minStock', '库存预警': 'minStock', 'min_stock': 'minStock',
};

const ProductImport: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const openModal = async () => {
    setOpen(true);
    setRows([]);
    setProgress(0);
    try {
      const res = await request.get('/categories');
      const list = res.data?.data || res.data || [];
      const flat: any[] = [];
      const walk = (arr: any[]) => arr.forEach(c => { flat.push(c); if (c.children) walk(c.children); });
      walk(list);
      setCats(flat);
    } catch {}
  };

  const parseFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const XLSX = await loadXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!json.length) { message.warning('文件为空'); setLoading(false); return; }

      const parsed: Row[] = json.map((r: any, idx: number) => {
        const row: any = { _row: idx + 2, _status: 'pending' };
        Object.keys(r).forEach(k => {
          const key = HEADER_MAP[String(k).trim()];
          if (key) row[key] = r[k];
        });
        row.name = String(row.name || '').trim();
        row.unit = row.unit || '个';
        row.costPrice = Number(row.costPrice) || 0;
        row.sellPrice = Number(row.sellPrice) || 0;
        row.wholesalePrice = row.wholesalePrice ? Number(row.wholesalePrice) : undefined;
        row.minStock = Number(row.minStock) || 0;
        if (!row.name) { row._status = 'err'; row._msg = '商品名称不能为空'; }
        return row;
      });

      setRows(parsed);
    } catch (e: any) {
      message.error(e.message || '解析失败');
    }
    setLoading(false);
  }, []);

  const downloadTemplate = async () => {
    let XLSX;
    try { XLSX = await loadXLSX(); } catch { message.warning('解析引擎加载失败，请刷新重试'); return; }
    const data = [
      ['商品名称', '条码', 'SKU', '分类', '单位', '进价', '售价', '批发价', '预警库存'],
      ['示例商品A', '6901234567890', 'SKU001', '数码配件', '个', 50, 99, 89, 5],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '商品导入模板');
    XLSX.writeFile(wb, '商品导入模板.xlsx');
  };

  const doImport = async () => {
    const valid = rows.filter(r => r._status !== 'err' && r.name);
    if (!valid.length) { message.warning('没有可导入的数据'); return; }

    setImporting(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r._status === 'err' || !r.name) continue;
      try {
        // 匹配分类
        let categoryId: number | undefined;
        if (r.category) {
          const c = cats.find(x => x.name === String(r.category).trim());
          if (c) categoryId = c.id;
        }
        await request.post('/products', {
          name: r.name,
          barcode: r.barcode || '',
          sku: r.sku || '',
          categoryId,
          unit: r.unit,
          costPrice: r.costPrice,
          sellPrice: r.sellPrice,
          wholesalePrice: r.wholesalePrice,
          minStock: r.minStock,
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
      setProgress(Math.round(((i + 1) / valid.length) * 100));
    }
    setImporting(false);
    if (ok) message.success(`成功导入 ${ok} 个商品${fail ? `，失败 ${fail} 个` : ''}`);
    if (ok) onSuccess();
  };

  const columns = [
    { title: '行号', dataIndex: '_row', width: 55 },
    { title: '商品名称', dataIndex: 'name', width: 140, ellipsis: true },
    { title: '条码', dataIndex: 'barcode', width: 110, ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 90, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 55 },
    { title: '进价', dataIndex: 'costPrice', width: 70, render: (v: number) => v ? `¥${v}` : '' },
    { title: '售价', dataIndex: 'sellPrice', width: 70, render: (v: number) => v ? `¥${v}` : '' },
    { title: '预警', dataIndex: 'minStock', width: 55 },
    {
      title: '状态', dataIndex: '_status', width: 90, fixed: 'right' as const,
      render: (s: string, r: Row) => {
        if (s === 'ok') return <Tag icon={<CheckCircleOutlined />} color="success">{r._msg || '成功'}</Tag>;
        if (s === 'err') return <Tag icon={<CloseCircleOutlined />} color="error">{r._msg || '错误'}</Tag>;
        return <Tag color="default">待导入</Tag>;
      }
    },
  ];

  return (
    <>
      <Button icon={<ImportOutlined />} onClick={openModal}>批量导入</Button>
      <Modal
        title="批量导入商品"
        open={open}
        onCancel={() => !importing && setOpen(false)}
        width={860}
        footer={[
          <Button key="tpl" icon={<DownloadOutlined />} onClick={downloadTemplate}>下载模板</Button>,
          <Button key="cancel" onClick={() => setOpen(false)} disabled={importing}>关闭</Button>,
          <Button key="ok" type="primary" icon={<UploadOutlined />} loading={importing}
            disabled={!rows.length} onClick={doImport}>
            开始导入（{rows.filter(r => r._status !== 'err' && r.name).length}条）
          </Button>,
        ]}
      >
        <Alert
          type="info" showIcon style={{ marginBottom: 12 }}
          message="支持 .xlsx / .xls 文件，必填列：商品名称、售价。分类名需与系统已有分类一致，否则归为未分类。"
        />
        <Space style={{ marginBottom: 12 }}>
          <Upload accept=".xlsx,.xls" showUploadList={false} beforeUpload={(f) => { parseFile(f); return false; }}>
            <Button type="primary" ghost icon={<UploadOutlined />} loading={loading}>选择Excel文件</Button>
          </Upload>
          {rows.length > 0 && <Text type="secondary">共 {rows.length} 行，{rows.filter(r => r._status === 'err').length} 行有误</Text>}
        </Space>

        {importing && <Progress percent={progress} style={{ marginBottom: 12 }} />}

        {rows.length > 0 && (
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="_row"
            size="small"
            scroll={{ x: 780, y: 360 }}
            pagination={false}
          />
        )}
      </Modal>
    </>
  );
};

export default ProductImport;
