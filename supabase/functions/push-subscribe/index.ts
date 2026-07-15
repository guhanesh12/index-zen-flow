// ═══════════════════════════════════════════════════════════════
// 🔔 PUSH SUBSCRIBE — lightweight standalone edge function
//   Stores FCM device tokens in kv_store_c4d79cb7 as push_subscriber:*
//   🔒 Requires a valid Supabase auth session. userId is derived from
//       the verified JWT, not from the request body (prevents attackers
//       from binding their device to another user's account).
// ═══════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 🔒 Verify caller. Derive userId from the JWT — never trust the body.
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token || token === ANON_KEY) {
      return new Response(
        JSON.stringify({ success: false, message: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const authClient = createClient(SUPABASE_URL, ANON_KEY || SERVICE_ROLE);
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    const authedUserId = userData?.user?.id;
    if (userErr || !authedUserId) {
      return new Response(
        JSON.stringify({ success: false, message: "unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { deviceToken, browser, device, platform } = body || {};
    if (!deviceToken) {
      return new Response(
        JSON.stringify({ success: false, message: "deviceToken required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Dedup by deviceToken — reuse existing id if same token re-registers
    const { data: existingRows } = await admin
      .from("kv_store_c4d79cb7")
      .select("key, value")
      .like("key", "push_subscriber:%");

    let subscriberId: string | null = null;
    let createdAt: string | null = null;
    for (const r of existingRows || []) {
      if ((r as any).value?.deviceToken === deviceToken) {
        subscriberId = (r as any).value?.id || (r as any).key.replace("push_subscriber:", "");
        createdAt = (r as any).value?.createdAt || null;
        break;
      }
    }
    if (!subscriberId) {
      subscriberId = `push_sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    const resolvedPlatform =
      platform ||
      (/(iPhone|iPad|iOS)/i.test(device || "")
        ? "ios"
        : /Android/i.test(device || "")
        ? "android"
        : "web");

    const subscription = {
      id: subscriberId,
      userId: authedUserId, // 🔒 always the verified caller
      deviceToken,
      browser: browser || "",
      device: device || "",
      platform: resolvedPlatform,
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("kv_store_c4d79cb7")
      .upsert({ key: `push_subscriber:${subscriberId}`, value: subscription }, { onConflict: "key" });
    if (upErr) throw new Error(upErr.message);

    console.log(`✅ Push subscriber saved (${resolvedPlatform}):`, subscriberId, "user:", authedUserId);

    return new Response(
      JSON.stringify({ success: true, subscriberId, platform: resolvedPlatform }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("❌ push-subscribe:", e);
    return new Response(
      JSON.stringify({ success: false, message: e?.message || "internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
