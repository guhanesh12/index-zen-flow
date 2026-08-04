// ═══════════════════════════════════════════════════════════════
// 🤖 AUTO NOTIFICATIONS
//   - cleanup: delete user_notifications items older than 24h
//   - market_open / market_close: send broadcast on trading days only
//   - templates read from public.auto_notification_templates
// Auth: shared INTERNAL_SYNC_KEY header (used by pg_cron)
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
const PUSH_NOTIFY_URL = `${SUPABASE_URL}/functions/v1/push-notify`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

async function isTradingDay(): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("is_trading_day");
    if (error) {
      console.error("is_trading_day rpc error:", error);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error("is_trading_day exception:", e);
    return false;
  }
}

async function cleanupOldNotifications(): Promise<{ scanned: number; trimmed: number; removed: number }> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const { data: rows, error } = await admin
    .from("kv_store_c4d79cb7")
    .select("key, value")
    .like("key", "user_notifications:%");
  if (error) throw new Error(error.message);
  let trimmed = 0, removed = 0;
  for (const r of rows || []) {
    const items = Array.isArray(r.value) ? r.value : [];
    const kept = items.filter((n: any) => (n?.timestamp || 0) >= cutoff);
    if (kept.length !== items.length) {
      trimmed++;
      removed += items.length - kept.length;
      await admin.from("kv_store_c4d79cb7").upsert({ key: r.key, value: kept }, { onConflict: "key" });
    }
  }
  return { scanned: rows?.length || 0, trimmed, removed };
}

async function loadTemplate(event: string) {
  const { data, error } = await admin
    .from("auto_notification_templates")
    .select("event, title, body, image_url, enabled")
    .eq("event", event)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function sendBroadcast(event: string) {
  const tpl = await loadTemplate(event);
  if (!tpl || !tpl.enabled) return { skipped: true, reason: "template_disabled_or_missing", event };
  const resp = await fetch(PUSH_NOTIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_KEY },
    body: JSON.stringify({
      event,
      title: tpl.title,
      body: tpl.body,
      imageUrl: tpl.image_url || undefined,
      data: { source: "auto", event },
    }),
  });
  const j = await resp.json().catch(() => ({}));
  return { ok: resp.ok, event, response: j };
}

// 💰 LOW WALLET BALANCE — notify users with balance < threshold, once per day
async function sendLowBalanceAlerts(threshold = 100) {
  const tpl = await loadTemplate("LOW_BALANCE");
  if (!tpl || !tpl.enabled) return { skipped: true, reason: "template_disabled_or_missing", event: "LOW_BALANCE" };

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); // IST date
  const { data: rows, error } = await admin
    .from("kv_store_c4d79cb7")
    .select("key, value")
    .like("key", "wallet:%");
  if (error) throw new Error(error.message);

  let sent = 0, skipped = 0;
  for (const r of rows || []) {
    const userId = String(r.key).slice("wallet:".length);
    const balance = Number((r.value as any)?.balance ?? 0);
    if (!userId || !isFinite(balance) || balance >= threshold) continue;

    const markKey = `low_balance_sent:${userId}:${today}`;
    const { data: already } = await admin
      .from("kv_store_c4d79cb7")
      .select("key")
      .eq("key", markKey)
      .maybeSingle();
    if (already) { skipped++; continue; }

    const title = String(tpl.title || "💰 Low Wallet Balance")
      .replace(/\{balance\}/g, balance.toFixed(2));
    const body = String(tpl.body || "Your balance is low. Recharge now and keep trading for profit!")
      .replace(/\{balance\}/g, balance.toFixed(2));

    await fetch(PUSH_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_KEY },
      body: JSON.stringify({
        event: "LOW_BALANCE",
        userId,
        title,
        body,
        imageUrl: tpl.image_url || undefined,
        data: { source: "auto", event: "LOW_BALANCE", balance, url: "/wallet" },
      }),
    }).catch((e) => console.error("low_balance push failed", userId, e));

    await admin.from("kv_store_c4d79cb7").upsert(
      { key: markKey, value: { sentAt: Date.now(), balance } },
      { onConflict: "key" },
    );
    sent++;
  }
  return { event: "LOW_BALANCE", threshold, scanned: rows?.length || 0, sent, skipped };
}

// 🔑 DHAN TOKEN EXPIRY — warn when token expires within `withinMinutes`, once per window
async function sendTokenExpiryAlerts(withinMinutes = 60) {
  const tplSoon = await loadTemplate("TOKEN_EXPIRING");
  const tplGone = await loadTemplate("TOKEN_EXPIRED");

  const { data: rows, error } = await admin.rpc("broker_token_expiries");
  if (error) throw new Error(error.message);

  const nowSec = Math.floor(Date.now() / 1000);
  let warned = 0, expired = 0, ok = 0, skipped = 0;

  for (const r of (rows as any[]) || []) {
    const userId = r.user_id as string;
    const exp = Number(r.exp_epoch || 0);
    if (!userId || !exp) continue;

    const minsLeft = Math.round((exp - nowSec) / 60);
    let tpl: any = null, event = "";

    if (minsLeft <= 0) { tpl = tplGone; event = "TOKEN_EXPIRED"; }
    else if (minsLeft <= withinMinutes) { tpl = tplSoon; event = "TOKEN_EXPIRING"; }
    else { ok++; continue; }

    if (!tpl || !tpl.enabled) { skipped++; continue; }

    // dedupe: one alert per user per event per token-expiry timestamp
    const markKey = `token_alert_sent:${userId}:${event}:${exp}`;
    const { data: already } = await admin
      .from("kv_store_c4d79cb7")
      .select("key")
      .eq("key", markKey)
      .maybeSingle();
    if (already) { skipped++; continue; }

    const fill = (s: string) =>
      String(s || "").replace(/\{minutes\}/g, String(Math.max(minsLeft, 0)));

    await fetch(PUSH_NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_KEY },
      body: JSON.stringify({
        event,
        userId,
        title: fill(tpl.title),
        body: fill(tpl.body),
        imageUrl: tpl.image_url || undefined,
        data: { source: "auto", event, minutesLeft: minsLeft, url: "/broker" },
      }),
    }).catch((e) => console.error("token_expiry push failed", userId, e));

    await admin.from("kv_store_c4d79cb7").upsert(
      { key: markKey, value: { sentAt: Date.now(), exp, minsLeft } },
      { onConflict: "key" },
    );

    if (event === "TOKEN_EXPIRED") expired++; else warned++;
  }

  return { event: "TOKEN_EXPIRY", withinMinutes, scanned: (rows as any[])?.length || 0, warned, expired, ok, skipped };
}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const providedKey = req.headers.get("x-internal-key") || "";
    if (!INTERNAL_KEY || providedKey !== INTERNAL_KEY) {
      return new Response(JSON.stringify({ success: false, message: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").toLowerCase();

    if (action === "cleanup") {
      const r = await cleanupOldNotifications();
      return new Response(JSON.stringify({ success: true, action, ...r }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "low_balance") {
      const threshold = Number(body?.threshold ?? 100);
      const r = await sendLowBalanceAlerts(isFinite(threshold) ? threshold : 100);
      return new Response(JSON.stringify({ success: true, action, ...r }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "token_expiry") {
      const within = Number(body?.withinMinutes ?? 60);
      const r = await sendTokenExpiryAlerts(isFinite(within) ? within : 60);
      return new Response(JSON.stringify({ success: true, action, ...r }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }




    if (action === "market_open" || action === "market_close") {
      const trading = await isTradingDay();
      if (!trading) {
        return new Response(JSON.stringify({ success: true, action, skipped: true, reason: "non_trading_day" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await sendBroadcast(action);
      return new Response(JSON.stringify({ success: true, action, ...r }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, message: "unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("❌ auto-notifications:", e);
    return new Response(JSON.stringify({ success: false, message: e?.message || "internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
