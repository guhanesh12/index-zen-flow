// @ts-nocheck
// ═══════════════════════════════════════════════════════════════
// 🔔 PUSH NOTIFICATION SUBSCRIPTION UTILITY
// ═══════════════════════════════════════════════════════════════

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirebaseMessagingRegistration, WEB_PUSH_VAPID_KEY } from '@/utils/firebase/config';

// Firebase configuration — project indexpilotai-e1106
const firebaseConfig = {
  apiKey: "AIzaSyBUt38Mx2WR-EfEU1wLfFEjNygNMay8eYo",
  authDomain: "indexpilotai-e1106.firebaseapp.com",
  projectId: "indexpilotai-e1106",
  storageBucket: "indexpilotai-e1106.firebasestorage.app",
  messagingSenderId: "167770668435",
  appId: "1:167770668435:web:ec781a95603f5b24bbbc66",
  measurementId: "G-6BTDWSVFPQ",
};

// Web Push VAPID public key (from Firebase Console → Cloud Messaging → Web Push certificates)
const vapidKey = WEB_PUSH_VAPID_KEY;

let app: any = null;
let messaging: any = null;

/**
 * Initialize Firebase
 */
export function initializeFirebase() {
  try {
    if (!app) {
      app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      console.log('✅ Firebase initialized');
    }
    
    if (!messaging && typeof window !== 'undefined' && 'Notification' in window) {
      messaging = getMessaging(app);
      console.log('✅ Firebase Messaging initialized');
    }
    
    return { app, messaging };
  } catch (error: any) {
    console.error('❌ Error initializing Firebase:', error);
    return { app: null, messaging: null };
  }
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!('Notification' in window)) {
      console.warn('⚠️ This browser does not support notifications');
      return false;
    }

    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      console.log('✅ Notification permission granted');
      return true;
    } else {
      console.log('❌ Notification permission denied');
      return false;
    }
  } catch (error: any) {
    console.error('❌ Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPushNotifications(
  serverUrl: string,
  userId?: string
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Initialize Firebase
    const { messaging: msg } = initializeFirebase();
    
    if (!msg) {
      return { 
        success: false, 
        error: 'Firebase Messaging not supported in this browser' 
      };
    }

    // Request permission
    const hasPermission = await requestNotificationPermission();
    
    if (!hasPermission) {
      return { 
        success: false, 
        error: 'Notification permission denied' 
      };
    }

    // Get device token. Firebase needs /firebase-messaging-sw.js to exist;
    // register it explicitly so web/PWA and RN WebView token creation is reliable.
    const serviceWorkerRegistration = await getFirebaseMessagingRegistration();
    const token = await getToken(msg, { vapidKey, serviceWorkerRegistration });
    
    if (!token) {
      return { 
        success: false, 
        error: 'Failed to get device token' 
      };
    }

    console.log('✅ Firebase device token:', token);

    // Get browser and device info
    const browser = getBrowserInfo();
    const device = getDeviceInfo();

    // Send subscription to standalone edge function (bypasses monolith worker limit)
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.functions.invoke('push-subscribe', {
      body: { userId, deviceToken: token, browser, device },
    });
    if (error) {
      console.error('❌ push-subscribe invoke error:', error);
      return { success: false, error: error.message || 'Failed to subscribe' };
    }

    if (data.success) {
      console.log('✅ Successfully subscribed to push notifications');
      
      // Store subscription status in localStorage
      localStorage.setItem('push_notifications_enabled', 'true');
      
      return { success: true, token };
    } else {
      return { 
        success: false, 
        error: data.message || 'Failed to subscribe' 
      };
    }
  } catch (error: any) {
    console.error('❌ Error subscribing to push notifications:', error);
    return { 
      success: false, 
      error: error.message || 'Subscription failed' 
    };
  }
}

/**
 * Listen for foreground messages
 */
export function onForegroundMessage(callback: (payload: any) => void) {
  try {
    const { messaging: msg } = initializeFirebase();
    
    if (!msg) {
      console.warn('⚠️ Firebase Messaging not available');
      return () => {};
    }

    return onMessage(msg, (payload) => {
      console.log('📩 Foreground message received:', payload);
      callback(payload);
    });
  } catch (error: any) {
    console.error('❌ Error setting up foreground message listener:', error);
    return () => {};
  }
}

/**
 * Check if push notifications are enabled
 */
export function isPushNotificationsEnabled(): boolean {
  return localStorage.getItem('push_notifications_enabled') === 'true';
}

/**
 * Get browser information
 */
function getBrowserInfo(): string {
  const userAgent = navigator.userAgent;
  
  if (userAgent.indexOf('Firefox') > -1) {
    return 'Firefox';
  } else if (userAgent.indexOf('Chrome') > -1) {
    return 'Chrome';
  } else if (userAgent.indexOf('Safari') > -1) {
    return 'Safari';
  } else if (userAgent.indexOf('Edge') > -1) {
    return 'Edge';
  } else {
    return 'Unknown';
  }
}

/**
 * Get device information
 */
function getDeviceInfo(): string {
  const userAgent = navigator.userAgent;
  
  if (/mobile/i.test(userAgent)) {
    return 'Mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    return 'Tablet';
  } else {
    return 'Desktop';
  }
}

/**
 * Show notification popup prompt to the user
 */
export function showNotificationPrompt(
  serverUrl: string,
  userId?: string,
  onSuccess?: () => void,
  onError?: (error: string) => void
) {
  // Check if already subscribed
  if (isPushNotificationsEnabled()) {
    console.log('ℹ️ Already subscribed to push notifications');
    return;
  }

  // Check if user has denied permission before
  if (Notification.permission === 'denied') {
    console.log('⚠️ User has denied notification permission');
    return;
  }

  // Show a custom prompt (you can customize this UI)
  if (confirm('Enable push notifications to receive real-time trading alerts and updates?')) {
    subscribeToPushNotifications(serverUrl, userId)
      .then(result => {
        if (result.success) {
          onSuccess?.();
        } else {
          onError?.(result.error || 'Failed to subscribe');
        }
      })
      .catch(error => {
        onError?.(error.message);
      });
  }
}

/**
 * Silent auto-subscribe — no confirm popup, called on login.
 * Only requests permission if not already decided; if denied, exits quietly.
 */
export async function autoSubscribeOnLogin(userId: string): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'denied') return;
    // Fire once per session per user
    const flag = `push_auto_sub_done:${userId}`;
    if (sessionStorage.getItem(flag) === '1') return;
    sessionStorage.setItem(flag, '1');
    const result = await subscribeToPushNotifications('', userId);
    if (result.success) {
      console.log('✅ Auto-subscribed to push notifications');
    } else {
      console.log('ℹ️ Auto-subscribe skipped:', result.error);
    }
  } catch (e) {
    console.warn('autoSubscribeOnLogin error:', e);
  }
}