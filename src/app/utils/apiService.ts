// @ts-nocheck
/**
 * Centralized API Service
 * Handles all API calls with support for both Supabase and Node.js backend
 */

import { publicAnonKey } from '@/utils-ext/supabase/info';
import { getServerUrl } from '@/utils-ext/config/apiConfig';

// Custom API URL (stored in localStorage, set via Admin Settings)
const CUSTOM_API_URL_KEY = 'indexpilotai_custom_backend_url';

// Get the appropriate base URL
export function getBaseUrl(): string {
  // Priority 1: Custom URL from localStorage (Admin Settings)
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_API_URL_KEY) : null;
  if (customUrl && customUrl.trim() !== '') {
    console.log('🔗 Using Custom Backend URL:', customUrl);
    return customUrl.trim();
  }

  // Priority 2: Use window.location.origin so the Express reverse proxy
  // forwards requests to Supabase server-to-server (avoids CORS/network blocks).
  const url = getServerUrl();
  console.log('🔗 Using Backend URL:', url);
  return url;
}

// Set custom backend URL (used by Admin Settings)
export function setCustomBackendUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim() !== '') {
      localStorage.setItem(CUSTOM_API_URL_KEY, url.trim());
      console.log('✅ Custom backend URL saved:', url.trim());
    } else {
      localStorage.removeItem(CUSTOM_API_URL_KEY);
      console.log('✅ Custom backend URL cleared');
    }
  }
}

// Get custom backend URL
export function getCustomBackendUrl(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(CUSTOM_API_URL_KEY);
  }
  return null;
}

// Get auth headers
export function getAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else {
    // Use Supabase anon key when no user token is available
    headers['Authorization'] = `Bearer ${publicAnonKey}`;
  }

  return headers;
}

/**
 * Generic API request handler
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getBaseUrl();
  
  // Clean endpoint (remove leading slash if present)
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  const url = `${baseUrl}${cleanEndpoint}`;

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
      let errorMessage = `API Error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log(`✅ API Response: ${options.method || 'GET'} ${url}`, data);
    return data;
  } catch (error) {
    console.error('❌ API Request failed:', error);
    throw error;
  }
}

/**
 * API Helper Methods
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

  patch: <T = any>(endpoint: string, data?: any, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'PATCH',
      headers: getAuthHeaders(token),
      body: JSON.stringify(data),
    }),

  delete: <T = any>(endpoint: string, token?: string) =>
    apiRequest<T>(endpoint, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    }),

  upload: <T = any>(endpoint: string, formData: FormData, token?: string) => {
    const baseUrl = getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;
    
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      headers['Authorization'] = `Bearer ${publicAnonKey}`;
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `Upload failed: ${response.status}`);
      }
      return response.json();
    });
  },
};

/**
 * Predefined API Endpoints
 */
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    CHECK_EMAIL: '/auth/check-email',
    SEND_OTP: '/auth/send-otp',
    VERIFY_OTP: '/auth/verify-otp',
    REGISTER: '/auth/register',
    SIGNUP: '/signup',
    LOGIN: '/auth/login',
    ADMIN_LOGIN: '/admin/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
  },

  // Admin
  ADMIN: {
    HOTKEYS: '/admin/hotkeys',
    USERS: '/admin/users',
    SETTINGS: '/admin/settings',
    STATS: '/admin/stats',
    JOURNALS: '/admin/journals',
    INSTRUMENTS: '/admin/instruments',
    TRANSACTIONS: '/admin/transactions',
    SECURITY: '/admin/security',
    SUPPORT: '/admin/support',
    PUSH_NOTIFICATIONS: '/admin/push-notifications',
    LEGAL: '/admin/legal',
    ACTIVITY_LOGS: '/admin/activity-logs',
  },

  // Trading
  TRADING: {
    ADVANCED_AI_SIGNAL: '/trading/advanced-ai-signal',
    AI_SIGNAL: '/ai-signal',
    PLACE_ORDER: '/trading/place-order',
    POSITIONS: '/trading/positions',
    ORDERS: '/trading/orders',
    TRADES: '/trading/trades',
    HISTORY: '/trading/history',
    // 24/7 Backend Engine
    ENGINE_START: '/engine/start',
    ENGINE_STOP: '/engine/stop',
    ENGINE_STATUS: '/engine/status',
    SIGNALS: '/engine/signals',
  },

  // Broker
  BROKER: {
    CONNECTIONS: '/broker/connections',
    CONNECT: '/broker/connect',
    DISCONNECT: '/broker/disconnect',
  },

  // User
  USER: {
    PROFILE: '/user/profile',
    STATISTICS: '/user/statistics',
    SETTINGS: '/user/settings',
  },

  // Strategies
  STRATEGY: {
    LIST: '/strategy',
    CREATE: '/strategy/create',
    UPDATE: (id: number) => `/strategy/${id}`,
    DELETE: (id: number) => `/strategy/${id}`,
  },

  // Notifications
  NOTIFICATION: {
    LIST: '/notification',
    READ: (id: number) => `/notification/${id}/read`,
    READ_ALL: '/notification/read-all',
    UNREAD_COUNT: '/notification/unread-count',
  },

  // Analytics
  ANALYTICS: {
    TRACK: '/analytics/track',
    USER: '/analytics/user',
  },

  // Landing Page
  LANDING: {
    GET_CONTENT: '/landing/content',
    UPDATE_CONTENT: '/landing/update',
    GET_TERMS: '/landing/terms',
    UPDATE_TERMS: '/landing/terms',
    GET_PRIVACY: '/landing/privacy',
    UPDATE_PRIVACY: '/landing/privacy',
    GET_PAGES: '/landing/pages',
    GET_PAGE: (slug: string) => `/landing/pages/${slug}`,
    SAVE_PAGE: '/landing/pages',
    DELETE_PAGE: (slug: string) => `/landing/pages/${slug}`,
    SOCIAL_LINKS: '/landing/social',
  },

  // Health
  HEALTH: '/health',
};

/**
 * Export everything
 */
export default {
  getBaseUrl,
  getAuthHeaders,
  apiRequest,
  api,
  API_ENDPOINTS,
  setCustomBackendUrl,
  getCustomBackendUrl,
};