import { sql } from 'drizzle-orm';
import {
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  targetModel: text('target_model').notNull(),
  name: text('name').notNull(),
  certStatus: text('cert_status').notNull(), // enterprise | personal | none
  price: real('price').notNull(),
  rateLimit: real('rate_limit').notNull().default(0),
  availabilityPct: real('availability_pct').notNull().default(100),
  downgradeStatus: text('downgrade_status').notNull().default('未发现'),
  latencySeconds: real('latency_seconds').notNull().default(0),
  featuredWeight: real('featured_weight').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const priceChanges = sqliteTable('price_changes', {
  id: text('id').primaryKey(),
  channelId: text('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  oldPrice: real('old_price').notNull(),
  newPrice: real('new_price').notNull(),
  changedAt: text('changed_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const detectionHistory = sqliteTable('detection_history', {
  id: text('id').primaryKey(),
  endpointMasked: text('endpoint_masked').notNull(),
  targetModel: text('target_model').notNull(),
  overallScore: integer('overall_score').notNull(),
  dimensionsJson: text('dimensions_json').notNull(),
  cacheResultJson: text('cache_result_json'),
  warningsJson: text('warnings_json').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export const officialApiStatus = sqliteTable('official_api_status', {
  provider: text('provider').primaryKey(), // openai | claude | gemini
  status: text('status').notNull(), // normal | abnormal | unknown
  lastUpdated: text('last_updated').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  detail: text('detail').notNull().default(''),
});

export type ChannelRow = typeof channels.$inferSelect;
export type PriceChangeRow = typeof priceChanges.$inferSelect;
export type DetectionHistoryRow = typeof detectionHistory.$inferSelect;
export type OfficialApiStatusRow = typeof officialApiStatus.$inferSelect;
