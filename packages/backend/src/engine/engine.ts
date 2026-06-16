import type { DetectionResult, Dimension, RoundInfo } from '@tinyowl/shared';
import { maskEndpoint } from '../lib/mask.js';
import { evaluateCache } from './cache.js';
import { AuthFailedError, callRelay } from './sampler.js';
import { ALL_PROBES } from './probes.js';
import { aggregateScore, deriveWarnings } from './score.js';
import {
  IDENTITY_QUESTIONS,
  KNOWLEDGE_QUESTIONS,
  REASONING_QUESTIONS,
  getModelProfile,
} from './profiles.js';
import type { ProbeContext, RelaySample } from './types.js';

export interface RunInput extends ProbeContext {
  taskId: string;
  apiKey: string;
  rounds: number;
  roundTimeoutMs: number;
}

const DIMENSION_ORDER: Dimension[] = [
  'protocol_consistency',
  'response_structure',
  'knowledge_qa',
  'identity_consistency',
  'reasoning_trace',
  'signature_fingerprint',
];

/**
 * 检测引擎主流程：采样（I/O）→ 判定（纯函数）→ 聚合（纯函数）。
 * 鉴权失败立即中止（REQ-3.9）；单轮超时仅标记并继续（REQ-3.10）。
 */
export async function runDetection(input: RunInput): Promise<DetectionResult> {
  const { baseUrl, apiKey, targetModel, roundTimeoutMs, rounds } = input;
  const profile = getModelProfile(targetModel);
  const samples: RelaySample[] = [];
  const roundInfos: RoundInfo[] = [];
  let roundCounter = 0;

  const baseSample = {
    baseUrl,
    apiKey,
    model: targetModel,
    timeoutMs: roundTimeoutMs,
  };

  // 探测计划：为每个维度生成若干轮采样
  const plan: Array<{ dimension: Dimension; sample: () => Promise<RelaySample> }> = [];

  // 协议一致性：流式 + 非流式各若干轮
  for (let i = 0; i < rounds; i++) {
    const stream = i % 2 === 1;
    plan.push({
      dimension: 'protocol_consistency',
      sample: () => callRelay({ ...baseSample, purpose: 'protocol', stream, messages: [{ role: 'user', content: '用一句话介绍你自己。' }] }),
    });
  }
  // 响应结构
  for (let i = 0; i < rounds; i++) {
    plan.push({
      dimension: 'response_structure',
      sample: () => callRelay({ ...baseSample, purpose: 'structure', messages: [{ role: 'user', content: '请回答：1+1=?' }] }),
    });
  }
  // 知识问答（轮转题库）
  for (let i = 0; i < rounds; i++) {
    const q = KNOWLEDGE_QUESTIONS[i % KNOWLEDGE_QUESTIONS.length];
    plan.push({
      dimension: 'knowledge_qa',
      sample: () => callRelay({ ...baseSample, purpose: 'knowledge', messages: [{ role: 'user', content: q.prompt }], meta: { expectedKeywords: q.expectedKeywords } }),
    });
  }
  // 身份一致性
  for (let i = 0; i < rounds; i++) {
    const q = IDENTITY_QUESTIONS[i % IDENTITY_QUESTIONS.length];
    plan.push({
      dimension: 'identity_consistency',
      sample: () => callRelay({ ...baseSample, purpose: 'identity', messages: [{ role: 'user', content: q }] }),
    });
  }
  // 思维链
  for (let i = 0; i < rounds; i++) {
    const q = REASONING_QUESTIONS[i % REASONING_QUESTIONS.length];
    plan.push({
      dimension: 'reasoning_trace',
      sample: () => callRelay({ ...baseSample, purpose: 'reasoning', messages: [{ role: 'user', content: q }] }),
    });
  }
  // 签名指纹：固定 prompt 多次采样
  for (let i = 0; i < rounds; i++) {
    plan.push({
      dimension: 'signature_fingerprint',
      sample: () => callRelay({ ...baseSample, purpose: 'fingerprint', messages: [{ role: 'user', content: '请写一首关于秋天的四行短诗。' }] }),
    });
  }

  // 执行采样
  for (const step of plan) {
    input.onProgress({ round: roundCounter, dimension: step.dimension });
    const sample = await step.sample();
    samples.push(sample);
    roundInfos.push({ index: roundCounter, status: sample.timedOut ? 'timeout' : 'ok' });
    roundCounter++;
    // 鉴权失败采样器已抛出，这里无需额外处理
  }

  // 缓存检测（可选，约 +30s）
  let cacheDetection;
  if (input.cacheDetection) {
    const cachePrompt = '请严格输出这句话：缓存检测探针。';
    for (let i = 0; i < 3; i++) {
      input.onProgress({ round: roundCounter, dimension: 'signature_fingerprint' });
      const s = await callRelay({ ...baseSample, purpose: 'cache', messages: [{ role: 'user', content: cachePrompt }] });
      samples.push(s);
      roundInfos.push({ index: roundCounter, status: s.timedOut ? 'timeout' : 'ok' });
      roundCounter++;
    }
    cacheDetection = evaluateCache(samples);
  }

  // 判定（纯函数）
  const dimensions = ALL_PROBES.map((p) => p.evaluate(samples, profile)).sort(
    (a, b) => DIMENSION_ORDER.indexOf(a.dimension) - DIMENSION_ORDER.indexOf(b.dimension),
  );
  const overallScore = aggregateScore(dimensions);
  const warnings = deriveWarnings(dimensions);

  return {
    taskId: input.taskId,
    status: 'COMPLETED',
    targetModel,
    endpointMasked: maskEndpoint(baseUrl),
    overallScore,
    dimensions,
    cacheDetection,
    warnings,
    rounds: roundInfos,
    keyWiped: false, // 由调用方在 finally 中置为 true
    createdAt: new Date().toISOString(),
  };
}

export { AuthFailedError };
