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

// Premium-but-inbox-safe HTML wrapper.
// Design: white bg, single 600px column, slim navy header strip with brand
// wordmark (text, no images = no banner penalty), gold accent rule,
// content card with system font, one optional CTA button, branded footer.
// Avoids: gradients, banner images, multi-column, tracking pixels, emojis,
// "click here" buttons, marketing words.
function btn(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0">
    <tr><td bgcolor="#0B1E3F" style="border-radius:6px">
      <a href="${href}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">${label}</a>
    </td></tr>
  </table>`;
}
function plain(bodyHtml: string, opts: { preheader?: string } = {}): string {
  const pre = opts.preheader || "";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${BRAND.name}</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e6e8ec;border-radius:10px;overflow:hidden">
      <tr><td style="background:#0B1E3F;padding:18px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.3px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
              IndexPilot<span style="color:#F4B400">·</span>AI
            </td>
            <td align="right" style="color:#9aa7c2;font-size:12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
              ${new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="height:3px;background:#F4B400;line-height:3px;font-size:0">&nbsp;</td></tr>
      <tr><td style="padding:28px 32px 12px 32px;color:#1a1a1a;font-size:15px;line-height:1.65">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 32px 24px 32px;border-top:1px solid #eef0f3;color:#6b7280;font-size:12.5px;line-height:1.55">
        Need help? Just reply to this email — a real person from our team will respond.<br/>
        <span style="color:#9aa1ad">— ${BRAND.name} Team</span>
      </td></tr>
    </table>
    <div style="max-width:600px;margin:14px auto 0;color:#9aa1ad;font-size:11.5px;line-height:1.5;text-align:center;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
      ${BRAND.name} · <a href="${BRAND.url}" style="color:#9aa1ad;text-decoration:underline">indexpilotai.com</a> · <a href="mailto:${BRAND.supportEmail}" style="color:#9aa1ad;text-decoration:underline">${BRAND.supportEmail}</a><br/>
      You're receiving this because you have an account with us.
    </div>
  </td></tr>
</table></body></html>`;
}

// Highlighted code/amount block (used for OTP, amounts)
function codeBox(value: string, label?: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0">
    <tr><td style="background:#f7f9fc;border:1px solid #e3e8f0;border-radius:8px;padding:14px 22px;text-align:center">
      ${label ? `<div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">${label}</div>` : ""}
      <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:26px;font-weight:700;letter-spacing:6px;color:#0B1E3F">${value}</div>
    </td></tr>
  </table>`;
}

// Key/value detail rows (used for transaction/signal details)
function details(rows: Array<[string, string]>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border:1px solid #eef0f3;border-radius:8px;overflow:hidden">
    ${rows.map(([k,v], i) => `<tr style="background:${i%2?'#fafbfc':'#ffffff'}">
      <td style="padding:10px 16px;color:#6b7280;font-size:13px;width:42%">${k}</td>
      <td style="padding:10px 16px;color:#1a1a1a;font-size:14px;font-weight:600">${v}</td>
    </tr>`).join("")}
  </table>`;
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
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Welcome aboard, ${d.name || "trader"}</h2>
       <p style="margin:0 0 12px">Your ${BRAND.name} account is set up and ready to go.</p>
       ${details([["Client ID", d.clientId || "—"], ["Email", d.email || d.to || "—"]])}
       ${btn("Open your dashboard", `${BRAND.url}/dashboard`)}
       <p style="margin:14px 0 0;color:#6b7280;font-size:13px">If you didn't create this account, just reply and we'll help.</p>`,
      { preheader: `Your ${BRAND.shortName} account is ready` }
    );
    return { subject: `Welcome to ${BRAND.shortName}, ${d.name || "trader"}`, html, text: htmlToText(html) };
  },

  otp: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Verify your email</h2>
       <p style="margin:0 0 6px">Hi ${d.name || "there"}, use the code below to continue:</p>
       ${codeBox(d.code || "------", "Verification code")}
       <p style="margin:0 0 6px;color:#6b7280;font-size:13px">This code expires in ${d.expiryMinutes || 10} minutes. Don't share it with anyone.</p>
       <p style="margin:14px 0 0;color:#6b7280;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`,
      { preheader: `Your code: ${d.code || ""}` }
    );
    return { subject: `Your ${BRAND.shortName} code: ${d.code || ""}`.trim(), html, text: htmlToText(html) };
  },

  password_reset: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Reset your password</h2>
       <p style="margin:0 0 6px">Hi ${d.name || "there"}, use this code to reset your password:</p>
       ${codeBox(d.code || "------", "Reset code")}
       <p style="margin:14px 0 0;color:#6b7280;font-size:13px">If you didn't request this, please reply so we can secure your account.</p>`,
      { preheader: "Password reset code inside" }
    );
    return { subject: `Password reset request`, html, text: htmlToText(html) };
  },

  password_changed: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Password updated</h2>
       <p>Hi ${d.name || "there"},</p>
       <p>Your ${BRAND.shortName} password was changed on <b>${new Date().toLocaleString("en-IN")}</b>.</p>
       <p style="color:#6b7280;font-size:13px">If this wasn't you, reply to this email immediately.</p>`
    );
    return { subject: `Your password was changed`, html, text: htmlToText(html) };
  },

  wallet_recharge: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Payment received</h2>
       <p>Hi ${d.name || "there"}, we've credited your wallet.</p>
       ${codeBox(`₹${Number(d.amount || 0).toLocaleString("en-IN")}`, "Amount credited")}
       ${details([["New balance", `₹${Number(d.balance || 0).toLocaleString("en-IN")}`], ["Transaction ID", d.txnId || "—"], ["Date", new Date().toLocaleString("en-IN")]])}
       ${btn("View wallet", `${BRAND.url}/dashboard?tab=wallet`)}`,
      { preheader: `₹${d.amount} credited to your wallet` }
    );
    return { subject: `Payment received — ₹${d.amount}`, html, text: htmlToText(html) };
  },

  wallet_debit: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Wallet debit</h2>
       <p>Hi ${d.name || "there"}, an amount was debited from your wallet.</p>
       ${codeBox(`₹${Number(d.amount || 0).toLocaleString("en-IN")}`, "Amount debited")}
       ${details([["Reason", d.reason || "Trading charge"], ["New balance", `₹${Number(d.balance || 0).toLocaleString("en-IN")}`], ["Transaction ID", d.txnId || "—"], ["Date", new Date().toLocaleString("en-IN")]])}`,
      { preheader: `₹${d.amount} debited from your wallet` }
    );
    return { subject: `Wallet debit — ₹${d.amount}`, html, text: htmlToText(html) };
  },

  subscription: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">${d.plan || "Premium"} plan activated</h2>
       <p>Hi ${d.name || "there"}, your subscription is now active.</p>
       ${details([["Plan", d.plan || "Premium"], ["Amount", `₹${Number(d.amount || 0).toLocaleString("en-IN")}`], ["Valid until", d.expiry || "—"], ["Invoice", d.invoiceId || "—"]])}
       ${btn("Open dashboard", `${BRAND.url}/dashboard`)}`
    );
    return { subject: `${d.plan || "Premium"} plan activated`, html, text: htmlToText(html) };
  },

  buy_call: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Signal: BUY CALL · ${d.symbol || "—"}</h2>
       <p>Hi ${d.name || "there"}, the AI engine just generated a new signal.</p>
       ${details([["Symbol", d.symbol || "—"], ["Entry", `₹${d.entry || "—"}`], ["Target", `₹${d.target || "—"}`], ["Stop loss", `₹${d.sl || "—"}`], ["AI confidence", `${d.confidence || 0}%`]])}
       ${btn("Review on dashboard", `${BRAND.url}/dashboard`)}
       <p style="color:#6b7280;font-size:12.5px;margin-top:14px">Trading involves risk. Review before executing.</p>`,
      { preheader: `BUY CALL ${d.symbol} · entry ₹${d.entry}` }
    );
    return { subject: `Signal alert — ${d.symbol || "BUY CALL"}`, html, text: htmlToText(html) };
  },

  buy_put: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Signal: BUY PUT · ${d.symbol || "—"}</h2>
       <p>Hi ${d.name || "there"}, the AI engine just generated a new signal.</p>
       ${details([["Symbol", d.symbol || "—"], ["Entry", `₹${d.entry || "—"}`], ["Target", `₹${d.target || "—"}`], ["Stop loss", `₹${d.sl || "—"}`], ["AI confidence", `${d.confidence || 0}%`]])}
       ${btn("Review on dashboard", `${BRAND.url}/dashboard`)}
       <p style="color:#6b7280;font-size:12.5px;margin-top:14px">Trading involves risk. Review before executing.</p>`,
      { preheader: `BUY PUT ${d.symbol} · entry ₹${d.entry}` }
    );
    return { subject: `Signal alert — ${d.symbol || "BUY PUT"}`, html, text: htmlToText(html) };
  },

  signals_combined: (d) => {
    const signals = Array.isArray(d.signals) ? d.signals : [];
    const rows = signals.flatMap((s: any, i: number) => {
      const action = s.action === "BUY_CALL" ? "BUY CALL" : "BUY PUT";
      return [[`${s.index || "—"} · ${action}`, `Entry ₹${s.entry || "—"} · Target ₹${s.target || "—"} · SL ₹${s.sl || "—"} · AI ${Math.round(Number(s.confidence || 0))}%`]] as [string,string][];
    });
    const headline = signals.length === 1
      ? `Signal alert — ${signals[0].index} ${signals[0].action === "BUY_CALL" ? "BUY CALL" : "BUY PUT"}`
      : `${signals.length} new signals from your engine`;
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">${signals.length === 1 ? "New signal" : `${signals.length} new signals`}</h2>
       <p>Hi ${d.name || "there"}, generated at ${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
       ${rows.length ? details(rows) : "<p>—</p>"}
       ${btn("Open dashboard", `${BRAND.url}/dashboard`)}
       <p style="color:#6b7280;font-size:12.5px;margin-top:14px">Trading involves risk. Review before executing.</p>`,
      { preheader: headline }
    );
    return { subject: headline, html, text: htmlToText(html) };
  },

  trade_exit: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Position closed · ${d.symbol || "—"}</h2>
       ${details([["Symbol", d.symbol || "—"], ["Entry → Exit", `₹${d.entry || "—"} → ₹${d.exit || "—"}`], ["P&L", `₹${Number(d.pnl || 0).toLocaleString("en-IN")}`], ["Reason", d.reason || "Target hit"]])}`
    );
    return { subject: `Trade closed — ${d.symbol}`, html, text: htmlToText(html) };
  },

  position_closed_profit: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Profit booked · ${d.symbol || "—"}</h2>
       ${codeBox(`+₹${Number(d.pnl || 0).toLocaleString("en-IN")}`, "Net P&L")}
       ${details([["Symbol", d.symbol || "—"], ["Entry → Exit", `₹${d.entry || "—"} → ₹${d.exit || "—"}`], ["Quantity", String(d.qty || 1)], ["Reason", d.reason || "Target hit"]])}`,
      { preheader: `+₹${d.pnl} on ${d.symbol}` }
    );
    return { subject: `Profit booked — ${d.symbol}`, html, text: htmlToText(html) };
  },

  position_closed_loss: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Position closed · ${d.symbol || "—"}</h2>
       ${codeBox(`₹${Number(d.pnl || 0).toLocaleString("en-IN")}`, "Net P&L")}
       ${details([["Symbol", d.symbol || "—"], ["Entry → Exit", `₹${d.entry || "—"} → ₹${d.exit || "—"}`], ["Quantity", String(d.qty || 1)], ["Reason", d.reason || "Stop-loss hit"]])}`
    );
    return { subject: `Position closed — ${d.symbol}`, html, text: htmlToText(html) };
  },

  market_closed: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Signal not placed</h2>
       <p>Hi ${d.name || "there"}, a signal was generated but the order was not placed because the market is closed.</p>
       ${details([["Symbol", d.symbol || "—"], ["Reason", d.reason || "Outside market hours"], ["Next session", d.nextSession || "Next trading day · 09:15 IST"]])}`
    );
    return { subject: `Signal not placed — market closed`, html, text: htmlToText(html) };
  },

  daily_premarket: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Pre-market brief</h2>
       <p>Good morning ${d.name || "there"}. Markets open at <b>09:15 IST</b> today.</p>
       ${details([["Engine status", d.engineStatus || "Ready"], ["Active symbols", d.activeSymbols || "NIFTY · BANKNIFTY · SENSEX"], ["Wallet balance", `₹${Number(d.balance || 0).toLocaleString("en-IN")}`]])}
       ${btn("Open dashboard", `${BRAND.url}/dashboard`)}`
    );
    return { subject: `Pre-market brief for ${new Date().toLocaleDateString("en-IN", { weekday: "long" })}`, html, text: htmlToText(html) };
  },

  engine_started: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Trading engine started</h2>
       <p>Hi ${d.name || "there"}, your engine is now live.</p>
       ${details([["Candle interval", `${d.candleInterval || "15"} min`], ["Active symbols", String(d.symbolCount || 0)], ["Started at", `${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`]])}
       ${btn("Open dashboard", `${BRAND.url}/dashboard`)}`
    );
    return { subject: `Trading engine started`, html, text: htmlToText(html) };
  },

  ticket_created: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Support ticket received</h2>
       <p>Hi ${d.name || "there"}, we've received your request.</p>
       ${details([["Ticket #", d.ticketId || "—"], ["Subject", d.subject || "—"], ["Status", "Waiting for our team's reply"]])}
       <p style="color:#6b7280;font-size:13px">We usually respond within 4–6 hours.</p>`
    );
    return { subject: `Support ticket #${d.ticketId} received`, html, text: htmlToText(html) };
  },

  ticket_reply: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Reply on your ticket</h2>
       <p>Hi ${d.name || "there"}, our team replied to ticket <b>#${d.ticketId || "—"}</b>:</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0"><tr><td style="background:#f7f9fc;border-left:3px solid #F4B400;padding:14px 18px;color:#1a1a1a;font-size:14px;border-radius:4px">${(d.message || "").toString()}</td></tr></table>
       ${btn("View ticket", `${BRAND.url}/dashboard?tab=support`)}`
    );
    return { subject: `Reply on ticket #${d.ticketId}`, html, text: htmlToText(html) };
  },

  referral_reward: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Referral reward credited</h2>
       <p>${d.refereeName || "A new user"} just joined ${BRAND.shortName} using your referral.</p>
       ${codeBox(`+₹${Number(d.amount || 0).toLocaleString("en-IN")}`, "Reward credited")}
       ${details([["Total referrals", String(d.totalRefs || 1)], ["Total earned", `₹${Number(d.totalEarned || 0).toLocaleString("en-IN")}`]])}
       ${btn("View referrals", `${BRAND.url}/dashboard?tab=referrals`)}`
    );
    return { subject: `Referral reward credited — ₹${d.amount}`, html, text: htmlToText(html) };
  },

  notification: (d) => {
    const html = plain(
      `${d.heading ? `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">${d.heading}</h2>` : ""}
       <p>Hi ${d.name || "there"},</p>
       <p style="white-space:pre-line">${(d.message || "").toString()}</p>
       ${d.ctaUrl ? btn(d.ctaLabel || "Open dashboard", d.ctaUrl) : ""}`
    );
    return {
      subject: d.subject || `Notification from ${BRAND.shortName}`,
      html, text: htmlToText(html),
      promotional: !!d.promotional,
    };
  },

  test: (d) => {
    const html = plain(
      `<h2 style="margin:0 0 14px;font-size:20px;color:#0B1E3F">Email integration test</h2>
       <p>Hi ${d.name || "Admin"}, this confirms your ${BRAND.name} email service is working correctly.</p>
       ${details([["Sent at", new Date().toLocaleString("en-IN")], ["Service", "Brevo API"], ["Status", "Delivered"]])}`
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

    // 🔒 Require a caller identity so anonymous visitors cannot spam the
    // platform's verified sending domain. Two accepted paths:
    //   1. Internal shared secret (x-internal-key === INTERNAL_SYNC_KEY) —
    //      used by trusted edge functions, triggers and cron jobs.
    //   2. Verified Supabase user session (Bearer <access_token>) — used by
    //      logged-in users triggering their own transactional emails.
    // Additionally, the customSubject / customHtml free-form path is
    // restricted to the internal-secret caller (never the anon key or a
    // regular user), because it can produce arbitrary branded email.
    const INTERNAL_KEY = Deno.env.get("INTERNAL_SYNC_KEY") || "";
    const providedInternal = req.headers.get("x-internal-key") || "";
    const isInternal = !!INTERNAL_KEY && providedInternal === INTERNAL_KEY;

    let sessionUserId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      // Reject calls whose Bearer is just the public anon key (no real user).
      if (!token || token === anonKey || token === SERVICE_KEY) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      sessionUserId = userData.user.id;
    }

    const body = await req.json();
    let { template, to, name, data = {}, userId, channel = "email", subject: customSubject, html: customHtml } = body;

    // Only internal callers can send free-form HTML/subject email.
    if (!isInternal && (customHtml || customSubject) && !template) {
      return new Response(JSON.stringify({ error: "Custom subject/html requires internal caller" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Regular authenticated users can only send email to themselves — never to arbitrary recipients.
    if (!isInternal && sessionUserId) {
      userId = sessionUserId;
      // Force `to` to be resolved from this user's profile below (drop attacker-supplied recipient).
      to = undefined;
    }

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
