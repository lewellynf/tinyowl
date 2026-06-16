import { useEffect, useState } from 'react';
import { Card, Col, Row, Tag, Typography, Spin } from 'antd';
import {
  OFFICIAL_STATUS_LABELS,
  type OfficialStatus,
  type OfficialStatusValue,
} from '@tinyowl/shared';
import { getOfficialStatus } from '../api.js';

const { Title, Text } = Typography;

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
};

function statusColor(s: OfficialStatusValue) {
  return s === 'normal' ? 'green' : s === 'abnormal' ? 'red' : 'default';
}

export default function StatusPage() {
  const [data, setData] = useState<OfficialStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOfficialStatus()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="to-section">
      <div className="to-card">
        <Title level={3} style={{ marginTop: 0 }}>官方 API 状态</Title>
        <Text type="secondary">
          监控 OpenAI、Claude、Gemini 官方 API 的可用性，帮助你区分问题来自官方还是中转站。
        </Text>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : (
          <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
            {data.map((s) => (
              <Col xs={24} sm={8} key={s.provider}>
                <Card>
                  <Title level={4} style={{ marginTop: 0 }}>
                    {PROVIDER_LABELS[s.provider] ?? s.provider}
                  </Title>
                  <Tag color={statusColor(s.status)} style={{ fontSize: 14, padding: '2px 10px' }}>
                    {OFFICIAL_STATUS_LABELS[s.status]}
                  </Tag>
                  <div style={{ marginTop: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {s.detail}
                    </Text>
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      更新时间：{new Date(s.lastUpdated).toLocaleString('zh-CN')}
                    </Text>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
