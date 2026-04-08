// ═══════════════════════════════════════════════════════════════
// 🔔 PUSH NOTIFICATION SUBSCRIPTION UTILITY
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

// Firebase configuration from the requirements
const firebaseConfig = {
  apiKey: "AIzaSyBwqxzsY4_ueHSams1jDJCjxKhLEOYVrtU",
  authDomain: "algo-app-615ae.firebaseapp.com",
  projectId: "algo-app-615ae",
  storageBucket: "algo-app-615ae.firebasestorage.app",
  messagingSenderId: "759806420144",
  appId: "1:759806420144:web:a9aaeebe4b93bb48594775",
  measurementId: "G-VX9L36H2G5"
};

// Web Push Certificate (VAPID Key)
const vapidKey = "BCJwUHX0XWuHubHBLmhbiKnUjInxpo-bLBR_NxkGmJOod-XlhzMH5e_VZVDCOsLd5zuB0E-kVsXz4XO3l9oU8BQ";

let app: any = null;
let messaging: any = null;

/**
 * Initialize Firebase
 */
export function initializeFirebase() {
  try {
    if (!app) {
      app = initializeApp(firebaseConfig);
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

    // Get device token
    const token = await getToken(msg, { vapidKey });
    
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

    // Send subscription to backend
    const response = await fetch(`${serverUrl}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        deviceToken: token,
        browser,
        device,
      }),
    });

    const data = await response.json();

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