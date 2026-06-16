import { z } from 'zod';
import {
  CertStatusSchema,
  DimensionSchema,
  OfficialStatusValueSchema,
  RoundStatusSchema,
  TaskStatusSchema,
  VerdictSchema,
  WarningSchema,
} from './enums.js';

/** 单维度结果 */
export const DimensionResultSchema = z.object({
  dimension: DimensionSchema,
  verdict: VerdictSchema,
  score: z.number().min(0).max(100),
  explanation: z.string(),
});
export type DimensionResult = z.infer<typeof DimensionResultSchema>;

export const CacheDetectionResultSchema = z.object({
  enabled: z.boolean(),
  cacheHitSuspected: z.boolean(),
  explanation: z.string(),
});
export type CacheDetectionResult = z.infer<typeof CacheDetectionResultSchema>;

export const RoundInfoSchema = z.object({
  index: z.number().int().nonnegative(),
  status: RoundStatusSchema,
});
export type RoundInfo = z.infer<typeof RoundInfoSchema>;

/** 检测结果（脱敏后对外返回） */
export const DetectionResultSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  targetModel: z.string(),
  endpointMasked: z.string(),
  overallScore: z.number().min(0).max(100),
  dimensions: z.array(DimensionResultSchema),
  cacheDetection: CacheDetectionResultSchema.optional(),
  warnings: z.array(WarningSchema),
  rounds: z.array(RoundInfoSchema),
  keyWiped: z.boolean(),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
});
export type DetectionResult = z.infer<typeof DetectionResultSchema>;

/** 创建检测任务请求体 */
export const CreateDetectionRequestSchema = z.object({
  baseUrl: z
    .string()
    .min(1, '中转站接口地址不能为空')
    .url('接口地址格式无效')
    .refine((u) => /^https?:\/\//i.test(u), '接口地址格式无效'),
  apiKey: z.string().min(1, 'API Key 不能为空'),
  targetModel: z.string().min(1, '请选择目标模型'),
  cacheDetection: z.boolean().default(false),
});
export type CreateDetectionRequest = z.infer<typeof CreateDetectionRequestSchema>;

export const CreateDetectionResponseSchema = z.object({
  taskId: z.string(),
});
export type CreateDetectionResponse = z.infer<typeof CreateDetectionResponseSchema>;

/** SSE 进度事件 */
export const ProgressEventSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  round: z.number().int().nonnegative(),
  totalRounds: z.number().int().positive(),
  dimension: DimensionSchema.optional(),
  message: z.string().optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/** 渠道（榜单条目） */
export const ChannelSchema = z.object({
  id: z.string(),
  targetModel: z.string(),
  name: z.string(),
  certStatus: CertStatusSchema,
  price: z.number().nonnegative(),
  priceDeltaPct: z.number(), // 近 7 天价格变化百分比（派生）
  rateLimit: z.number().nonnegative(), // 限速 RPM
  availabilityPct: z.number().min(0).max(100),
  downgradeStatus: z.string(), // 降智情况
  latencySeconds: z.number().nonnegative(),
  featuredWeight: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Channel = z.infer<typeof ChannelSchema>;

/** 创建/更新渠道请求 */
export const ChannelInputSchema = z.object({
  targetModel: z.string({ required_error: '目标模型不能为空' }).min(1, '目标模型不能为空'),
  name: z.string({ required_error: '渠道名不能为空' }).min(1, '渠道名不能为空'),
  certStatus: CertStatusSchema,
  price: z.number({ required_error: '价格不能为空', invalid_type_error: '价格须为数字' }).nonnegative('价格须为非负数'),
  rateLimit: z.number().nonnegative().default(0),
  availabilityPct: z.number().min(0).max(100).default(100),
  downgradeStatus: z.string().default('未发现'),
  latencySeconds: z.number().nonnegative().default(0),
  featuredWeight: z.number().default(0),
});
export type ChannelInput = z.infer<typeof ChannelInputSchema>;

export const LeaderboardSortSchema = z.enum(['featured', 'price']);
export type LeaderboardSort = z.infer<typeof LeaderboardSortSchema>;

export const LeaderboardQuerySchema = z.object({
  model: z.string().optional(),
  cert: CertStatusSchema.optional(),
  sort: LeaderboardSortSchema.default('featured'),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

/** 检测历史列表项 */
export const HistoryItemSchema = z.object({
  id: z.string(),
  endpointMasked: z.string(),
  targetModel: z.string(),
  overallScore: z.number(),
  status: TaskStatusSchema,
  createdAt: z.string(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const HistoryDetailSchema = HistoryItemSchema.extend({
  dimensions: z.array(DimensionResultSchema),
  cacheDetection: CacheDetectionResultSchema.optional(),
  warnings: z.array(WarningSchema),
});
export type HistoryDetail = z.infer<typeof HistoryDetailSchema>;

/** 官方 API 状态 */
export const OfficialStatusSchema = z.object({
  provider: z.enum(['openai', 'claude', 'gemini']),
  status: OfficialStatusValueSchema,
  lastUpdated: z.string(),
  detail: z.string(),
});
export type OfficialStatus = z.infer<typeof OfficialStatusSchema>;

export const AdminLoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type AdminLoginRequest = z.infer<typeof AdminLoginRequestSchema>;

export const AdminLoginResponseSchema = z.object({
  token: z.string(),
});
export type AdminLoginResponse = z.infer<typeof AdminLoginResponseSchema>;

/** 统一错误结构 */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
