import { z } from 'zod';

/** 检测维度 */
export const DimensionSchema = z.enum([
  'protocol_consistency', // 返回协议一致性
  'response_structure', // 响应结构
  'knowledge_qa', // 知识问答结果
  'identity_consistency', // 身份一致性
  'reasoning_trace', // 思维链痕迹
  'signature_fingerprint', // 签名指纹
  'provenance_fingerprint', // 协议来源指纹（响应元数据厂商一致性）
]);
export type Dimension = z.infer<typeof DimensionSchema>;

/** 维度中文名映射 */
export const DIMENSION_LABELS: Record<Dimension, string> = {
  protocol_consistency: '返回协议一致性',
  response_structure: '响应结构',
  knowledge_qa: '知识问答结果',
  identity_consistency: '身份一致性',
  reasoning_trace: '思维链痕迹',
  signature_fingerprint: '签名指纹',
  provenance_fingerprint: '协议来源指纹',
};

export const VerdictSchema = z.enum(['pass', 'suspect', 'fail', 'inconclusive']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const VERDICT_LABELS: Record<Verdict, string> = {
  pass: '通过',
  suspect: '可疑',
  fail: '未通过',
  inconclusive: '无法判定',
};

export const RoundStatusSchema = z.enum(['ok', 'timeout']);
export type RoundStatus = z.infer<typeof RoundStatusSchema>;

export const TaskStatusSchema = z.enum([
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'AUTH_FAILED',
  'ERROR',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  PENDING: '排队中',
  RUNNING: '检测中',
  COMPLETED: '已完成',
  AUTH_FAILED: '鉴权失败',
  ERROR: '检测出错',
};

/** 认证状态：企业/个人实名/未认证 */
export const CertStatusSchema = z.enum(['enterprise', 'personal', 'none']);
export type CertStatus = z.infer<typeof CertStatusSchema>;

export const CERT_STATUS_LABELS: Record<CertStatus, string> = {
  enterprise: '企业认证',
  personal: '个人实名认证',
  none: '未认证',
};

/** 官方 API 三态 */
export const OfficialStatusValueSchema = z.enum(['normal', 'abnormal', 'unknown']);
export type OfficialStatusValue = z.infer<typeof OfficialStatusValueSchema>;

export const OFFICIAL_STATUS_LABELS: Record<OfficialStatusValue, string> = {
  normal: '正常',
  abnormal: '异常',
  unknown: '未知',
};

export const WarningSchema = z.enum(['identity_swap', 'downgrade']);
export type Warning = z.infer<typeof WarningSchema>;

export const WARNING_LABELS: Record<Warning, string> = {
  identity_swap: '疑似模型身份替换',
  downgrade: '疑似降智',
};
