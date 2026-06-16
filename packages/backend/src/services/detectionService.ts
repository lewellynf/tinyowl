import { EventEmitter } from 'node:events';
import { nanoid } from 'nanoid';
import type {
  CreateDetectionRequest,
  DetectionResult,
  ProgressEvent,
  TaskStatus,
} from '@tinyowl/shared';
import { DIMENSION_LABELS } from '@tinyowl/shared';
import type { AppConfig } from '../config.js';
import { keyHolder } from '../engine/keyHolder.js';
import { AuthFailedError, runDetection } from '../engine/engine.js';
import { maskEndpoint } from '../lib/mask.js';
import { saveHistory } from './historyService.js';
import type { Db } from '../db/client.js';

interface TaskState {
  taskId: string;
  status: TaskStatus;
  result?: DetectionResult;
  emitter: EventEmitter;
  totalRounds: number;
}

const tasks = new Map<string, TaskState>();

function estimateTotalRounds(cfg: AppConfig, cacheDetection: boolean): number {
  // 6 维度 × rounds + 可选缓存 3 轮
  return cfg.probeRounds * 6 + (cacheDetection ? 3 : 0);
}

/** 创建并异步执行检测任务，返回 taskId */
export function createDetectionTask(
  db: Db,
  cfg: AppConfig,
  req: CreateDetectionRequest,
  logger: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void },
): string {
  const taskId = nanoid();
  const totalRounds = estimateTotalRounds(cfg, req.cacheDetection);
  const state: TaskState = {
    taskId,
    status: 'PENDING',
    emitter: new EventEmitter(),
    totalRounds,
  };
  state.emitter.setMaxListeners(50);
  tasks.set(taskId, state);

  // 密钥仅入内存
  const keyRef = keyHolder.put(req.apiKey, taskId);

  void (async () => {
    state.status = 'RUNNING';
    emit(state, { taskId, status: 'RUNNING', round: 0, totalRounds, message: '检测开始' });
    try {
      const result = await runDetection({
        taskId,
        baseUrl: req.baseUrl,
        apiKey: req.apiKey,
        targetModel: req.targetModel,
        cacheDetection: req.cacheDetection,
        rounds: cfg.probeRounds,
        roundTimeoutMs: cfg.roundTimeoutMs,
        onProgress: ({ round, dimension }) => {
          emit(state, {
            taskId,
            status: 'RUNNING',
            round,
            totalRounds,
            dimension,
            message: `正在检测：${DIMENSION_LABELS[dimension]}（第 ${round + 1}/${totalRounds} 轮）`,
          });
        },
      });
      result.keyWiped = true; // 密钥将在 finally 销毁
      state.result = result;
      state.status = 'COMPLETED';
      // 脱敏写入历史（REQ-6.1）
      saveHistory(db, result);
      emit(state, { taskId, status: 'COMPLETED', round: totalRounds, totalRounds, message: '检测完成' });
    } catch (err) {
      if (err instanceof AuthFailedError) {
        state.status = 'AUTH_FAILED';
        state.result = {
          taskId,
          status: 'AUTH_FAILED',
          targetModel: req.targetModel,
          endpointMasked: maskEndpoint(req.baseUrl),
          overallScore: 0,
          dimensions: [],
          warnings: [],
          rounds: [],
          keyWiped: true,
          errorMessage: '中转站返回鉴权失败（401/403），请检查 API Key 是否正确。',
          createdAt: new Date().toISOString(),
        };
        emit(state, { taskId, status: 'AUTH_FAILED', round: 0, totalRounds, message: '鉴权失败' });
      } else {
        logger.error({ err: (err as Error).message }, '检测任务执行出错');
        state.status = 'ERROR';
        state.result = {
          taskId,
          status: 'ERROR',
          targetModel: req.targetModel,
          endpointMasked: maskEndpoint(req.baseUrl),
          overallScore: 0,
          dimensions: [],
          warnings: [],
          rounds: [],
          keyWiped: true,
          errorMessage: '检测过程发生错误，请稍后重试。',
          createdAt: new Date().toISOString(),
        };
        emit(state, { taskId, status: 'ERROR', round: 0, totalRounds, message: '检测出错' });
      }
    } finally {
      // 用后即焚（REQ-2.2）
      keyHolder.wipe(keyRef.taskId);
      logger.info({ taskId }, 'API Key 已从内存销毁');
    }
  })();

  return taskId;
}

function emit(state: TaskState, event: ProgressEvent): void {
  state.emitter.emit('progress', event);
}

export function getTask(taskId: string): TaskState | undefined {
  return tasks.get(taskId);
}

export function subscribe(taskId: string, listener: (e: ProgressEvent) => void): () => void {
  const state = tasks.get(taskId);
  if (!state) return () => {};
  state.emitter.on('progress', listener);
  return () => state.emitter.off('progress', listener);
}
