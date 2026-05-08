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

// ============= PREMIUM TEMPLATE ENGINE =============
const BRAND = {
  name: "IndexPilot AI",
  primary: "#06b6d4",
  primary2: "#0891b2",
  accent: "#a855f7",
  bg: "#0a0a0f",
  card: "#111118",
  text: "#e4e4e7",
  muted: "#a1a1aa",
  green: "#10b981",
  red: "#ef4444",
  url: "https://indexpilotai.com",
  logo: "https://indexpilotai.com/logo.png",
};

function shell(title: string, bodyHtml: string, preview = ""): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Inter',-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0a0a0f">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(6,182,212,0.25)">
      <tr><td style="background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.primary2} 50%,${BRAND.accent} 100%);padding:36px 32px;text-align:center">
        <div style="display:inline-block;background:rgba(255,255,255,0.18);backdrop-filter:blur(8px);padding:10px 22px;border-radius:999px;border:1px solid rgba(255,255,255,0.3);margin-bottom:14px">
          <span style="color:#fff;font-weight:700;font-size:13px;letter-spacing:1.5px">⚡ ${BRAND.name.toUpperCase()}</span>
        </div>
        <h1 style="color:#fff;margin:8px 0 0;font-size:26px;font-weight:800;letter-spacing:-0.5px">${title}</h1>
      </td></tr>
      <tr><td style="padding:40px 36px;color:#1e293b;font-size:15px;line-height:1.7">${bodyHtml}</td></tr>
      <tr><td style="background:#f8fafc;padding:24px 32px;text-align:center;border-top:1px solid #e2e8f0">
        <p style="margin:0 0 8px;color:#64748b;font-size:13px">Need help? <a href="mailto:support@indexpilotai.com" style="color:${BRAND.primary2};text-decoration:none;font-weight:600">support@indexpilotai.com</a></p>
        <p style="margin:0;color:#94a3b8;font-size:11px">© ${new Date().getFullYear()} ${BRAND.name} · India's Premium AI Algo Trading Platform</p>
        <p style="margin:8px 0 0;color:#cbd5e1;font-size:10px">You received this because you have an account on ${BRAND.name}.</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

const btn = (href: string, label: string, color = BRAND.primary) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto"><tr><td style="background:linear-gradient(135deg,${color} 0%,${BRAND.primary2} 100%);border-radius:12px;box-shadow:0 6px 20px -4px ${color}66"><a href="${href}" style="display:inline-block;padding:14px 36px;color:#fff;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.3px">${label}</a></td></tr></table>`;

const bigCode = (code: string) =>
  `<div style="text-align:center;margin:28px 0"><div style="display:inline-block;background:linear-gradient(135deg,#f0f9ff 0%,#faf5ff 100%);border:2px dashed ${BRAND.primary};padding:20px 36px;border-radius:16px"><div style="font-family:'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:10px;background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.accent} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">${code}</div></div></div>`;

const stat = (label: string, value: string, color = BRAND.primary2) =>
  `<tr><td style="padding:10px 14px;background:#f8fafc;border-radius:8px;border-left:4px solid ${color}"><div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600">${label}</div><div style="color:#0f172a;font-size:18px;font-weight:700;margin-top:2px">${value}</div></td></tr><tr><td style="height:8px"></td></tr>`;

// ============= TEMPLATES =============
type TplData = Record<string, any>;

const TEMPLATES: Record<string, (d: TplData) => { subject: string; html: string }> = {
  welcome: (d) => ({
    subject: `🎉 Welcome to ${BRAND.name}, ${d.name || "Trader"}!`,
    html: shell(
      `Welcome aboard! 🚀`,
      `<p style="font-size:17px;margin:0 0 8px"><b>Hi ${d.name || "Trader"},</b></p>
       <p>Your <b>${BRAND.name}</b> account is live. You now have access to India's most advanced AI-powered algo trading platform.</p>
       <table width="100%" style="margin:24px 0">
         ${stat("Your Client ID", d.clientId || "—")}
         ${stat("Your Referral Code", d.referralCode || "—", BRAND.accent)}
         ${stat("Account Email", d.email || "—", BRAND.green)}
       </table>
       <p>Quick wins to get started:</p>
       <ul style="padding-left:20px;color:#334155">
         <li>Connect your broker (Dhan supported)</li>
         <li>Add your favourite index symbols</li>
         <li>Activate AI signals for NIFTY / BANKNIFTY / SENSEX</li>
         <li>Share your referral code & earn rewards</li>
       </ul>
       ${btn(d.dashboardUrl || `${BRAND.url}/dashboard`, "🚀 Open Dashboard")}
       <p style="font-size:13px;color:#64748b;text-align:center;margin-top:24px">Questions? Just reply to this email — we read every message.</p>`,
      `Welcome to ${BRAND.name}! Your AI trading account is ready.`
    ),
  }),

  otp: (d) => ({
    subject: `🔐 Your ${BRAND.name} verification code: ${d.code}`,
    html: shell(
      `Verify your account 🔐`,
      `<p>Hi <b>${d.name || "there"}</b>,</p>
       <p>Use the code below to verify your account. This code is valid for <b>${d.expiryMinutes || 10} minutes</b>.</p>
       ${bigCode(d.code || "------")}
       <p style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:8px;color:#78350f;font-size:13px">
       ⚠️ <b>Security tip:</b> Never share this code with anyone. ${BRAND.name} staff will never ask for your OTP.</p>
       <p style="font-size:13px;color:#64748b">If you didn't request this, you can safely ignore this email.</p>`,
      `Your verification code: ${d.code}`
    ),
  }),

  password_reset: (d) => ({
    subject: `🔑 ${BRAND.name} password reset code`,
    html: shell(
      `Password reset request 🔑`,
      `<p>Hi <b>${d.name || "there"}</b>,</p>
       <p>We received a request to reset your password. Use this code to continue:</p>
       ${bigCode(d.code || "------")}
       <p style="background:#fee2e2;border-left:4px solid ${BRAND.red};padding:12px 16px;border-radius:8px;color:#7f1d1d;font-size:13px">
       🛡️ If you did not request a password reset, please secure your account immediately and contact support.</p>
       ${d.ip ? `<p style="font-size:12px;color:#94a3b8">Request IP: ${d.ip}</p>` : ""}`,
      `Reset code: ${d.code}`
    ),
  }),

  password_changed: (d) => ({
    subject: `✅ Your ${BRAND.name} password was changed`,
    html: shell(
      `Password updated ✅`,
      `<p>Hi <b>${d.name || "there"}</b>,</p>
       <p>Your password was changed successfully on <b>${new Date().toLocaleString("en-IN")}</b>.</p>
       ${btn(`${BRAND.url}/login`, "Sign in now", BRAND.green)}
       <p style="background:#fee2e2;border-left:4px solid ${BRAND.red};padding:12px;border-radius:8px;color:#7f1d1d;font-size:13px">If this wasn't you, contact support immediately.</p>`
    ),
  }),

  wallet_recharge: (d) => ({
    subject: `💰 Wallet recharged: ₹${d.amount}`,
    html: shell(
      `Payment Received 💰`,
      `<p>Hi <b>${d.name || "Trader"}</b>,</p>
       <p>Your wallet has been credited successfully.</p>
       <table width="100%" style="margin:20px 0">
         ${stat("Amount Credited", `₹${Number(d.amount || 0).toLocaleString("en-IN")}`, BRAND.green)}
         ${stat("New Balance", `₹${Number(d.balance || 0).toLocaleString("en-IN")}`)}
         ${stat("Transaction ID", d.txnId || "—", BRAND.accent)}
         ${stat("Payment Method", d.method || "Razorpay")}
       </table>
       ${btn(`${BRAND.url}/wallet`, "View Wallet")}`,
      `₹${d.amount} credited to your wallet`
    ),
  }),

  subscription: (d) => ({
    subject: `🌟 ${d.plan || "Premium"} plan activated!`,
    html: shell(
      `Premium Activated 🌟`,
      `<p>Hi <b>${d.name || "Trader"}</b>,</p>
       <p>Your <b>${d.plan || "Premium"}</b> plan is now active. All advanced features are unlocked.</p>
       <table width="100%" style="margin:20px 0">
         ${stat("Plan", d.plan || "Premium", BRAND.accent)}
         ${stat("Amount Paid", `₹${Number(d.amount || 0).toLocaleString("en-IN")}`, BRAND.green)}
         ${stat("Valid Until", d.expiry || "—")}
         ${stat("Invoice ID", d.invoiceId || "—")}
       </table>
       ${btn(`${BRAND.url}/dashboard`, "Explore Premium Features")}`,
      `${d.plan} activated`
    ),
  }),

  buy_call: (d) => ({
    subject: `🟢 BUY CALL Signal: ${d.symbol}`,
    html: shell(
      `🟢 BUY CALL — ${d.symbol || ""}`,
      `<div style="background:linear-gradient(135deg,#dcfce7 0%,#bbf7d0 100%);padding:18px;border-radius:12px;border-left:6px solid ${BRAND.green};margin-bottom:20px">
         <div style="font-size:13px;color:#166534;font-weight:600;letter-spacing:1px">BULLISH SIGNAL DETECTED</div>
         <div style="font-size:24px;font-weight:800;color:#14532d;margin-top:4px">${d.symbol || "—"}</div>
       </div>
       <table width="100%" style="margin:16px 0">
         ${stat("Entry Price", `₹${d.entry || "—"}`, BRAND.green)}
         ${stat("Target", `₹${d.target || "—"}`, BRAND.primary)}
         ${stat("Stop Loss", `₹${d.sl || "—"}`, BRAND.red)}
         ${stat("AI Confidence", `${d.confidence || 0}%`, BRAND.accent)}
         ${stat("Timeframe", d.timeframe || "Intraday")}
         ${stat("Risk Level", d.risk || "Medium")}
       </table>
       ${btn(`${BRAND.url}/dashboard`, "View Live Signal", BRAND.green)}
       <p style="font-size:12px;color:#94a3b8;text-align:center">⚠️ Trading involves risk. Past performance is not indicative of future results.</p>`,
      `BUY CALL ${d.symbol} @ ₹${d.entry}`
    ),
  }),

  buy_put: (d) => ({
    subject: `🔴 BUY PUT Signal: ${d.symbol}`,
    html: shell(
      `🔴 BUY PUT — ${d.symbol || ""}`,
      `<div style="background:linear-gradient(135deg,#fee2e2 0%,#fecaca 100%);padding:18px;border-radius:12px;border-left:6px solid ${BRAND.red};margin-bottom:20px">
         <div style="font-size:13px;color:#991b1b;font-weight:600;letter-spacing:1px">BEARISH SIGNAL DETECTED</div>
         <div style="font-size:24px;font-weight:800;color:#7f1d1d;margin-top:4px">${d.symbol || "—"}</div>
       </div>
       <table width="100%" style="margin:16px 0">
         ${stat("Entry Price", `₹${d.entry || "—"}`, BRAND.red)}
         ${stat("Target", `₹${d.target || "—"}`, BRAND.primary)}
         ${stat("Stop Loss", `₹${d.sl || "—"}`, BRAND.green)}
         ${stat("AI Confidence", `${d.confidence || 0}%`, BRAND.accent)}
         ${stat("Timeframe", d.timeframe || "Intraday")}
         ${stat("Risk Level", d.risk || "Medium")}
       </table>
       ${btn(`${BRAND.url}/dashboard`, "View Live Signal", BRAND.red)}`,
      `BUY PUT ${d.symbol} @ ₹${d.entry}`
    ),
  }),

  trade_exit: (d) => ({
    subject: `${(d.pnl || 0) >= 0 ? "✅" : "❌"} Trade Exited: ${d.symbol}`,
    html: shell(
      `Trade Closed`,
      `<p>Your position in <b>${d.symbol}</b> has been closed.</p>
       <table width="100%" style="margin:16px 0">
         ${stat("Symbol", d.symbol || "—")}
         ${stat("Entry → Exit", `₹${d.entry || "—"} → ₹${d.exit || "—"}`)}
         ${stat("P&L", `₹${Number(d.pnl || 0).toLocaleString("en-IN")}`, (d.pnl || 0) >= 0 ? BRAND.green : BRAND.red)}
         ${stat("Exit Reason", d.reason || "Target hit")}
       </table>`
    ),
  }),

  ticket_created: (d) => ({
    subject: `🎫 Support Ticket #${d.ticketId} received`,
    html: shell(
      `Ticket Received 🎫`,
      `<p>Hi <b>${d.name || "there"}</b>,</p>
       <p>We've received your support request. Our team usually replies within <b>4–6 hours</b>.</p>
       <table width="100%" style="margin:16px 0">
         ${stat("Ticket ID", `#${d.ticketId || "—"}`, BRAND.accent)}
         ${stat("Subject", d.subject || "—")}
         ${stat("Status", "Waiting for Admin Reply", BRAND.primary)}
       </table>
       ${btn(`${BRAND.url}/dashboard?tab=support`, "Track Ticket")}`,
      `Ticket #${d.ticketId} received`
    ),
  }),

  ticket_reply: (d) => ({
    subject: `💬 New reply on ticket #${d.ticketId}`,
    html: shell(
      `New Reply 💬`,
      `<p>Hi <b>${d.name || "there"}</b>, our team has replied to your ticket.</p>
       <div style="background:#f1f5f9;border-left:4px solid ${BRAND.primary};padding:16px;border-radius:8px;margin:16px 0">
         <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600">Admin Reply</div>
         <div style="margin-top:6px;color:#0f172a;line-height:1.6">${d.message || ""}</div>
       </div>
       ${btn(`${BRAND.url}/dashboard?tab=support`, "View Conversation")}`,
      `Reply on ticket #${d.ticketId}`
    ),
  }),

  referral_reward: (d) => ({
    subject: `🎁 You earned ₹${d.amount} referral reward!`,
    html: shell(
      `Reward Credited 🎁`,
      `<p>Congratulations <b>${d.name || "Trader"}</b>! 🎉</p>
       <p>Your friend <b>${d.refereeName || "a new user"}</b> just joined ${BRAND.name} using your referral.</p>
       <table width="100%" style="margin:16px 0">
         ${stat("Reward Earned", `₹${Number(d.amount || 0).toLocaleString("en-IN")}`, BRAND.green)}
         ${stat("Total Referrals", `${d.totalRefs || 1}`, BRAND.accent)}
         ${stat("Total Earned", `₹${Number(d.totalEarned || 0).toLocaleString("en-IN")}`)}
       </table>
       ${btn(`${BRAND.url}/dashboard?tab=profile`, "Share & Earn More")}`,
      `₹${d.amount} referral reward credited`
    ),
  }),

  test: (d) => ({
    subject: `✅ ${BRAND.name} — Email Integration Test Successful`,
    html: shell(
      `Integration Successful ✅`,
      `<p>Hi <b>${d.name || "Admin"}</b>,</p>
       <p>This is an automated test email confirming that your <b>Brevo + ${BRAND.name}</b> communication system is working perfectly.</p>
       <table width="100%" style="margin:20px 0">
         ${stat("Provider", "Brevo HTTP API ✓", BRAND.green)}
         ${stat("Status", "Connected & Verified", BRAND.green)}
         ${stat("Email Service", "Active ✓", BRAND.primary)}
         ${stat("Sent At", new Date().toLocaleString("en-IN"))}
       </table>
       <p>You can now send transactional emails for:</p>
       <ul style="color:#334155">
         <li>✅ Welcome & onboarding</li>
         <li>✅ OTP & password reset</li>
         <li>✅ Wallet recharge & subscription receipts</li>
         <li>✅ Trade signals (Buy Call / Buy Put / Exit)</li>
         <li>✅ Support ticket notifications</li>
         <li>✅ Referral rewards</li>
       </ul>
       ${btn(`${BRAND.url}/dashboard`, "Open Platform")}`,
      `Brevo email integration is working`
    ),
  }),
};

// ============= BREVO SENDER =============
async function sendViaBrevo(p: {
  to: string; name?: string; subject: string; html: string;
  fromEmail: string; fromName: string; replyTo?: string;
}) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: p.fromEmail, name: p.fromName },
      to: [{ email: p.to, name: p.name || p.to }],
      subject: p.subject,
      htmlContent: p.html,
      replyTo: p.replyTo ? { email: p.replyTo } : undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${JSON.stringify(data)}`);
  return data?.messageId || null;
}

// ============= HANDLER =============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  try {
    // GET /status — public health check
    if (req.method === "GET" && url.pathname.endsWith("/status")) {
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
    const { template, to, name, data = {}, userId, channel = "email", subject: customSubject, html: customHtml } = body;

    if (!to) return new Response(JSON.stringify({ error: "Recipient (to) required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Load admin settings
    const { data: settings } = await supabase.from("communication_settings").select("*").eq("id", 1).maybeSingle();
    const s = settings || { email_enabled: true, sms_enabled: false, whatsapp_enabled: false, from_email: "noreply@indexpilotai.com", from_name: BRAND.name };

    // Channel gating
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

    // Resolve template
    let subject = customSubject || "";
    let html = customHtml || "";
    if (template && TEMPLATES[template]) {
      const r = TEMPLATES[template]({ name, ...data });
      subject = r.subject; html = r.html;
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
        to, name, subject, html, fromEmail: s.from_email, fromName: s.from_name, replyTo: s.reply_to || undefined,
      });
      if (logRow?.id) {
        await supabase.from("email_logs").update({ status: "sent", provider_message_id: messageId }).eq("id", logRow.id);
      }
      return new Response(JSON.stringify({ ok: true, messageId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (err: any) {
      if (logRow?.id) {
        await supabase.from("email_logs").update({ status: "failed", error: String(err?.message || err) }).eq("id", logRow.id);
      }
      throw err;
    }
  } catch (err: any) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
