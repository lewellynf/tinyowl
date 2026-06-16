import { useParams, Link } from 'react-router-dom';
import { Button } from 'antd';
import DetectionPanel from '../components/DetectionPanel.js';

/**
 * 独立结果页：用于分享链接或新标签页打开 /result/:taskId。
 * 首页检测走内联面板，不跳转本页。
 */
export default function ResultPage() {
  const { taskId } = useParams<{ taskId: string }>();
  if (!taskId) return null;
  return (
    <div className="to-section">
      <div style={{ marginBottom: 16 }}>
        <Link to="/">
          <Button type="link" style={{ paddingLeft: 0 }}>← 返回首页发起新检测</Button>
        </Link>
      </div>
      <DetectionPanel taskId={taskId} />
    </div>
  );
}
