import { Typography, Divider } from 'antd';
import DetectionForm from '../components/DetectionForm.js';
import LeaderboardTable from '../components/LeaderboardTable.js';

const { Title, Paragraph } = Typography;

export default function HomePage() {
  return (
    <div>
      <div className="to-hero">
        <h1>🦉 猫头鹰评测 tinyowl</h1>
        <p>对 API 中转站进行多维度技术检测，识别模型身份替换、降智等风险，挑选靠谱的中转站</p>
      </div>

      <div className="to-section">
        <div className="to-card to-detect-card">
          <Title level={4} style={{ marginTop: 0 }}>接口检测</Title>
          <DetectionForm />
        </div>
      </div>

      <div className="to-section">
        <div className="to-card">
          <Title level={4} style={{ marginTop: 0 }}>模型排行榜</Title>
          <Paragraph type="secondary" style={{ marginTop: -4 }}>
            按目标模型查看各中转站渠道的价格、可用率、降智与延迟等指标。
          </Paragraph>
          <Divider style={{ margin: '12px 0 20px' }} />
          <LeaderboardTable />
        </div>
      </div>
    </div>
  );
}
