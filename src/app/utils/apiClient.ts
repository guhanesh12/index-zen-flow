/**
 * API Client with Automatic JWT Refresh on 401 Errors
 */

import { supabase } from '@/utils-ext/supabase/client';

interface FetchWithAuthOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

/**
 * Fetch wrapper that automatically refreshes auth token on 401 errors
 */
export async function fetchWithAuth(
  url: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const { skipAuthRefresh, ...fetchOptions } = options;
  
  // First attempt
  let response = await fetch(url, fetchOptions);
  
  // If 401 and not already retrying, try to refresh the session
  if (response.status === 401 && !skipAuthRefresh) {
    console.log('🔄 Got 401 error, attempting to refresh session...');
    
    try {
      // Refresh the session
      const { data: { session }, error } = await supabase.auth.refreshSession();
      
      if (error || !session) {
        console.error('❌ Failed to refresh session:', error?.message);
        // Let the caller handle the 401
        return response;
      }
      
      console.log('✅ Session refreshed successfully');
      
      // Update Authorization header with new token
      const newHeaders = new Headers(fetchOptions.headers || {});
      newHeaders.set('Authorization', `Bearer ${session.access_token}`);
      
      // Retry the request with new token
      response = await fetch(url, {
        ...fetchOptions,
        headers: newHeaders,
        skipAuthRefresh: true // Prevent infinite loop
      } as FetchWithAuthOptions);
      
      console.log(`✅ Retry with refreshed token: ${response.status} ${response.statusText}`);
    } catch (refreshError) {
      console.error('❌ Error during session refresh:', refreshError);
    }
  }
  
  return response;
}

/**
 * Get current access token with automatic refresh if needed
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error || !session) {
      console.log('📡 No session found, attempting refresh...');
      const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !newSession) {
        console.error('❌ Failed to get/refresh session:', refreshError?.message);
        return null;
      }
      
      return newSession.access_token;
    }
    
    return session.access_token;
  } catch (err) {
    console.error('❌ Error getting access token:', err);
    return null;
  }
}
