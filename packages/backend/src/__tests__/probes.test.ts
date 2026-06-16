import { describe, it, expect } from 'vitest';
import {
  fingerprintProbe,
  identityProbe,
  knowledgeProbe,
  protocolProbe,
  structureProbe,
} from '../engine/probes.js';
import { getModelProfile } from '../engine/profiles.js';
import type { RelaySample } from '../engine/types.js';

const opus = getModelProfile('claude-opus-4-6');

describe('protocolProbe', () => {
  it('完整 OpenAI 协议字段 → pass', () => {
    const samples: RelaySample[] = [
      { purpose: 'protocol', ok: true, timedOut: false, body: { id: 'x', object: 'chat.completion', choices: [{}], model: 'm' } },
    ];
    const r = protocolProbe.evaluate(samples, opus);
    expect(r.verdict).toBe('pass');
    expect(r.score).toBe(100);
  });

  it('缺失顶层字段 → fail', () => {
    const samples: RelaySample[] = [{ purpose: 'protocol', ok: true, timedOut: false, body: { foo: 1 } }];
    const r = protocolProbe.evaluate(samples, opus);
    expect(r.verdict).toBe('fail');
  });

  it('全部超时 → inconclusive', () => {
    const samples: RelaySample[] = [{ purpose: 'protocol', ok: false, timedOut: true }];
    expect(protocolProbe.evaluate(samples, opus).verdict).toBe('inconclusive');
  });
});

describe('structureProbe', () => {
  it('usage total = prompt + completion 且字段合法 → pass', () => {
    const samples: RelaySample[] = [
      {
        purpose: 'structure',
        ok: true,
        timedOut: false,
        body: {
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }],
        },
      },
    ];
    expect(structureProbe.evaluate(samples, opus).verdict).toBe('pass');
  });

  it('total 不等于 prompt+completion → 非 pass', () => {
    const samples: RelaySample[] = [
      {
        purpose: 'structure',
        ok: true,
        timedOut: false,
        body: {
          usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 99 },
          choices: [{ finish_reason: 'stop', message: { role: 'assistant' } }],
        },
      },
    ];
    expect(structureProbe.evaluate(samples, opus).verdict).not.toBe('pass');
  });
});

describe('knowledgeProbe', () => {
  it('命中预期关键词 → 高分', () => {
    const samples: RelaySample[] = [
      { purpose: 'knowledge', ok: true, timedOut: false, content: '答案是 1024', meta: { expectedKeywords: ['1024'] } },
      { purpose: 'knowledge', ok: true, timedOut: false, content: '北京', meta: { expectedKeywords: ['北京'] } },
    ];
    const r = knowledgeProbe.evaluate(samples, opus);
    expect(r.score).toBe(100);
    expect(r.verdict).toBe('pass');
  });

  it('全部答错 → 低分并提示降智', () => {
    const samples: RelaySample[] = [
      { purpose: 'knowledge', ok: true, timedOut: false, content: '不知道', meta: { expectedKeywords: ['1024'] } },
    ];
    const r = knowledgeProbe.evaluate(samples, opus);
    expect(r.score).toBe(0);
    expect(r.verdict).toBe('fail');
  });
});

describe('identityProbe', () => {
  it('自述身份命中目标关键词 → pass', () => {
    const samples: RelaySample[] = [
      { purpose: 'identity', ok: true, timedOut: false, content: '我是 Claude，由 Anthropic 训练。' },
    ];
    expect(identityProbe.evaluate(samples, opus).verdict).toBe('pass');
  });

  it('自述身份完全不符 → fail（触发身份替换）', () => {
    const samples: RelaySample[] = [
      { purpose: 'identity', ok: true, timedOut: false, content: '我是 GPT，由 OpenAI 开发。' },
    ];
    expect(identityProbe.evaluate(samples, opus).verdict).toBe('fail');
  });

  // 回归用例：正品 Claude 因安全策略拒答身份问题，不应判失败（对齐真品 xiaomuai.cn）
  it('正品拒答身份问题（如 "I can\'t discuss that."）→ pass，不误判替换', () => {
    const samples: RelaySample[] = [
      { purpose: 'identity', ok: true, timedOut: false, content: "I can't discuss that." },
      { purpose: 'identity', ok: true, timedOut: false, content: '抱歉，我无法讨论这个问题。' },
    ];
    const r = identityProbe.evaluate(samples, opus);
    expect(r.verdict).toBe('pass');
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it('部分拒答 + 部分自称本厂商 → pass', () => {
    const samples: RelaySample[] = [
      { purpose: 'identity', ok: true, timedOut: false, content: "I can't discuss that." },
      { purpose: 'identity', ok: true, timedOut: false, content: '我是 Claude。' },
    ];
    expect(identityProbe.evaluate(samples, opus).verdict).toBe('pass');
  });
});

describe('fingerprintProbe（校准回归）', () => {
  // 回归用例：正品中文四行诗，长度恒为 35 但内容各异，应 pass（对齐真品 xiaomuai.cn）
  it('固定格式输出长度相同但内容互异 → pass（不误判缓存）', () => {
    const poems = [
      '落叶随风舞翩翩，霜染枫林色斑斓。雁阵南飞天际远，一抹斜阳挂冷山。',
      '枫叶染红山间路，寒露凝霜草木疏。雁阵南归天际远，一壶新茶对黄昏。',
      '落叶随风舞翩翩，寒霜初染柿枝间。雁阵南归天际远，一缕秋光映冷山。',
      '落叶随风舞翩跹，霜染枫林红似焰。雁阵南归天际远，一抹斜阳照秋山。',
      '落叶随风舞翩翩，霜染枫林色斑斓。雁阵南飞天际远，一湖秋水映寒山。',
    ];
    const samples: RelaySample[] = poems.map((c) => ({ purpose: 'fingerprint', ok: true, timedOut: false, content: c }));
    const r = fingerprintProbe.evaluate(samples, opus);
    expect(r.verdict).toBe('pass');
    expect(r.score).toBe(100);
  });

  // 对抗用例：多次返回完全相同内容 → 疑似缓存/模板，应扣分
  it('多次返回完全相同内容 → suspect/fail（识别缓存模板）', () => {
    const same = '这是一句固定的模板回答。';
    const samples: RelaySample[] = Array.from({ length: 5 }, () => ({
      purpose: 'fingerprint' as const,
      ok: true,
      timedOut: false,
      content: same,
    }));
    const r = fingerprintProbe.evaluate(samples, opus);
    expect(r.score).toBeLessThan(80);
  });

  it('多次空响应 → 低分', () => {
    const samples: RelaySample[] = Array.from({ length: 3 }, () => ({
      purpose: 'fingerprint' as const,
      ok: true,
      timedOut: false,
      content: '',
    }));
    expect(fingerprintProbe.evaluate(samples, opus).score).toBeLessThan(60);
  });
});
