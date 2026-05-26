// ═══════════════════════════════════════════════════════════════
// 🔔 PUSH NOTIFICATION SERVICE — Firebase Cloud Messaging HTTP v1
//   - OAuth2 via service account (FIREBASE_SERVICE_ACCOUNT_JSON)
//   - Per-user targeted send + broadcast
//   - Auto-cleans invalid / unregistered tokens
//   - Backwards-compatible exports used by /push/* routes in index.ts
// ═══════════════════════════════════════════════════════════════
import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export interface PushSubscription {
  id: string;
  userId?: string;
  deviceToken: string;
  browser: string;
  device: string;
  platform?: "android" | "ios" | "web";
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
  status: "sent" | "failed" | "pending";
}

// ════════════════════════════════════════════════════════════════
// 🔐 FCM HTTP v1 — OAuth2 access token from service account
// ════════════════════════════════════════════════════════════════
let _cachedToken: { token: string; exp: number } | null = null;
let _cachedProjectId: string | null = null;

function _b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function _pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function _getAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON secret not set");
  const sa = JSON.parse(raw);
  _cachedProjectId = sa.project_id;

  const now = Math.floor(Date.now() / 1000);
  if (_cachedToken && _cachedToken.exp - 60 > now) {
    return { token: _cachedToken.token, projectId: sa.project_id };
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${_b64url(JSON.stringify(header))}.${_b64url(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    _pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${_b64url(new Uint8Array(sig))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) {
    throw new Error(`FCM OAuth failed: ${JSON.stringify(json)}`);
  }
  _cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600) };
  return { token: json.access_token, projectId: sa.project_id };
}

// ════════════════════════════════════════════════════════════════
// 📌 SUBSCRIBERS  (kept compatible with /push/subscribe route)
// ════════════════════════════════════════════════════════════════
export async function saveSubscriber(data: {
  userId?: string;
  deviceToken: string;
  browser: string;
  device: string;
  platform?: "android" | "ios" | "web";
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (!data.deviceToken) return { success: false, error: "deviceToken required" };

    // Deduplicate by deviceToken — replace old entry if same token re-registers
    const all = await getAllSubscribers();
    const existing = all.find((s) => s.deviceToken === data.deviceToken);
    const subscriberId = existing?.id || `push_sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const subscription: PushSubscription = {
      id: subscriberId,
      userId: data.userId,
      deviceToken: data.deviceToken,
      browser: data.browser,
      device: data.device,
      platform: data.platform || (/(iPhone|iPad|iOS)/i.test(data.device) ? "ios" : /Android/i.test(data.device) ? "android" : "web"),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    await kv.set(`push_subscriber:${subscriberId}`, subscription);
    console.log(`✅ Push subscriber saved (${subscription.platform}):`, subscriberId, "user:", data.userId || "anon");
    return { success: true };
  } catch (e: any) {
    console.error("❌ saveSubscriber:", e);
    return { success: false, error: e.message };
  }
}

export async function getAllSubscribers(): Promise<PushSubscription[]> {
  try {
    const results = await kv.getByPrefix("push_subscriber:");
    return results.map((item: any) => item.value) as PushSubscription[];
  } catch (e) {
    console.error("❌ getAllSubscribers:", e);
    return [];
  }
}

export async function getSubscribersForUser(userId: string): Promise<PushSubscription[]> {
  const all = await getAllSubscribers();
  return all.filter((s) => s.userId === userId);
}

export async function deleteSubscriber(subscriberId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await kv.del(`push_subscriber:${subscriberId}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

async function _removeTokenIfInvalid(deviceToken: string, errCode?: string) {
  const invalid = ["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH", "NOT_FOUND"];
  if (!errCode || !invalid.includes(errCode)) return;
  const all = await getAllSubscribers();
  for (const s of all) {
    if (s.deviceToken === deviceToken) {
      await kv.del(`push_subscriber:${s.id}`);
      console.log(`🧹 Removed invalid token sub:${s.id} (${errCode})`);
    }
  }
}

// ════════════════════════════════════════════════════════════════
// 📤 LOW-LEVEL FCM SEND (HTTP v1, single token)
// ════════════════════════════════════════════════════════════════
async function _sendOneFcm(opts: {
  accessToken: string;
  projectId: string;
  deviceToken: string;
  title: string;
  body: string;
  imageUrl?: string;
  targetUrl?: string;
  data?: Record<string, string>;
}): Promise<{ ok: boolean; errorCode?: string; raw?: any }> {
  const message: any = {
    token: opts.deviceToken,
    notification: {
      title: opts.title,
      body: opts.body,
      ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
    },
    data: {
      ...(opts.data || {}),
      ...(opts.targetUrl ? { url: opts.targetUrl, click_action: opts.targetUrl } : {}),
    },
    android: {
      priority: "HIGH",
      notification: {
        sound: "default",
        channel_id: "indexpilot_default",
        ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
      },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: {
        aps: { sound: "default", "mutable-content": 1, "content-available": 1 },
        ...(opts.imageUrl ? { fcm_options: { image: opts.imageUrl } } : {}),
      },
    },
    webpush: opts.imageUrl ? { notification: { image: opts.imageUrl } } : undefined,
  };

  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${opts.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify({ message }),
    },
  );
  const j = await resp.json().catch(() => ({}));
  if (resp.ok) return { ok: true, raw: j };
  const code = j?.error?.details?.[0]?.errorCode || j?.error?.status || j?.error?.message;
  return { ok: false, errorCode: code, raw: j };
}

// ════════════════════════════════════════════════════════════════
// 🎯 PER-USER SEND  (use this from wallet / signal / ticket / order)
// ════════════════════════════════════════════════════════════════
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; imageUrl?: string; targetUrl?: string; data?: Record<string, string> },
): Promise<{ success: boolean; delivered: number; failed: number; error?: string }> {
  try {
    const subs = await getSubscribersForUser(userId);
    if (subs.length === 0) {
      // Still drop into in-app notification center
      await _saveToUserNotificationCenter(userId, payload);
      return { success: true, delivered: 0, failed: 0 };
    }
    const { token, projectId } = await _getAccessToken();
    let delivered = 0, failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        const r = await _sendOneFcm({
          accessToken: token, projectId, deviceToken: s.deviceToken,
          title: payload.title, body: payload.body, imageUrl: payload.imageUrl,
          targetUrl: payload.targetUrl, data: payload.data,
        });
        if (r.ok) delivered++;
        else { failed++; await _removeTokenIfInvalid(s.deviceToken, r.errorCode); }
      }),
    );
    await _saveToUserNotificationCenter(userId, payload);
    console.log(`📤 sendPushToUser ${userId}: ${delivered} ok / ${failed} fail`);
    return { success: true, delivered, failed };
  } catch (e: any) {
    console.error("❌ sendPushToUser:", e);
    return { success: false, delivered: 0, failed: 0, error: e.message };
  }
}

async function _saveToUserNotificationCenter(
  userId: string,
  p: { title: string; body: string; imageUrl?: string; targetUrl?: string; data?: Record<string, string> },
) {
  try {
    const existing = (await kv.get(`user_notifications:${userId}`)) || [];
    const item = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: p.data?.type || "SYSTEM_ALERT",
      title: p.title,
      message: p.body,
      timestamp: Date.now(),
      read: false,
      data: { imageUrl: p.imageUrl, targetUrl: p.targetUrl, ...(p.data || {}) },
    };
    const arr = [item, ...existing].slice(0, 100);
    await kv.set(`user_notifications:${userId}`, arr);
  } catch (e) {
    console.error("❌ _saveToUserNotificationCenter:", e);
  }
}

// ════════════════════════════════════════════════════════════════
// 📣 BROADCAST  (admin manual notifications — used by /push/send)
// ════════════════════════════════════════════════════════════════
export async function sendPushNotification(data: {
  title: string;
  description: string;
  imageUrl?: string;
  targetUrl?: string;
}): Promise<{ success: boolean; notificationId?: string; totalDelivered: number; error?: string }> {
  const notificationId = `push_notif_${Date.now()}`;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: authData } = await supabase.auth.admin.listUsers();
    const ownerEmail = Deno.env.get("PLATFORM_OWNER_EMAIL") || "";
    const users = (authData?.users || []).filter((u: any) => u.email !== ownerEmail);

    const subs = await getAllSubscribers();
    let delivered = 0, failed = 0;

    if (subs.length > 0) {
      const { token, projectId } = await _getAccessToken();
      await Promise.all(
        subs.map(async (s) => {
          const r = await _sendOneFcm({
            accessToken: token, projectId, deviceToken: s.deviceToken,
            title: data.title, body: data.description,
            imageUrl: data.imageUrl, targetUrl: data.targetUrl,
            data: { type: "ADMIN_BROADCAST" },
          });
          if (r.ok) delivered++;
          else { failed++; await _removeTokenIfInvalid(s.deviceToken, r.errorCode); }
        }),
      );
    }

    // Drop in-app for every real user
    await Promise.all(users.map((u: any) =>
      _saveToUserNotificationCenter(u.id, {
        title: data.title, body: data.description,
        imageUrl: data.imageUrl, targetUrl: data.targetUrl,
        data: { type: "ADMIN_BROADCAST", fromAdmin: "true" },
      })
    ));

    const notification: PushNotification = {
      id: notificationId,
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      targetUrl: data.targetUrl,
      sentTime: new Date().toISOString(),
      totalDelivered: delivered,
      status: delivered > 0 || users.length > 0 ? "sent" : "failed",
    };
    await kv.set(`push_notification:${notificationId}`, notification);
    console.log(`📣 Broadcast: FCM ${delivered}/${subs.length} | in-app ${users.length}`);
    return { success: true, notificationId, totalDelivered: delivered };
  } catch (e: any) {
    console.error("❌ sendPushNotification:", e);
    const failedNotif: PushNotification = {
      id: notificationId, title: data.title, description: data.description,
      imageUrl: data.imageUrl, targetUrl: data.targetUrl,
      sentTime: new Date().toISOString(), totalDelivered: 0, status: "failed",
    };
    await kv.set(`push_notification:${notificationId}`, failedNotif);
    return { success: false, notificationId, totalDelivered: 0, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════
// 📊 HISTORY
// ════════════════════════════════════════════════════════════════
export async function getNotificationHistory(): Promise<PushNotification[]> {
  try {
    const results = await kv.getByPrefix("push_notification:");
    const arr = results.map((i: any) => i.value) as PushNotification[];
    return arr.sort((a, b) => new Date(b.sentTime).getTime() - new Date(a.sentTime).getTime());
  } catch (e) {
    console.error("❌ getNotificationHistory:", e);
    return [];
  }
}

export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await kv.get(`push_notification:${notificationId}`);
    if (!existing) return { success: false, error: "Notification not found" };
    await kv.del(`push_notification:${notificationId}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
