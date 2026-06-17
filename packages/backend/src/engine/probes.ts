import type { Dimension, DimensionResult, Verdict } from '@tinyowl/shared';
import type { ModelProfile, ProvenanceSignals, RelaySample } from './types.js';
import {
  KNOWN_MODEL_VENDORS,
  THIRD_PARTY_USAGE_MARKERS,
  VENDOR_SIGNATURES,
  type VendorSignature,
} from './profiles.js';

/** 维度判定纯函数集合。输入采样样本与目标画像，输出维度结论。 */
export interface DimensionProbe {
  dimension: Dimension;
  evaluate(samples: RelaySample[], target: ModelProfile): DimensionResult;
}

function scoreToVerdict(score: number, hasData: boolean): Verdict {
  if (!hasData) return 'inconclusive';
  if (score >= 80) return 'pass';
  if (score >= 50) return 'suspect';
  return 'fail';
}

/** 1. 返回协议一致性：校验 OpenAI 兼容协议字段与流式格式（REQ-3.3） */
export const protocolProbe: DimensionProbe = {
  dimension: 'protocol_consistency',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'protocol' && !s.timedOut);
    if (relevant.length === 0) {
      return { dimension: 'protocol_consistency', verdict: 'inconclusive', score: 0, explanation: '无有效协议采样（全部超时或失败）。' };
    }
    let pass = 0;
    const notes: string[] = [];
    for (const s of relevant) {
      const stream = s.streamRaw ?? '';
      if (stream.length > 0) {
        // 流式样本：校验 SSE 分块格式（data:{...} 与 [DONE] 终止符）
        const streamOk = /data:\s*\{/.test(stream) && /\[DONE\]/.test(stream);
        if (streamOk) pass++;
        else notes.push('流式分块未见 data:{...} 或 [DONE] 终止符');
      } else {
        // 非流式样本：校验顶层字段
        const body = s.body as Record<string, unknown> | undefined;
        const hasTopFields =
          !!body &&
          typeof body.id === 'string' &&
          body.object !== undefined &&
          Array.isArray(body.choices) &&
          typeof body.model === 'string';
        if (hasTopFields) pass++;
        else notes.push('缺失 id/object/choices/model 顶层字段');
      }
    }
    const score = Math.round((pass / relevant.length) * 100);
    return {
      dimension: 'protocol_consistency',
      verdict: scoreToVerdict(score, true),
      score,
      explanation:
        score === 100
          ? '响应完全符合 OpenAI 兼容协议（顶层字段与流式格式均正常）。'
          : `${relevant.length} 次采样中 ${pass} 次完全合规。${[...new Set(notes)].join('；') || ''}`,
    };
  },
};

/** 2. 响应结构：校验 usage / finish_reason / role（REQ-3.4） */
export const structureProbe: DimensionProbe = {
  dimension: 'response_structure',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'structure' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'response_structure', verdict: 'inconclusive', score: 0, explanation: '无有效结构采样。' };
    }
    const VALID_FINISH = new Set(['stop', 'length', 'tool_calls', 'content_filter', 'function_call']);
    let pass = 0;
    const notes: string[] = [];
    for (const s of relevant) {
      const body = s.body as any;
      const usage = body?.usage;
      const usageOk =
        usage &&
        Number.isInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 &&
        Number.isInteger(usage.completion_tokens) && usage.completion_tokens >= 0 &&
        Number.isInteger(usage.total_tokens) &&
        usage.total_tokens === usage.prompt_tokens + usage.completion_tokens;
      const choice = body?.choices?.[0];
      const finishOk = choice && VALID_FINISH.has(choice.finish_reason);
      const roleOk = choice?.message?.role === 'assistant';
      if (usageOk && finishOk && roleOk) pass++;
      else {
        if (!usageOk) notes.push('usage 字段缺失或 total≠prompt+completion');
        if (!finishOk) notes.push('finish_reason 非法');
        if (!roleOk) notes.push("choices[].message.role 非 'assistant'");
      }
    }
    const score = Math.round((pass / relevant.length) * 100);
    return {
      dimension: 'response_structure',
      verdict: scoreToVerdict(score, true),
      score,
      explanation:
        score === 100
          ? 'usage、finish_reason、role 等结构字段均合法。'
          : `${relevant.length} 次采样中 ${pass} 次结构完整。${[...new Set(notes)].join('；')}`,
    };
  },
};

/** 3. 知识问答结果：比对已知答案，过低命中率提示降智（REQ-3.5） */
export const knowledgeProbe: DimensionProbe = {
  dimension: 'knowledge_qa',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'knowledge' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'knowledge_qa', verdict: 'inconclusive', score: 0, explanation: '无有效知识问答采样。' };
    }
    let correct = 0;
    for (const s of relevant) {
      const expected = (s.meta?.expectedKeywords as string[]) ?? [];
      const content = (s.content ?? '').toLowerCase();
      if (expected.some((k) => content.includes(k.toLowerCase()))) correct++;
    }
    const score = Math.round((correct / relevant.length) * 100);
    return {
      dimension: 'knowledge_qa',
      verdict: scoreToVerdict(score, true),
      score,
      explanation: `已知答案探测题命中 ${correct}/${relevant.length}。${
        score < 50 ? '命中率偏低，能力疑似低于所声称模型（疑似降智）。' : '知识问答表现正常。'
      }`,
    };
  },
};

/** 4. 身份一致性：自述身份与目标模型比对（REQ-3.6）
 *  关键原则：只有「自称竞品厂商」才判身份替换；正品模型常因安全策略拒答或不明示自身身份，
 *  这种情况不应判失败（否则正品反而测不过）。 */
export const identityProbe: DimensionProbe = {
  dimension: 'identity_consistency',
  evaluate(samples, target) {
    const relevant = samples.filter((s) => s.purpose === 'identity' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'identity_consistency', verdict: 'inconclusive', score: 0, explanation: '无有效身份采样。' };
    }
    if (target.identityKeywords.length === 0) {
      return { dimension: 'identity_consistency', verdict: 'inconclusive', score: 0, explanation: '未知目标模型，缺少身份基线，无法判定。' };
    }
    let selfMatch = 0; // 自称本厂商
    let competitor = 0; // 自称竞品（强替换信号）
    let neutral = 0; // 拒答 / 未明示
    for (const s of relevant) {
      const content = (s.content ?? '').toLowerCase();
      const hitSelf = target.identityKeywords.some((k) => content.includes(k.toLowerCase()));
      const hitComp = target.competitorKeywords.some((k) => content.includes(k.toLowerCase()));
      if (hitComp && !hitSelf) competitor++;
      else if (hitSelf) selfMatch++;
      else neutral++;
    }
    // 任意一次自称竞品 → 判失败（身份替换）
    if (competitor > 0) {
      const score = Math.max(0, Math.round((selfMatch / relevant.length) * 40));
      return {
        dimension: 'identity_consistency',
        verdict: 'fail',
        score,
        explanation: `${relevant.length} 次身份探测中有 ${competitor} 次自称其它厂商模型，疑似模型身份替换。`,
      };
    }
    // 无竞品信号：自称本厂商或合规拒答/不明示，均视为通过
    if (selfMatch > 0) {
      return {
        dimension: 'identity_consistency',
        verdict: 'pass',
        score: 100,
        explanation: `模型自述身份与目标「${target.model}」一致。`,
      };
    }
    return {
      dimension: 'identity_consistency',
      verdict: 'pass',
      score: 85,
      explanation:
        '模型未明确自述身份（正品模型常因安全策略拒答此类问题），但未发现自称其它厂商，未见身份替换迹象。',
    };
  },
};

/** 5. 思维链痕迹：是否存在与目标推理特征匹配的思维链（REQ-3.7） */
export const reasoningProbe: DimensionProbe = {
  dimension: 'reasoning_trace',
  evaluate(samples, target) {
    const relevant = samples.filter((s) => s.purpose === 'reasoning' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'reasoning_trace', verdict: 'inconclusive', score: 0, explanation: '无有效思维链采样。' };
    }
    let traced = 0;
    for (const s of relevant) {
      const hasReasoningField = !!s.reasoning && s.reasoning.trim().length > 0;
      const content = s.content ?? '';
      // 多步推理文本特征：包含步骤化/推导词或换行较多
      const stepLike = /(首先|然后|接着|因此|所以|step|step\s*\d|第[一二三四五])/i.test(content) || (content.match(/\n/g)?.length ?? 0) >= 2;
      if (hasReasoningField || stepLike) traced++;
    }
    const ratio = traced / relevant.length;
    let score: number;
    let explanation: string;
    if (target.hasReasoning) {
      score = Math.round(ratio * 100);
      explanation = score >= 80
        ? '检测到与目标模型一致的思维链/推理痕迹。'
        : `目标模型应具备推理痕迹，但 ${relevant.length} 次中仅 ${traced} 次观察到，疑似能力不符。`;
    } else {
      // 目标模型本不强推理，存在与否都不强约束，给中性偏高分
      score = 75;
      explanation = '目标模型非强推理型，思维链维度作为参考，未发现异常。';
    }
    return { dimension: 'reasoning_trace', verdict: scoreToVerdict(score, true), score, explanation };
  },
};

/** 6. 签名指纹：基于多次采样的统计指纹（REQ-3.8）
 *  关键原则：判缓存/模板要看「内容是否重复」，而非「长度是否相同」——
 *  正品模型在固定格式下（如中文四行诗）长度天然一致，但内容各不相同。
 *  方法学参考「基于秩的均匀性检验」：用响应内容的分布形态与基线比对。 */
export const fingerprintProbe: DimensionProbe = {
  dimension: 'signature_fingerprint',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'fingerprint' && !s.timedOut && s.ok);
    if (relevant.length < 2) {
      return { dimension: 'signature_fingerprint', verdict: 'inconclusive', score: 0, explanation: '指纹采样不足（需至少 2 次有效采样）。' };
    }
    const contents = relevant.map((s) => (s.content ?? '').trim());
    const nonEmpty = contents.filter((c) => c.length > 0).length;
    const validity = nonEmpty / contents.length; // 有效响应占比

    // 内容去重率：同一 prompt 多次返回，正品应高度多样
    const uniqueContents = new Set(contents.filter((c) => c.length > 0)).size;
    const diversity = nonEmpty > 0 ? uniqueContents / nonEmpty : 0;

    // 有效性占 55 分；内容多样性占 45 分
    const validityScore = validity * 55;
    let diversityScore: number;
    let diversityNote: string;
    if (diversity >= 0.8) {
      diversityScore = 45;
      diversityNote = '内容多样性高，符合真实模型采样特征';
    } else if (diversity >= 0.5) {
      diversityScore = 32;
      diversityNote = '内容存在部分重复';
    } else if (diversity > 0) {
      diversityScore = 14;
      diversityNote = '内容大量重复，疑似固定模板或缓存';
    } else {
      diversityScore = 0;
      diversityNote = '无有效内容';
    }
    const score = Math.round(Math.min(100, validityScore + diversityScore));

    let explanation: string;
    if (validity < 0.5) {
      explanation = `多次采样中 ${nonEmpty}/${contents.length} 次返回有效内容，有效率偏低，疑似异常。`;
    } else {
      explanation = `统计指纹：有效率 ${(validity * 100).toFixed(0)}%，内容去重率 ${(diversity * 100).toFixed(0)}%（${uniqueContents}/${nonEmpty} 互异）。${diversityNote}。`;
    }
    return {
      dimension: 'signature_fingerprint',
      verdict: scoreToVerdict(score, true),
      score,
      explanation,
    };
  },
};

/** 判断一组来源信号指向哪个厂商，返回各厂商命中分。 */
function scoreVendor(sig: VendorSignature, signals: ProvenanceSignals[]): number {
  let hits = 0;
  for (const s of signals) {
    if (s.idPrefix && sig.idPrefixes.some((p) => s.idPrefix === p)) hits += 3;
    const usage = (s.usageKeys ?? []).join(',').toLowerCase();
    if (sig.usageMarkers.some((m) => usage.includes(m.toLowerCase()))) hits += 3;
    if (s.finishReason && sig.finishReasons.includes(s.finishReason)) hits += 1;
    if (sig.systemFingerprint && s.hasSystemFingerprint) hits += 2;
  }
  return hits;
}

/** 7. 协议来源指纹：响应元数据厂商一致性（最难伪造的强信号）
 *  原理：响应的 id 前缀、usage 特有字段、stop_reason 词表、system_fingerprint
 *  会暴露上游真实厂商。声称 Claude 却带 OpenAI 元数据（或反之）= 强替换信号。
 *  这些元数据难以全部伪造，廉价中转常直接透传上游而露馅。 */
export const provenanceProbe: DimensionProbe = {
  dimension: 'provenance_fingerprint',
  evaluate(samples, target) {
    const signals = samples
      .filter((s) => !s.timedOut && s.ok && s.provenance)
      .map((s) => s.provenance!) as ProvenanceSignals[];
    if (signals.length === 0 || target.vendor === 'unknown') {
      return { dimension: 'provenance_fingerprint', verdict: 'inconclusive', score: 0, explanation: '无可用的协议元数据，或目标厂商未知，无法判定来源。' };
    }

    const expected = target.vendor; // openai | anthropic | google
    const vendorCn: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google' };

    // ===== 铁证级前置检查：直接暴露第三方厂商的破绽 =====
    // (a) model 字段回显 / system_fingerprint 出现他厂模型名（套壳最常忘记改写的地方）
    for (const s of signals) {
      const haystack = `${s.modelField ?? ''} ${s.systemFingerprintValue ?? ''}`.toLowerCase();
      if (!haystack.trim()) continue;
      for (const k of KNOWN_MODEL_VENDORS) {
        if (haystack.includes(k.marker) && k.vendor !== expected) {
          return {
            dimension: 'provenance_fingerprint',
            verdict: 'fail',
            score: 0,
            explanation: `响应的 model/system_fingerprint 字段出现「${k.label}」特征（实际为 ${s.modelField ?? s.systemFingerprintValue}），与目标厂商 ${vendorCn[expected]} 不符。几乎可断定为模型套壳替换。`,
          };
        }
      }
    }
    // (b) usage 出现第三方厂商特有字段（如 DeepSeek 的 prompt_cache_hit_tokens）
    for (const s of signals) {
      const usage = (s.usageKeys ?? []).join(',').toLowerCase();
      if (!usage) continue;
      for (const tp of THIRD_PARTY_USAGE_MARKERS) {
        if (tp.vendor !== expected && tp.markers.every((m) => usage.includes(m.toLowerCase()))) {
          return {
            dimension: 'provenance_fingerprint',
            verdict: 'fail',
            score: 0,
            explanation: `响应 usage 含「${tp.label}」特有字段（${tp.markers.join('、')}），与目标厂商 ${vendorCn[expected]} 不符。强烈疑似第三方模型套壳替换。`,
          };
        }
      }
    }

    const scores: Record<string, number> = {
      openai: scoreVendor(VENDOR_SIGNATURES.openai, signals),
      anthropic: scoreVendor(VENDOR_SIGNATURES.anthropic, signals),
      google: scoreVendor(VENDOR_SIGNATURES.google, signals),
    };
    const expectedScore = scores[expected];
    // 找出最强的“竞品”厂商命中
    let topOther = '';
    let topOtherScore = 0;
    for (const v of ['openai', 'anthropic', 'google']) {
      if (v === expected) continue;
      if (scores[v] > topOtherScore) {
        topOtherScore = scores[v];
        topOther = v;
      }
    }

    // 竞品信号强于目标厂商 → 判定来源冲突（强替换信号）
    if (topOtherScore > expectedScore && topOtherScore >= 3) {
      return {
        dimension: 'provenance_fingerprint',
        verdict: 'fail',
        score: 0,
        explanation: `响应元数据指向 ${vendorCn[topOther]}（命中分 ${topOtherScore}），而非目标厂商 ${vendorCn[expected]}（命中分 ${expectedScore}）。检测到上游来源冲突，强烈疑似模型身份替换。`,
      };
    }

    if (expectedScore >= 3) {
      const score = expectedScore >= 5 ? 100 : 85;
      return {
        dimension: 'provenance_fingerprint',
        verdict: 'pass',
        score,
        explanation: `响应元数据（id 前缀、usage 特有字段、结束原因等）与目标厂商 ${vendorCn[expected]} 一致，命中分 ${expectedScore}。`,
      };
    }

    // 元数据被规范化（无厂商特征）：无法证伪，但也失去强证据
    return {
      dimension: 'provenance_fingerprint',
      verdict: 'suspect',
      score: 55,
      explanation: `响应元数据未见 ${vendorCn[expected]} 的厂商特征，也未见明显竞品特征。中转站可能已规范化元数据，来源不可证实。`,
    };
  },
};

export const ALL_PROBES: DimensionProbe[] = [
  protocolProbe,
  structureProbe,
  knowledgeProbe,
  identityProbe,
  reasoningProbe,
  fingerprintProbe,
  provenanceProbe,
];
