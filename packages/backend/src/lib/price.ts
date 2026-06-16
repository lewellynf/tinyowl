import type { PriceChangeRow } from '../db/schema.js';

/**
 * 近 7 天价格变化百分比（REQ-7.2）。
 * 取 7 天窗口内最早一条变更的 old_price 作为基准 base，
 * delta = (current - base) / base * 100。窗口内无变更则返回 0。
 * 纯函数。
 */
export function priceDeltaPct(
  currentPrice: number,
  changes: Pick<PriceChangeRow, 'oldPrice' | 'changedAt'>[],
  now: Date = new Date(),
): number {
  const windowStart = now.getTime() - 7 * 24 * 3600 * 1000;
  const within = changes
    .filter((c) => new Date(c.changedAt).getTime() >= windowStart)
    .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
  if (within.length === 0) return 0;
  const base = within[0].oldPrice;
  if (base === 0) return 0;
  return ((currentPrice - base) / base) * 100;
}
