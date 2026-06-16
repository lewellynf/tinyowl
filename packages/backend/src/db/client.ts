import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: Database.Database | null = null;
let dbInstance: Db | null = null;

/**
 * 打开（或复用）嵌入式 SQLite。所有环境一律持久化到文件（REQ-12.4）。
 * 若存储不可用，抛出明确错误（REQ-12.5）。
 */
export function getDb(dbPath: string): Db {
  if (dbInstance) return dbInstance;
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    dbInstance = drizzle(sqlite, { schema });
    return dbInstance;
  } catch (err) {
    throw new Error(
      `持久化存储不可用，无法打开数据库文件「${dbPath}」：${(err as Error).message}`,
    );
  }
}

export function getRawSqlite(): Database.Database {
  if (!sqlite) throw new Error('数据库尚未初始化');
  return sqlite;
}

export { schema };
