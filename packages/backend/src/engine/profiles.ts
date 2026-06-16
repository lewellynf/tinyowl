import type { ModelProfile } from './types.js';

const OPENAI_KW = ['gpt', 'openai', 'chatgpt'];
const ANTHROPIC_KW = ['claude', 'anthropic'];
const GOOGLE_KW = ['gemini', 'google', 'bard'];

/** 各目标模型基线画像（身份关键词、竞品关键词、是否含思维链） */
const PROFILES: Record<string, ModelProfile> = {
  'gpt-5.5': { model: 'gpt-5.5', vendor: 'openai', identityKeywords: OPENAI_KW, competitorKeywords: [...ANTHROPIC_KW, ...GOOGLE_KW], hasReasoning: true },
  'gpt-5.4': { model: 'gpt-5.4', vendor: 'openai', identityKeywords: OPENAI_KW, competitorKeywords: [...ANTHROPIC_KW, ...GOOGLE_KW], hasReasoning: true },
  'claude-opus-4-8': { model: 'claude-opus-4-8', vendor: 'anthropic', identityKeywords: ANTHROPIC_KW, competitorKeywords: [...OPENAI_KW, ...GOOGLE_KW], hasReasoning: true },
  'claude-opus-4-7': { model: 'claude-opus-4-7', vendor: 'anthropic', identityKeywords: ANTHROPIC_KW, competitorKeywords: [...OPENAI_KW, ...GOOGLE_KW], hasReasoning: true },
  'claude-opus-4-6': { model: 'claude-opus-4-6', vendor: 'anthropic', identityKeywords: ANTHROPIC_KW, competitorKeywords: [...OPENAI_KW, ...GOOGLE_KW], hasReasoning: true },
  'claude-sonnet-4-6': { model: 'claude-sonnet-4-6', vendor: 'anthropic', identityKeywords: ANTHROPIC_KW, competitorKeywords: [...OPENAI_KW, ...GOOGLE_KW], hasReasoning: false },
  'gemini-3.1-pro': { model: 'gemini-3.1-pro', vendor: 'google', identityKeywords: GOOGLE_KW, competitorKeywords: [...OPENAI_KW, ...ANTHROPIC_KW], hasReasoning: true },
};

const DEFAULT_PROFILE: ModelProfile = {
  model: 'unknown',
  vendor: 'unknown',
  identityKeywords: [],
  competitorKeywords: [],
  hasReasoning: false,
};

export function getModelProfile(model: string): ModelProfile {
  return PROFILES[model] ?? { ...DEFAULT_PROFILE, model };
}

/** 各厂商的协议来源签名（响应元数据指纹）。难以伪造，是强鉴别信号。 */
export interface VendorSignature {
  vendor: 'openai' | 'anthropic' | 'google';
  /** 该厂商响应 id 的典型前缀 */
  idPrefixes: string[];
  /** usage 中出现即强烈指向该厂商的特有字段（子串匹配） */
  usageMarkers: string[];
  /** 该厂商原生的结束原因取值 */
  finishReasons: string[];
  /** 是否会出现 OpenAI 特有的 system_fingerprint */
  systemFingerprint: boolean;
}

export const VENDOR_SIGNATURES: Record<'openai' | 'anthropic' | 'google', VendorSignature> = {
  openai: {
    vendor: 'openai',
    idPrefixes: ['chatcmpl-'],
    usageMarkers: ['prompt_tokens_details', 'completion_tokens_details', 'reasoning_tokens'],
    finishReasons: ['stop', 'length', 'tool_calls', 'content_filter', 'function_call'],
    systemFingerprint: true,
  },
  anthropic: {
    vendor: 'anthropic',
    idPrefixes: ['msg_'],
    usageMarkers: ['cache_creation_input_tokens', 'cache_read_input_tokens', 'claude_cache_creation'],
    finishReasons: ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use'],
    systemFingerprint: false,
  },
  google: {
    vendor: 'google',
    idPrefixes: [],
    usageMarkers: ['promptTokenCount', 'candidatesTokenCount', 'totalTokenCount'],
    finishReasons: ['STOP', 'MAX_TOKENS', 'SAFETY', 'stop'],
    systemFingerprint: false,
  },
};

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
