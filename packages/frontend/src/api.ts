import axios from 'axios';
import type {
  Channel,
  CreateDetectionRequest,
  CreateDetectionResponse,
  DetectionResult,
  HistoryDetail,
  HistoryItem,
  LeaderboardQuery,
  OfficialStatus,
} from '@tinyowl/shared';

const api = axios.create({ baseURL: '/api', timeout: 30_000 });

// 注入运营 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tinyowl_admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

function extractError(e: unknown): string {
  if (axios.isAxiosError(e)) {
    return e.response?.data?.error?.message ?? e.message;
  }
  return (e as Error).message;
}

export async function createDetection(req: CreateDetectionRequest): Promise<CreateDetectionResponse> {
  const { data } = await api.post<CreateDetectionResponse>('/detections', req);
  return data;
}

export async function getDetection(taskId: string): Promise<DetectionResult> {
  const { data } = await api.get<DetectionResult>(`/detections/${taskId}`);
  return data;
}

export async function getLeaderboard(query: LeaderboardQuery): Promise<Channel[]> {
  const { data } = await api.get<Channel[]>('/leaderboard', { params: query });
  return data;
}

export async function getHistory(): Promise<HistoryItem[]> {
  const { data } = await api.get<HistoryItem[]>('/history');
  return data;
}

export async function getHistoryDetail(id: string): Promise<HistoryDetail> {
  const { data } = await api.get<HistoryDetail>(`/history/${id}`);
  return data;
}

export async function getOfficialStatus(): Promise<OfficialStatus[]> {
  const { data } = await api.get<OfficialStatus[]>('/official-status');
  return data;
}

export async function adminLogin(username: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/admin/login', { username, password });
  return data.token;
}

export async function createChannel(input: unknown): Promise<Channel> {
  const { data } = await api.post<Channel>('/admin/channels', input);
  return data;
}

export async function updateChannel(id: string, input: unknown): Promise<Channel> {
  const { data } = await api.put<Channel>(`/admin/channels/${id}`, input);
  return data;
}

export async function deleteChannel(id: string): Promise<void> {
  await api.delete(`/admin/channels/${id}`);
}

export { extractError };
