import axios from 'axios';
import type {
  ApiResponse,
  PaginatedResponse,
  Database,
  Table,
  Issue,
  Scan,
  DashboardStats,
  IssuesOverview,
  Conversation,
  Message,
  SQLGenerationRequest,
  SQLGeneration,
  User,
} from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 120 seconds timeout for LLM requests
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors and network errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    
    // Enhance network error messages
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      error.message = 'Request timed out. The server may be processing a large request. Please try again.';
    } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      error.message = 'Cannot connect to the server. Please ensure the backend is running on http://localhost:3001';
    } else if (!error.response) {
      error.message = 'Network error: Unable to reach the server. Please check if the backend is running.';
    }
    
    return Promise.reject(error);
  }
);

// Auth APIs
export const authApi = {
  login: async (email: string, password: string): Promise<{ user: User; token: string }> => {
    const response = await api.post<ApiResponse<{ user: User; token: string }>>('/auth/login', {
      email,
      password,
    });
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', response.data.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.data.user));
    }
    return response.data.data;
  },
  register: async (email: string, name: string, password: string, role?: string): Promise<User> => {
    const response = await api.post<ApiResponse<{ user: User }>>('/auth/register', {
      email,
      name,
      password,
      role,
    });
    return response.data.data.user;
  },
  logout: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
    }
  },
  getCurrentUser: (): User | null => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    }
    return null;
  },
  getToken: (): string | null => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  },
};

// Schema APIs (matching backend endpoints)
export const schemaApi = {
  ingest: async (data: {
    databaseName: string;
    databaseType: 'postgresql' | 'mysql' | 'sqlite' | 'mssql';
    tables: Array<{
      name: string;
      schemaName?: string;
      rowCount?: number;
      sizeBytes?: number;
      sizeFormatted?: string;
      columns: Array<{
        name: string;
        type: string;
        nullable?: boolean;
        defaultValue?: string | null;
        isPrimaryKey?: boolean;
        isForeignKey?: boolean;
      }>;
      indexes: Array<{
        name: string;
        columns: string[];
        unique?: boolean;
        type?: string;
      }>;
      foreignKeys: Array<{
        name: string;
        columnName: string;
        referencedTable: string;
        referencedColumn: string;
      }>;
    }>;
  }): Promise<{ snapshotId: string; version: number; databaseId: string; createdAt: string }> => {
    const response = await api.post<ApiResponse<{ snapshotId: string; version: number; databaseId: string; createdAt: string }>>(
      '/v1/schema/ingest',
      data
    );
    return response.data.data;
  },
  getLatest: async (dbName: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>(`/v1/schema/${dbName}`);
    return response.data.data;
  },
  getSnapshot: async (snapshotId: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>(`/v1/schema/snapshot/${snapshotId}`);
    return response.data.data;
  },
  getAll: async (dbName?: string, page = 1, pageSize = 20): Promise<PaginatedResponse<any>> => {
    const params: any = { page, pageSize };
    if (dbName) params.dbName = dbName;
    const response = await api.get<ApiResponse<{ data: any[]; pagination: any }>>('/v1/schema', { params });
    const pag = (response.data as any).pagination || {};
    return {
      data: (response.data as any).data || [],
      total: pag.total ?? 0,
      page: pag.page ?? 1,
      pageSize: pag.pageSize ?? 20,
      totalPages: pag.totalPages ?? 0,
    };
  },
  compare: async (snapshotId1: string, snapshotId2: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/v1/schema/compare', {
      snapshotId1,
      snapshotId2,
    });
    return response.data.data;
  },
  deleteSnapshot: async (snapshotId: string): Promise<void> => {
    await api.delete<ApiResponse<void>>(`/v1/schema/snapshot/${snapshotId}`);
  },
  deleteAllSnapshots: async (dbName?: string): Promise<{ deletedCount: number }> => {
    const params = dbName ? { dbName } : {};
    const response = await api.delete<ApiResponse<{ deletedCount: number }>>('/v1/schema/all', { params });
    return response.data.data;
  },
};

// Impact & Issues APIs
export const impactApi = {
  getScore: async (snapshotId: string): Promise<{
    healthScore: number;
    totalIssues: number;
    severityCounts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
    breakdown: { critical: number; high: number; medium: number; low: number };
  }> => {
    const response = await api.get<ApiResponse<any>>(`/v1/impact/score/${snapshotId}`);
    return response.data.data;
  },
  getRankedIssues: async (snapshotId: string, limit = 10): Promise<Issue[]> => {
    const response = await api.get<ApiResponse<Issue[]>>(`/v1/impact/rank/${snapshotId}`, {
      params: { limit },
    });
    return response.data.data;
  },
};

// Recommendations APIs
export const recommendationApi = {
  generate: async (issueId: string): Promise<any[]> => {
    const response = await api.post<ApiResponse<any[]>>(`/v1/recommendations/generate/${issueId}`);
    return response.data.data;
  },
  getForIssue: async (issueId: string): Promise<any[]> => {
    const response = await api.get<ApiResponse<any[]>>(`/v1/recommendations/issue/${issueId}`);
    return response.data.data;
  },
  getForSnapshot: async (snapshotId: string): Promise<any[]> => {
    const response = await api.get<ApiResponse<any[]>>(`/v1/recommendations/snapshot/${snapshotId}`);
    return response.data.data;
  },
};

// AI Assistant APIs
export const assistantApi = {
  sendMessage: async (message: string, databaseName?: string, conversationId?: string): Promise<Message> => {
    const response = await api.post<ApiResponse<Message>>('/v1/assistant/message', {
      message,
      databaseName,
      conversationId,
    });
    return response.data.data;
  },
};

// Conversation APIs
export const conversationApi = {
  list: async (options?: {
    archived?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ conversations: Conversation[]; total: number }> => {
    const response = await api.get<ApiResponse<{ conversations: Conversation[]; total: number }>>(
      '/v1/conversations',
      { params: options }
    );
    return response.data.data;
  },
  get: async (id: string): Promise<Conversation> => {
    const response = await api.get<ApiResponse<Conversation>>(`/v1/conversations/${id}`);
    return response.data.data;
  },
  create: async (data?: { title?: string; databaseName?: string }): Promise<Conversation> => {
    const response = await api.post<ApiResponse<Conversation>>('/v1/conversations', data || {});
    return response.data.data;
  },
  updateTitle: async (id: string, title: string): Promise<void> => {
    await api.patch<ApiResponse<void>>(`/v1/conversations/${id}/title`, { title });
  },
  archive: async (id: string, archived: boolean): Promise<void> => {
    await api.patch<ApiResponse<void>>(`/v1/conversations/${id}/archive`, { archived });
  },
  delete: async (id: string): Promise<void> => {
    await api.delete<ApiResponse<void>>(`/v1/conversations/${id}`);
  },
  deleteMultiple: async (conversationIds: string[]): Promise<void> => {
    await api.delete<ApiResponse<void>>('/v1/conversations', { data: { conversationIds } });
  },
};

// Schema Advisor APIs
export const schemaAdvisorApi = {
  getBySnapshot: async (snapshotId: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>(`/v1/schema-advisor/snapshot/${snapshotId}`);
    return response.data.data;
  },
  getByDatabase: async (dbName: string): Promise<any> => {
    const response = await api.get<ApiResponse<any>>(`/v1/schema-advisor/db/${dbName}`);
    return response.data.data;
  },
};

// Health check
export const healthApi = {
  check: async (): Promise<{ status: string; database: string; timestamp: string }> => {
    const response = await api.get('/health');
    return response.data;
  },
};

// Analytics APIs
export interface DatabaseConnection {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
}

export interface AnalyticsSchema {
  tables: Array<{
    schema: string;
    name: string;
    columnCount: number;
    columns: Array<{
      name: string;
      type: string;
      nullable: boolean;
      isDate: boolean;
      isNumeric: boolean;
      isText: boolean;
    }>;
  }>;
}

export interface TimeSeriesData {
  date: string;
  count: number;
  total?: number;
  average?: number;
}

export interface DistributionData {
  category: string;
  count: number;
}

export interface TopNData {
  entity: string;
  count: number;
  total?: number;
  average?: number;
}

export const analyticsApi = {
  getSchema: async (connection: DatabaseConnection): Promise<AnalyticsSchema> => {
    const response = await api.post<ApiResponse<AnalyticsSchema>>('/v1/analytics/schema', connection);
    return response.data.data;
  },
  getMetrics: async (connection: DatabaseConnection & { table: string; metricColumn?: string }): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/v1/analytics/metrics', connection);
    return response.data.data;
  },
  getTimeSeries: async (
    connection: DatabaseConnection & {
      table: string;
      dateColumn: string;
      metricColumn?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<TimeSeriesData[]> => {
    const response = await api.post<ApiResponse<TimeSeriesData[]>>('/v1/analytics/time-series', connection);
    return response.data.data;
  },
  getDistribution: async (
    connection: DatabaseConnection & { table: string; categoryColumn: string; limit?: number }
  ): Promise<DistributionData[]> => {
    const response = await api.post<ApiResponse<DistributionData[]>>('/v1/analytics/distribution', connection);
    return response.data.data;
  },
  getTopN: async (
    connection: DatabaseConnection & { table: string; column: string; metricColumn?: string; limit?: number }
  ): Promise<TopNData[]> => {
    const response = await api.post<ApiResponse<TopNData[]>>('/v1/analytics/top-n', connection);
    return response.data.data;
  },
};

export default api;

