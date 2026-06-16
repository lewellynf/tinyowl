import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Channel, CertStatus } from '@tinyowl/shared';
import { applyFilterSort } from '../lib/leaderboard.js';

function ch(overrides: Partial<Channel>): Channel {
  return {
    id: Math.random().toString(36).slice(2),
    targetModel: 'gpt-5.5',
    name: 'c',
    certStatus: 'none',
    price: 10,
    priceDeltaPct: 0,
    rateLimit: 0,
    availabilityPct: 100,
    downgradeStatus: '未发现',
    latencySeconds: 0,
    featuredWeight: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

const channelArb = fc.record({
  certStatus: fc.constantFrom<CertStatus>('enterprise', 'personal', 'none'),
  price: fc.double({ min: 0, max: 1000, noNaN: true }),
  featuredWeight: fc.double({ min: 0, max: 100, noNaN: true }),
});

describe('applyFilterSort', () => {
  it('按价格升序排序', () => {
    const list = [ch({ price: 30 }), ch({ price: 10 }), ch({ price: 20 })];
    const sorted = applyFilterSort(list, { sort: 'price' });
    expect(sorted.map((c) => c.price)).toEqual([10, 20, 30]);
  });

  it('按精选权重降序排序', () => {
    const list = [ch({ featuredWeight: 10 }), ch({ featuredWeight: 90 }), ch({ featuredWeight: 50 })];
    const sorted = applyFilterSort(list, { sort: 'featured' });
    expect(sorted.map((c) => c.featuredWeight)).toEqual([90, 50, 10]);
  });

  it('cert 筛选仅保留匹配项', () => {
    const list = [ch({ certStatus: 'enterprise' }), ch({ certStatus: 'none' }), ch({ certStatus: 'enterprise' })];
    const filtered = applyFilterSort(list, { sort: 'featured', cert: 'enterprise' });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((c) => c.certStatus === 'enterprise')).toBe(true);
  });

  it('属性：价格排序结果非递减', () => {
    fc.assert(
      fc.property(fc.array(channelArb, { maxLength: 30 }), (raws) => {
        const list = raws.map((r) => ch(r));
        const sorted = applyFilterSort(list, { sort: 'price' });
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].price).toBeGreaterThanOrEqual(sorted[i - 1].price);
        }
      }),
    );
  });

  it('属性：精选排序结果非递增', () => {
    fc.assert(
      fc.property(fc.array(channelArb, { maxLength: 30 }), (raws) => {
        const list = raws.map((r) => ch(r));
        const sorted = applyFilterSort(list, { sort: 'featured' });
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].featuredWeight).toBeLessThanOrEqual(sorted[i - 1].featuredWeight);
        }
      }),
    );
  });

  it('属性：筛选+排序不改变元素总数关系（筛选后 <= 原数量）', () => {
    fc.assert(
      fc.property(
        fc.array(channelArb, { maxLength: 30 }),
        fc.constantFrom<CertStatus | undefined>('enterprise', 'personal', 'none', undefined),
        (raws, cert) => {
          const list = raws.map((r) => ch(r));
          const result = applyFilterSort(list, { sort: 'featured', cert });
          expect(result.length).toBeLessThanOrEqual(list.length);
          if (cert) expect(result.every((c) => c.certStatus === cert)).toBe(true);
        },
      ),
    );
  });
});
