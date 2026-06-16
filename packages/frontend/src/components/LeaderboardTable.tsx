import { useEffect, useState } from 'react';
import { Table, Tag, Segmented, Select, Space, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CERT_STATUS_LABELS,
  SUPPORTED_MODELS,
  type CertStatus,
  type Channel,
  type LeaderboardSort,
} from '@tinyowl/shared';
import { getLeaderboard } from '../api.js';

function certTag(cert: CertStatus) {
  const color = cert === 'enterprise' ? 'gold' : cert === 'personal' ? 'blue' : 'default';
  return <Tag color={color}>{CERT_STATUS_LABELS[cert]}</Tag>;
}

function deltaText(pct: number) {
  if (pct === 0) return <span style={{ color: '#999' }}>持平</span>;
  const up = pct > 0;
  return (
    <span style={{ color: up ? '#cf1322' : '#389e0d' }}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

const columns: ColumnsType<Channel> = [
  { title: '认证', dataIndex: 'certStatus', key: 'cert', render: certTag, width: 110 },
  { title: '渠道名', dataIndex: 'name', key: 'name', width: 120 },
  {
    title: '价格(元/M)',
    dataIndex: 'price',
    key: 'price',
    width: 100,
    render: (v: number) => `¥${v}`,
  },
  {
    title: '近7天价格',
    dataIndex: 'priceDeltaPct',
    key: 'delta',
    width: 100,
    render: deltaText,
  },
  { title: '限速(RPM)', dataIndex: 'rateLimit', key: 'rate', width: 100 },
  {
    title: '可用率',
    dataIndex: 'availabilityPct',
    key: 'avail',
    width: 90,
    render: (v: number) => `${v}%`,
  },
  { title: '降智情况', dataIndex: 'downgradeStatus', key: 'downgrade', width: 90 },
  {
    title: '延迟(秒)',
    dataIndex: 'latencySeconds',
    key: 'latency',
    width: 90,
    render: (v: number) => v.toFixed(1),
  },
];

export default function LeaderboardTable({ defaultModel }: { defaultModel?: string }) {
  const [model, setModel] = useState(defaultModel ?? SUPPORTED_MODELS[0].value);
  const [cert, setCert] = useState<CertStatus | undefined>(undefined);
  const [sort, setSort] = useState<LeaderboardSort>('featured');
  const [data, setData] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getLeaderboard({ model, cert, sort })
      .then(setData)
      .finally(() => setLoading(false));
  }, [model, cert, sort]);

  return (
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Segmented
          value={model}
          onChange={(v) => setModel(v as string)}
          options={SUPPORTED_MODELS.map((m) => ({ label: m.label, value: m.value }))}
        />
      </Space>
      <Space wrap style={{ marginBottom: 16, display: 'flex' }}>
        <span>认证筛选：</span>
        <Select
          allowClear
          placeholder="全部认证"
          style={{ width: 160 }}
          value={cert}
          onChange={(v) => setCert(v)}
          options={[
            { value: 'enterprise', label: '企业认证' },
            { value: 'personal', label: '个人实名认证' },
            { value: 'none', label: '未认证' },
          ]}
        />
        <span style={{ marginLeft: 12 }}>排序：</span>
        <Segmented
          value={sort}
          onChange={(v) => setSort(v as LeaderboardSort)}
          options={[
            { label: '精选', value: 'featured' },
            { label: '价格', value: 'price' },
          ]}
        />
      </Space>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        scroll={{ x: 800 }}
        locale={{ emptyText: <Empty description="暂无渠道数据" /> }}
      />
    </div>
  );
}
