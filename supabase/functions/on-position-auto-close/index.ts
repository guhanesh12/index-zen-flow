// @ts-nocheck
// Triggered by DB trigger `trg_position_auto_close_engine_off` on
// position_monitor_state UPDATE (is_active -> false, non-manual exit).
// Actions: (1) set trading_engine_state.is_running = false,
//          (2) clear KV engine_running:<uid>,
//          (3) send branded email via send-email (position_auto_close template).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_KEY = (Deno.env.get("INTERNAL_SYNC_KEY") || "").trim();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Auth: internal shared secret OR service_role bearer only.
  const providedInternal = req.headers.get("x-internal-key") || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const isInternal = INTERNAL_KEY && providedInternal === INTERNAL_KEY;
  const isService = bearer && bearer === SERVICE_KEY;
  if (!isInternal && !isService) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const user_id = (body.user_id || "").toString();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const symbol = body.symbol || "";
    const pnl = Number(body.pnl || 0);
    const exit_reason = body.exit_reason || "auto_exit";

    // 1) Engine OFF
    const stoppedReason = `Auto engine off: position auto-closed (${exit_reason})`;
    await supabase.from("trading_engine_state").update({
      is_running: false,
      stopped_at: new Date().toISOString(),
      stopped_reason: stoppedReason,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user_id);

    // 2) KV mirror off
    await supabase.from("kv_store_c4d79cb7").upsert({
      key: `engine_running:${user_id}`,
      value: false,
    });

    // 3) Resolve email & send branded mail (best-effort)
    let email: string | null = null;
    let fullName: string | null = null;
    try {
      const { data: prof } = await supabase.from("profiles")
        .select("email, full_name")
        .eq("user_id", user_id).maybeSingle();
      email = prof?.email || null;
      fullName = prof?.full_name || null;
    } catch (_) { /* ignore */ }

    let mailStatus: any = { skipped: true };
    if (email) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-key": INTERNAL_KEY,
          },
          body: JSON.stringify({
            template: "position_auto_close",
            to: email,
            userId: user_id,
            name: fullName || undefined,
            data: {
              name: fullName || undefined,
              symbol,
              entry_price: body.entry_price,
              exit_price: body.exit_price,
              pnl,
              quantity: body.quantity,
              exit_reason,
              order_id: body.order_id,
            },
          }),
        });
        mailStatus = await r.json().catch(() => ({ ok: r.ok }));
      } catch (e) {
        mailStatus = { ok: false, error: String(e?.message || e) };
      }
    }

    return new Response(JSON.stringify({ ok: true, engine_off: true, email: mailStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[on-position-auto-close] fatal", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
