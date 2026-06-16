import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { getDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seed } from './db/seed.js';
import { registerRoutes } from './routes.js';
import { startStatusScheduler } from './services/statusService.js';
import { maskSensitive } from './lib/mask.js';

async function main(): Promise<void> {
  const cfg = loadConfig();

  // 启动时确保存储可用（REQ-12.5）
  let db;
  try {
    runMigrations(cfg.dbPath);
    db = getDb(cfg.dbPath);
    seed(cfg.dbPath);
  } catch (err) {
    console.error('❌ 启动失败：', (err as Error).message);
    process.exit(1);
  }

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // 日志脱敏：任何形似密钥的串以首尾掩码替换（REQ-2.3）
      serializers: {
        req(req) {
          return { method: req.method, url: maskSensitive(req.url) };
        },
      },
    },
    disableRequestLogging: false,
  });

  await app.register(cors, { origin: true });

  // 全局错误处理，统一中文错误结构
  app.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
    app.log.error({ err: maskSensitive(error.message) }, '请求处理出错');
    if (!reply.sent) {
      reply.code(error.statusCode ?? 500).send({
        error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
      });
    }
  });

  await registerRoutes(app, db, cfg);

  // 周期采集官方 API 状态（REQ-9.2）
  startStatusScheduler(db);

  try {
    await app.listen({ port: cfg.port, host: cfg.host });
    app.log.info(`🦉 tinyowl 后端已启动：http://localhost:${cfg.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
