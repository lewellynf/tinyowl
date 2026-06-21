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

/** 3. 知识问答结果：比对已知答案，过低命中率提示降智（REQ-3.5）
 *  评分更严格 — 知识问答正确率低说明模型能力不足或被替换 */
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
    const accuracy = correct / relevant.length;
    // 严格评分：正确率映射到分数区间
    let score: number;
    if (accuracy >= 0.8) score = Math.round(70 + accuracy * 30); // 94-100
    else if (accuracy >= 0.5) score = Math.round(accuracy * 80); // 40-64
    else score = Math.round(accuracy * 50); // 0-25

    return {
      dimension: 'knowledge_qa',
      verdict: scoreToVerdict(score, true),
      score,
      explanation: `已知答案探测题命中 ${correct}/${relevant.length}。${
        score < 50 ? '命中率偏低，能力疑似低于所声称模型（疑似降智或替换）。' : '知识问答表现正常。'
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

/** 6. 签名指纹：基于多次采样的统计指纹 + Claude Code 签名验证（REQ-3.8）
 *  关键原则：判缓存/模板要看「内容是否重复」，而非「长度是否相同」——
 *  正品模型在固定格式下（如中文四行诗）长度天然一致，但内容各不相同。
 *  Claude Code 验证：发送 Claude Code 客户端特征头和系统提示词，
 *  正品 Anthropic 后端会正常响应；非 Anthropic 后端可能拒绝或行为异常。 */
export const fingerprintProbe: DimensionProbe = {
  dimension: 'signature_fingerprint',
  evaluate(samples) {
    const fingerprints = samples.filter((s) => s.purpose === 'fingerprint' && !s.timedOut && s.ok);
    const ccVerify = samples.filter((s) => s.purpose === 'claude_code_verify' && !s.timedOut);

    if (fingerprints.length < 2 && ccVerify.length === 0) {
      return { dimension: 'signature_fingerprint', verdict: 'inconclusive', score: 0, explanation: '指纹采样不足（需至少 2 次有效采样）。' };
    }

    let totalScore = 0;
    let totalWeight = 0;
    const explanations: string[] = [];

    // 统计指纹部分（权重 60%）
    if (fingerprints.length >= 2) {
      const contents = fingerprints.map((s) => (s.content ?? '').trim());
      const nonEmpty = contents.filter((c) => c.length > 0).length;
      const validity = nonEmpty / contents.length;
      const uniqueContents = new Set(contents.filter((c) => c.length > 0)).size;
      const diversity = nonEmpty > 0 ? uniqueContents / nonEmpty : 0;

      const validityScore = validity * 55;
      let diversityScore: number;
      let diversityNote: string;
      if (diversity >= 0.8) {
        diversityScore = 45;
        diversityNote = '内容多样性高';
      } else if (diversity >= 0.5) {
        diversityScore = 32;
        diversityNote = '内容存在部分重复';
      } else if (diversity > 0) {
        diversityScore = 14;
        diversityNote = '内容大量重复，疑似缓存';
      } else {
        diversityScore = 0;
        diversityNote = '无有效内容';
      }
      const fpScore = Math.min(100, validityScore + diversityScore);
      totalScore += fpScore * 0.6;
      totalWeight += 0.6;
      explanations.push(`统计指纹：去重率 ${(diversity * 100).toFixed(0)}%（${uniqueContents}/${nonEmpty}），${diversityNote}`);
    }

    // Claude Code 签名验证部分（权重 40%）
    if (ccVerify.length > 0) {
      const s = ccVerify[0];
      let ccScore: number;
      if (!s.ok) {
        // 请求失败 — 中转站可能不支持 Claude Code headers
        ccScore = 50;
        explanations.push('Claude Code 签名验证：请求失败（中转站可能不支持）');
      } else {
        const content = (s.content ?? '').toLowerCase();
        const provenance = s.provenance;
        // 检查响应是否来自 Anthropic（id 前缀 msg_）
        const isAnthropicId = provenance?.idPrefix === 'msg_';
        // 检查模型是否正常回答身份（Claude 应能回答）
        const claimsClaudeInContent = /claude/i.test(content) && /anthropic/i.test(content);
        // 检查是否出现拒绝访问模式
        const denied = /cannot discuss|can'?t provide|unable to comply|access denied|not authorized/i.test(content) || /无法执行|没有权限|不在我的能力范围/i.test(content);

        if (isAnthropicId && claimsClaudeInContent) {
          ccScore = 100;
          explanations.push('Claude Code 签名验证：响应 id 前缀 msg_，自述 Claude/Anthropic，验证通过');
        } else if (claimsClaudeInContent) {
          ccScore = 80;
          explanations.push('Claude Code 签名验证：自述 Claude/Anthropic 但元数据不完全匹配');
        } else if (denied) {
          ccScore = 40;
          explanations.push('Claude Code 签名验证：收到访问拒绝，可能为非 Anthropic 后端');
        } else {
          ccScore = 55;
          explanations.push('Claude Code 签名验证：未能确认 Anthropic 来源');
        }
      }
      totalScore += ccScore * 0.4;
      totalWeight += 0.4;
    }

    const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    return {
      dimension: 'signature_fingerprint',
      verdict: scoreToVerdict(score, true),
      score,
      explanation: explanations.join('。') + '。',
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

/** 8. 动态计算：随机数学题验证计算能力，不可缓存（参考 hvoy.ai）
 *  评分逻辑更严格：错误直接重罚，因为正品大模型应该能答对简单算术。 */
export const computationProbe: DimensionProbe = {
  dimension: 'dynamic_computation',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'computation' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'dynamic_computation', verdict: 'inconclusive', score: 0, explanation: '无有效动态计算采样。' };
    }
    let correct = 0;
    let wrong = 0;
    for (const s of relevant) {
      const expected = s.meta?.expectedAnswer as number | undefined;
      if (expected === undefined) continue;
      const content = (s.content ?? '').trim();
      // 从回答中提取数字
      const numbers = content.match(/-?\d+/g);
      if (numbers && numbers.some((n) => parseInt(n, 10) === expected)) {
        correct++;
      } else {
        wrong++;
      }
    }
    // 严格评分：每错一题重扣
    const total = correct + wrong;
    if (total === 0) {
      return { dimension: 'dynamic_computation', verdict: 'inconclusive', score: 0, explanation: '无可判定的计算样本。' };
    }
    // 正确率低于 60% → fail，低端模型或缓存回复的强信号
    const accuracy = correct / total;
    let score: number;
    if (accuracy >= 0.8) score = Math.round(accuracy * 100);
    else if (accuracy >= 0.5) score = Math.round(accuracy * 70); // 压缩到 35-56 分段
    else score = Math.round(accuracy * 40); // 压缩到 0-20 分段

    return {
      dimension: 'dynamic_computation',
      verdict: scoreToVerdict(score, true),
      score,
      explanation: `随机数学题正确 ${correct}/${total}。${
        score < 50 ? '计算能力明显不足，疑似低端模型或固定模板回复。' : '动态计算能力正常。'
      }`,
    };
  },
};

/** 9. 指令遵循：验证模型对复杂约束的遵循能力（含 JSON Schema 结构化输出） */
export const instructionProbe: DimensionProbe = {
  dimension: 'instruction_following',
  evaluate(samples) {
    const relevant = samples.filter((s) => (s.purpose === 'instruction' || s.purpose === 'structured_output') && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'instruction_following', verdict: 'inconclusive', score: 0, explanation: '无有效指令遵循采样。' };
    }
    let pass = 0;
    const notes: string[] = [];
    for (const s of relevant) {
      const validatorId = s.meta?.validator as string | undefined;
      const isJsonSchema = s.meta?.isJsonSchema as boolean | undefined;
      const content = (s.content ?? '').trim();
      let ok = false;

      if (isJsonSchema) {
        // JSON Schema 结构化输出验证
        const expected = s.meta?.expectedAnswer as number | undefined;
        try {
          const parsed = JSON.parse(content);
          ok = typeof parsed === 'object' && parsed !== null &&
            'expression' in parsed && 'result' in parsed &&
            typeof parsed.result === 'number' &&
            (expected === undefined || parsed.result === expected);
        } catch {
          ok = false;
        }
        if (!ok) notes.push('JSON Schema 结构化输出验证失败');
      } else {
        switch (validatorId) {
          case 'exact_ok':
            ok = /^\s*OK\s*$/i.test(content);
            if (!ok) notes.push('未精确回复 OK');
            break;
          case 'chinese_comma':
            ok = content === '，' || content === '"，"' || content === '「，」';
            if (!ok) notes.push('未精确输出中文逗号');
            break;
          case 'constrained_poem': {
            const words = content.split(/\s+/).filter(Boolean);
            const hasFiveWords = words.length === 5;
            const hasSunset = content.includes('夕阳');
            const noForbidden = !content.includes('的') && !content.includes('了');
            ok = hasFiveWords && hasSunset && noForbidden;
            if (!ok) notes.push('约束诗句未满足全部条件');
            break;
          }
          case 'json_format': {
            const expected = s.meta?.expectedAnswer as number | undefined;
            try {
              const parsed = JSON.parse(content);
              ok = typeof parsed === 'object' && parsed !== null &&
                'expression' in parsed && 'result' in parsed &&
                (expected === undefined || parsed.result === expected);
            } catch {
              ok = false;
            }
            if (!ok) notes.push('未返回正确 JSON 格式或计算结果有误');
            break;
          }
          default:
            ok = content.length > 0;
        }
      }
      if (ok) pass++;
    }
    const score = Math.round((pass / relevant.length) * 100);
    return {
      dimension: 'instruction_following',
      verdict: scoreToVerdict(score, true),
      score,
      explanation: `指令遵循测试通过 ${pass}/${relevant.length}。${
        score < 50 ? '指令遵循能力偏弱，疑似低端模型。' : [...new Set(notes)].join('；') || '指令遵循能力正常。'
      }`,
    };
  },
};

/** 10. 注入抗性：检测中转站是否泄露系统提示词/内部信息 */
export const injectionProbe: DimensionProbe = {
  dimension: 'injection_resistance',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'injection' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'injection_resistance', verdict: 'inconclusive', score: 0, explanation: '无有效注入抗性采样。' };
    }
    const patterns: RegExp[] = [
      /system\s*prompt/i,
      /you\s+are\s+(an?\s+)?(interactive\s+)?agent/i,
      /chain.of.thought/i,
      /thinking\s*block/i,
      /signature.delta/i,
      /hidden\s+instructions/i,
      /tool\s+definitions/i,
      /系统提示词/,
      /内部模型签名/,
      /不可见推理/,
    ];
    let leaked = 0;
    for (const s of relevant) {
      const content = (s.content ?? '');
      const hit = patterns.some((p) => p.test(content));
      if (hit) {
        leaked++;
      }
    }
    // 无泄露 = 100 分；泄露率越高分越低
    const leakRate = leaked / relevant.length;
    const score = Math.round((1 - leakRate) * 100);
    let explanation: string;
    if (leaked === 0) {
      explanation = '模型正确拒绝了注入攻击，未泄露任何内部信息。注入抗性良好。';
    } else {
      explanation = `${relevant.length} 次注入探测中 ${leaked} 次检测到疑似信息泄露。中转站可能注入了额外 system prompt 或模型抗注入能力不足。`;
    }
    return {
      dimension: 'injection_resistance',
      verdict: scoreToVerdict(score, true),
      score,
      explanation,
    };
  },
};

/** 11. 陷阱题（时效性陷阱）：问虚构的未来事件，正品模型应拒绝回答。
 *  逻辑反转：默认假设回答 = 可疑，只有明确拒绝才得分。
 *  这是 hvoy.ai 的核心鉴伪手段 — 中转站灌假数据时陷阱题必中。 */
export const trapProbe: DimensionProbe = {
  dimension: 'trap_detection',
  evaluate(samples) {
    const relevant = samples.filter((s) => s.purpose === 'trap' && !s.timedOut && s.ok);
    if (relevant.length === 0) {
      return { dimension: 'trap_detection', verdict: 'inconclusive', score: 0, explanation: '无有效陷阱题采样。' };
    }

    // 广泛的拒绝/不确定模式 — 正品模型遇到未来事件应表达不确定
    const UNIVERSAL_REFUSAL = /不知道|don'?t\s*know|not\s*sure|无法确认|cannot\s+confirm|无法回答|没有.*信息|无法提供|不确定|我不了解|尚未|还没有|没有发生|hasn'?t\s*(happened|occurred)|not\s*aware|no\s+information|as\s+of\s+my|截止|knowledge\s*cut/i;

    let correctRefusals = 0;
    let suspiciousAnswers = 0;
    let confidentAnswers = 0; // 未命中具体模式但也没拒绝 = 疑似编造
    const suspiciousDetails: string[] = [];

    for (const s of relevant) {
      const content = (s.content ?? '');
      const contentLower = content.toLowerCase();
      const suspiciousPatterns = s.meta?.suspiciousPatterns as string[] | undefined;
      const refusalPatterns = s.meta?.refusalPatterns as string[] | undefined;

      // 检查是否明确拒绝（正确行为）
      const refused = refusalPatterns
        ? refusalPatterns.some((p) => new RegExp(p, 'i').test(content))
        : UNIVERSAL_REFUSAL.test(content);

      // 检查是否命中具体虚假答案模式
      const hitSpecific = suspiciousPatterns
        ? suspiciousPatterns.some((p) => new RegExp(p, 'i').test(content))
        : false;

      if (hitSpecific) {
        // 命中了具体的虚假答案 — 最严重
        suspiciousAnswers++;
        const trapId = s.meta?.trapId as string ?? 'unknown';
        suspiciousDetails.push(trapId);
      } else if (refused) {
        // 明确拒绝 — 正确
        correctRefusals++;
      } else {
        // 既没拒绝也没命中具体模式 — 但给出了某种回答 = 编造嫌疑
        // 检查回复长度：如果内容较长且像在回答问题，视为编造
        if (contentLower.length > 20) {
          confidentAnswers++;
          const trapId = s.meta?.trapId as string ?? 'unknown';
          suspiciousDetails.push(trapId);
        } else {
          correctRefusals += 0.5;
        }
      }
    }

    const totalBad = suspiciousAnswers + confidentAnswers;

    // 任何一次可疑回答 = 判 fail
    if (totalBad > 0) {
      // 命中具体模式的更严重
      const severity = suspiciousAnswers > 0 ? 15 : 25;
      const score = Math.min(severity, Math.max(0, Math.round((correctRefusals / relevant.length) * 40)));
      return {
        dimension: 'trap_detection',
        verdict: 'fail',
        score,
        explanation: `${relevant.length} 道陷阱题中有 ${totalBad} 次未正确拒绝虚构事件（${suspiciousDetails.join('、')}）。` +
          (suspiciousAnswers > 0 ? '模型自信回答了虚假信息，疑似被灌入假数据。' : '模型未表达不确定性，疑似编造回答。'),
      };
    }

    const score = Math.round((correctRefusals / relevant.length) * 100);
    return {
      dimension: 'trap_detection',
      verdict: scoreToVerdict(score, true),
      score,
      explanation: score >= 80
        ? '模型正确拒绝了所有陷阱题（虚构未来事件），时效性验证通过。'
        : `${relevant.length} 道陷阱题中 ${Math.round(correctRefusals)} 次正确拒绝，部分回答模糊。`,
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
  computationProbe,
  instructionProbe,
  injectionProbe,
  trapProbe,
];
