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

/** id 前缀：取首个非字母数字分隔符前的部分（含分隔符），如 'msg_' / 'chatcmpl-' / 'gen-' */
function idPrefixOf(id: unknown): string | undefined {
  if (typeof id !== 'string' || id.length === 0) return undefined;
  const m = id.match(/^([A-Za-z]+[-_])/);
  return m ? m[1] : undefined;
}

/** 从已解析的响应体（非流式）或单个流式分块提取协议来源指纹 */
function extractProvenance(obj: any): import('./types.js').ProvenanceSignals | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const usage = obj.usage;
  const choice = obj.choices?.[0];
  return {
    idPrefix: idPrefixOf(obj.id),
    modelField: typeof obj.model === 'string' ? obj.model : undefined,
    usageKeys: usage && typeof usage === 'object' ? Object.keys(usage) : undefined,
    finishReason: choice?.finish_reason ?? choice?.stop_reason ?? obj.stop_reason ?? undefined,
    hasSystemFingerprint: obj.system_fingerprint != null,
    systemFingerprintValue: typeof obj.system_fingerprint === 'string' ? obj.system_fingerprint : undefined,
    topLevelKeys: Object.keys(obj),
  };
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
      // 从 SSE 分块中拼接 delta 内容，并合并提取来源指纹（id/usage 常出现在不同分块）
      let content = '';
      const prov: import('./types.js').ProvenanceSignals = {};
      const usageKeySet = new Set<string>();
      for (const line of streamRaw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          content += j?.choices?.[0]?.delta?.content ?? '';
          const p = extractProvenance(j);
          if (p) {
            if (p.idPrefix && !prov.idPrefix) prov.idPrefix = p.idPrefix;
            if (p.modelField && !prov.modelField) prov.modelField = p.modelField;
            if (p.finishReason) prov.finishReason = p.finishReason;
            if (p.hasSystemFingerprint) prov.hasSystemFingerprint = true;
            if (p.systemFingerprintValue && !prov.systemFingerprintValue) prov.systemFingerprintValue = p.systemFingerprintValue;
            for (const k of p.usageKeys ?? []) usageKeySet.add(k);
            if (p.topLevelKeys && !prov.topLevelKeys) prov.topLevelKeys = p.topLevelKeys;
          }
        } catch {
          /* 忽略非 JSON 分块 */
        }
      }
      if (usageKeySet.size > 0) prov.usageKeys = [...usageKeySet];
      return {
        purpose: opts.purpose,
        ok: status >= 200 && status < 300,
        timedOut: false,
        httpStatus: status,
        streamRaw,
        content,
        latencyMs: Date.now() - started,
        meta: opts.meta,
        provenance: prov,
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
      provenance: extractProvenance(body),
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
