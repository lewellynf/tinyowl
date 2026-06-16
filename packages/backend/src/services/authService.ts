import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config.js';

/** 生成简单的 HMAC 签名 Token（无外部依赖的轻量鉴权） */
export function issueToken(cfg: AppConfig): string {
  const payload = `${cfg.adminUsername}:${Date.now()}`;
  const sig = createHmac('sha256', cfg.adminTokenSecret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}

export function verifyToken(cfg: AppConfig, token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    if (lastColon < 0) return false;
    const payload = decoded.slice(0, lastColon);
    const sig = decoded.slice(lastColon + 1);
    const expected = createHmac('sha256', cfg.adminTokenSecret).update(payload).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function checkCredentials(cfg: AppConfig, username: string, password: string): boolean {
  return username === cfg.adminUsername && password === cfg.adminPassword;
}
