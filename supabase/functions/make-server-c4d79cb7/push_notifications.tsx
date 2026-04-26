import * as kv from "./kv_store.tsx";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ═══════════════════════════════════════════════════════════════
// 📢 PUSH NOTIFICATION SERVICE - Firebase Cloud Messaging Integration
// ═══════════════════════════════════════════════════════════════

export interface PushSubscription {
  id: string;
  userId?: string;
  deviceToken: string;
  browser: string;
  device: string;
  createdAt: string;
}

export interface PushNotification {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  targetUrl?: string;
  sentTime: string;
  totalDelivered: number;
  status: 'sent' | 'failed' | 'pending';
}

// ═══════════════════════════════════════════════════════════════
// 📌 SUBSCRIBER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Save a new push notification subscriber
 */
export async function saveSubscriber(data: {
  userId?: string;
  deviceToken: string;
  browser: string;
  device: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const subscriberId = `push_sub_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const subscription: PushSubscription = {
      id: subscriberId,
      userId: data.userId,
      deviceToken: data.deviceToken,
      browser: data.browser,
      device: data.device,
      createdAt: new Date().toISOString(),
    };
    
    // Save to KV store
    await kv.set(`push_subscriber:${subscriberId}`, subscription);
    
    console.log('✅ Push subscriber saved:', subscriberId);
    
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error saving push subscriber:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all push notification subscribers
 */
export async function getAllSubscribers(): Promise<PushSubscription[]> {
  try {
    const results = await kv.getByPrefix('push_subscriber:');
    // Extract the value from each {key, value} object
    const subscribers = results.map((item: any) => item.value) as PushSubscription[];
    return subscribers;
  } catch (error: any) {
    console.error('❌ Error fetching subscribers:', error);
    return [];
  }
}

/**
 * Delete a push notification subscriber
 */
export async function deleteSubscriber(subscriberId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await kv.del(`push_subscriber:${subscriberId}`);
    console.log('✅ Subscriber deleted:', subscriberId);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error deleting subscriber:', error);
    return { success: false, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// 📤 NOTIFICATION SENDING
// ═══════════════════════════════════════════════════════════════

/**
 * Send push notification to all subscribers using Firebase Cloud Messaging
 */
export async function sendPushNotification(data: {
  title: string;
  description: string;
  imageUrl?: string;
  targetUrl?: string;
}): Promise<{ success: boolean; notificationId?: string; totalDelivered: number; error?: string }> {
  try {
    console.log('🔥 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔥 SEND PUSH NOTIFICATION FUNCTION CALLED');
    console.log('🔥 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Title:', data.title);
    console.log('📋 Description:', data.description);
    console.log('🖼️ Image URL:', data.imageUrl || 'None');
    console.log('🔗 Target URL:', data.targetUrl || 'None');
    console.log('🔥 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Get Supabase client to fetch all users
    console.log('📡 Creating Supabase client...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );
    
    // Get all registered users from Supabase Auth
    console.log('👥 Fetching all registered users from Supabase Auth...');
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError || !authData?.users) {
      console.error('❌ Error fetching users from Supabase:', authError);
      return { success: false, totalDelivered: 0, error: 'Failed to fetch users' };
    }
    
    // 🔒 FILTER: Exclude platform admin from receiving notifications
    // Admin sends notifications, they shouldn't receive their own notifications
    const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || 'airoboengin@smilykat.com';
    const clientUsers = authData.users.filter((user: any) => user.email !== platformOwnerEmail);
    
    // Get all subscribers (for device tokens)
    console.log('📱 Fetching all push notification subscribers...');
    const subscribers = await getAllSubscribers();
    
    console.log(`👥 Found ${clientUsers.length} client users (excluded admin)`);
    console.log(`📱 Found ${subscribers.length} device tokens`);
    console.log(`📊 User IDs:`, clientUsers.map(u => u.id));
    
    if (subscribers.length === 0) {
      console.log('⚠️ No device tokens found, but saving notification to history');
    }
    
    // Create notification ID
    const notificationId = `push_notif_${Date.now()}`;
    
    // Get Firebase Server Key from environment (for FCM API)
    const firebaseServerKey = Deno.env.get('FIREBASE_SERVER_KEY');
    
    if (!firebaseServerKey) {
      console.error('❌ Firebase Server Key not configured');
      
      // Save notification to history anyway (as failed)
      const notification: PushNotification = {
        id: notificationId,
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        targetUrl: data.targetUrl,
        sentTime: new Date().toISOString(),
        totalDelivered: 0,
        status: 'failed',
      };
      
      await kv.set(`push_notification:${notificationId}`, notification);
      
      return { 
        success: false, 
        notificationId,
        totalDelivered: 0, 
        error: 'Firebase Server Key not configured. Please set FIREBASE_SERVER_KEY environment variable.' 
      };
    }
    
    // Send notifications using Firebase Cloud Messaging API
    let successCount = 0;
    const deviceTokens = subscribers.map(sub => sub.deviceToken);
    
    if (deviceTokens.length > 0) {
      // FCM expects tokens in batches of 1000 max
      const batchSize = 500; // Use 500 for safety
      for (let i = 0; i < deviceTokens.length; i += batchSize) {
        const batch = deviceTokens.slice(i, i + batchSize);
        
        try {
          const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${firebaseServerKey}`,
            },
            body: JSON.stringify({
              registration_ids: batch,
              notification: {
                title: data.title,
                body: data.description,
                icon: data.imageUrl || '/logo-192x192.png',
                image: data.imageUrl,
                click_action: data.targetUrl || '/',
              },
              data: {
                url: data.targetUrl || '/',
              },
            }),
          });
          
          const fcmResult = await fcmResponse.json();
          
          if (fcmResult.success) {
            successCount += fcmResult.success;
          }
          
          console.log(`✅ FCM batch ${i / batchSize + 1} sent:`, fcmResult);
        } catch (batchError: any) {
          console.error(`❌ Error sending FCM batch ${i / batchSize + 1}:`, batchError);
        }
      }
    }
    
    // Also save notification to each user's notification center
    console.log('💾 Saving notifications to user notification centers...');
    console.log('💾 Total users to notify:', clientUsers.length);
    console.log('💾 User details:', clientUsers.map(u => ({ id: u.id, email: u.email })));
    
    for (const user of clientUsers) {
      try {
        const userNotification = {
          id: `${notificationId}_${user.id}`,
          type: 'SYSTEM_ALERT',
          title: data.title,
          message: data.description,
          timestamp: Date.now(),
          read: false,
          data: {
            imageUrl: data.imageUrl,
            targetUrl: data.targetUrl,
            fromAdmin: true,
          }
        };
        
        console.log(`📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📬 SAVING NOTIFICATION FOR USER`);
        console.log(`📬 User ID: ${user.id}`);
        console.log(`📬 User Email: ${user.email}`);
        console.log(`📬 KV Store Key: user_notifications:${user.id}`);
        console.log(`📬 Notification:`, userNotification);
        console.log(`📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        // Get existing notifications for user
        const existingNotifications = await kv.get(`user_notifications:${user.id}`) || [];
        
        console.log(`📊 User ${user.id} has ${existingNotifications.length} existing notifications`);
        
        // Add new notification to the beginning
        const updatedNotifications = [userNotification, ...existingNotifications];
        
        // Keep only last 100 notifications
        if (updatedNotifications.length > 100) {
          updatedNotifications.splice(100);
        }
        
        // Save back to KV store
        console.log(`💾 Saving ${updatedNotifications.length} notifications to KV store...`);
        await kv.set(`user_notifications:${user.id}`, updatedNotifications);
        
        // Verify it was saved
        const verification = await kv.get(`user_notifications:${user.id}`);
        console.log(`✅ VERIFICATION: ${verification?.length || 0} notifications in KV store for user ${user.id}`);
        
        console.log(`✅ Notification saved for user ${user.id}. Total: ${updatedNotifications.length}`);
      } catch (userNotifError: any) {
        console.error(`❌ Error saving notification for user ${user.id}:`, userNotifError);
      }
    }
    console.log(`✅ Notifications saved to ${clientUsers.length} user notification centers`);
    
    // Count total users as delivered (since we're sending to all registered users)
    const totalDelivered = clientUsers.length;
    
    // Save notification to history
    const notification: PushNotification = {
      id: notificationId,
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      targetUrl: data.targetUrl,
      sentTime: new Date().toISOString(),
      totalDelivered: totalDelivered,
      status: totalDelivered > 0 ? 'sent' : 'failed',
    };
    
    await kv.set(`push_notification:${notificationId}`, notification);
    
    console.log(`✅ Push notification sent to ${totalDelivered} users (${successCount} via FCM)`);
    
    return { 
      success: true, 
      notificationId,
      totalDelivered: totalDelivered 
    };
  } catch (error: any) {
    console.error('❌ Error sending push notification:', error);
    return { 
      success: false, 
      totalDelivered: 0,
      error: error.message 
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// 📊 NOTIFICATION HISTORY
// ══════════════════════════════════════════════════════════════

/**
 * Get all notification history
 */
export async function getNotificationHistory(): Promise<PushNotification[]> {
  try {
    const results = await kv.getByPrefix('push_notification:');
    
    // Extract the value from each {key, value} object
    const notifications = results.map((item: any) => item.value) as PushNotification[];
    
    // Sort by sentTime (newest first)
    const sorted = notifications.sort((a, b) => {
      return new Date(b.sentTime).getTime() - new Date(a.sentTime).getTime();
    });
    
    console.log(`📊 Fetched ${sorted.length} notifications from history`);
    if (sorted.length > 0) {
      console.log('📊 Sample notification:', sorted[0]);
    }
    
    return sorted;
  } catch (error: any) {
    console.error('❌ Error fetching notification history:', error);
    return [];
  }
}

/**
 * Delete a notification from history
 */
export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`🗑️ Attempting to delete notification with ID: ${notificationId}`);
    
    // Check if notification exists first
    const existing = await kv.get(`push_notification:${notificationId}`);
    if (!existing) {
      console.log(`⚠️ Notification ${notificationId} not found in database`);
      return { success: false, error: 'Notification not found' };
    }
    
    console.log(`✅ Found notification to delete:`, existing);
    
    // Delete from KV store
    await kv.del(`push_notification:${notificationId}`);
    
    // Verify deletion
    const verify = await kv.get(`push_notification:${notificationId}`);
    if (verify) {
      console.log(`❌ Notification still exists after deletion attempt!`);
      return { success: false, error: 'Failed to delete notification' };
    }
    
    console.log(`✅ Notification ${notificationId} successfully deleted and verified`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error deleting notification:', error);
    return { success: false, error: error.message };
  }
}