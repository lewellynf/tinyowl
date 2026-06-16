import { nanoid } from 'nanoid';

export interface KeyRef {
  taskId: string;
}

/**
 * 进程内密钥持有者：API Key 仅在内存中存活，任务结束即焚（REQ-2.2）。
 * 不落盘、不进日志（日志经 mask 中间件处理）。
 */
export class InMemoryKeyHolder {
  private store = new Map<string, string>();

  put(apiKey: string, taskId = nanoid()): KeyRef {
    this.store.set(taskId, apiKey);
    return { taskId };
  }

  use<T>(ref: KeyRef, fn: (key: string) => T): T {
    const key = this.store.get(ref.taskId);
    if (key === undefined) {
      throw new Error('密钥不存在或已被销毁');
    }
    return fn(key);
  }

  has(ref: KeyRef): boolean {
    return this.store.has(ref.taskId);
  }

  /** 销毁密钥：删除引用（REQ-2.2） */
  wipe(taskId: string): void {
    this.store.delete(taskId);
  }
}

export const keyHolder = new InMemoryKeyHolder();
