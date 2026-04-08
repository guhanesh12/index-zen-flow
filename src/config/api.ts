/**
 * API Configuration
 * Handles switching between Supabase (dev) and Centralized Backend (production)
 */

// Environment detection
const isDevelopment = import.meta.env.MODE === 'development';
const useSupabase = import.meta.env.VITE_USE_SUPABASE === 'true' || isDevelopment;

// API URLs
export const API_CONFIG = {
  // Centralized backend API (Production)
  BACKEND_URL: import.meta.env.VITE_API_URL || 'https://api.indexpilotai.com',
  
  // Supabase (Development/Testing)
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  
  // Environment flags
  IS_DEVELOPMENT: isDevelopment,
  USE_SUPABASE: useSupabase,
};

/**
 * Get the base API URL based on environment
 */
export function getApiUrl(): string {
  if (API_CONFIG.USE_SUPABASE && API_CONFIG.SUPABASE_URL) {
    // Development mode with Supabase
    return `${API_CONFIG.SUPABASE_URL}/functions/v1/make-server-c4d79cb7`;
  } else {
    // Production mode with centralized backend
    return `${API_CONFIG.BACKEND_URL}/api`;
  }
}

/**
 * Get authorization header based on environment
 */
export function getAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (API_CONFIG.USE_SUPABASE && API_CONFIG.SUPABASE_ANON_KEY) {
    // Use Supabase anon key in development
    headers['Authorization'] = `Bearer ${API_CONFIG.SUPABASE_ANON_KEY}`;
  }

  return headers;
}

/**
 * API Endpoints
 */
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    CHECK_EMAIL: '/auth/check-email',
    SEND_OTP: '/auth/send-otp',
    VERIFY_OTP: '/auth/verify-otp',
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
  },
  
  // User
  USER: {
    PROFILE: '/user/profile',
    STATISTICS: '/user/statistics',
  },
  
  // Trading
  TRADING: {
    TRADES: '/trading/trades',
    POSITIONS: '/trading/positions',
  },
  
  // Broker
  BROKER: {
    CONNECTIONS: '/broker/connections',
  },
  
  // Strategies
  STRATEGY: {
    LIST: '/strategy',
  },
  
  // Notifications
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
