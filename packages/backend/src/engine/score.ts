import type { Dimension, DimensionResult, Warning } from '@tinyowl/shared';

/** 各维度权重（合计为 1） */
const WEIGHTS: Record<Dimension, number> = {
  protocol_consistency: 0.15,
  response_structure: 0.15,
  knowledge_qa: 0.2,
  identity_consistency: 0.25,
  reasoning_trace: 0.1,
  signature_fingerprint: 0.15,
};

/**
 * 评分聚合（REQ-5.1）：对各维度子分加权求和，裁剪到 [0,100]。
 * inconclusive（无数据）维度按比例从权重池中剔除，避免无谓拉低总分。
 * 纯函数。
 */
export function aggregateScore(dimensions: DimensionResult[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const d of dimensions) {
    if (d.verdict === 'inconclusive') continue;
    const w = WEIGHTS[d.dimension];
    weighted += d.score * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  const score = weighted / totalWeight;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 由维度结论派生警示（REQ-5.5 / REQ-5.6）。纯函数。
 * - identity_consistency.verdict==='fail' → identity_swap
 * - knowledge_qa 或 signature_fingerprint 为 suspect|fail → downgrade
 */
export function deriveWarnings(dimensions: DimensionResult[]): Warning[] {
  const warnings = new Set<Warning>();
  for (const d of dimensions) {
    if (d.dimension === 'identity_consistency' && d.verdict === 'fail') {
      warnings.add('identity_swap');
    }
    if (
      (d.dimension === 'knowledge_qa' || d.dimension === 'signature_fingerprint') &&
      (d.verdict === 'suspect' || d.verdict === 'fail')
    ) {
      warnings.add('downgrade');
    }
  }
  return [...warnings];
}
