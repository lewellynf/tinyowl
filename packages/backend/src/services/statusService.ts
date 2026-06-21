import { request } from 'undici';
import type { OfficialStatus, OfficialStatusValue } from '@tinyowl/shared';
import type { Db } from '../db/client.js';
import { officialApiStatus } from '../db/schema.js';

interface ProviderProbe {
  provider: 'openai' | 'claude' | 'gemini';
  url: string;
  detail: string;
}

// 仅探测连通性（GET 状态页），不需要密钥
const PROVIDERS: ProviderProbe[] = [
  { provider: 'openai', url: 'https://status.openai.com/api/v2/status.json', detail: 'OpenAI 官方 API' },
  // Anthropic 状态页已迁移到 status.claude.com（旧 status.anthropic.com 会 302 跳转）
  { provider: 'claude', url: 'https://status.claude.com/api/v2/status.json', detail: 'Anthropic Claude 官方 API' },
  { provider: 'gemini', url: 'https://status.cloud.google.com/incidents.json', detail: 'Google Gemini 官方 API' },
];

interface ProbeResult {
  status: OfficialStatusValue;
  detail: string;
}

async function probeProvider(p: ProviderProbe): Promise<ProbeResult> {
  try {
    // maxRedirections：状态页可能 301/302 迁移到新域名，需跟随重定向
    const res = await request(p.url, {
      method: 'GET',
      headersTimeout: 8000,
      bodyTimeout: 8000,
      maxRedirections: 3,
    });
    const text = await res.body.text().catch(() => '');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // statuspage.io 风格：indicator=none 表示正常
      try {
        const j = JSON.parse(text);
        const indicator = j?.status?.indicator;
        if (indicator && indicator !== 'none' && indicator !== 'minor') {
          return { status: 'abnormal', detail: `${p.detail}（状态：${indicator}）` };
        }
      } catch {
        /* 非 statuspage 格式，能连通即视为正常 */
      }
      return { status: 'normal', detail: p.detail };
    }
    return { status: 'abnormal', detail: `${p.detail}（HTTP ${res.statusCode}）` };
  } catch {
    // 探测失败多为网络不可达（如本服务器无法访问境外状态页），不代表官方真异常
    return { status: 'unknown', detail: `${p.detail}（网络不可达，未能探测）` };
  }
}

export async function refreshOfficialStatus(db: Db): Promise<void> {
  await Promise.all(
    PROVIDERS.map(async (p) => {
      const { status, detail } = await probeProvider(p);
      db.insert(officialApiStatus)
        .values({ provider: p.provider, status, detail, lastUpdated: new Date().toISOString() })
        .onConflictDoUpdate({
          target: officialApiStatus.provider,
          set: { status, detail, lastUpdated: new Date().toISOString() },
        })
        .run();
    }),
  );
}

export function getOfficialStatus(db: Db): OfficialStatus[] {
  const rows = db.select().from(officialApiStatus).all();
  const order = ['openai', 'claude', 'gemini'];
  return rows
    .map((r) => ({
      provider: r.provider as OfficialStatus['provider'],
      status: r.status as OfficialStatusValue,
      lastUpdated: r.lastUpdated,
      detail: r.detail,
    }))
    .sort((a, b) => order.indexOf(a.provider) - order.indexOf(b.provider));
}

/** 启动周期采集（默认每 5 分钟） */
export function startStatusScheduler(db: Db, intervalMs = 5 * 60 * 1000): NodeJS.Timeout {
  void refreshOfficialStatus(db).catch(() => undefined);
  return setInterval(() => {
    void refreshOfficialStatus(db).catch(() => undefined);
  }, intervalMs);
}
