import type { Dimension, DimensionResult, Warning } from '@tinyowl/shared';

/** 各维度权重（合计为 1）。协议来源指纹最难伪造，权重最高。
 * 新增三维度后重新分配权重，保持协议层强信号主导地位。 */
const WEIGHTS: Record<Dimension, number> = {
  provenance_fingerprint: 0.18,
  identity_consistency: 0.12,
  knowledge_qa: 0.09,
  dynamic_computation: 0.11,
  instruction_following: 0.09,
  injection_resistance: 0.07,
  trap_detection: 0.12,
  signature_fingerprint: 0.08,
  protocol_consistency: 0.07,
  response_structure: 0.04,
  reasoning_trace: 0.03,
};

/**
 * 评分聚合：hvoy.ai 风格 —— 以「假率」为导向的惩罚性评分。
 *
 * 核心区别：不再跳过 inconclusive 维度。中转站无法产出某维度数据本身就是可疑信号，
 * 给予惩罚分（50分），避免通过”隐藏维度”刷高总分。
 *
 * 硬封顶规则：
 * - provenance_fingerprint fail → cap 30
 * - trap_detection fail → cap 35
 * - identity_consistency fail → cap 40
 * - 多个 fail 维度（≥3）→ cap 45
 */
export function aggregateScore(dimensions: DimensionResult[]): number {
  let weighted = 0;
  let totalWeight = 0;
  let failCount = 0;

  for (const d of dimensions) {
    const w = WEIGHTS[d.dimension] ?? 0;
    if (d.verdict === 'inconclusive') {
      // inconclusive 不再免费跳过，给惩罚分 50
      weighted += 50 * w;
    } else {
      weighted += d.score * w;
    }
    totalWeight += w;
    if (d.verdict === 'fail') failCount++;
  }

  if (totalWeight === 0) return 0;
  let score = weighted / totalWeight;

  // 硬封顶：最强信号优先
  const provenance = dimensions.find((d) => d.dimension === 'provenance_fingerprint');
  if (provenance && provenance.verdict === 'fail') {
    score = Math.min(score, 30);
  }

  const trap = dimensions.find((d) => d.dimension === 'trap_detection');
  if (trap && trap.verdict === 'fail') {
    score = Math.min(score, 35);
  }

  const identity = dimensions.find((d) => d.dimension === 'identity_consistency');
  if (identity && identity.verdict === 'fail') {
    score = Math.min(score, 40);
  }

  // 多维度同时 fail → 额外压低
  if (failCount >= 3) {
    score = Math.min(score, 45);
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
