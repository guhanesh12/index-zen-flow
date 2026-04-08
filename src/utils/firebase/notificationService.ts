// Import Firebase messaging
import { getToken, onMessage, Messaging } from "firebase/messaging";
import { messaging } from "./config";
import { supabase } from "/utils/supabase/client";
import { getServerUrl } from "/utils/config/apiConfig";

export type NotificationType = 
  | 'SIGNAL_DETECTED'
  | 'ORDER_PLACED'
  | 'POSITION_CLOSED'
  | 'SUPPORT_REPLY'
  | 'MARKET_OPEN'
  | 'MARKET_CLOSED'
  | 'SYSTEM_ALERT'
  | 'INFO';

export interface NotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  data?: {
    index?: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
    symbol?: string;
    action?: 'BUY' | 'SELL' | 'EXIT';
    quantity?: number;
    price?: number;
    pnl?: number;
    exitReason?: string;
    [key: string]: any;
  };
}

class NotificationService {
  private static instance: NotificationService;
  private notificationListeners: ((notification: NotificationData) => void)[] = [];
  private fcmToken: string | null = null;
  private permissionGranted: boolean = false;

  private constructor() {
    this.init();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private async init() {
    // Request notification permission on page load
    if ('Notification' in window && Notification.permission === 'default') {
      console.log('🔔 Requesting notification permission...');
      await this.requestPermission();
    } else if (Notification.permission === 'granted') {
      this.permissionGranted = true;
      await this.initializeFCM();
    }

    // Play notification sound when message received
    if (messaging) {
      onMessage(messaging, (payload) => {
        console.log('📩 FCM Message received:', payload);
        this.handleFCMMessage(payload);
      });
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === 'granted';
      
      if (this.permissionGranted) {
        console.log('✅ Notification permission granted!');
        await this.initializeFCM();
        
        // Show welcome notification
        this.sendNotification({
          type: 'INFO',
          title: '🎉 Notifications Enabled!',
          message: 'You will now receive real-time trading alerts',
          data: {}
        });
      } else {
        console.log('❌ Notification permission denied');
      }
      
      return this.permissionGranted;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  private async initializeFCM() {
    if (!messaging) {
      console.warn('Firebase Messaging not available');
      return;
    }

    try {
      // Get FCM token
      const token = await getToken(messaging, {
        vapidKey: 'BCJwUHX0XWuHubHBLmhbiKnUjInxpo-bLBR_NxkGmJOod-XlhzMH5e_VZVDCOsLd5zuB0E-kVsXz4XO3l9oU8BQ'
      });
      
      if (token) {
        this.fcmToken = token;
        console.log('🔑 FCM Token:', token);
        
        // Send token to your server to save it for this user
        // await this.saveFCMTokenToServer(token);
      }
    } catch (error: any) {
      if (error.code === 'messaging/permission-blocked') {
        console.warn('⚠️ Notifications are blocked. Using in-app notifications only.');
      } else {
        console.error('Error getting FCM token:', error);
      }
    }
  }

  private handleFCMMessage(payload: any) {
    const notification: NotificationData = {
      id: `fcm_${Date.now()}`,
      type: payload.data?.type || 'INFO',
      title: payload.notification?.title || 'Notification',
      message: payload.notification?.body || '',
      timestamp: Date.now(),
      read: false,
      data: payload.data || {}
    };

    // Notify all listeners
    this.notifyListeners(notification);

    // Play sound
    this.playNotificationSound(notification.type);
  }

  // Send notification (in-app + browser push)
  sendNotification(notification: Omit<NotificationData, 'id' | 'timestamp' | 'read'>) {
    const fullNotification: NotificationData = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false,
      ...notification
    };

    // Save to localStorage
    this.saveNotification(fullNotification);

    // Notify all listeners (for in-app UI)
    this.notifyListeners(fullNotification);

    // Send browser push notification (if permission granted)
    if (this.permissionGranted && 'Notification' in window) {
      this.sendBrowserNotification(fullNotification);
    }

    // Play sound
    this.playNotificationSound(fullNotification.type);

    return fullNotification;
  }

  private sendBrowserNotification(notification: NotificationData) {
    try {
      const options: NotificationOptions = {
        body: notification.message,
        icon: '/icon-192x192.png', // Your app icon
        badge: '/badge-72x72.png', // Small badge icon
        vibrate: [200, 100, 200],
        tag: notification.id,
        requireInteraction: false,
        data: notification.data,
        timestamp: notification.timestamp
      };

      // Add custom icon based on type
      if (notification.type === 'SIGNAL_DETECTED') {
        options.icon = '📊';
      } else if (notification.type === 'ORDER_PLACED') {
        options.icon = '💰';
      } else if (notification.type === 'POSITION_CLOSED') {
        options.icon = '✅';
      }

      new Notification(notification.title, options);
    } catch (error) {
      console.error('Error sending browser notification:', error);
    }
  }

  private playNotificationSound(type: NotificationType) {
    try {
      // Different sounds for different notification types
      let frequency = 800;
      let duration = 200;

      if (type === 'SIGNAL_DETECTED') {
        frequency = 900;
        duration = 300;
      } else if (type === 'ORDER_PLACED') {
        frequency = 1000;
        duration = 250;
      } else if (type === 'POSITION_CLOSED') {
        frequency = 700;
        duration = 350;
      }

      // Create audio context for custom sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (error) {
      console.error('Error playing sound:', error);
    }
  }

  // Subscribe to notifications
  subscribe(listener: (notification: NotificationData) => void) {
    this.notificationListeners.push(listener);
    return () => {
      this.notificationListeners = this.notificationListeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(notification: NotificationData) {
    this.notificationListeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  // Storage management
  private saveNotification(notification: NotificationData) {
    try {
      const stored = localStorage.getItem('notifications') || '[]';
      const notifications: NotificationData[] = JSON.parse(stored);
      notifications.unshift(notification); // Add to beginning
      
      // Keep only last 100 notifications
      if (notifications.length > 100) {
        notifications.splice(100);
      }
      
      localStorage.setItem('notifications', JSON.stringify(notifications));
    } catch (error) {
      console.error('Error saving notification:', error);
    }
  }

  getAllNotifications(): NotificationData[] {
    try {
      const stored = localStorage.getItem('notifications') || '[]';
      return JSON.parse(stored);
    } catch (error) {
      console.error('Error loading notifications:', error);
      return [];
    }
  }

  async syncNotificationsFromBackend(): Promise<void> {
    try {
      console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 STARTING BACKEND NOTIFICATION SYNC');
      console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // Use Supabase client to get the session
      console.log('🔐 Step 1: Getting Supabase session...');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('❌ No active session found!');
        console.log('Session error:', sessionError?.message || 'Not logged in');
        console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }

      const accessToken = session.access_token;
      const userId = session.user?.id;
      const userEmail = session.user?.email;
      console.log('✅ Session found!');
      console.log('👤 User ID:', userId);
      console.log('📧 User Email:', userEmail);

      const serverUrl = getServerUrl();
      
      console.log('📡 Step 2: Fetching notifications from backend...');
      console.log('🔗 URL:', `${serverUrl}/user/notifications`);
      console.log('🔑 Using access token:', `${accessToken.substring(0, 20)}...`);

      // Fetch notifications from backend
      const response = await fetch(`${serverUrl}/user/notifications`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📊 Response status:', response.status);
      console.log('📊 Response OK:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Backend API error!');
        console.error('Status:', response.status);
        console.error('Response:', errorText);
        console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }

      const data = await response.json();
      
      console.log('📬 Step 3: Processing backend response...');
      console.log('✅ Response data:', data);

      if (data.success && data.notifications) {
        console.log(`📊 Received ${data.notifications.length} notifications from backend`);
        if (data.notifications.length > 0) {
          console.log('📋 First notification:', data.notifications[0]);
        }
        
        // Get local notifications
        const localNotifications = this.getAllNotifications();
        console.log(`💾 Current local notifications: ${localNotifications.length}`);
        
        // Merge backend notifications with local ones (avoid duplicates)
        const backendNotifications: NotificationData[] = data.notifications;
        const localIds = new Set(localNotifications.map(n => n.id));
        
        const newNotifications = backendNotifications.filter(n => !localIds.has(n.id));
        
        if (newNotifications.length > 0) {
          console.log(`✅ Found ${newNotifications.length} NEW notifications to sync!`);
          console.log('📋 New notification IDs:', newNotifications.map(n => n.id));
          const merged = [...newNotifications, ...localNotifications];
          
          // Keep only last 100
          if (merged.length > 100) {
            merged.splice(100);
          }
          
          // Save to localStorage
          console.log(`💾 Step 4: Saving ${merged.length} notifications to localStorage...`);
          localStorage.setItem('notifications', JSON.stringify(merged));
          
          // Verify save
          const verified = localStorage.getItem('notifications');
          const verifiedCount = verified ? JSON.parse(verified).length : 0;
          console.log(`✅ VERIFICATION: ${verifiedCount} notifications saved in localStorage`);
          console.log(`💾 Total notifications after merge: ${merged.length}`);
        } else {
          console.log('✅ No new notifications to sync (all already in localStorage)');
          console.log('📋 Backend notification IDs:', backendNotifications.map(n => n.id));
          console.log('📋 Local notification IDs:', Array.from(localIds));
        }
      } else {
        console.error('⚠️ Backend sync failed or returned empty!');
        console.error('Success:', data.success);
        console.error('Message:', data.message || 'No error message');
        console.error('Notifications:', data.notifications);
      }
      
      console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ BACKEND SYNC COMPLETED');
      console.log('🔄 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ CRITICAL ERROR IN BACKEND SYNC!');
      console.error('❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Error:', error);
      console.error('Stack:', (error as Error).stack);
      console.error('❌ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }

  getUnreadCount(): number {
    return this.getAllNotifications().filter(n => !n.read).length;
  }

  markAsRead(id: string) {
    try {
      const notifications = this.getAllNotifications();
      const notification = notifications.find(n => n.id === id);
      if (notification) {
        notification.read = true;
        localStorage.setItem('notifications', JSON.stringify(notifications));
        
        // Notify listeners of update
        this.notificationListeners.forEach(listener => listener(notification));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  markAllAsRead() {
    try {
      const notifications = this.getAllNotifications();
      notifications.forEach(n => n.read = true);
      localStorage.setItem('notifications', JSON.stringify(notifications));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  clearAll() {
    localStorage.setItem('notifications', '[]');
  }

  // Helper methods for different notification types
  notifySignalDetected(data: {
    index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
    symbol: string;
    action: 'BUY' | 'SELL' | 'WAIT';
    confidence?: number;
    reasoning?: string;
  }) {
    // Different emoji for WAIT signals
    const emoji = data.action === 'WAIT' ? '⏸️' : '📊';
    const title = data.action === 'WAIT' 
      ? `⏸️ ${data.index} - Market Not Suitable` 
      : `📊 ${data.index} Signal Detected`;
    
    let message = `${data.action} ${data.symbol}`;
    if (data.confidence) {
      message += ` (${data.confidence}% confidence)`;
    }
    if (data.reasoning && data.action === 'WAIT') {
      // Add reasoning for WAIT signals
      message += ` - ${data.reasoning.substring(0, 60)}...`;
    }
    
    return this.sendNotification({
      type: 'SIGNAL_DETECTED',
      title,
      message,
      data
    });
  }
  
  // Test notification for debugging
  createTestNotification() {
    return this.sendNotification({
      type: 'SIGNAL_DETECTED',
      title: '🧪 Test Notification',
      message: 'This is a test notification to verify the system is working!',
      data: {
        index: 'NIFTY',
        symbol: 'NIFTY 23800 CE',
        action: 'BUY',
        confidence: 85
      }
    });
  }

  notifyOrderPlaced(data: {
    symbol: string;
    quantity: number;
    price: number;
    action: 'BUY' | 'SELL';
  }) {
    return this.sendNotification({
      type: 'ORDER_PLACED',
      title: `💰 Order Placed`,
      message: `${data.action} ${data.quantity} x ${data.symbol} @ ₹${data.price}`,
      data
    });
  }

  notifyPositionClosed(data: {
    symbol: string;
    exitReason: string;
    pnl: number;
  }) {
    const emoji = data.pnl >= 0 ? '🎉' : '📉';
    const sign = data.pnl >= 0 ? '+' : '';
    
    return this.sendNotification({
      type: 'POSITION_CLOSED',
      title: `${emoji} Position Closed`,
      message: `${data.symbol} | ${data.exitReason} | P&L: ${sign}₹${data.pnl.toFixed(2)}`,
      data
    });
  }

  notifySupportReply(message: string) {
    return this.sendNotification({
      type: 'SUPPORT_REPLY',
      title: '💬 Support Ticket Update',
      message,
      data: {}
    });
  }

  notifyMarketOpen() {
    return this.sendNotification({
      type: 'MARKET_OPEN',
      title: '🔔 Market Open',
      message: 'NSE Market is now open',
      data: {}
    });
  }

  notifyMarketClosed() {
    return this.sendNotification({
      type: 'MARKET_CLOSED',
      title: '🔕 Market Closed',
      message: 'NSE Market is now closed',
      data: {}
    });
  }
}

export const notificationService = NotificationService.getInstance();
export default notificationService;