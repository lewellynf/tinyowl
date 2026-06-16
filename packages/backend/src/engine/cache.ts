import type { CacheDetectionResult } from '@tinyowl/shared';
import type { RelaySample } from './types.js';

/**
 * 缓存命中判定（REQ-4.2）。纯函数。
 * 对同一 prompt 重复请求：若内容字节级一致且后续延迟显著低于首次，疑似缓存。
 */
export function evaluateCache(samples: RelaySample[]): CacheDetectionResult {
  const relevant = samples.filter((s) => s.purpose === 'cache' && !s.timedOut && s.ok);
  if (relevant.length < 2) {
    return { enabled: true, cacheHitSuspected: false, explanation: '缓存探测采样不足，未能判定。' };
  }
  const first = relevant[0];
  const rest = relevant.slice(1);
  const identicalContent = rest.every((s) => (s.content ?? '') === (first.content ?? '') && (s.content ?? '').length > 0);
  const firstLatency = first.latencyMs ?? 0;
  const avgRestLatency = rest.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0) / rest.length;
  const latencyDrop = firstLatency > 0 && avgRestLatency < firstLatency * 0.4;

  const cacheHitSuspected = identicalContent && latencyDrop;
  let explanation: string;
  if (cacheHitSuspected) {
    explanation = `重复请求返回完全一致内容，且后续延迟（${avgRestLatency.toFixed(0)}ms）显著低于首次（${firstLatency}ms），疑似命中缓存。`;
  } else if (identicalContent) {
    explanation = '重复请求内容一致，但延迟无明显下降，可能为低温确定性输出而非缓存。';
  } else {
    explanation = '重复请求返回内容存在差异，未发现明显缓存行为。';
  }
  return { enabled: true, cacheHitSuspected, explanation };
}
