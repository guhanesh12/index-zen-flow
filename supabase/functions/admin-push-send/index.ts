// ═══════════════════════════════════════════════════════════════
// 🔔 ADMIN PUSH SEND — lightweight standalone edge function
//   Fixes WORKER_RESOURCE_LIMIT on the monolith by isolating FCM logic.
//   - Broadcasts to all push_subscriber:* rows in kv_store_c4d79cb7
//   - Uses FCM HTTP v1 + service account JWT (RS256)
//   - Auto-removes UNREGISTERED / INVALID tokens
//   - Stores history in push_notification:* KV rows
// ═══════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON secret not set");
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
  if (!resp.ok || !json.access_token) {
    throw new Error(`FCM OAuth failed: ${JSON.stringify(json)}`);
  }
  cachedToken = {
    token: json.access_token,
    exp: now + (json.expires_in || 3600),
    projectId: sa.project_id,
  };
  return { token: json.access_token, projectId: sa.project_id };
}

async function sendOneFcm(opts: {
  accessToken: string;
  projectId: string;
  deviceToken: string;
  title: string;
  body: string;
  imageUrl?: string;
  targetUrl?: string;
}): Promise<{ ok: boolean; errorCode?: string; raw?: any }> {
  const message: any = {
    token: opts.deviceToken,
    notification: {
      title: opts.title,
      body: opts.body,
      ...(opts.imageUrl ? { image: opts.imageUrl } : {}),
    },
    data: {
      type: "ADMIN_BROADCAST",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, description, imageUrl, targetUrl } = await req.json();
    if (!title || !description) {
      return new Response(
        JSON.stringify({ success: false, message: "title and description are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Load all push subscribers from KV store
    const { data: subRows, error: subErr } = await admin
      .from("kv_store_c4d79cb7")
      .select("key, value")
      .like("key", "push_subscriber:%");
    if (subErr) throw new Error(`Load subscribers failed: ${subErr.message}`);

    const subs = (subRows || []).map((r: any) => ({ key: r.key, ...(r.value || {}) }));
    const notificationId = `push_notif_${Date.now()}`;
    let delivered = 0;
    let failed = 0;
    // Only delete on codes that mean the token itself is gone — NOT on config issues
    const removableCodes = ["UNREGISTERED", "NOT_FOUND"];
    const invalidKeys: string[] = [];
    const errorBreakdown: Record<string, number> = {};
    let saProjectId = "unknown";

    if (subs.length > 0) {
      const { token, projectId } = await getAccessToken();
      saProjectId = projectId;
      const results = await Promise.all(
        subs.map((s: any) =>
          sendOneFcm({
            accessToken: token,
            projectId,
            deviceToken: s.deviceToken,
            title,
            body: description,
            imageUrl,
            targetUrl,
          }).then((r) => ({ r, s })),
        ),
      );
      for (const { r, s } of results) {
        if (r.ok) delivered++;
        else {
          failed++;
          const code = r.errorCode || "UNKNOWN";
          errorBreakdown[code] = (errorBreakdown[code] || 0) + 1;
          if (removableCodes.includes(code)) invalidKeys.push(s.key);
          // Log first few failures with raw body for debugging
          if (failed <= 3) {
            console.error(`❌ FCM fail [${code}] token=${(s.deviceToken || "").slice(0, 20)}…`, JSON.stringify(r.raw));
          }
        }
      }
      // Clean truly-invalid tokens only
      if (invalidKeys.length > 0) {
        await admin.from("kv_store_c4d79cb7").delete().in("key", invalidKeys);
        console.log(`🧹 Removed ${invalidKeys.length} truly-invalid FCM tokens (UNREGISTERED/NOT_FOUND)`);
      }
    }

    // Save history record
    const history = {
      id: notificationId,
      title,
      description,
      imageUrl: imageUrl || null,
      targetUrl: targetUrl || null,
      sentTime: new Date().toISOString(),
      totalDelivered: delivered,
      totalFailed: failed,
      totalSubscribers: subs.length,
      errorBreakdown,
      serviceAccountProjectId: saProjectId,
      status: delivered > 0 ? "sent" : subs.length === 0 ? "sent" : "failed",
    };
    await admin
      .from("kv_store_c4d79cb7")
      .upsert({ key: `push_notification:${notificationId}`, value: history });

    console.log(
      `📣 Broadcast: ${delivered}/${subs.length} delivered, ${failed} failed | ` +
      `SA project=${saProjectId} | errors=${JSON.stringify(errorBreakdown)}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        notificationId,
        totalDelivered: delivered,
        totalFailed: failed,
        totalSubscribers: subs.length,
        errorBreakdown,
        serviceAccountProjectId: saProjectId,
        hint:
          failed > 0 && delivered === 0 && errorBreakdown["SENDER_ID_MISMATCH"]
            ? `All tokens rejected with SENDER_ID_MISMATCH — your FIREBASE_SERVICE_ACCOUNT_JSON is for project "${saProjectId}" but tokens were registered against a different Firebase project. Re-upload the service account JSON from the SAME Firebase project as your web + mobile apps (indexpilotai-e1106).`
            : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("❌ admin-push-send error:", e);
    return new Response(
      JSON.stringify({ success: false, message: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
