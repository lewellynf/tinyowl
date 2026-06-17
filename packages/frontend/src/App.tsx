import { Link, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import LeaderboardPage from './pages/LeaderboardPage.js';
import StatusPage from './pages/StatusPage.js';
import HistoryPage from './pages/HistoryPage.js';
import FaqPage from './pages/FaqPage.js';
import AdminPage from './pages/AdminPage.js';
import ResultPage from './pages/ResultPage.js';

const WHITEPAPER_URL =
  'https://github.com/lewellynf/tinyowl/blob/master/docs/%E6%A3%80%E6%B5%8B%E5%8E%9F%E7%90%86.md';
const GITHUB_URL = 'https://github.com/lewellynf/tinyowl';

const NAV = [
  { key: '/', label: '首页检测' },
  { key: '/leaderboard', label: '模型榜单' },
  { key: '/status', label: '官方状态' },
  { key: '/history', label: '检测历史' },
  { key: '/faq', label: '常见问题' },
];

function GithubIcon({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-1.96c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.35.97.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.9-.39s1.98.13 2.9.39c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.4-5.25 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.56C20.21 21.38 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

function Brand() {
  return (
    <Link to="/" className="nav-brand">
      <img src="/owl.svg" alt="Tiny Owl logo" />
      Tiny Owl <span className="sub">猫头鹰评测</span>
    </Link>
  );
}

export default function App() {
  const location = useLocation();
  const selected = '/' + (location.pathname.split('/')[1] ?? '');

  return (
    <div className="page">
      <nav className="nav">
        <div className="nav-inner">
          <Brand />
          <div className="nav-links">
            {NAV.map((n) => (
              <Link key={n.key} to={n.key} className={selected === n.key ? 'active' : ''}>
                {n.label}
              </Link>
            ))}
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="nav-github"
            aria-label="GitHub 仓库"
          >
            <GithubIcon />
          </a>
          <div className="nav-cta">
            <Link to="/" className="btn btn-purple btn-sm">
              立即检测
            </Link>
          </div>
        </div>
      </nav>

      <main className="page-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/status" element={<StatusPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/result/:taskId" element={<ResultPage />} />
        </Routes>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Link to="/" className="nav-brand">
              <img src="/owl.svg" alt="Tiny Owl logo" />
              Tiny Owl <span className="sub">猫头鹰评测</span>
            </Link>
            <p>面向 API 中转站的评测与验证平台。挑选靠谱的中转站，远离模型身份替换风险。</p>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="footer-github">
              <GithubIcon size={18} />
              <span>github.com/lewellynf/tinyowl</span>
            </a>
          </div>
          <div className="footer-col">
            <h5>站点</h5>
            <Link to="/">首页检测</Link>
            <Link to="/leaderboard">模型榜单</Link>
            <Link to="/status">官方状态</Link>
            <Link to="/history">检测历史</Link>
            <Link to="/faq">常见问题</Link>
          </div>
          <div className="footer-col">
            <h5>方法</h5>
            <a href={WHITEPAPER_URL} target="_blank" rel="noreferrer">
              检测原理白皮书
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              引擎源码（GitHub）
            </a>
          </div>
          <div className="footer-col">
            <h5>法律</h5>
            <Link to="/faq">免责声明</Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub 仓库
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 tinyowl.cn · All Rights Reserved</span>
          <span>本检测为低成本技术性验证 · 非法律审计 · 不保证 100% 准确</span>
        </div>
      </footer>
    </div>
  );
}
