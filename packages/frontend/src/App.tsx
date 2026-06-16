import { Layout, Menu } from 'antd';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import LeaderboardPage from './pages/LeaderboardPage.js';
import StatusPage from './pages/StatusPage.js';
import HistoryPage from './pages/HistoryPage.js';
import FaqPage from './pages/FaqPage.js';
import AdminPage from './pages/AdminPage.js';
import ResultPage from './pages/ResultPage.js';

const { Header, Content } = Layout;

const NAV = [
  { key: '/', label: <Link to="/">首页检测</Link> },
  { key: '/leaderboard', label: <Link to="/leaderboard">模型榜单</Link> },
  { key: '/status', label: <Link to="/status">官方状态</Link> },
  { key: '/history', label: <Link to="/history">检测历史</Link> },
  { key: '/faq', label: <Link to="/faq">常见问题</Link> },
  { key: '/admin', label: <Link to="/admin">运营管理</Link> },
];

export default function App() {
  const location = useLocation();
  const selected = '/' + (location.pathname.split('/')[1] ?? '');
  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Header style={{ display: 'flex', alignItems: 'center', background: '#fff', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', padding: '0 24px' }}>
        <Link to="/" className="to-brand" style={{ marginRight: 32 }}>
          <img src="/owl.svg" alt="tinyowl" width={28} height={28} />
          猫头鹰评测
        </Link>
        <Menu
          mode="horizontal"
          selectedKeys={[selected === '/' ? '/' : selected]}
          items={NAV}
          style={{ flex: 1, borderBottom: 'none' }}
        />
      </Header>
      <Content>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/result/:taskId" element={<ResultPage />} />
        </Routes>
        <div className="to-footer">
          <div>🦉 tinyowl 猫头鹰评测 · 挑选靠谱的 API 中转站</div>
          <div style={{ marginTop: 6 }}>
            本检测为低成本技术性验证，非法律审计，不保证 100% 准确 ·{' '}
            <a href="https://github.com/lewellynf/tinyowl" target="_blank" rel="noreferrer">GitHub</a> · © 2026 tinyowl.cn
          </div>
        </div>
      </Content>
    </Layout>
  );
}
