/** 平台支持的目标模型（参考 hvoy.ai 榜单分类） */
export interface ModelOption {
  value: string;
  label: string;
  vendor: 'openai' | 'anthropic' | 'google';
}

export const SUPPORTED_MODELS: ModelOption[] = [
  { value: 'gpt-5.5', label: 'GPT 5.5', vendor: 'openai' },
  { value: 'gpt-5.4', label: 'GPT 5.4', vendor: 'openai' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8', vendor: 'anthropic' },
  { value: 'claude-opus-4-7', label: 'Opus 4.7', vendor: 'anthropic' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6', vendor: 'anthropic' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', vendor: 'anthropic' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', vendor: 'google' },
];

export function modelLabel(value: string): string {
  return SUPPORTED_MODELS.find((m) => m.value === value)?.label ?? value;
}
