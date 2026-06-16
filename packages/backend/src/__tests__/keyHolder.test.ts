import { describe, it, expect } from 'vitest';
import { InMemoryKeyHolder } from '../engine/keyHolder.js';

describe('InMemoryKeyHolder', () => {
  it('put 后可读取，wipe 后即失效（用后即焚）', () => {
    const holder = new InMemoryKeyHolder();
    const ref = holder.put('sk-secret-123456');
    expect(holder.has(ref)).toBe(true);
    expect(holder.use(ref, (k) => k)).toBe('sk-secret-123456');
    holder.wipe(ref.taskId);
    expect(holder.has(ref)).toBe(false);
    expect(() => holder.use(ref, (k) => k)).toThrow();
  });

  it('不同 taskId 互不干扰', () => {
    const holder = new InMemoryKeyHolder();
    const a = holder.put('key-a', 'task-a');
    const b = holder.put('key-b', 'task-b');
    holder.wipe(a.taskId);
    expect(holder.has(a)).toBe(false);
    expect(holder.has(b)).toBe(true);
  });
});
