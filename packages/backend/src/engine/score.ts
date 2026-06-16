import type { Dimension, DimensionResult, Warning } from '@tinyowl/shared';

/** 各维度权重（合计为 1）。协议来源指纹最难伪造，权重最高。 */
const WEIGHTS: Record<Dimension, number> = {
  provenance_fingerprint: 0.25,
  identity_consistency: 0.2,
  knowledge_qa: 0.15,
  signature_fingerprint: 0.12,
  protocol_consistency: 0.13,
  response_structure: 0.1,
  reasoning_trace: 0.05,
};

/**
 * 评分聚合（REQ-5.1）：对各维度子分加权求和，裁剪到 [0,100]。
 * inconclusive（无数据）维度按比例从权重池中剔除，避免无谓拉低总分。
 *
 * 硬封顶规则：协议来源指纹判定为来源冲突（fail）时，说明上游元数据指向
 * 其它厂商——这是最强的替换证据，无论其它行为维度表现多好，总分封顶到 30，
 * 避免“伪装得好”的中转靠行为层刷高分。纯函数。
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
  let score = weighted / totalWeight;

  const provenance = dimensions.find((d) => d.dimension === 'provenance_fingerprint');
  if (provenance && provenance.verdict === 'fail') {
    score = Math.min(score, 30);
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * 由维度结论派生警示（REQ-5.5 / REQ-5.6）。纯函数。
 * - identity_consistency 或 provenance_fingerprint 判 fail → identity_swap
 * - knowledge_qa 或 signature_fingerprint 为 suspect|fail → downgrade
 */
export function deriveWarnings(dimensions: DimensionResult[]): Warning[] {
  const warnings = new Set<Warning>();
  for (const d of dimensions) {
    if (
      (d.dimension === 'identity_consistency' || d.dimension === 'provenance_fingerprint') &&
      d.verdict === 'fail'
    ) {
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
