// Daily ₹5 wallet auto-debit for users who opted-in to email signal alerts.
// Promo email to users who have it OFF (max once per day).
// Designed to run via pg_cron at ~3:35 PM IST (10:05 UTC) on trading days.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAILY_FEE = 5;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const todayIST = () => {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
};

async function kvGet(key: string) {
  const { data } = await supabase.from("kv_store_c4d79cb7").select("value").eq("key", key).maybeSingle();
  return data?.value;
}
async function kvSet(key: string, value: any) {
  await supabase.from("kv_store_c4d79cb7").upsert({ key, value });
}

async function sendMail(template: string, to: string, userId: string, data: any = {}) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ to, userId, template, data, channel: "email" }),
    });
  } catch (e) { console.warn("[billing] mail fail", e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const date = todayIST();
  const summary = { date, debited: 0, skipped_no_balance: 0, skipped_no_engine: 0, promo_sent: 0, errors: 0 };

  try {
    // 1) Users who have email notifications ON
    const { data: optedIn } = await supabase
      .from("notification_preferences")
      .select("user_id, email_enabled")
      .eq("email_enabled", true);

    for (const row of optedIn || []) {
      const userId = row.user_id;
      try {
        // Skip if already billed today (unique constraint also protects)
        const { data: existing } = await supabase
          .from("notification_billing_log")
          .select("id").eq("user_id", userId).eq("billed_date", date).maybeSingle();
        if (existing) continue;

        // Only debit if engine actually ran today (any signal/trade activity)
        const engineActive = await kvGet(`engine_running:${userId}`);
        const lastRun = await kvGet(`engine_last_run_date:${userId}`);
        const ranToday = engineActive === true || lastRun === date;
        if (!ranToday) {
          summary.skipped_no_engine++;
          continue;
        }

        const wallet = (await kvGet(`wallet:${userId}`)) || { balance: 0 };
        const bal = Number(wallet.balance || 0);
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        const email = user?.email;

        if (bal < DAILY_FEE) {
          // Auto-disable to stop accruing & notify
          await supabase.from("notification_preferences")
            .update({ email_enabled: false, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
          await supabase.from("notification_billing_log").insert({
            user_id: userId, billed_date: date, amount: 0, status: "insufficient",
            note: `Balance ₹${bal} < ₹${DAILY_FEE}. Notifications auto-disabled.`,
          });
          if (email) await sendMail("notification", email, userId, {
            subject: "Email alerts paused – low wallet balance",
            heading: "Action needed",
            message: `Your wallet balance (₹${bal}) is below the daily ₹${DAILY_FEE} alert fee. Email signal alerts have been paused. Top-up your wallet and re-enable from your Profile to resume.`,
          });
          summary.skipped_no_balance++;
          continue;
        }

        const newBal = bal - DAILY_FEE;
        await kvSet(`wallet:${userId}`, { ...wallet, balance: newBal });

        // Wallet transactions ledger (KV) for backwards compat
        const txns = (await kvGet(`wallet_transactions:${userId}`)) || [];
        txns.push({
          id: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          userId, type: "debit", amount: DAILY_FEE, balance: newBal,
          timestamp: new Date().toISOString(),
          description: `Daily email alert subscription (${date})`,
          source: "notification_billing",
        });
        await kvSet(`wallet_transactions:${userId}`, txns);

        // Persisted billing log
        await supabase.from("notification_billing_log").insert({
          user_id: userId, billed_date: date, amount: DAILY_FEE, status: "success",
          note: `Auto-debit after market close. Balance ₹${bal} → ₹${newBal}`,
        });
        await supabase.from("wallet_transactions").insert({
          user_id: userId, type: "debit", amount: DAILY_FEE,
          reference_id: `notif-${date}`, description: "Daily email alert fee",
        }).then(() => {}, () => {});

        summary.debited++;
      } catch (e) {
        console.error("[billing] user error", userId, e);
        summary.errors++;
      }
    }

    // 2) Promo to users with email_enabled = false (or no row) — once per day
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, full_name")
      .limit(5000);

    const optedSet = new Set((optedIn || []).map((r: any) => r.user_id));
    for (const p of profiles || []) {
      if (!p.email || optedSet.has(p.user_id)) continue;
      const promoKey = `promo_notif_sent:${p.user_id}:${date}`;
      const sent = await kvGet(promoKey);
      if (sent) continue;
      await sendMail("notification", p.email, p.user_id, {
        subject: "Never miss a signal – enable email alerts (₹5/day)",
        heading: "Turn on Instant Signal Alerts",
        message: `Hi ${p.full_name || "Trader"}, get every Nifty / BankNifty / Sensex signal, trade exit and daily P&L summary delivered straight to your inbox.\n\n• Just ₹5 per trading day (auto-debited from wallet only on engine days)\n• Switch OFF anytime from your Profile\n• OTP, welcome & pre-market mails always remain free\n\nOpen your Profile → toggle "Email Signal & P&L Alerts" ON.`,
      });
      await kvSet(promoKey, true);
      summary.promo_sent++;
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[billing] fatal", e);
    return new Response(JSON.stringify({ ok: false, error: e.message, summary }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
