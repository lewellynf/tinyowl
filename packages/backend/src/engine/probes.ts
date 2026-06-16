import type { Dimension, DimensionResult, Verdict } from '@tinyowl/shared';
import type { ModelProfile, RelaySample } from './types.js';

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

/** 4. 身份一致性：自述身份与目标模型比对（REQ-3.6） */
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
    let match = 0;
    const seen: string[] = [];
    for (const s of relevant) {
      const content = (s.content ?? '').toLowerCase();
      seen.push(s.content?.slice(0, 40) ?? '');
      if (target.identityKeywords.some((k) => content.includes(k.toLowerCase()))) match++;
    }
    const score = Math.round((match / relevant.length) * 100);
    // 身份维度更严格：低于半数命中即判 fail（触发身份替换警示）
    const verdict: Verdict = score >= 80 ? 'pass' : score >= 50 ? 'suspect' : 'fail';
    return {
      dimension: 'identity_consistency',
      verdict,
      score,
      explanation:
        score >= 80
          ? `模型自述身份与目标「${target.model}」一致。`
          : `${relevant.length} 次身份探测中仅 ${match} 次与目标模型特征匹配，疑似模型身份替换。`,
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

/** 6. 签名指纹：基于秩的均匀性检验思路，比对长度分布与基线（REQ-3.8） */
export const fingerprintProbe: DimensionProbe = {
  dimension: 'signature_fingerprint',
  evaluate(samples, target) {
    const relevant = samples.filter((s) => s.purpose === 'fingerprint' && !s.timedOut && s.ok);
    if (relevant.length < 2) {
      return { dimension: 'signature_fingerprint', verdict: 'inconclusive', score: 0, explanation: '指纹采样不足（需至少 2 次有效采样）。' };
    }
    const lens = relevant.map((s) => (s.content ?? '').length);
    const [lo, hi] = target.typicalLenRange;
    const inRange = lens.filter((l) => l >= lo && l <= hi).length;
    // 长度分布离散度：完全相同的输出长度提示缓存/固定模板，过度集中也异常
    const uniqueLens = new Set(lens).size;
    const diversity = uniqueLens / lens.length; // 1 表示完全多样
    const rangeScore = (inRange / lens.length) * 70;
    const diversityScore = diversity * 30;
    const score = Math.round(Math.min(100, rangeScore + diversityScore));
    return {
      dimension: 'signature_fingerprint',
      verdict: scoreToVerdict(score, true),
      score,
      explanation:
        score >= 80
          ? '输出统计指纹（长度分布、离散度）与目标模型基线相符。'
          : `指纹偏离基线：${inRange}/${lens.length} 次输出长度落在典型区间，离散度 ${(diversity * 100).toFixed(0)}%。显著偏离可能为替换/降智或缓存。`,
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
];
