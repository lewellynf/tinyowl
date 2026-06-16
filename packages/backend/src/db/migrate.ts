import { getRawSqlite, getDb } from './client.js';
import { loadConfig } from '../config.js';
import { fileURLToPath } from 'node:url';

const DDL = `
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  target_model TEXT NOT NULL,
  name TEXT NOT NULL,
  cert_status TEXT NOT NULL,
  price REAL NOT NULL,
  rate_limit REAL NOT NULL DEFAULT 0,
  availability_pct REAL NOT NULL DEFAULT 100,
  downgrade_status TEXT NOT NULL DEFAULT '未发现',
  latency_seconds REAL NOT NULL DEFAULT 0,
  featured_weight REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS price_changes (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  old_price REAL NOT NULL,
  new_price REAL NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_price_changes_channel ON price_changes(channel_id);

CREATE TABLE IF NOT EXISTS detection_history (
  id TEXT PRIMARY KEY,
  endpoint_masked TEXT NOT NULL,
  target_model TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  dimensions_json TEXT NOT NULL,
  cache_result_json TEXT,
  warnings_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_history_created ON detection_history(created_at DESC);

CREATE TABLE IF NOT EXISTS official_api_status (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_updated TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  detail TEXT NOT NULL DEFAULT ''
);
`;

export function runMigrations(dbPath: string): void {
  getDb(dbPath);
  const sqlite = getRawSqlite();
  sqlite.exec(DDL);
}

// 允许作为脚本直接执行
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = loadConfig();
  runMigrations(cfg.dbPath);
  console.log(`✅ 数据库迁移完成：${cfg.dbPath}`);
}
