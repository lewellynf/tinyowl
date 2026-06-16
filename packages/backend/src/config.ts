import { fileURLToPath } from 'node:url';

export interface AppConfig {
  port: number;
  host: string;
  dbPath: string;
  adminUsername: string;
  adminPassword: string;
  adminTokenSecret: string;
  probeRounds: number; // 每维度探测轮次
  roundTimeoutMs: number; // 单轮超时
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    dbPath:
      process.env.DB_PATH ??
      fileURLToPath(new URL('../../data/tinyowl.sqlite', import.meta.url)),
    adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
    adminPassword: process.env.ADMIN_PASSWORD ?? 'tinyowl',
    adminTokenSecret: process.env.ADMIN_TOKEN_SECRET ?? 'tinyowl-dev-secret-change-me',
    probeRounds: Number(process.env.PROBE_ROUNDS ?? 5),
    roundTimeoutMs: Number(process.env.ROUND_TIMEOUT_MS ?? 60_000),
  };
}
