/**
 * 密钥掩码：仅保留首尾各 4 字符，中间以 **** 替换（REQ-2.3）。
 * 纯函数，便于属性测试。
 */
export function maskKey(key: string): string {
  if (key.length <= 8) {
    // 太短则全部以 * 掩码，避免泄露
    return '*'.repeat(key.length);
  }
  const head = key.slice(0, 4);
  const tail = key.slice(-4);
  return `${head}****${tail}`;
}

/**
 * 中转站接口地址脱敏：保留协议与主机名，路径与查询参数省略。
 */
export function maskEndpoint(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.hostname}`;
  } catch {
    return '***';
  }
}

/**
 * 通用日志脱敏：将文本中任何形似密钥的长串替换为首尾掩码。
 * 用于 Masking 中间件，确保密钥不会以明文进入日志。
 */
const KEY_LIKE = /\b(sk-[A-Za-z0-9_\-]{8,}|[A-Za-z0-9_\-]{24,})\b/g;
export function maskSensitive(text: string): string {
  return text.replace(KEY_LIKE, (m) => maskKey(m));
}
