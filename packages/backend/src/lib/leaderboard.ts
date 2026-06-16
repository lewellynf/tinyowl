import type { Channel, CertStatus, LeaderboardSort } from '@tinyowl/shared';

/**
 * 榜单筛选与排序（REQ-8）。纯函数。
 * - cert 为空时不过滤；
 * - sort='price' 按价格升序；sort='featured' 按精选权重降序。
 */
export function applyFilterSort(
  channels: Channel[],
  opts: { cert?: CertStatus; sort: LeaderboardSort },
): Channel[] {
  let result = channels;
  if (opts.cert) {
    result = result.filter((c) => c.certStatus === opts.cert);
  }
  const sorted = [...result];
  if (opts.sort === 'price') {
    sorted.sort((a, b) => a.price - b.price);
  } else {
    sorted.sort((a, b) => b.featuredWeight - a.featuredWeight);
  }
  return sorted;
}
