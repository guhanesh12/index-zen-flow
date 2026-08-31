// User PIN login: set / verify / status / forgot (send OTP) / reset (verify OTP + set new)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const TWOFACTOR = Deno.env.get("TWOFACTOR_API_KEY") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const enc = new TextEncoder();
async function sha256(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, "0")).join("");
}
function isValidPin(p: unknown): p is string {
  return typeof p === "string" && /^\d{4}$/.test(p);
}
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getUserFromJwt(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const u = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await u.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

async function sendOtpVia2Factor(mobile: string, otp: string) {
  if (!TWOFACTOR) {
    console.error("[user-pin] TWOFACTOR_API_KEY missing");
    return { ok: false, error: "otp_provider_not_configured" };
  }
  const clean = mobile.replace(/\D/g, "").slice(-10);
  if (clean.length !== 10) return { ok: false, error: "invalid_mobile" };
  // Try the plain (default) template first, then the named DLT template.
  const urls = [
    `https://2factor.in/API/V1/${TWOFACTOR}/SMS/${clean}/${otp}`,
    `https://2factor.in/API/V1/${TWOFACTOR}/SMS/${clean}/${otp}/${encodeURIComponent("PIN Reset OTP")}`,
    `https://2factor.in/API/V1/${TWOFACTOR}/SMS/+91${clean}/${otp}`,
  ];
  let lastErr = "otp_send_failed";
  for (const url of urls) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      let j: any = {};
      try { j = JSON.parse(text); } catch { /* non-json */ }
      console.log(`[user-pin] 2factor attempt -> status=${r.status} body=${text.slice(0, 300)}`);
      if (j?.Status === "Success") return { ok: true, sessionId: j?.Details };
      lastErr = j?.Details || text.slice(0, 200) || `otp_send_failed_${r.status}`;
    } catch (e) {
      lastErr = String(e);
      console.error("[user-pin] 2factor fetch error", lastErr);
    }
  }
  return { ok: false, error: lastErr };
}

// Diagnostic: check 2Factor account balance (proves key validity + credits)
async function twoFactorBalance() {
  if (!TWOFACTOR) return { ok: false, error: "otp_provider_not_configured" };
  try {
    const r = await fetch(`https://2factor.in/API/V1/${TWOFACTOR}/ADDON_SERVICES/BAL/SMS`);
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text.slice(0, 400) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}


// Send the same OTP by email through the shared Brevo-backed send-email function.
async function sendOtpViaEmail(email: string, name: string, otp: string) {
  if (!email) return { ok: false, error: "no_email" };
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": Deno.env.get("INTERNAL_SYNC_KEY") || "",
        apikey: ANON,
      },
      body: JSON.stringify({
        template: "otp",
        to: email,
        name: name || "there",
        data: { code: otp, expiryMinutes: 10 },
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.ok !== false) return { ok: true };
    return { ok: false, error: j?.error || `email_failed_${r.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function maskMobile(m: string) {
  const d = (m || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 2)}****${d.slice(6)}` : "";
}
function maskEmail(e: string) {
  const [u, d] = (e || "").split("@");
  if (!u || !d) return "";
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // status | set | verify | forgot | reset

  try {
    // Internal diagnostic (no user JWT): checks provider key + credits
    if (action === "sms-diag") {
      const key = req.headers.get("x-internal-key") || "";
      if (!key || key !== (Deno.env.get("INTERNAL_SYNC_KEY") || "")) {
        return json(401, { success: false, message: "Unauthorized" });
      }
      const bal = await twoFactorBalance();
      const testTo = url.searchParams.get("to");
      let send: unknown = null;
      if (testTo) send = await sendOtpVia2Factor(testTo, "123456");
      return json(200, { success: true, hasKey: !!TWOFACTOR, balance: bal, send });
    }

    const user = await getUserFromJwt(req);
    if (!user) return json(401, { success: false, message: "Unauthorized" });


    // GET status: does this user have a PIN?
    if (action === "status" && req.method === "GET") {
      const { data } = await admin.from("user_pins").select("user_id, locked_until").eq("user_id", user.id).maybeSingle();
      const { data: prof } = await admin.from("profiles").select("mobile, email").eq("user_id", user.id).maybeSingle();
      const locked = data?.locked_until && new Date(data.locked_until) > new Date();
      return json(200, {
        success: true,
        hasPin: !!data,
        locked: !!locked,
        lockedUntil: data?.locked_until || null,
        mobile: maskMobile(prof?.mobile || ""),
        email: maskEmail(prof?.email || user.email || ""),
      });
    }


    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Set PIN (first time OR overwrite when user is authenticated). Requires confirmPin match.
    if (action === "set" && req.method === "POST") {
      const { pin, confirmPin } = body || {};
      if (!isValidPin(pin) || !isValidPin(confirmPin)) return json(400, { success: false, message: "PIN must be 4 digits" });
      if (pin !== confirmPin) return json(400, { success: false, message: "PINs do not match" });
      const salt = randomSalt();
      const pin_hash = await sha256(`${salt}:${pin}`);
      const { error } = await admin.from("user_pins").upsert({
        user_id: user.id, pin_hash, pin_salt: salt,
        failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
      });
      if (error) return json(500, { success: false, message: error.message });
      return json(200, { success: true, message: "PIN saved" });
    }

    // Verify PIN
    if (action === "verify" && req.method === "POST") {
      const { pin } = body || {};
      if (!isValidPin(pin)) return json(400, { success: false, message: "PIN must be 4 digits" });
      const { data: row } = await admin.from("user_pins").select("*").eq("user_id", user.id).maybeSingle();
      if (!row) return json(404, { success: false, message: "No PIN set", hasPin: false });
      if (row.locked_until && new Date(row.locked_until) > new Date()) {
        return json(200, { success: false, message: "PIN locked. Try later.", lockedUntil: row.locked_until });
      }
      const check = await sha256(`${row.pin_salt}:${pin}`);
      if (check !== row.pin_hash) {
        const attempts = (row.failed_attempts || 0) + 1;
        const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        await admin.from("user_pins").update({
          failed_attempts: lock ? 0 : attempts,
          locked_until: lock,
        }).eq("user_id", user.id);
        return json(200, { success: false, message: "Incorrect PIN", attemptsLeft: Math.max(0, 5 - attempts), lockedUntil: lock });
      }
      await admin.from("user_pins").update({ failed_attempts: 0, locked_until: null, last_used_at: new Date().toISOString() }).eq("user_id", user.id);
      return json(200, { success: true, message: "PIN verified" });
    }

    // Forgot: send a 6-digit OTP to the registered mobile ONLY (no email)
    if (action === "forgot" && req.method === "POST") {
      const { data: prof } = await admin.from("profiles")
        .select("mobile, email, full_name").eq("user_id", user.id).maybeSingle();
      const mobile = (prof?.mobile || "").toString();
      const hasMobile = mobile.replace(/\D/g, "").length >= 10;
      if (!hasMobile) {
        return json(400, { success: false, message: "No registered mobile number. Update your profile first." });
      }
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const otp_hash = await sha256(otp);
      const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await admin.from("pin_reset_otps").insert({ user_id: user.id, mobile, otp_hash, expires_at });

      const sms = await sendOtpVia2Factor(mobile, otp);
      if (!sms.ok) {
        return json(502, { success: false, message: sms.error || "OTP send failed" });
      }
      return json(200, {
        success: true,
        message: "OTP sent to your registered mobile number",
        channels: { sms: true, email: false },
        mobile: maskMobile(mobile),
        email: null,
      });
    }



    // Reset: verify OTP + set new PIN
    if (action === "reset" && req.method === "POST") {
      const { otp, pin, confirmPin } = body || {};
      if (!/^\d{4,6}$/.test(String(otp || ""))) return json(400, { success: false, message: "Invalid OTP" });
      if (!isValidPin(pin) || !isValidPin(confirmPin)) return json(400, { success: false, message: "PIN must be 4 digits" });
      if (pin !== confirmPin) return json(400, { success: false, message: "PINs do not match" });

      const { data: rows } = await admin.from("pin_reset_otps")
        .select("*").eq("user_id", user.id).eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(1);
      const row = rows?.[0];
      if (!row) return json(400, { success: false, message: "OTP expired. Request a new one." });
      if ((row.attempts || 0) >= 5) return json(429, { success: false, message: "Too many attempts. Request a new OTP." });

      const otp_hash = await sha256(String(otp));
      if (otp_hash !== row.otp_hash) {
        await admin.from("pin_reset_otps").update({ attempts: (row.attempts || 0) + 1 }).eq("id", row.id);
        return json(200, { success: false, message: "Incorrect OTP" });
      }
      await admin.from("pin_reset_otps").update({ verified: true }).eq("id", row.id);

      const salt = randomSalt();
      const pin_hash = await sha256(`${salt}:${pin}`);
      await admin.from("user_pins").upsert({
        user_id: user.id, pin_hash, pin_salt: salt,
        failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString(),
      });
      return json(200, { success: true, message: "PIN reset successful" });
    }

    return json(404, { success: false, message: "Unknown action" });
  } catch (e) {
    return json(500, { success: false, message: String(e?.message || e) });
  }
});
