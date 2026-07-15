// @ts-nocheck
// Admin bulk email sender. Resolves a segment to a recipient list server-side
// and dispatches the "broadcast" template via send-email (internal path).
// Auth: caller must be a super admin OR have communication:create permission.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const INTERNAL_KEY = (Deno.env.get("INTERNAL_SYNC_KEY") || "").trim();

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const SEGMENTS = [
  { key: "all", label: "All users" },
  { key: "email_subscribers", label: "Active email subscribers" },
  { key: "vps_renewal_7", label: "VPS / broker token renewal due (7 days)" },
  { key: "vps_renewal_30", label: "VPS / broker token renewal due (30 days)" },
  { key: "wallet_low", label: "Wallet balance below ₹50" },
  { key: "referrers", label: "Users with ≥1 referral" },
  { key: "inactive_30d", label: "Inactive 30+ days" },
  { key: "custom", label: "Custom (selected user IDs)" },
];

type Recipient = { user_id: string; email: string; name?: string | null };

async function resolveSegment(segment: string, filter: any): Promise<Recipient[]> {
  const out = new Map<string, Recipient>();
  const add = (rows: any[]) => rows?.forEach(r => {
    if (r?.email) out.set(r.user_id, { user_id: r.user_id, email: r.email, name: r.full_name });
  });

  if (segment === "all") {
    const { data } = await admin.from("profiles").select("user_id,email,full_name").not("email", "is", null).limit(10000);
    add(data || []);
  } else if (segment === "email_subscribers") {
    const { data } = await admin
      .from("notification_preferences")
      .select("user_id, email_enabled, profiles!inner(user_id,email,full_name)")
      .eq("email_enabled", true).limit(10000);
    add((data || []).map((r: any) => r.profiles).filter(Boolean));
  } else if (segment === "vps_renewal_7" || segment === "vps_renewal_30") {
    const days = segment === "vps_renewal_7" ? 7 : 30;
    const cutoff = new Date(Date.now() + days * 86400_000).toISOString();
    const { data } = await admin
      .from("broker_credentials")
      .select("user_id, access_token_expiry")
      .lte("access_token_expiry", cutoff)
      .gte("access_token_expiry", new Date().toISOString())
      .limit(10000);
    const ids = Array.from(new Set((data || []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await admin.from("profiles").select("user_id,email,full_name").in("user_id", ids);
      add(profs || []);
    }
  } else if (segment === "wallet_low") {
    const { data: wallets } = await admin.from("kv_store_c4d79cb7").select("key,value").like("key", "wallet:%").limit(20000);
    const ids = (wallets || [])
      .filter((w: any) => Number(w.value?.balance || 0) < 50)
      .map((w: any) => w.key.replace("wallet:", ""));
    if (ids.length) {
      const { data: profs } = await admin.from("profiles").select("user_id,email,full_name").in("user_id", ids);
      add(profs || []);
    }
  } else if (segment === "referrers") {
    const { data } = await admin.from("referrals").select("referrer_user_id").limit(20000);
    const ids = Array.from(new Set((data || []).map((r: any) => r.referrer_user_id)));
    if (ids.length) {
      const { data: profs } = await admin.from("profiles").select("user_id,email,full_name").in("user_id", ids);
      add(profs || []);
    }
  } else if (segment === "inactive_30d") {
    const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data } = await admin.from("profiles").select("user_id,email,full_name,updated_at").lt("updated_at", cutoff).limit(10000);
    add(data || []);
  } else if (segment === "custom") {
    const ids = Array.isArray(filter?.user_ids) ? filter.user_ids : [];
    if (ids.length) {
      const { data: profs } = await admin.from("profiles").select("user_id,email,full_name").in("user_id", ids);
      add(profs || []);
    }
    // also accept direct emails
    const emails = Array.isArray(filter?.emails) ? filter.emails : [];
    for (const e of emails) if (e) out.set(`e:${e}`, { user_id: `e:${e}`, email: e });
  }
  return Array.from(out.values());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true, segments: SEGMENTS }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify caller is an admin (super admin OR has communication:create permission).
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token || token === ANON_KEY || token === SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const uid = userData.user.id;
  const email = userData.user.email || null;

  const { data: superOk } = await admin.rpc("is_super_admin", { _user_id: uid });
  let allowed = !!superOk;
  if (!allowed) {
    const { data: permOk } = await admin.rpc("has_permission", { _user_id: uid, _module: "communication", _action: "create" });
    allowed = !!permOk;
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "Forbidden — communication:create required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action || "send";
  const segment = body.segment || "all";
  const filter = body.filter || {};

  if (action === "preview") {
    const recipients = await resolveSegment(segment, filter);
    return new Response(JSON.stringify({ ok: true, count: recipients.length, sample: recipients.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // action === "send"
  const subject = (body.subject || "").toString().trim();
  const heading = (body.heading || "").toString().trim();
  const bodyText = (body.body || "").toString();
  const cta_label = body.cta_label || null;
  const cta_url = body.cta_url || null;
  const banner_url = body.banner_url || null;

  if (!subject || !bodyText) {
    return new Response(JSON.stringify({ error: "subject and body are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipients = await resolveSegment(segment, filter);
  const testMode = !!body.test_mode;
  const testTo = body.test_to || email;
  const list: Recipient[] = testMode ? [{ user_id: uid, email: testTo, name: "Admin (test)" }] : recipients;

  const { data: campaign, error: campErr } = await admin.from("email_campaigns").insert({
    admin_user_id: uid,
    admin_email: email,
    segment: testMode ? `${segment} (test)` : segment,
    segment_filter: filter,
    subject, heading, body: bodyText,
    cta_label, cta_url, banner_url,
    total_recipients: list.length,
    status: "sending",
  }).select("id").maybeSingle();
  if (campErr) {
    return new Response(JSON.stringify({ error: campErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const campaignId = campaign?.id;

  let sent = 0, failed = 0;
  for (const r of list) {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_KEY,
        },
        body: JSON.stringify({
          template: "broadcast",
          to: r.email,
          userId: r.user_id?.startsWith?.("e:") ? undefined : r.user_id,
          name: r.name || undefined,
          data: {
            name: r.name || undefined,
            subject, heading, body: bodyText,
            cta_label, cta_url, banner_url,
            promotional: true,
          },
        }),
      });
      const j = await resp.json().catch(() => ({}));
      if (resp.ok && j?.ok !== false) sent++; else failed++;
      // Tag the just-created log with the campaign id (best-effort, latest matching row).
      if (campaignId) {
        await admin.from("email_logs")
          .update({ campaign_id: campaignId })
          .eq("recipient", r.email)
          .is("campaign_id", null)
          .eq("template", "broadcast")
          .order("created_at", { ascending: false })
          .limit(1);
      }
      // Rate limit ~10/sec for Brevo
      await new Promise((res) => setTimeout(res, 110));
    } catch (e) {
      failed++;
    }
  }

  await admin.from("email_campaigns").update({
    sent_count: sent, failed_count: failed,
    status: failed > 0 && sent === 0 ? "failed" : "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", campaignId);

  return new Response(JSON.stringify({ ok: true, campaign_id: campaignId, total: list.length, sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
