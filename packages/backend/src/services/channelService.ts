import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Channel, ChannelInput, LeaderboardQuery } from '@tinyowl/shared';
import type { Db } from '../db/client.js';
import { channels, priceChanges } from '../db/schema.js';
import type { ChannelRow } from '../db/schema.js';
import { priceDeltaPct } from '../lib/price.js';
import { applyFilterSort } from '../lib/leaderboard.js';

function toChannel(db: Db, row: ChannelRow): Channel {
  const changes = db
    .select()
    .from(priceChanges)
    .where(eq(priceChanges.channelId, row.id))
    .all();
  return {
    id: row.id,
    targetModel: row.targetModel,
    name: row.name,
    certStatus: row.certStatus as Channel['certStatus'],
    price: row.price,
    priceDeltaPct: Number(priceDeltaPct(row.price, changes).toFixed(1)),
    rateLimit: row.rateLimit,
    availabilityPct: row.availabilityPct,
    downgradeStatus: row.downgradeStatus,
    latencySeconds: row.latencySeconds,
    featuredWeight: row.featuredWeight,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getLeaderboard(db: Db, query: LeaderboardQuery): Channel[] {
  let rows = db.select().from(channels).all();
  if (query.model) {
    rows = rows.filter((r) => r.targetModel === query.model);
  }
  const list = rows.map((r) => toChannel(db, r));
  return applyFilterSort(list, { cert: query.cert, sort: query.sort });
}

/** 可选的目标模型列表（榜单切换用） */
export function listModelsWithChannels(db: Db): string[] {
  const rows = db.select({ m: channels.targetModel }).from(channels).all();
  return [...new Set(rows.map((r) => r.m))];
}

export function createChannel(db: Db, input: ChannelInput): Channel {
  const id = nanoid();
  const now = new Date().toISOString();
  db.insert(channels)
    .values({
      id,
      targetModel: input.targetModel,
      name: input.name,
      certStatus: input.certStatus,
      price: input.price,
      rateLimit: input.rateLimit,
      availabilityPct: input.availabilityPct,
      downgradeStatus: input.downgradeStatus,
      latencySeconds: input.latencySeconds,
      featuredWeight: input.featuredWeight,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = db.select().from(channels).where(eq(channels.id, id)).get()!;
  return toChannel(db, row);
}

export function updateChannel(db: Db, id: string, input: ChannelInput): Channel | null {
  const existing = db.select().from(channels).where(eq(channels.id, id)).get();
  if (!existing) return null;
  // 价格变更则记录（REQ-11.3）
  if (existing.price !== input.price) {
    db.insert(priceChanges)
      .values({
        id: nanoid(),
        channelId: id,
        oldPrice: existing.price,
        newPrice: input.price,
        changedAt: new Date().toISOString(),
      })
      .run();
  }
  db.update(channels)
    .set({
      targetModel: input.targetModel,
      name: input.name,
      certStatus: input.certStatus,
      price: input.price,
      rateLimit: input.rateLimit,
      availabilityPct: input.availabilityPct,
      downgradeStatus: input.downgradeStatus,
      latencySeconds: input.latencySeconds,
      featuredWeight: input.featuredWeight,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(channels.id, id))
    .run();
  const row = db.select().from(channels).where(eq(channels.id, id)).get()!;
  return toChannel(db, row);
}

export function deleteChannel(db: Db, id: string): boolean {
  const existing = db.select().from(channels).where(eq(channels.id, id)).get();
  if (!existing) return false;
  db.delete(channels).where(eq(channels.id, id)).run();
  return true;
}
