// @ts-nocheck
// ═══════════════════════════════════════════════════════════════
// 📊 ANALYTICS TRACKING HOOK - Client-side tracking
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { publicAnonKey } from '@/utils-ext/supabase/info';
import { getServerUrl } from '@/utils-ext/config/apiConfig';

// Track page view
export function trackPageView(page: string) {
  try {
    const serverUrl = getServerUrl();
    console.log(`📊 [Analytics] Tracking page view: ${page}`);
    fetch(`${serverUrl}/analytics/pageview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ page }),
    })
      .then(res => {
        if (res.ok) {
          console.log(`✅ [Analytics] Page view tracked: ${page}`);
        } else {
          console.error('❌ [Analytics] Failed to track page view:', res.status);
        }
      })
      .catch(err => console.error('❌ [Analytics] Error tracking page view:', err));
  } catch (error) {
    console.error('❌ [Analytics] Error tracking page view:', error);
  }
}

// Send heartbeat to keep session alive
export function sendHeartbeat(page: string) {
  try {
    const serverUrl = getServerUrl();
    fetch(`${serverUrl}/analytics/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ page }),
    }).catch(() => {}); // Silent fail
  } catch (error) {
    // Silent fail
  }
}

// Track login attempt
export function trackLogin(email: string, status: 'success' | 'failed', userId?: string) {
  try {
    const serverUrl = getServerUrl();
    console.log(`📊 [Analytics] Tracking login: ${email} - ${status}`);
    fetch(`${serverUrl}/analytics/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ email, status, userId }),
    })
      .then(res => {
        if (res.ok) {
          console.log(`✅ [Analytics] Login tracked: ${email} - ${status}`);
        } else {
          console.error('❌ [Analytics] Failed to track login:', res.status);
        }
      })
      .catch(err => console.error('❌ [Analytics] Error tracking login:', err));
  } catch (error) {
    console.error('❌ [Analytics] Error tracking login:', error);
  }
}

// Track signup progress
export function trackSignup(
  email: string | undefined,
  name: string | undefined,
  mobile: string | undefined,
  completionPercent: number,
  completed: boolean,
  userId?: string
) {
  try {
    const serverUrl = getServerUrl();
    console.log(`📊 [Analytics] Tracking signup: ${email || mobile} - ${completionPercent}%${completed ? ' (COMPLETED)' : ''}`);
    fetch(`${serverUrl}/analytics/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify({ email, name, mobile, completionPercent, completed, userId }),
    })
      .then(res => {
        if (res.ok) {
          console.log(`✅ [Analytics] Signup tracked: ${email || mobile} - ${completionPercent}%`);
        } else {
          console.error('❌ [Analytics] Failed to track signup:', res.status);
        }
      })
      .catch(err => console.error('❌ [Analytics] Error tracking signup:', err));
  } catch (error) {
    console.error('❌ [Analytics] Error tracking signup:', error);
  }
}

// Hook to automatically track page views
export function useAnalyticsTracking() {
  const location = useLocation();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Track page view on route change
    trackPageView(location.pathname);

    // Send immediate heartbeat to mark session as active
    sendHeartbeat(location.pathname);

    // Send heartbeat every 1 minute to keep session alive
    // (sessions are considered active if updated within last 5 minutes)
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(location.pathname);
    }, 60000); // 1 minute

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [location.pathname]);
}