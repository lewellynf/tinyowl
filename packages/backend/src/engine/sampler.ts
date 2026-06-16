import { request } from 'undici';
import type { RelaySample } from './types.js';

interface ChatCallOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  stream?: boolean;
  timeoutMs: number;
  purpose: RelaySample['purpose'];
  meta?: Record<string, unknown>;
}

/** 鉴权失败信号：调用方据此立即中止任务（REQ-3.9） */
export class AuthFailedError extends Error {
  constructor(public httpStatus: number) {
    super(`鉴权失败（HTTP ${httpStatus}）`);
    this.name = 'AuthFailedError';
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  // 兼容用户传入已含 /v1 的地址
  if (/\/v1$/.test(trimmed)) return `${trimmed}${path}`;
  return `${trimmed}/v1${path}`;
}

function extractContent(body: any): string {
  const choice = body?.choices?.[0];
  return choice?.message?.content ?? choice?.text ?? '';
}

function extractReasoning(body: any): string | undefined {
  const choice = body?.choices?.[0];
  return choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? body?.reasoning ?? undefined;
}

/**
 * 调用中转站 /v1/chat/completions 采集一次样本。
 * 单轮 60s 超时 → 标记 timeout 并返回（REQ-3.10）。
 * 401/403 → 抛 AuthFailedError（REQ-3.9）。
 */
export async function callRelay(opts: ChatCallOptions): Promise<RelaySample> {
  const url = joinUrl(opts.baseUrl, '/chat/completions');
  const started = Date.now();
  try {
    const res = await request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: opts.stream ?? false,
        temperature: 0.7,
      }),
      headersTimeout: opts.timeoutMs,
      bodyTimeout: opts.timeoutMs,
    });

    const status = res.statusCode;
    if (status === 401 || status === 403) {
      // 读取并丢弃响应体
      await res.body.text().catch(() => undefined);
      throw new AuthFailedError(status);
    }

    if (opts.stream) {
      const streamRaw = await res.body.text();
      // 从 SSE 分块中拼接 delta 内容
      let content = '';
      for (const line of streamRaw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          content += j?.choices?.[0]?.delta?.content ?? '';
        } catch {
          /* 忽略非 JSON 分块 */
        }
      }
      return {
        purpose: opts.purpose,
        ok: status >= 200 && status < 300,
        timedOut: false,
        httpStatus: status,
        streamRaw,
        content,
        latencyMs: Date.now() - started,
        meta: opts.meta,
      };
    }

    const text = await res.body.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    return {
      purpose: opts.purpose,
      ok: status >= 200 && status < 300 && body !== undefined,
      timedOut: false,
      httpStatus: status,
      body,
      content: extractContent(body),
      reasoning: extractReasoning(body),
      latencyMs: Date.now() - started,
      meta: opts.meta,
    };
  } catch (err) {
    if (err instanceof AuthFailedError) throw err;
    const e = err as { code?: string; name?: string };
    const timedOut =
      e.code === 'UND_ERR_HEADERS_TIMEOUT' ||
      e.code === 'UND_ERR_BODY_TIMEOUT' ||
      e.name === 'HeadersTimeoutError' ||
      e.name === 'BodyTimeoutError';
    return {
      purpose: opts.purpose,
      ok: false,
      timedOut,
      latencyMs: Date.now() - started,
      meta: opts.meta,
    };
  }
}
