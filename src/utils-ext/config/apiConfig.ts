/**
 * API Configuration
 * Centralized configuration for all API endpoints
 * 
 * IMPORTANT: This allows easy switching between Supabase and custom domain
 * for mobile network compatibility where Supabase URLs may be blocked.
 */

import { projectId, publicAnonKey } from '../supabase/info';

// ==============================================
// API BASE URL CONFIGURATION
// ==============================================

/**
 * Toggle between Supabase and Custom Domain
 * 
 * OPTIONS:
 * 1. 'supabase' - Use default Supabase edge functions URL
 * 2. 'custom' - Use custom domain (for mobile networks where Supabase is blocked)
 */
const API_MODE: 'supabase' | 'custom' = 'supabase';

/**
 * Custom Domain Configuration
 * This domain works on mobile networks where Supabase URLs are blocked
 */
const CUSTOM_API_DOMAIN = 'https://api.indexpilotai.com';

/**
 * Supabase Domain Configuration
 * Default Supabase edge functions URL
 */
const SUPABASE_API_DOMAIN = `https://${projectId}.supabase.co`;

// ==============================================
// ACTIVE API URL (AUTOMATICALLY SELECTED)
// ==============================================

/**
 * Get the active API base URL based on current mode
 */
export const getApiBaseUrl = (): string => {
  if ((API_MODE as string) === 'custom') {
    console.log('🌐 [API CONFIG] Using CUSTOM domain:', CUSTOM_API_DOMAIN);
    return CUSTOM_API_DOMAIN;
  } else {
    console.log('🌐 [API CONFIG] Using SUPABASE domain:', SUPABASE_API_DOMAIN);
    return SUPABASE_API_DOMAIN;
  }
};

/**
 * Get the complete server URL with function path
 */
export const getServerUrl = (): string => {
  return `${getApiBaseUrl()}/functions/v1/make-server-c4d79cb7`;
};

/**
 * Get the URL for the dedicated Express backend that handles
 * VPS provisioning, Razorpay payments, and subscription management.
 *
 * In development this is the local Express server (port 3001).
 * In production it should be the deployed backend domain.
 */
export const getVpsBackendUrl = (): string => {
  return 'https://api.indexpilotai.com/api';
};

/**
 * Get full endpoint URL
 * @param endpoint - API endpoint path (e.g., '/auth/login', '/trades/create')
 * @returns Complete URL with base domain and endpoint
 */
export const getEndpointUrl = (endpoint: string): string => {
  const baseUrl = getServerUrl();
  // Remove leading slash from endpoint if present to avoid double slashes
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${cleanEndpoint}`;
};

// ==============================================
// COMMON API HEADERS
// ==============================================

/**
 * Get standard API headers with authorization
 * @param accessToken - Optional user access token (if not provided, uses public anon key)
 */
export const getApiHeaders = (accessToken?: string): HeadersInit => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken || publicAnonKey}`,
  };
};

/**
 * Get headers for multipart/form-data requests
 * @param accessToken - Optional user access token (if not provided, uses public anon key)
 */
export const getMultipartHeaders = (accessToken?: string): HeadersInit => {
  return {
    'Authorization': `Bearer ${accessToken || publicAnonKey}`,
    // Note: Don't set Content-Type for multipart, browser will set it with boundary
  };
};

// ==============================================
// ENVIRONMENT INFO (FOR DEBUGGING)
// ==============================================

/**
 * Log current API configuration (useful for debugging)
 */
export const logApiConfig = () => {
  console.log('📊 [API CONFIG] ======================');
  console.log('📊 [API CONFIG] Mode:', API_MODE);
  console.log('📊 [API CONFIG] Base URL:', getApiBaseUrl());
  console.log('📊 [API CONFIG] Server URL:', getServerUrl());
  console.log('📊 [API CONFIG] Project ID:', projectId);
  console.log('📊 [API CONFIG] ======================');
};

// ==============================================
// EXPORTS
// ==============================================

export {
  API_MODE,
  CUSTOM_API_DOMAIN,
  SUPABASE_API_DOMAIN,
  publicAnonKey,
  projectId,
};
