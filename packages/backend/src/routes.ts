import type { FastifyInstance } from 'fastify';
import {
  AdminLoginRequestSchema,
  ChannelInputSchema,
  CreateDetectionRequestSchema,
  LeaderboardQuerySchema,
} from '@tinyowl/shared';
import type { AppConfig } from './config.js';
import type { Db } from './db/client.js';
import {
  createDetectionTask,
  getTask,
  subscribe,
} from './services/detectionService.js';
import { getHistoryDetail, listHistory } from './services/historyService.js';
import {
  createChannel,
  deleteChannel,
  getLeaderboard,
  listModelsWithChannels,
  updateChannel,
} from './services/channelService.js';
import { getOfficialStatus } from './services/statusService.js';
import { checkCredentials, issueToken, verifyToken } from './services/authService.js';

function err(code: string, message: string) {
  return { error: { code, message } };
}

export async function registerRoutes(app: FastifyInstance, db: Db, cfg: AppConfig): Promise<void> {
  // 鉴权预处理（运营管理接口，REQ-11.4/11.5）
  const requireAuth = async (req: any, reply: any): Promise<boolean> => {
    const auth = req.headers['authorization'] as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token || !verifyToken(cfg, token)) {
      reply.code(401).send(err('UNAUTHORIZED', '未授权，请先登录运营账号'));
      return false;
    }
    return true;
  };

  app.get('/api/health', async () => ({ ok: true, name: 'tinyowl', cn: '猫头鹰评测' }));

  // 创建检测任务
  app.post('/api/detections', async (req, reply) => {
    const parsed = CreateDetectionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? '请求参数无效';
      return reply.code(400).send(err('INVALID_REQUEST', msg));
    }
    const taskId = createDetectionTask(db, cfg, parsed.data, app.log);
    return reply.code(201).send({ taskId });
  });

  // 查询检测结果
  app.get('/api/detections/:taskId', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = getTask(taskId);
    if (!task) return reply.code(404).send(err('NOT_FOUND', '检测任务不存在或已过期'));
    if (!task.result) {
      return reply.send({ taskId, status: task.status });
    }
    return reply.send(task.result);
  });

  // SSE 进度流
  app.get('/api/detections/:taskId/stream', async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = getTask(taskId);
    if (!task) return reply.code(404).send(err('NOT_FOUND', '检测任务不存在'));

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // 已结束的任务直接补发终态
    if (task.status === 'COMPLETED' || task.status === 'AUTH_FAILED' || task.status === 'ERROR') {
      send({ taskId, status: task.status, round: task.totalRounds, totalRounds: task.totalRounds, message: '已结束' });
      reply.raw.end();
      return reply;
    }

    const unsubscribe = subscribe(taskId, (e) => {
      send(e);
      if (e.status === 'COMPLETED' || e.status === 'AUTH_FAILED' || e.status === 'ERROR') {
        unsubscribe();
        reply.raw.end();
      }
    });

    req.raw.on('close', () => unsubscribe());
    return reply;
  });

  // 历史列表
  app.get('/api/history', async (req) => {
    const q = req.query as { limit?: string; offset?: string };
    return listHistory(db, Number(q.limit ?? 50), Number(q.offset ?? 0));
  });

  app.get('/api/history/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = getHistoryDetail(db, id);
    if (!detail) return reply.code(404).send(err('NOT_FOUND', '历史记录不存在'));
    return detail;
  });

  // 榜单
  app.get('/api/leaderboard', async (req, reply) => {
    const parsed = LeaderboardQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send(err('INVALID_REQUEST', '查询参数无效'));
    return getLeaderboard(db, parsed.data);
  });

  app.get('/api/leaderboard/models', async () => listModelsWithChannels(db));

  // 官方状态
  app.get('/api/official-status', async () => getOfficialStatus(db));

  // 运营登录
  app.post('/api/admin/login', async (req, reply) => {
    const parsed = AdminLoginRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(err('INVALID_REQUEST', '用户名或密码不能为空'));
    if (!checkCredentials(cfg, parsed.data.username, parsed.data.password)) {
      return reply.code(401).send(err('INVALID_CREDENTIALS', '用户名或密码错误'));
    }
    return { token: issueToken(cfg) };
  });

  // 渠道 CRUD（需鉴权）
  app.post('/api/admin/channels', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const parsed = ChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(err('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '字段校验失败'));
    }
    return reply.code(201).send(createChannel(db, parsed.data));
  });

  app.put('/api/admin/channels/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const parsed = ChannelInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(err('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? '字段校验失败'));
    }
    const updated = updateChannel(db, id, parsed.data);
    if (!updated) return reply.code(404).send(err('NOT_FOUND', '渠道不存在'));
    return updated;
  });

  app.delete('/api/admin/channels/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return;
    const { id } = req.params as { id: string };
    const ok = deleteChannel(db, id);
    if (!ok) return reply.code(404).send(err('NOT_FOUND', '渠道不存在'));
    return { ok: true };
  });
}
