// @ts-nocheck
/**
 * Centralized API Service
 * Handles all API calls with Google Cloud Run / Node.js backend
 */

const CUSTOM_API_URL_KEY = 'indexpilotai_custom_backend_url';

export function getBaseUrl(): string {
  const customUrl = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_API_URL_KEY) : null;
  if (customUrl && customUrl.trim() !== '') {
    return customUrl.trim();
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export function setCustomBackendUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (url && url.trim() !== '') {
      localStorage.setItem(CUSTOM_API_URL_KEY, url.trim());
    } else {
      localStorage.removeItem(CUSTOM_API_URL_KEY);
    }
  }
}

export function getCustomBackendUrl(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(CUSTOM_API_URL_KEY);
  }
  return null;
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

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const customUrl = getCustomBackendUrl();
  const url = customUrl ? `${customUrl}${cleanEndpoint}` : `${getBaseUrl()}${cleanEndpoint}`;

  const defaultHeaders = getAuthHeaders();
  
  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

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

    return await response.json();
  } catch (error: any) {
    console.error(`❌ API Error (${endpoint}):`, error);
    throw error;
  }
}

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
};
