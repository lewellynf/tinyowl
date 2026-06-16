import { nanoid } from 'nanoid';
import { fileURLToPath } from 'node:url';
import { getDb } from './client.js';
import { channels, officialApiStatus, priceChanges } from './schema.js';
import { runMigrations } from './migrate.js';
import { loadConfig } from '../config.js';
import type { CertStatus } from '@tinyowl/shared';

interface SeedChannel {
  targetModel: string;
  name: string;
  certStatus: CertStatus;
  price: number;
  prevPrice?: number; // 用于生成 7 天内价格变更记录
  rateLimit: number;
  availabilityPct: number;
  downgradeStatus: string;
  latencySeconds: number;
  featuredWeight: number;
}

const SEED: SeedChannel[] = [
  // GPT 5.5
  { targetModel: 'gpt-5.5', name: '云雀API', certStatus: 'enterprise', price: 12.5, prevPrice: 15, rateLimit: 5000, availabilityPct: 99.6, downgradeStatus: '未发现', latencySeconds: 1.8, featuredWeight: 100 },
  { targetModel: 'gpt-5.5', name: '极速中转', certStatus: 'personal', price: 9.8, rateLimit: 2000, availabilityPct: 97.2, downgradeStatus: '偶发', latencySeconds: 2.4, featuredWeight: 60 },
  { targetModel: 'gpt-5.5', name: '低价仓', certStatus: 'none', price: 6.0, prevPrice: 5, rateLimit: 500, availabilityPct: 88.5, downgradeStatus: '疑似', latencySeconds: 4.1, featuredWeight: 10 },
  // Opus 4.8
  { targetModel: 'claude-opus-4-8', name: '云雀API', certStatus: 'enterprise', price: 45, prevPrice: 50, rateLimit: 3000, availabilityPct: 99.9, downgradeStatus: '未发现', latencySeconds: 2.1, featuredWeight: 100 },
  { targetModel: 'claude-opus-4-8', name: '智海互联', certStatus: 'enterprise', price: 42, rateLimit: 2500, availabilityPct: 99.1, downgradeStatus: '未发现', latencySeconds: 2.6, featuredWeight: 85 },
  { targetModel: 'claude-opus-4-8', name: '平价转发', certStatus: 'personal', price: 30, prevPrice: 28, rateLimit: 800, availabilityPct: 94.0, downgradeStatus: '偶发', latencySeconds: 3.5, featuredWeight: 40 },
  // Sonnet 4.6
  { targetModel: 'claude-sonnet-4-6', name: '极速中转', certStatus: 'personal', price: 9, rateLimit: 4000, availabilityPct: 98.4, downgradeStatus: '未发现', latencySeconds: 1.5, featuredWeight: 70 },
  { targetModel: 'claude-sonnet-4-6', name: '云雀API', certStatus: 'enterprise', price: 11, prevPrice: 12, rateLimit: 6000, availabilityPct: 99.7, downgradeStatus: '未发现', latencySeconds: 1.3, featuredWeight: 95 },
  // Gemini 3.1 Pro
  { targetModel: 'gemini-3.1-pro', name: '谷歌之门', certStatus: 'enterprise', price: 8, rateLimit: 5000, availabilityPct: 99.3, downgradeStatus: '未发现', latencySeconds: 1.9, featuredWeight: 90 },
  { targetModel: 'gemini-3.1-pro', name: '低价仓', certStatus: 'none', price: 4.5, prevPrice: 6, rateLimit: 300, availabilityPct: 85.0, downgradeStatus: '疑似', latencySeconds: 5.2, featuredWeight: 5 },
];

export function seed(dbPath: string): void {
  runMigrations(dbPath);
  const db = getDb(dbPath);

  const existing = db.select().from(channels).all();
  if (existing.length > 0) {
    console.log(`ℹ️  已有 ${existing.length} 条渠道数据，跳过种子写入`);
  } else {
    const now = new Date().toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    for (const s of SEED) {
      const id = nanoid();
      db.insert(channels)
        .values({
          id,
          targetModel: s.targetModel,
          name: s.name,
          certStatus: s.certStatus,
          price: s.price,
          rateLimit: s.rateLimit,
          availabilityPct: s.availabilityPct,
          downgradeStatus: s.downgradeStatus,
          latencySeconds: s.latencySeconds,
          featuredWeight: s.featuredWeight,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (s.prevPrice !== undefined) {
        db.insert(priceChanges)
          .values({
            id: nanoid(),
            channelId: id,
            oldPrice: s.prevPrice,
            newPrice: s.price,
            changedAt: threeDaysAgo,
          })
          .run();
      }
    }
    console.log(`✅ 写入 ${SEED.length} 条渠道种子数据`);
  }

  // 官方状态初始化
  const providers: Array<{ provider: string; detail: string }> = [
    { provider: 'openai', detail: 'OpenAI 官方 API' },
    { provider: 'claude', detail: 'Anthropic Claude 官方 API' },
    { provider: 'gemini', detail: 'Google Gemini 官方 API' },
  ];
  for (const p of providers) {
    db.insert(officialApiStatus)
      .values({ provider: p.provider, status: 'unknown', detail: p.detail })
      .onConflictDoNothing()
      .run();
  }
  console.log('✅ 官方状态初始化完成');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = loadConfig();
  seed(cfg.dbPath);
  console.log('🌱 种子数据写入完成');
}
