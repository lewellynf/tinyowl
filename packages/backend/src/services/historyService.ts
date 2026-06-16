import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { DetectionResult, HistoryDetail, HistoryItem } from '@tinyowl/shared';
import { DimensionResultSchema } from '@tinyowl/shared';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { detectionHistory } from '../db/schema.js';

export class DesensitizeError extends Error {
  constructor() {
    super('脱敏校验失败，拒绝写入历史');
    this.name = 'DesensitizeError';
  }
}

const KEY_LIKE = /sk-[A-Za-z0-9_\-]{8,}|[A-Za-z0-9_\-]{32,}/;

/**
 * 写入检测历史（REQ-6.1/6.2）。
 * 仅存脱敏数据，无 api_key（REQ-2.4/6.5）。
 * 写入前做脱敏校验，若疑似含明文密钥则拒绝（REQ-2.5）。
 */
export function saveHistory(db: Db, result: DetectionResult): void {
  const dimsJson = JSON.stringify(result.dimensions);
  const warningsJson = JSON.stringify(result.warnings);
  const cacheJson = result.cacheDetection ? JSON.stringify(result.cacheDetection) : null;

  // 脱敏自检：序列化内容中不得出现形似密钥的串，且 endpoint 必须已脱敏
  const serialized = `${result.endpointMasked}${dimsJson}${warningsJson}${cacheJson ?? ''}`;
  if (KEY_LIKE.test(serialized)) {
    throw new DesensitizeError();
  }

  db.insert(detectionHistory)
    .values({
      id: nanoid(),
      endpointMasked: result.endpointMasked,
      targetModel: result.targetModel,
      overallScore: Math.round(result.overallScore),
      dimensionsJson: dimsJson,
      cacheResultJson: cacheJson,
      warningsJson,
      status: result.status,
      createdAt: result.createdAt,
    })
    .run();
}

export function listHistory(db: Db, limit = 50, offset = 0): HistoryItem[] {
  const rows = db
    .select()
    .from(detectionHistory)
    .orderBy(desc(detectionHistory.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
  return rows.map((r) => ({
    id: r.id,
    endpointMasked: r.endpointMasked,
    targetModel: r.targetModel,
    overallScore: r.overallScore,
    status: r.status as HistoryItem['status'],
    createdAt: r.createdAt,
  }));
}

export function getHistoryDetail(db: Db, id: string): HistoryDetail | null {
  const row = db.select().from(detectionHistory).where(eq(detectionHistory.id, id)).get();
  if (!row) return null;
  const dimensions = z.array(DimensionResultSchema).parse(JSON.parse(row.dimensionsJson));
  return {
    id: row.id,
    endpointMasked: row.endpointMasked,
    targetModel: row.targetModel,
    overallScore: row.overallScore,
    status: row.status as HistoryDetail['status'],
    createdAt: row.createdAt,
    dimensions,
    warnings: JSON.parse(row.warningsJson),
    cacheDetection: row.cacheResultJson ? JSON.parse(row.cacheResultJson) : undefined,
  };
}
