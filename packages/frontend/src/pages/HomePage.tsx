import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DetectionForm from '../components/DetectionForm.js';
import DetectionPanel from '../components/DetectionPanel.js';
import LeaderboardTable from '../components/LeaderboardTable.js';

const WHITEPAPER_URL =
  'https://github.com/lewellynf/tinyowl/blob/master/docs/%E6%A3%80%E6%B5%8B%E5%8E%9F%E7%90%86.md';

const DIMENSIONS = [
  { name: '返回协议一致性', w: 'W·18', priority: false },
  { name: '响应结构', w: 'W·12', priority: false },
  { name: '知识问答结果', w: 'W·14', priority: false },
  { name: '身份一致性', w: 'W·14', priority: false },
  { name: '思维链痕迹', w: 'W·10', priority: false },
  { name: '签名指纹', w: 'W·10', priority: false },
  { name: '协议来源指纹', w: 'W·22 · 最高', priority: true },
  { name: '综合满分', w: '100 分', priority: false },
];

export default function HomePage() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleStarted = (id: string) => {
    setTaskId(id);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  return (
    <div>
      {/* 01 HERO */}
      <section className="hero">
        <div className="hero-inner">
          <div>
            <div className="hero-badge">
              七维度技术检测 · 独立公开方法 <span>v2026.06</span>
            </div>
            <h1>
              挑靠谱的
              <br />
              <em>API 中转站</em>
            </h1>
            <p className="hero-sub">
              对 OpenAI / Claude / Gemini 中转站接口进行<strong>七维度技术性验证</strong>，
              识别「模型身份替换」「降智」等风险。协议来源指纹是权重最高的维度，最难伪造，
              可识破「行为层伪装到位、底层来源不符」的高仿替换。
            </p>
            <div className="hero-actions">
              <a href="#detect" className="btn btn-purple">
                开始检测 →
              </a>
              <Link to="/leaderboard" className="btn btn-ghost">
                查看榜单 →
              </Link>
            </div>
            <div className="hero-meta">
              <span className="hero-meta-item">HTTPS 传输，Key 仅内存存活</span>
              <span className="hero-meta-item">任务结束即焚</span>
              <span className="hero-meta-item">日志脱敏</span>
              <span className="hero-meta-item">非法律审计</span>
            </div>
          </div>
          <aside className="hero-card">
            <div className="hc-label">七维度 · 权重分配</div>
            <div className="hc-dims">
              {DIMENSIONS.map((d) => (
                <div key={d.name} className={d.priority ? 'hc-dim priority' : 'hc-dim'}>
                  <div className="name">{d.name}</div>
                  <div className="w">{d.priority ? `权重 ${d.w}` : d.w.includes('分') ? d.w : `权重 ${d.w}`}</div>
                </div>
              ))}
            </div>
            <p className="hc-foot">
              方法学参考论文《Auditing Black-Box LLM APIs…》等。完整白皮书见{' '}
              <a href={WHITEPAPER_URL} target="_blank" rel="noreferrer">
                检测原理
              </a>
              。
            </p>
          </aside>
        </div>
      </section>

      {/* 检测进行/结果面板（提交后内联展示） */}
      {taskId && (
        <section className="section" ref={panelRef}>
          <DetectionPanel taskId={taskId} />
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setTaskId(null)}>
              ← 再检测一个中转站
            </button>
          </div>
        </section>
      )}
      <HomeRest taskId={taskId} onStarted={handleStarted} />
    </div>
  );
}

function HomeRest({
  taskId,
  onStarted,
}: {
  taskId: string | null;
  onStarted: (id: string) => void;
}) {
  return (
    <>
      {/* 02 检测区：左表单 右方法学 */}
      {!taskId && (
        <section className="section" id="detect">
          <div className="detect-grid">
            <div>
              <div className="section-label">接口检测</div>
              <h2 className="block-title">
                提交一次
                <br />
                检测任务
              </h2>
              <p className="block-lead">
                输入中转站接口地址、API Key 和目标模型，系统自动进行七维度探测，实时返回进度与评分。
              </p>
              <div className="card">
                <DetectionForm onStarted={onStarted} />
              </div>
            </div>
            <div className="card-soft">
              <img
                src="/seven-dim.png"
                alt="七维度检测体系示意图"
                className="seven-dim-img"
              />
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>七维度检测体系</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 0 }}>
                每个维度按权重加权汇总为 0–100 分，<strong style={{ color: 'var(--purple)' }}>协议来源指纹</strong>权重最高（22），最难伪造。
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 03 榜单预览 */}
      <section className="section" id="leaderboard" style={{ background: 'var(--surface)', maxWidth: 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div className="section-label">模型榜单</div>
          <h2 className="block-title">按模型筛选中转站渠道</h2>
          <p className="block-lead">
            按目标模型切换，查看各渠道的认证状态、价格、近 7 天变化、限速、可用率、降智与延迟。
          </p>
          <LeaderboardTable />
        </div>
      </section>

      {/* 04 检测原理 + 官方状态引导 */}
      <section className="section" id="principle">
        <div className="section-label">检测原理</div>
        <h2 className="block-title">引擎三段式 · I/O · 判定 · 聚合</h2>
        <p className="block-lead">
          采样调用中转站提取协议元数据；七个纯函数判定器逐维输出 verdict；加权聚合得出 0–100
          总分，来源冲突时硬封顶并派生警示。
        </p>
        <div className="flow-stages">
          <div className="stage-box">
            <div className="stage-num">STAGE 01</div>
            <div className="stage-name">采样</div>
            <p className="stage-desc">
              undici 直连中转站接口，提取 id 前缀 / usage 字段 / 结束原因 / 流式帧序列。单轮 60s
              超时仅标记；401/403 立即中止。
            </p>
          </div>
          <div className="stage-arrow">→</div>
          <div className="stage-box">
            <div className="stage-num">STAGE 02</div>
            <div className="stage-name">判定</div>
            <p className="stage-desc">
              七个纯函数判定器，每维输出 verdict（pass / warn / fail / inconclusive）+
              证据片段，便于属性测试。
            </p>
          </div>
          <div className="stage-arrow">→</div>
          <div className="stage-box highlight">
            <div className="stage-num">STAGE 03</div>
            <div className="stage-name">聚合</div>
            <p className="stage-desc">
              按权重加权得 0–100 总分；触发 identity_swap / downgrade 警示时硬封顶总分。
            </p>
          </div>
        </div>
        <p className="principle-foot">
          方法学参考《Auditing Black-Box LLM APIs with a Rank-Based Uniformity Test》、《Are You
          Getting What You Pay For? Auditing Model Substitution in LLM APIs》等。完整白皮书见{' '}
          <a href={WHITEPAPER_URL} target="_blank" rel="noreferrer">
            检测原理白皮书
          </a>
          。
        </p>
      </section>

      {/* 05 MANIFESTO */}
      <section className="manifesto">
        <div className="manifesto-inner">
          <blockquote>
            便宜的<em>价格</em>，<br />
            不是<em>更便宜</em>的模型。
          </blockquote>
          <cite>Tiny Owl · 2026.06 · tinyowl.cn</cite>
        </div>
      </section>
    </>
  );
}
