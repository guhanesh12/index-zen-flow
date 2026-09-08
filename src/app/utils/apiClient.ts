// @ts-nocheck
/**
 * API Client with Automatic Auth Token handling for Google Cloud Run
 */
import { auth } from "@/lib/firebase";
import { supabase } from "@/utils-ext/supabase/client";

interface FetchWithAuthOptions extends RequestInit {
  skipAuthRefresh?: boolean;
}

/**
 * Fetch wrapper that automatically includes auth token and user context
 */
export async function fetchWithAuth(
  url: string,
  options: FetchWithAuthOptions = {}
): Promise<Response> {
  const { skipAuthRefresh, ...fetchOptions } = options;
  
  const token = await getAccessToken();
  const headers = new Headers(fetchOptions.headers || {});
  
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Also include user id and email if available in localStorage
  try {
    const userSessionStr = localStorage.getItem('user_session');
    if (userSessionStr) {
      const parsed = JSON.parse(userSessionStr);
      const user = parsed?.user || parsed;
      if (user?.id && !headers.has('x-user-id')) headers.set('x-user-id', user.id);
      if (user?.email && !headers.has('x-user-email')) headers.set('x-user-email', user.email);
    }
  } catch {}

  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  });

  return response;
}

/**
 * Get current access token: checks Supabase auth session, localStorage, then Firebase
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    // 1. Check Supabase session first (primary authentication provider)
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }

    // 2. Check localStorage auth_token
    const localToken = localStorage.getItem('auth_token');
    if (localToken && !localToken.includes('cloud-run') && localToken.length > 20) {
      return localToken;
    }

    // 3. Check user_session object in localStorage
    const userSessionStr = localStorage.getItem('user_session');
    if (userSessionStr) {
      try {
        const parsed = JSON.parse(userSessionStr);
        if (parsed?.access_token) return parsed.access_token;
        if (parsed?.session?.access_token) return parsed.session.access_token;
      } catch {}
    }

    // 4. Check Firebase currentUser
    const currentUser = auth?.currentUser;
    if (currentUser) {
      return await currentUser.getIdToken();
    }

    return localToken || "cloud-run-local-token";
  } catch (err) {
    console.error('Error getting access token:', err);
    return localStorage.getItem('auth_token') || "cloud-run-local-token";
  }
}
