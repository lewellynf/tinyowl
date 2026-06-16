import { request } from 'undici';
import type { OfficialStatus, OfficialStatusValue } from '@tinyowl/shared';
import type { Db } from '../db/client.js';
import { officialApiStatus } from '../db/schema.js';

interface ProviderProbe {
  provider: 'openai' | 'claude' | 'gemini';
  url: string;
  detail: string;
}

// 仅探测连通性（HEAD/GET 状态页或 API 根），不需要密钥
const PROVIDERS: ProviderProbe[] = [
  { provider: 'openai', url: 'https://status.openai.com/api/v2/status.json', detail: 'OpenAI 官方 API' },
  { provider: 'claude', url: 'https://status.anthropic.com/api/v2/status.json', detail: 'Anthropic Claude 官方 API' },
  { provider: 'gemini', url: 'https://status.cloud.google.com/incidents.json', detail: 'Google Gemini 官方 API' },
];

async function probeProvider(p: ProviderProbe): Promise<OfficialStatusValue> {
  try {
    const res = await request(p.url, { method: 'GET', headersTimeout: 8000, bodyTimeout: 8000 });
    const text = await res.body.text().catch(() => '');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      // statuspage.io 风格：indicator=none 表示正常
      try {
        const j = JSON.parse(text);
        const indicator = j?.status?.indicator;
        if (indicator && indicator !== 'none' && indicator !== 'minor') return 'abnormal';
      } catch {
        /* 非 statuspage 格式，能连通即视为正常 */
      }
      return 'normal';
    }
    return 'abnormal';
  } catch {
    return 'unknown';
  }
}

export async function refreshOfficialStatus(db: Db): Promise<void> {
  await Promise.all(
    PROVIDERS.map(async (p) => {
      const status = await probeProvider(p);
      db.insert(officialApiStatus)
        .values({ provider: p.provider, status, detail: p.detail, lastUpdated: new Date().toISOString() })
        .onConflictDoUpdate({
          target: officialApiStatus.provider,
          set: { status, lastUpdated: new Date().toISOString() },
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
