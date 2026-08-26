import React, { useState, useEffect, useCallback } from 'react';
import { Card, DatePicker, Button, Typography, Row, Col, Statistic, Table, Tag, Modal, Input, message, Result, Alert, Space, Descriptions } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LockOutlined, HistoryOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import request from '../../api/request';

const { Title, Text, Paragraph } = Typography;

const fmt = (v: any) => Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PeriodClose: React.FC = () => {
  const [period, setPeriod] = useState(dayjs());
  const [status, setStatus] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [remark, setRemark] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await request.get('/period-close/status', { params: { period: period.format('YYYY-MM') } });
      setStatus(res.data?.data || null);
    } catch (e: any) { message.error(e.message || '加载失败'); } finally { setLoading(false); }
  }, [period]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await request.get('/period-close/history');
      setHistory(res.data?.data || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await request.post('/period-close/close', { period: period.format('YYYY-MM'), remark });
      const d = res.data?.data;
      message.success(`${period.format('YYYY年MM月')} 结转成功，净利润 ¥${fmt(d?.net_profit)}`);
      setConfirmOpen(false);
      setRemark('');
      loadStatus();
      loadHistory();
    } catch (e: any) { message.error(e.message || '结转失败'); } finally { setClosing(false); }
  };

  const profit = status?.profit || 0;
  const isClosed = status?.is_closed;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={4} style={{ margin: 0 }}>
          <LockOutlined style={{ marginRight: 8 }} />期末结转
        </Title>
        <Space>
          <Text type="secondary">会计期间：</Text>
          <DatePicker picker="month" value={period} onChange={(d) => d && setPeriod(d)} allowClear={false} />
          <Button onClick={() => { loadStatus(); loadHistory(); }}>刷新</Button>
        </Space>
      </div>

      {/* 当期损益概览 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}><Card loading={loading} size="small"><Statistic title="本期收入" value={status?.revenue || 0} precision={2} prefix="¥" valueStyle={{ color: '#3f8600' }} /></Card></Col>
        <Col xs={24} md={6}><Card loading={loading} size="small"><Statistic title="本期费用" value={status?.expense || 0} precision={2} prefix="¥" valueStyle={{ color: '#cf1322' }} /></Card></Col>
        <Col xs={24} md={6}><Card loading={loading} size="small"><Statistic title="本期利润" value={profit} precision={2} prefix="¥" valueStyle={{ color: profit >= 0 ? '#1677ff' : '#cf1322', fontWeight: 600 }} /></Card></Col>
        <Col xs={24} md={6}>
          <Card size="small">
            {isClosed ? (
              <div style={{ textAlign: 'center' }}>
                <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a' }} />
                <div style={{ marginTop: 4 }}><Tag color="success">已结转</Tag></div>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <CloseCircleOutlined style={{ fontSize: 28, color: '#faad14' }} />
                <div style={{ marginTop: 4 }}><Tag color="warning">未结转</Tag></div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 结转说明 / 操作 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        {isClosed ? (
          <Result
            status="success"
            title={`${period.format('YYYY年MM月')} 会计期间已结账`}
            subTitle={`系统已自动生成结转凭证，将本期收入、费用科目余额结转至本年利润。净利润：¥${fmt(profit)}`}
            extra={[
              <Text key="v" type="secondary">结转凭证号：{status?.closure?.voucher_no || '已生成'}</Text>,
            ]}
          />
        ) : (
          <>
            <Alert
              type="info" showIcon
              message="期末结转损益说明"
              description={
                <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                  <li>系统将自动生成一张「结转」类记账凭证（凭证号：结-YYYYMM-XXXX）</li>
                  <li>将本期所有收入类科目（6001/6051/6301等）余额从借方转出</li>
                  <li>将本期所有费用类科目（6401/6601/6602等）余额从贷方转出</li>
                  <li>差额计入「4103 本年利润」科目（盈利在贷方，亏损在借方）</li>
                  <li>结转后该期间将被锁定，不能再新增或修改凭证</li>
                </ul>
              }
              style={{ marginBottom: 16 }}
            />
            <Paragraph>
              <Text strong>本期预计结转：</Text>
              收入 ¥{fmt(status?.revenue)} − 费用 ¥{fmt(status?.expense)} =
              <Text strong style={{ color: profit >= 0 ? '#3f8600' : '#cf1322', marginLeft: 8 }}>
                {profit >= 0 ? '盈利' : '亏损'} ¥{fmt(Math.abs(profit))}
              </Text>
            </Paragraph>
            <Button type="primary" size="large" danger icon={<LockOutlined />} onClick={() => setConfirmOpen(true)}>
              立即结转 {period.format('YYYY年MM月')}
            </Button>
          </>
        )}
      </Card>

      {/* 结转历史 */}
      <Card size="small" title={<span><HistoryOutlined style={{ marginRight: 8 }} />结转历史</span>}>
        <Table
          size="small" rowKey="id" dataSource={history} pagination={false}
          columns={[
            { title: '会计期间', dataIndex: 'period', width: 120, render: (v: string) => v.replace('-', '年') + '月' },
            { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => v === 'closed' ? <Tag color="success">已结转</Tag> : <Tag>{v}</Tag> },
            { title: '收入', dataIndex: 'total_revenue', align: 'right' as const, render: (v: any) => v != null ? `¥${fmt(v)}` : '-' },
            { title: '费用', dataIndex: 'total_expense', align: 'right' as const, render: (v: any) => v != null ? `¥${fmt(v)}` : '-' },
            { title: '净利润', dataIndex: 'net_profit', align: 'right' as const, render: (v: any) => v != null ? <Text strong style={{ color: v >= 0 ? '#3f8600' : '#cf1322' }}>¥{fmt(v)}</Text> : '-' },
            { title: '结转凭证', dataIndex: 'voucher_no', width: 140 },
            { title: '结转时间', dataIndex: 'closed_at', width: 160, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
          ]}
        />
      </Card>

      <Modal
        title={<span><ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />确认期末结转</span>}
        open={confirmOpen} onOk={handleClose} confirmLoading={closing}
        onCancel={() => setConfirmOpen(false)} okText="确认结转" cancelText="取消" okButtonProps={{ danger: true }}
      >
        <Paragraph>即将对 <Text strong>{period.format('YYYY年MM月')}</Text> 执行期末结转损益操作。</Paragraph>
        <Paragraph type="warning">此操作不可撤销，结转后该期间将被锁定。</Paragraph>
        <div style={{ marginBottom: 8 }}>
          <Text>备注（可选）：</Text>
          <Input.TextArea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="如：2026年8月期末结转" style={{ marginTop: 4 }} />
        </div>
      </Modal>
    </div>
  );
};

export default PeriodClose;
