// @ts-nocheck
/**
 * 🔒 EDGE FUNCTION SECURITY HELPERS
 * Use in any handler under make-server-c4d79cb7 to enforce:
 *  - Authenticated JWT (getClaims)
 *  - Admin role check (via user_roles table)
 *  - HMAC signature verification (for webhooks)
 *  - Strict CORS allowlist
 *  - Audit logging
 *  - Brute-force recording
 *
 * Import: import { requireAuth, requireAdmin, verifyHmac, corsAllowlist, audit, recordFailedLogin } from "./security_helpers.tsx";
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// --- Strict CORS allowlist (no wildcards) ---
const ALLOWED_ORIGINS = new Set<string>([
  "https://indexpilotai.com",
  "https://www.indexpilotai.com",
  "https://index-zen-flow.lovable.app",
  "https://id-preview--53074c3b-4efc-4555-9d50-55b7d0bc2930.lovable.app",
  "http://localhost:8080",
  "http://localhost:5173",
]);

export function corsAllowlist(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-signature, x-timestamp",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

// --- Auth: validate JWT and return user claims ---
export async function requireAuth(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing bearer token", user: null };
  }
  const jwt = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: "Invalid or expired token", user: null };
  }
  return { ok: true, status: 200, user: data.user, jwt };
}

// --- Admin role check ---
export async function requireAdmin(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 403, error: "Admin role required", user: auth.user };
  }
  return { ok: true, status: 200, user: auth.user, jwt: auth.jwt };
}

// --- HMAC signature verification (for incoming webhooks) ---
export async function verifyHmac(
  rawBody: string,
  signature: string,
  secret: string,
  timestamp?: string,
  maxAgeSec: number = 300
): Promise<boolean> {
  if (!signature || !secret) return false;

  // Optional replay protection
  if (timestamp) {
    const ts = parseInt(timestamp, 10);
    if (!Number.isFinite(ts)) return false;
    const ageSec = Math.abs(Date.now() / 1000 - ts);
    if (ageSec > maxAgeSec) return false;
  }

  const payload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare
  const a = expected;
  const b = signature.toLowerCase().replace(/^sha256=/, "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// --- Audit log writer (server-trusted) ---
export async function audit(entry: {
  action: string;
  actor_user_id?: string | null;
  actor_email?: string | null;
  resource?: string;
  resource_id?: string;
  status?: "success" | "failed" | "blocked";
  metadata?: Record<string, any>;
  req?: Request;
}) {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const ip =
      entry.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      entry.req?.headers.get("cf-connecting-ip") ||
      null;
    await admin.from("security_audit_log").insert({
      actor_user_id: entry.actor_user_id ?? null,
      actor_email: entry.actor_email ?? null,
      action: entry.action,
      resource: entry.resource ?? null,
      resource_id: entry.resource_id ?? null,
      ip_address: ip,
      user_agent: entry.req?.headers.get("user-agent")?.slice(0, 500) ?? null,
      status: entry.status ?? "success",
      metadata: entry.metadata ?? {},
    });
  } catch (err) {
    console.warn("[audit] failed:", err);
  }
}

// --- Brute-force: record failed login (server-trusted) ---
export async function recordFailedLogin(
  identifier: string,
  req: Request,
  opts: { attempt_type?: "admin" | "user" | "otp"; reason?: string } = {}
) {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      null;
    await admin.from("failed_login_attempts").insert({
      identifier: identifier.toLowerCase().trim(),
      ip_address: ip,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
      attempt_type: opts.attempt_type ?? "user",
      reason: opts.reason ?? null,
    });
  } catch (err) {
    console.warn("[recordFailedLogin] failed:", err);
  }
}

// --- Brute-force: check lock status (server-trusted) ---
export async function isLoginLocked(
  identifier: string,
  req: Request
): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      null;
    const { data } = await admin.rpc("is_login_locked", {
      _identifier: identifier.toLowerCase().trim(),
      _ip: ip,
    });
    return Boolean(data);
  } catch {
    return false;
  }
}

// --- Standard JSON helper that always includes CORS ---
export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsAllowlist(req), "Content-Type": "application/json" },
  });
}
