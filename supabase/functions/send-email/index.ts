// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BREVO_API_KEY = (Deno.env.get("BREVO_API_KEY") || "").trim();

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ============= INBOX-FRIENDLY TEMPLATE ENGINE =============
// Design rules to AVOID Gmail Promotions tab:
//  - No emojis or marketing words in subjects
//  - Personal "From" name (e.g. "Rahul from IndexPilot")
//  - Plain-text version always included
//  - Minimal HTML: single column, white background, no banner images,
//    no gradients, ≤1 small button, short copy (50–150 words)
//  - Transactional headers: Precedence, Auto-Submitted, X-Mailer
const BRAND = {
  name: "IndexPilot AI",
  shortName: "IndexPilot",
  url: "https://indexpilotai.com",
  supportEmail: "support@indexpilotai.com",
};

// Minimal plain-looking HTML — one column, white bg, black text, ONE link max.
function plain(bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#222222;font-size:15px;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
  <tr><td align="left" style="padding:24px 22px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td>${bodyHtml}</td></tr>
      <tr><td style="padding-top:22px;border-top:1px solid #eeeeee;color:#777777;font-size:12px;line-height:1.5">
        — ${BRAND.name} Team<br/>
        Reply to this email if you need help.
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

// Strip HTML to get a plain-text fallback (Gmail looks for text/plain part).
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ============= TEMPLATES =============
// Each returns { subject, html, text?, promotional? }
// promotional=true keeps marketing styling (Gmail can put it in Promotions, that's fine).
type TplData = Record<string, any>;
type TplResult = { subject: string; html: string; text?: string; promotional?: boolean };

const TEMPLATES: Record<string, (d: TplData) => TplResult> = {
  // -------- TRANSACTIONAL (must hit Inbox) --------
  welcome: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your ${BRAND.name} account is ready.</p>
       <p>Your client ID is <b>${d.clientId || "—"}</b>.</p>
       <p>You can sign in here: <a href="${BRAND.url}/dashboard" style="color:#1155cc">${BRAND.url}/dashboard</a></p>
       <p>If you didn't create this account, please reply to this email and we'll help.</p>`
    );
    return {
      subject: `Welcome to ${BRAND.shortName}, ${d.name || "trader"}`,
      html,
      text: htmlToText(html),
    };
  },

  otp: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your ${BRAND.shortName} verification code is:</p>
       <p style="font-size:26px;font-weight:bold;letter-spacing:4px;color:#000">${d.code || "------"}</p>
       <p>This code expires in ${d.expiryMinutes || 10} minutes. Don't share it with anyone.</p>
       <p>If you didn't request this, you can ignore this email.</p>`
    );
    return {
      subject: `Your ${BRAND.shortName} code: ${d.code || ""}`.trim(),
      html,
      text: htmlToText(html),
    };
  },

  password_reset: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>We received a request to reset your password. Use this code to continue:</p>
       <p style="font-size:26px;font-weight:bold;letter-spacing:4px;color:#000">${d.code || "------"}</p>
       <p>If you didn't request a password reset, please reply to this email so we can secure your account.</p>`
    );
    return {
      subject: `Password reset request`,
      html,
      text: htmlToText(html),
    };
  },

  password_changed: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your ${BRAND.shortName} password was changed on ${new Date().toLocaleString("en-IN")}.</p>
       <p>If this wasn't you, please reply to this email immediately.</p>`
    );
    return { subject: `Your password was changed`, html, text: htmlToText(html) };
  },

  wallet_recharge: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>We received your payment of ₹${Number(d.amount || 0).toLocaleString("en-IN")}.</p>
       <p>New wallet balance: ₹${Number(d.balance || 0).toLocaleString("en-IN")}<br/>
       Transaction ID: ${d.txnId || "—"}</p>`
    );
    return { subject: `Payment received — ₹${d.amount}`, html, text: htmlToText(html) };
  },

  wallet_debit: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>An amount of ₹${Number(d.amount || 0).toLocaleString("en-IN")} was debited from your wallet.</p>
       <p>Reason: ${d.reason || "Trading charge"}<br/>
       New balance: ₹${Number(d.balance || 0).toLocaleString("en-IN")}<br/>
       Transaction ID: ${d.txnId || "—"}</p>`
    );
    return { subject: `Wallet debit — ₹${d.amount}`, html, text: htmlToText(html) };
  },

  subscription: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your ${d.plan || "Premium"} plan is now active.</p>
       <p>Amount: ₹${Number(d.amount || 0).toLocaleString("en-IN")}<br/>
       Valid until: ${d.expiry || "—"}<br/>
       Invoice: ${d.invoiceId || "—"}</p>`
    );
    return { subject: `${d.plan || "Premium"} plan activated`, html, text: htmlToText(html) };
  },

  // Single signal — keep it personal, no banners
  buy_call: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>A new BUY CALL signal was generated for <b>${d.symbol || "—"}</b>.</p>
       <p>Entry: ₹${d.entry || "—"}<br/>
       Target: ₹${d.target || "—"}<br/>
       Stop loss: ₹${d.sl || "—"}<br/>
       AI confidence: ${d.confidence || 0}%</p>
       <p>Open your dashboard to review: ${BRAND.url}/dashboard</p>
       <p style="color:#777;font-size:12px">Trading involves risk. Review before executing.</p>`
    );
    return { subject: `Signal alert — ${d.symbol || "BUY CALL"}`, html, text: htmlToText(html) };
  },

  buy_put: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>A new BUY PUT signal was generated for <b>${d.symbol || "—"}</b>.</p>
       <p>Entry: ₹${d.entry || "—"}<br/>
       Target: ₹${d.target || "—"}<br/>
       Stop loss: ₹${d.sl || "—"}<br/>
       AI confidence: ${d.confidence || 0}%</p>
       <p>Open your dashboard to review: ${BRAND.url}/dashboard</p>
       <p style="color:#777;font-size:12px">Trading involves risk. Review before executing.</p>`
    );
    return { subject: `Signal alert — ${d.symbol || "BUY PUT"}`, html, text: htmlToText(html) };
  },

  // Combined multi-index signals — minimal text list
  signals_combined: (d) => {
    const signals = Array.isArray(d.signals) ? d.signals : [];
    const lines = signals.map((s: any) => {
      const action = s.action === "BUY_CALL" ? "BUY CALL" : "BUY PUT";
      return `• ${s.index || "—"} — ${action} · Entry ₹${s.entry || "—"} · Target ₹${s.target || "—"} · SL ₹${s.sl || "—"} · AI ${Math.round(Number(s.confidence || 0))}%`;
    }).join("<br/>");
    const headline = signals.length === 1
      ? `Signal alert — ${signals[0].index} ${signals[0].action === "BUY_CALL" ? "BUY CALL" : "BUY PUT"}`
      : `${signals.length} signals for ${d.name || "you"}`;
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>The AI engine generated the following signals at ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST:</p>
       <p>${lines || "—"}</p>
       <p>Open your dashboard: ${BRAND.url}/dashboard</p>
       <p style="color:#777;font-size:12px">Trading involves risk. Review before executing.</p>`
    );
    return { subject: headline, html, text: htmlToText(html) };
  },

  trade_exit: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your position in <b>${d.symbol || "—"}</b> was closed.</p>
       <p>Entry → Exit: ₹${d.entry || "—"} → ₹${d.exit || "—"}<br/>
       P&L: ₹${Number(d.pnl || 0).toLocaleString("en-IN")}<br/>
       Reason: ${d.reason || "Target hit"}</p>`
    );
    return { subject: `Trade closed — ${d.symbol}`, html, text: htmlToText(html) };
  },

  position_closed_profit: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your position in <b>${d.symbol || "—"}</b> closed in profit.</p>
       <p>Entry → Exit: ₹${d.entry || "—"} → ₹${d.exit || "—"}<br/>
       Quantity: ${d.qty || 1}<br/>
       Net P&L: +₹${Number(d.pnl || 0).toLocaleString("en-IN")}<br/>
       Reason: ${d.reason || "Target hit"}</p>`
    );
    return { subject: `Profit booked — ${d.symbol}`, html, text: htmlToText(html) };
  },

  position_closed_loss: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your position in <b>${d.symbol || "—"}</b> was closed at a loss.</p>
       <p>Entry → Exit: ₹${d.entry || "—"} → ₹${d.exit || "—"}<br/>
       Quantity: ${d.qty || 1}<br/>
       Net P&L: ₹${Number(d.pnl || 0).toLocaleString("en-IN")}<br/>
       Reason: ${d.reason || "Stop-loss hit"}</p>`
    );
    return { subject: `Position closed — ${d.symbol}`, html, text: htmlToText(html) };
  },

  market_closed: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>The AI engine generated a signal for <b>${d.symbol || "—"}</b>, but the order was not placed because the market is closed.</p>
       <p>Reason: ${d.reason || "Outside market hours"}<br/>
       Next session: ${d.nextSession || "Next trading day · 09:15 IST"}</p>`
    );
    return { subject: `Signal not placed — market closed`, html, text: htmlToText(html) };
  },

  daily_premarket: (d) => {
    const html = plain(
      `<p>Good morning ${d.name || "there"},</p>
       <p>Markets open at 09:15 IST today.</p>
       <p>Engine status: ${d.engineStatus || "Ready"}<br/>
       Active symbols: ${d.activeSymbols || "NIFTY · BANKNIFTY · SENSEX"}<br/>
       Wallet balance: ₹${Number(d.balance || 0).toLocaleString("en-IN")}</p>
       <p>Open dashboard: ${BRAND.url}/dashboard</p>`
    );
    return { subject: `Pre-market brief for ${new Date().toLocaleDateString("en-IN", { weekday: "long" })}`, html, text: htmlToText(html) };
  },

  engine_started: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Your trading engine is now running.</p>
       <p>Candle interval: ${d.candleInterval || "15"} min<br/>
       Active symbols: ${d.symbolCount || 0}<br/>
       Started at: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
       <p>You can stop the engine anytime from your dashboard: ${BRAND.url}/dashboard</p>`
    );
    return { subject: `Trading engine started`, html, text: htmlToText(html) };
  },

  ticket_created: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>We received your support request (ticket #${d.ticketId || "—"}).</p>
       <p>Subject: ${d.subject || "—"}<br/>
       Status: Waiting for our team's reply</p>
       <p>We usually respond within 4–6 hours.</p>`
    );
    return { subject: `Support ticket #${d.ticketId} received`, html, text: htmlToText(html) };
  },

  ticket_reply: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>Our team replied to your ticket #${d.ticketId || "—"}:</p>
       <p style="border-left:3px solid #ddd;padding:6px 12px;color:#333">${(d.message || "").toString()}</p>
       <p>You can reply here or open the ticket: ${BRAND.url}/dashboard?tab=support</p>`
    );
    return { subject: `Reply on ticket #${d.ticketId}`, html, text: htmlToText(html) };
  },

  referral_reward: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>${d.refereeName || "A new user"} just joined ${BRAND.shortName} using your referral.</p>
       <p>Reward credited: ₹${Number(d.amount || 0).toLocaleString("en-IN")}<br/>
       Total referrals: ${d.totalRefs || 1}<br/>
       Total earned: ₹${Number(d.totalEarned || 0).toLocaleString("en-IN")}</p>`
    );
    return { subject: `Referral reward credited — ₹${d.amount}`, html, text: htmlToText(html) };
  },

  // Generic notification — used for billing alerts etc. Keep simple.
  notification: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "there"},</p>
       <p>${(d.message || "").toString()}</p>`
    );
    return {
      subject: d.subject || `Notification from ${BRAND.shortName}`,
      html,
      text: htmlToText(html),
      promotional: !!d.promotional, // billing/promo notifications can be flagged
    };
  },

  test: (d) => {
    const html = plain(
      `<p>Hi ${d.name || "Admin"},</p>
       <p>This is a test email confirming your ${BRAND.name} email service is working.</p>
       <p>Sent at: ${new Date().toLocaleString("en-IN")}</p>`
    );
    return { subject: `Email integration test`, html, text: htmlToText(html) };
  },
};

// ============= BREVO SENDER =============
async function sendViaBrevo(p: {
  to: string; name?: string; subject: string; html: string; text?: string;
  fromEmail: string; fromName: string; replyTo?: string;
  promotional?: boolean;
}) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");
  console.log(`[brevo] key prefix=${BREVO_API_KEY.slice(0, 10)} len=${BREVO_API_KEY.length}`);

  // Personal-looking sender helps Inbox placement.
  const senderName = p.fromName || `Team from ${BRAND.shortName}`;

  // Transactional emails get headers that signal "1:1 system mail" to Gmail.
  // Promotional emails skip these so Gmail can route them to Promotions tab.
  const headers: Record<string, string> = p.promotional
    ? {
        "X-Mailer": `${BRAND.shortName}-Promo`,
        // List-Unsubscribe is appropriate for promo/bulk
        "List-Unsubscribe": `<mailto:unsubscribe@indexpilotai.com?subject=unsubscribe>`,
      }
    : {
        "X-Mailer": `${BRAND.shortName}-Transactional`,
        "Precedence": "transactional",
        "Auto-Submitted": "auto-generated",
      };

  const payload: any = {
    sender: { email: p.fromEmail, name: senderName },
    to: [{ email: p.to, name: p.name || p.to.split("@")[0] }],
    subject: p.subject,
    htmlContent: p.html,
    textContent: p.text || htmlToText(p.html),
    headers,
    tags: [p.promotional ? "promotional" : "transactional"],
  };
  if (p.replyTo) payload.replyTo = { email: p.replyTo, name: senderName };

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${JSON.stringify(data)}`);
  return data?.messageId || null;
}

// ============= HANDLER =============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "GET") {
      const { data: settings } = await supabase.from("communication_settings").select("*").eq("id", 1).maybeSingle();
      return new Response(JSON.stringify({
        ok: true,
        brevo_configured: !!BREVO_API_KEY,
        settings: settings || null,
        templates: Object.keys(TEMPLATES),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    let { template, to, name, data = {}, userId, channel = "email", subject: customSubject, html: customHtml } = body;

    if (!to && !userId) return new Response(JSON.stringify({ error: "Recipient (to) or userId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Auto-fetch profile for personalisation
    try {
      let profile: any = null;
      if (userId) {
        const { data: p } = await supabase.from("profiles").select("user_id, full_name, client_id, email").eq("user_id", userId).maybeSingle();
        profile = p;
      } else if (to) {
        const { data: p } = await supabase.from("profiles").select("user_id, full_name, client_id, email").eq("email", to).maybeSingle();
        profile = p;
        if (p?.user_id) userId = p.user_id;
      }
      if (profile) {
        if (!to) to = profile.email;
        if (!name) name = profile.full_name || (profile.email ? profile.email.split("@")[0] : "trader");
        data = { name: data.name || profile.full_name || name, clientId: data.clientId || profile.client_id, email: data.email || profile.email, ...data };
        if (!data.clientId && profile.client_id) data.clientId = profile.client_id;
      }
    } catch (e) { console.warn("[send-email] profile lookup failed", e); }

    if (!to) return new Response(JSON.stringify({ error: "Could not resolve recipient email" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settings } = await supabase.from("communication_settings").select("*").eq("id", 1).maybeSingle();
    const s = settings || { email_enabled: true, sms_enabled: false, whatsapp_enabled: false, from_email: "noreply@indexpilotai.com", from_name: BRAND.name };

    if (channel === "email" && !s.email_enabled) {
      await supabase.from("email_logs").insert({ user_id: userId || null, recipient: to, template: template || "custom", channel, status: "skipped", error: "Email disabled by admin" });
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: "email_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (channel === "sms" && !s.sms_enabled) {
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: "sms_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (channel === "whatsapp" && !s.whatsapp_enabled) {
      return new Response(JSON.stringify({ ok: false, skipped: true, reason: "whatsapp_disabled" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ALWAYS_ON = new Set([
      "otp", "password_reset", "password_changed",
      "welcome", "daily_premarket", "engine_started",
      "test",
    ]);

    if (channel === "email" && userId && template && !ALWAYS_ON.has(template)) {
      try {
        const { data: userPrefs } = await supabase
          .from("notification_preferences")
          .select("email_enabled, trade_alerts")
          .eq("user_id", userId)
          .maybeSingle();
        if (userPrefs && userPrefs.email_enabled === false) {
          await supabase.from("email_logs").insert({
            user_id: userId, recipient: to, template, channel,
            status: "skipped", error: "User disabled notification emails",
          });
          return new Response(JSON.stringify({ ok: false, skipped: true, reason: "user_email_off" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch (e) { console.warn("[send-email] user prefs lookup failed", e); }
    }

    // Resolve template
    let subject = customSubject || "";
    let html = customHtml || "";
    let text: string | undefined = undefined;
    let promotional = false;
    if (template && TEMPLATES[template]) {
      const r = TEMPLATES[template]({ name, ...data });
      subject = r.subject; html = r.html; text = r.text; promotional = !!r.promotional;
    }
    if (!subject || !html) {
      return new Response(JSON.stringify({ error: "Provide a valid template name or both subject+html" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pre-log
    const { data: logRow } = await supabase.from("email_logs").insert({
      user_id: userId || null, recipient: to, template: template || "custom", subject, channel, status: "pending", metadata: data,
    }).select("id").maybeSingle();

    try {
      const messageId = await sendViaBrevo({
        to, name, subject, html, text,
        fromEmail: s.from_email, fromName: s.from_name, replyTo: s.reply_to || undefined,
        promotional,
      });
      if (logRow?.id) {
        await supabase.from("email_logs").update({ status: "sent", provider_message_id: messageId }).eq("id", logRow.id);
      }
      return new Response(JSON.stringify({ ok: true, messageId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err: any) {
      if (logRow?.id) {
        await supabase.from("email_logs").update({ status: "failed", error: String(err?.message || err) }).eq("id", logRow.id);
      }
      return new Response(JSON.stringify({ ok: false, error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
