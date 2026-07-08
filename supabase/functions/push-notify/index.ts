// ═══════════════════════════════════════════════════════════════
// 🔔 PUSH NOTIFY — internal event broadcaster
//   - Targeted (userId) or broadcast FCM push
//   - Called by DB triggers via pg_net and by client/admin code
//   - Auth: shared INTERNAL_SYNC_KEY header OR admin call
// ═══════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_KEY = Deno.env.get("INTERNAL_SYNC_KEY") || "";

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "\n")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; exp: number; projectId: string } | null = null;
async function getAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not set");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) {
    return { token: cachedToken.token, projectId: cachedToken.projectId };
  }
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await resp.json();
  if (!resp.ok || !json.access_token) throw new Error(`FCM OAuth failed: ${JSON.stringify(json)}`);
  cachedToken = { token: json.access_token, exp: now + (json.expires_in || 3600), projectId: sa.project_id };
  return { token: json.access_token, projectId: sa.project_id };
}

async function sendOne(accessToken: string, projectId: string, deviceToken: string, payload: any) {
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ message: { ...payload, token: deviceToken } }),
    },
  );
  const j = await resp.json().catch(() => ({}));
  if (resp.ok) return { ok: true };
  const code = j?.error?.details?.[0]?.errorCode || j?.error?.status || j?.error?.message;
  return { ok: false, errorCode: code || "UNKNOWN", raw: j };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const providedKey = req.headers.get("x-internal-key") || "";
    const body = await req.json().catch(() => ({}));
    const { event, userId, title, body: msgBody, imageUrl, data, requireInternal } = body || {};

    // Enforce internal key for event-triggered calls
    if (requireInternal !== false) {
      if (!INTERNAL_KEY || providedKey !== INTERNAL_KEY) {
        return new Response(
          JSON.stringify({ success: false, message: "unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!title || !msgBody) {
      return new Response(
        JSON.stringify({ success: false, message: "title and body required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    let query = admin.from("kv_store_c4d79cb7").select("key, value").like("key", "push_subscriber:%");
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let subs = (rows || []).map((r: any) => ({ key: r.key, ...(r.value || {}) }));
    if (userId) subs = subs.filter((s: any) => s.userId === userId);
    if (subs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, totalSubscribers: 0, delivered: 0, event }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { token: accessToken, projectId } = await getAccessToken();

    const notification: any = { title, body: msgBody };
    if (imageUrl) notification.image = imageUrl;
    const dataPayload: Record<string, string> = { event: event || "GENERIC" };
    if (data) for (const [k, v] of Object.entries(data)) dataPayload[k] = String(v);

    const msg = {
      notification,
      data: dataPayload,
      android: {
        priority: "HIGH",
        notification: {
          sound: "default",
          channel_id: "indexpilot_default",
          ...(imageUrl ? { image: imageUrl } : {}),
        },
      },
      apns: {
        headers: { "apns-priority": "10" },
        payload: {
          aps: { sound: "default", "mutable-content": 1, "content-available": 1 },
          ...(imageUrl ? { fcm_options: { image: imageUrl } } : {}),
        },
      },
      webpush: imageUrl ? { notification: { image: imageUrl } } : undefined,
    };

    let delivered = 0, failed = 0;
    const errBreakdown: Record<string, number> = {};
    const removable = ["UNREGISTERED", "NOT_FOUND"];
    const toRemove: string[] = [];
    const results = await Promise.all(subs.map((s: any) => sendOne(accessToken, projectId, s.deviceToken, msg).then((r) => ({ r, s }))));
    for (const { r, s } of results) {
      if (r.ok) delivered++;
      else {
        failed++;
        const code = r.errorCode || "UNKNOWN";
        errBreakdown[code] = (errBreakdown[code] || 0) + 1;
        if (removable.includes(code)) toRemove.push(s.key);
      }
    }
    if (toRemove.length) await admin.from("kv_store_c4d79cb7").delete().in("key", toRemove);

    return new Response(
      JSON.stringify({ success: true, event, totalSubscribers: subs.length, delivered, failed, errBreakdown, projectId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("❌ push-notify:", e);
    return new Response(
      JSON.stringify({ success: false, message: e?.message || "internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
