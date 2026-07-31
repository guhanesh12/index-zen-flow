// ═══════════════════════════════════════════════════════════════
// ⚙️ AUTO NOTIFICATION ADMIN — list / save auto notification templates
// Admin session required (owner email, user_roles admin, or active admin_profiles)
// ═══════════════════════════════════════════════════════════════
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function isAuthorizedAdmin(token: string): Promise<boolean> {
  const ownerEmail = (Deno.env.get("PLATFORM_OWNER_EMAIL") || "").trim().toLowerCase();
  const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { data: userData } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (!user) return false;
  if (ownerEmail && (user.email || "").trim().toLowerCase() === ownerEmail) return true;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
    admin.from("admin_profiles").select("user_id,status").eq("user_id", user.id).eq("status", "active").maybeSingle(),
  ]);
  return Boolean(roleRow || profileRow);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const internalKey = req.headers.get("x-internal-key") || "";
    const INTERNAL_SYNC_KEY = Deno.env.get("INTERNAL_SYNC_KEY") || "";

    let authorized = false;
    if (INTERNAL_SYNC_KEY && internalKey && internalKey === INTERNAL_SYNC_KEY) authorized = true;
    else if (token) authorized = await isAuthorizedAdmin(token);
    if (!authorized) return json({ success: false, message: "Forbidden: admin session required" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "list").toLowerCase();
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    if (action === "list") {
      const { data, error } = await admin
        .from("auto_notification_templates")
        .select("event, title, body, image_url, enabled, updated_at")
        .order("event");
      if (error) throw new Error(error.message);
      return json({ success: true, templates: data || [] });
    }

    if (action === "save") {
      const t = body?.template || {};
      if (!t.event) return json({ success: false, message: "event required" }, 400);
      const { error } = await admin
        .from("auto_notification_templates")
        .upsert({
          event: String(t.event),
          title: String(t.title || "").slice(0, 120),
          body: String(t.body || "").slice(0, 500),
          image_url: t.image_url ? String(t.image_url) : null,
          enabled: !!t.enabled,
          updated_at: new Date().toISOString(),
        }, { onConflict: "event" });
      if (error) throw new Error(error.message);
      return json({ success: true });
    }

    if (action === "toggle") {
      if (!body?.event) return json({ success: false, message: "event required" }, 400);
      const { error } = await admin
        .from("auto_notification_templates")
        .update({ enabled: !!body.enabled, updated_at: new Date().toISOString() })
        .eq("event", String(body.event));
      if (error) throw new Error(error.message);
      return json({ success: true });
    }

    return json({ success: false, message: "unknown action" }, 400);
  } catch (e: any) {
    console.error("auto-notification-admin error", e);
    return json({ success: false, message: e?.message || "internal error" }, 500);
  }
});
