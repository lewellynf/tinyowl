import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { DimensionResult, Dimension, Verdict } from '@tinyowl/shared';
import { aggregateScore, deriveWarnings } from '../engine/score.js';

const ALL: Dimension[] = [
  'protocol_consistency',
  'response_structure',
  'knowledge_qa',
  'identity_consistency',
  'reasoning_trace',
  'signature_fingerprint',
];

function dim(d: Dimension, score: number, verdict: Verdict): DimensionResult {
  return { dimension: d, score, verdict, explanation: '' };
}

describe('aggregateScore', () => {
  it('全维度满分 → 100', () => {
    const dims = ALL.map((d) => dim(d, 100, 'pass'));
    expect(aggregateScore(dims)).toBe(100);
  });

  it('全维度 0 分 → 0', () => {
    const dims = ALL.map((d) => dim(d, 0, 'fail'));
    expect(aggregateScore(dims)).toBe(0);
  });

  it('全部 inconclusive → 0（无有效权重）', () => {
    const dims = ALL.map((d) => dim(d, 50, 'inconclusive'));
    expect(aggregateScore(dims)).toBe(0);
  });

  it('inconclusive 维度被剔除，不拉低其余维度', () => {
    const dims = [
      dim('protocol_consistency', 100, 'pass'),
      dim('identity_consistency', 50, 'inconclusive'), // 应被剔除
    ];
    // 仅 protocol 计入 → 100
    expect(aggregateScore(dims)).toBe(100);
  });

  it('属性：结果恒在 [0,100]', () => {
    const dimArb = fc.record({
      dimension: fc.constantFrom(...ALL),
      score: fc.double({ min: 0, max: 100, noNaN: true }),
      verdict: fc.constantFrom<Verdict>('pass', 'suspect', 'fail', 'inconclusive'),
    });
    fc.assert(
      fc.property(fc.array(dimArb, { maxLength: 6 }), (raws) => {
        const dims = raws.map((r) => ({ ...r, explanation: '' }));
        const s = aggregateScore(dims);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }),
    );
  });
});

describe('deriveWarnings', () => {
  it('身份维度 fail → identity_swap', () => {
    const dims = [dim('identity_consistency', 20, 'fail')];
    expect(deriveWarnings(dims)).toContain('identity_swap');
  });

  it('知识问答 suspect → downgrade', () => {
    const dims = [dim('knowledge_qa', 40, 'suspect')];
    expect(deriveWarnings(dims)).toContain('downgrade');
  });

  it('签名指纹 fail → downgrade', () => {
    const dims = [dim('signature_fingerprint', 30, 'fail')];
    expect(deriveWarnings(dims)).toContain('downgrade');
  });

  it('身份维度 pass 不产生 identity_swap', () => {
    const dims = [dim('identity_consistency', 90, 'pass')];
    expect(deriveWarnings(dims)).not.toContain('identity_swap');
  });

  it('属性：警示不重复', () => {
    const dimArb = fc.record({
      dimension: fc.constantFrom(...ALL),
      score: fc.double({ min: 0, max: 100, noNaN: true }),
      verdict: fc.constantFrom<Verdict>('pass', 'suspect', 'fail', 'inconclusive'),
    });
    fc.assert(
      fc.property(fc.array(dimArb, { maxLength: 12 }), (raws) => {
        const dims = raws.map((r) => ({ ...r, explanation: '' }));
        const w = deriveWarnings(dims);
        expect(new Set(w).size).toBe(w.length);
      }),
    );
  });
});
