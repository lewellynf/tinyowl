import { describe, it, expect } from 'vitest';
import { identityProbe, knowledgeProbe, protocolProbe, structureProbe } from '../engine/probes.js';
import { getModelProfile } from '../engine/profiles.js';
import type { RelaySample } from '../engine/types.js';

const opus = getModelProfile('claude-opus-4-8');

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
});
