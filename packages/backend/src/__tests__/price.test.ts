import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { priceDeltaPct } from '../lib/price.js';

describe('priceDeltaPct', () => {
  it('窗口内无变更记录返回 0', () => {
    expect(priceDeltaPct(10, [])).toBe(0);
  });

  it('取 7 天窗口内最早一条的 old_price 作为基准', () => {
    const now = new Date('2026-06-16T00:00:00Z');
    const changes = [
      { oldPrice: 20, changedAt: '2026-06-12T00:00:00Z' }, // 最早（窗口内）
      { oldPrice: 18, changedAt: '2026-06-14T00:00:00Z' },
    ];
    // base=20, current=15 → (15-20)/20*100 = -25
    expect(priceDeltaPct(15, changes, now)).toBe(-25);
  });

  it('超过 7 天的变更被排除', () => {
    const now = new Date('2026-06-16T00:00:00Z');
    const changes = [{ oldPrice: 100, changedAt: '2026-06-01T00:00:00Z' }]; // 15 天前
    expect(priceDeltaPct(50, changes, now)).toBe(0);
  });

  it('base 为 0 时返回 0（避免除零）', () => {
    const now = new Date('2026-06-16T00:00:00Z');
    expect(priceDeltaPct(10, [{ oldPrice: 0, changedAt: '2026-06-15T00:00:00Z' }], now)).toBe(0);
  });

  it('属性：current 等于 base 时 delta 恒为 0', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.01, max: 1000, noNaN: true }), (base) => {
        const now = new Date('2026-06-16T00:00:00Z');
        const changes = [{ oldPrice: base, changedAt: '2026-06-15T00:00:00Z' }];
        expect(priceDeltaPct(base, changes, now)).toBeCloseTo(0, 6);
      }),
    );
  });

  it('属性：结果符号与 (current-base) 一致', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 1000, noNaN: true }),
        fc.double({ min: 0.1, max: 1000, noNaN: true }),
        (base, current) => {
          const now = new Date('2026-06-16T00:00:00Z');
          const changes = [{ oldPrice: base, changedAt: '2026-06-15T00:00:00Z' }];
          const d = priceDeltaPct(current, changes, now);
          if (current > base) expect(d).toBeGreaterThan(0);
          else if (current < base) expect(d).toBeLessThan(0);
          else expect(d).toBeCloseTo(0, 6);
        },
      ),
    );
  });
});
