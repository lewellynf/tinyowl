import type { ModelProfile } from './types.js';

/** 各目标模型基线画像（身份关键词、是否含思维链、典型长度） */
const PROFILES: Record<string, ModelProfile> = {
  'gpt-5.5': { model: 'gpt-5.5', identityKeywords: ['gpt', 'openai', 'chatgpt', 'gpt-5'], hasReasoning: true, typicalLenRange: [50, 4000] },
  'gpt-5.4': { model: 'gpt-5.4', identityKeywords: ['gpt', 'openai', 'chatgpt', 'gpt-5'], hasReasoning: true, typicalLenRange: [50, 4000] },
  'claude-opus-4-8': { model: 'claude-opus-4-8', identityKeywords: ['claude', 'anthropic', 'opus'], hasReasoning: true, typicalLenRange: [80, 6000] },
  'claude-opus-4-7': { model: 'claude-opus-4-7', identityKeywords: ['claude', 'anthropic', 'opus'], hasReasoning: true, typicalLenRange: [80, 6000] },
  'claude-opus-4-6': { model: 'claude-opus-4-6', identityKeywords: ['claude', 'anthropic', 'opus'], hasReasoning: true, typicalLenRange: [80, 6000] },
  'claude-sonnet-4-6': { model: 'claude-sonnet-4-6', identityKeywords: ['claude', 'anthropic', 'sonnet'], hasReasoning: false, typicalLenRange: [50, 5000] },
  'gemini-3.1-pro': { model: 'gemini-3.1-pro', identityKeywords: ['gemini', 'google', 'bard'], hasReasoning: true, typicalLenRange: [50, 5000] },
};

const DEFAULT_PROFILE: ModelProfile = {
  model: 'unknown',
  identityKeywords: [],
  hasReasoning: false,
  typicalLenRange: [10, 8000],
};

export function getModelProfile(model: string): ModelProfile {
  return PROFILES[model] ?? { ...DEFAULT_PROFILE, model };
}

/** 已知答案的知识探测题库 */
export interface KnowledgeQuestion {
  prompt: string;
  /** 任一关键词命中即判正确（小写比对） */
  expectedKeywords: string[];
}

export const KNOWLEDGE_QUESTIONS: KnowledgeQuestion[] = [
  { prompt: '只回答数字：2 的 10 次方等于多少？', expectedKeywords: ['1024'] },
  { prompt: '中国的首都是哪座城市？只回答城市名。', expectedKeywords: ['北京', 'beijing'] },
  { prompt: '水的化学分子式是什么？只回答分子式。', expectedKeywords: ['h2o', 'h₂o'] },
  { prompt: '一年有多少个月？只回答数字。', expectedKeywords: ['12', '十二'] },
  { prompt: '光在真空中的速度约为每秒多少万千米？只回答数字。', expectedKeywords: ['30', '三十', '299792', '300000'] },
];

/** 身份探测题 */
export const IDENTITY_QUESTIONS: string[] = [
  '你是哪个模型？请直接说明你的模型名称与厂商。',
  '请用一句话说明你是由哪家公司训练的、属于哪个模型系列。',
];

/** 思维链探测题（需要多步推理） */
export const REASONING_QUESTIONS: string[] = [
  '小明有 3 个苹果，又买了 5 个，吃掉 2 个，请一步步推理后给出还剩几个。',
];
