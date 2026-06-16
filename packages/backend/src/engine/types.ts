import type { Dimension } from '@tinyowl/shared';

/** 单次中转站采样的原始记录（由采样层产生，喂给纯函数判定层） */
export interface RelaySample {
  /** 探测意图，用于让各 probe 取用相关样本 */
  purpose: 'protocol' | 'structure' | 'knowledge' | 'identity' | 'reasoning' | 'fingerprint' | 'cache';
  ok: boolean; // 该轮是否成功（非超时/网络错误）
  timedOut: boolean;
  httpStatus?: number;
  /** 非流式响应体（已解析 JSON），可能为 null */
  body?: unknown;
  /** 流式响应原始分块文本（SSE）拼接，用于协议校验 */
  streamRaw?: string;
  /** 提取的助手文本内容 */
  content?: string;
  /** 提取的推理/思维链内容（若有） */
  reasoning?: string;
  latencyMs?: number;
  /** 探测题元信息（知识题对错判定用） */
  meta?: Record<string, unknown>;
}

/** 目标模型基线画像，用于身份/指纹比对 */
export interface ModelProfile {
  model: string;
  vendor: 'openai' | 'anthropic' | 'google' | 'unknown';
  /** 本模型/厂商自述身份时常见的关键词（命中视为身份一致） */
  identityKeywords: string[];
  /** 其它厂商关键词（自述命中这些 = 疑似身份替换） */
  competitorKeywords: string[];
  /** 是否为具备显式思维链/推理痕迹的模型 */
  hasReasoning: boolean;
}

export interface ProbeContext {
  baseUrl: string;
  targetModel: string;
  cacheDetection: boolean;
  onProgress: (p: { round: number; dimension: Dimension }) => void;
}
