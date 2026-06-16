import { Typography } from 'antd';
import LeaderboardTable from '../components/LeaderboardTable.js';

const { Title, Paragraph } = Typography;

export default function LeaderboardPage() {
  return (
    <div className="to-section">
      <div className="to-card">
        <Title level={3} style={{ marginTop: 0 }}>模型榜单</Title>
        <Paragraph type="secondary">
          按目标模型切换，查看各中转站渠道的认证状态、价格、近 7 天价格变化、限速、可用率、降智情况与响应延迟。可按认证筛选、按精选或价格排序。
        </Paragraph>
        <LeaderboardTable />
      </div>
    </div>
  );
}
