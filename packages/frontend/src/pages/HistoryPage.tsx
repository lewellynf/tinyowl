import { useEffect, useState } from 'react';
import { Table, Tag, Typography, Drawer, Progress, Space, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DIMENSION_LABELS,
  TASK_STATUS_LABELS,
  VERDICT_LABELS,
  WARNING_LABELS,
  modelLabel,
  type HistoryDetail,
  type HistoryItem,
} from '@tinyowl/shared';
import { getHistory, getHistoryDetail } from '../api.js';

const { Title, Text, Paragraph } = Typography;

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getHistory()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (id: string) => {
    const d = await getHistoryDetail(id);
    setDetail(d);
    setOpen(true);
  };

  const columns: ColumnsType<HistoryItem> = [
    {
      title: '检测时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    { title: '接口', dataIndex: 'endpointMasked', key: 'endpoint' },
    { title: '目标模型', dataIndex: 'targetModel', key: 'model', render: (v: string) => modelLabel(v) },
    {
      title: '评分',
      dataIndex: 'overallScore',
      key: 'score',
      render: (v: number, r) => (r.status === 'COMPLETED' ? v : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: HistoryItem['status']) => (
        <Tag color={v === 'COMPLETED' ? 'green' : v === 'AUTH_FAILED' ? 'red' : 'orange'}>
          {TASK_STATUS_LABELS[v]}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <a onClick={() => openDetail(r.id)}>查看明细</a>
      ),
    },
  ];

  return (
    <div className="to-section">
      <div className="to-card">
        <Title level={3} style={{ marginTop: 0 }}>检测历史</Title>
        <Text type="secondary">按检测时间倒序展示，仅保存脱敏结果，不含 API Key 明文。</Text>
        <Table
          rowKey="id"
          style={{ marginTop: 16 }}
          columns={columns}
          dataSource={items}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无检测历史" /> }}
        />
      </div>

      <Drawer title="检测明细" open={open} onClose={() => setOpen(false)} width={480}>
        {detail && (
          <div>
            <Paragraph>
              <Text strong>接口：</Text>
              {detail.endpointMasked} · <Text strong>模型：</Text>
              {modelLabel(detail.targetModel)} · <Text strong>评分：</Text>
              {detail.overallScore}
            </Paragraph>
            {detail.warnings.length > 0 && (
              <Space wrap style={{ marginBottom: 12 }}>
                {detail.warnings.map((w) => (
                  <Tag color="red" key={w}>
                    {WARNING_LABELS[w]}
                  </Tag>
                ))}
              </Space>
            )}
            {detail.dimensions.map((d) => (
              <div key={d.dimension} style={{ marginBottom: 14 }}>
                <Space>
                  <Text strong>{DIMENSION_LABELS[d.dimension]}</Text>
                  <Tag>{VERDICT_LABELS[d.verdict]}</Tag>
                  <Text type="secondary">{d.score}</Text>
                </Space>
                <Progress percent={d.score} showInfo={false} size="small" />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {d.explanation}
                </Text>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
