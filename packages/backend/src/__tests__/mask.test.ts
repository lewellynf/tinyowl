import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { maskKey, maskEndpoint, maskSensitive } from '../lib/mask.js';

describe('maskKey', () => {
  it('保留首尾各 4 字符（长度 > 8）', () => {
    expect(maskKey('sk-1234567890abcdef')).toBe('sk-1****cdef');
  });

  it('长度 <= 8 全部掩码，不泄露任何字符', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 8 }), (s) => {
        const masked = maskKey(s);
        expect(masked).toBe('*'.repeat(s.length));
      }),
    );
  });

  it('属性：掩码结果恒为 首4 + **** + 尾4，且长度固定为 12', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 9, maxLength: 80 }), (s) => {
        const masked = maskKey(s);
        expect(masked).toBe(`${s.slice(0, 4)}****${s.slice(-4)}`);
        expect(masked.length).toBe(12);
      }),
    );
  });
});

describe('maskEndpoint', () => {
  it('仅保留协议与主机名', () => {
    expect(maskEndpoint('https://relay.example.com/v1/chat?k=1')).toBe('https://relay.example.com');
  });
  it('非法 URL 返回 ***', () => {
    expect(maskEndpoint('not a url')).toBe('***');
  });
});

describe('maskSensitive（日志脱敏）', () => {
  it('属性：脱敏后文本不含原始 sk- 密钥', () => {
    fc.assert(
      fc.property(fc.hexaString({ minLength: 20, maxLength: 48 }), (hex) => {
        const key = `sk-${hex}`;
        const log = `请求使用密钥 ${key} 完成`;
        const masked = maskSensitive(log);
        expect(masked.includes(key)).toBe(false);
      }),
    );
  });
});
