import { useEffect, useRef, useState } from 'react';
import {
  Progress,
  Card,
  Typography,
  Alert,
  Tag,
  Descriptions,
  Spin,
  Result as AntResult,
  Space,
} from 'antd';
import { CheckCircleFilled, SafetyCertificateOutlined } from '@ant-design/icons';
import {
  DIMENSION_LABELS,
  VERDICT_LABELS,
  WARNING_LABELS,
  type DetectionResult,
  type DimensionResult,
  type ProgressEvent,
} from '@tinyowl/shared';
import { getDetection } from '../api.js';

const { Title, Paragraph, Text } = Typography;

function verdictColor(v: DimensionResult['verdict']) {
  return v === 'pass' ? 'green' : v === 'suspect' ? 'orange' : v === 'fail' ? 'red' : 'default';
}

function scoreColor(score: number) {
  if (score >= 80) return '#389e0d';
  if (score >= 60) return '#d48806';
  return '#cf1322';
}

function KeyWiped({ wiped }: { wiped: boolean }) {
  if (!wiped) return null;
  return (
    <Text type="success">
      <CheckCircleFilled /> 您的 API Key 已在检测结束后从内存中删除，未做任何持久化存储。
    </Text>
  );
}

/**
 * 检测进度 + 结果面板。可内联在首页，也可被结果页复用。
 * 传入 taskId 即开始监听 SSE 进度并展示结果。
 */
export default function DetectionPanel({ taskId }: { taskId: string }) {
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return;
    // 重置状态（taskId 变化时重新检测）
    setProgress(null);
    setResult(null);
    setDone(false);

    const es = new EventSource(`/api/detections/${taskId}/stream`);
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as ProgressEvent;
        setProgress(data);
        if (data.status === 'COMPLETED' || data.status === 'AUTH_FAILED' || data.status === 'ERROR') {
          es.close();
          getDetection(taskId).then((r) => {
            setResult(r);
            setDone(true);
          });
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es.close();
      getDetection(taskId).then((r) => {
        if (r.status && r.status !== 'RUNNING' && r.status !== 'PENDING') {
          setResult(r);
          setDone(true);
        }
      });
    };
    return () => es.close();
  }, [taskId]);

  if (!done) {
    const pct = progress ? Math.round((progress.round / progress.totalRounds) * 100) : 0;
    return (
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>检测进行中</Title>
        <Progress percent={pct} status="active" />
        <Paragraph style={{ marginTop: 16 }}>
          <Spin size="small" /> <Text>{progress?.message ?? '正在初始化检测任务…'}</Text>
        </Paragraph>
        <Text type="secondary">
          正在对接口进行多轮、六维度探测（返回协议一致性、响应结构、知识问答、身份一致性、思维链痕迹、签名指纹）。
        </Text>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <Spin />
      </Card>
    );
  }

  if (result.status === 'AUTH_FAILED') {
    return (
      <Card>
        <AntResult
          status="error"
          title="鉴权失败"
          subTitle={result.errorMessage ?? '中转站返回鉴权失败，请检查 API Key 是否正确。'}
        />
        <KeyWiped wiped={result.keyWiped} />
      </Card>
    );
  }

  if (result.status === 'ERROR') {
    return (
      <Card>
        <AntResult status="warning" title="检测出错" subTitle={result.errorMessage ?? '请稍后重试。'} />
        <KeyWiped wiped={result.keyWiped} />
      </Card>
    );
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div className="to-score-ring">
          <Progress
            type="dashboard"
            percent={result.overallScore}
            format={(p) => (
              <span style={{ color: scoreColor(result.overallScore), fontWeight: 700 }}>{p}</span>
            )}
            strokeColor={scoreColor(result.overallScore)}
          />
          <Title level={4} style={{ marginTop: 8 }}>综合可信度评分</Title>
          <Text type="secondary">
            目标模型：{result.targetModel} · 接口：{result.endpointMasked}
          </Text>
        </div>

        {result.warnings.length > 0 && (
          <Space direction="vertical" style={{ width: '100%', marginTop: 20 }}>
            {result.warnings.map((w) => (
              <Alert key={w} type="error" showIcon banner message={`⚠️ ${WARNING_LABELS[w]}`} />
            ))}
          </Space>
        )}
      </Card>

      <Card title="各维度检测明细" style={{ marginBottom: 16 }}>
        {result.dimensions.map((d) => (
          <div key={d.dimension} style={{ marginBottom: 16 }}>
            <Space>
              <Text strong>{DIMENSION_LABELS[d.dimension]}</Text>
              <Tag color={verdictColor(d.verdict)}>{VERDICT_LABELS[d.verdict]}</Tag>
              <Text type="secondary">得分 {d.score}</Text>
            </Space>
            <Progress percent={d.score} showInfo={false} strokeColor={scoreColor(d.score)} size="small" />
            <Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
              {d.explanation}
            </Paragraph>
          </div>
        ))}
      </Card>

      {result.cacheDetection && (
        <Card title="缓存检测" style={{ marginBottom: 16 }}>
          <Descriptions column={1}>
            <Descriptions.Item label="缓存命中判定">
              <Tag color={result.cacheDetection.cacheHitSuspected ? 'orange' : 'green'}>
                {result.cacheDetection.cacheHitSuspected ? '疑似命中缓存' : '未发现明显缓存'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="说明">{result.cacheDetection.explanation}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card>
        <KeyWiped wiped={result.keyWiped} />
        <Alert
          style={{ marginTop: 12 }}
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="免责声明"
          description="本检测为低成本技术性验证，非法律审计，不保证 100% 准确。建议结合榜单与小额充值综合判断。"
        />
      </Card>
    </div>
  );
}
