// @ts-nocheck
/**
 * API Configuration
 * Configured exclusively for Google Cloud Run / Express backend (No Supabase)
 */

const isDevelopment = import.meta.env.MODE === 'development';

export const API_CONFIG = {
  BACKEND_URL: import.meta.env.VITE_API_URL || '',
  IS_DEVELOPMENT: isDevelopment,
  USE_SUPABASE: false,
};

export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}`;
  }
  return API_CONFIG.BACKEND_URL || 'http://localhost:3000';
}

export function getAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    const localToken = localStorage.getItem('auth_token') || 'cloud-run-local-token';
    headers['Authorization'] = `Bearer ${localToken}`;
  }

  return headers;
}

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    ME: '/api/auth/me',
  },
  USER: {
    PROFILE: '/api/user/profile',
  },
  TRADING: {
    TRADES: '/api/trading/trades',
  },
  NOTIFICATION: {
    LIST: '/notification',
    READ: (id: number) => `/notification/${id}/read`,
    READ_ALL: '/notification/read-all',
    UNREAD_COUNT: '/notification/unread-count',
  },
  
  // Admin
  ADMIN: {
    UPDATES: '/admin/updates',
    UPLOAD_UPDATE: '/admin/upload-update',
    ROLLBACK: (id: number) => `/admin/rollback/${id}`,
    CLEANUP: '/admin/cleanup-backups',
  },
  
  // Analytics
  ANALYTICS: {
    TRACK: '/analytics/track',
    USER: '/analytics/user',
  },
  
  // Health
  HEALTH: '/health',
};

/**
 * Make API Request
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;

  const defaultHeaders = getAuthHeaders();
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  console.log(`🔗 API Request: ${options.method || 'GET'} ${url}`);

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || errorData.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ API Request failed:', error);
    throw error;
  }
}

/**
 * API Helper Functions
 */
export const api = {
  get: <T = any>(endpoint: string, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'GET',
      headers: getAuthHeaders(token),
    }),

  post: <T = any>(endpoint: string, data?: any, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(data),
    }),

  put: <T = any>(endpoint: string, data?: any, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'PUT',
      headers: getAuthHeaders(token),
      body: JSON.stringify(data),
    }),

  delete: <T = any>(endpoint: string, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    }),

  upload: <T = any>(endpoint: string, formData: FormData, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: formData,
    }),
};

export default {
  API_CONFIG,
  getApiUrl,
  getAuthHeaders,
  API_ENDPOINTS,
  apiRequest,
  api,
};
