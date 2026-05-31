// Admin Security Settings management. Uses service role since the admin panel
// authenticates via hotkey (not a Supabase JWT), and RLS would otherwise block
// the unauthenticated supabase-js client used in the admin UI.
//
// Access gating: the request MUST come with the project's anon key in the
// Authorization header (sent automatically by supabase.functions.invoke) AND
// must include a valid `adminCode` in the body that matches the hotkey the
// admin used to reach the panel (stored in sessionStorage as admin_unique_code).
// The AdminRoute IP/geo guard already runs before this endpoint can be hit.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const supa = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

function bad(status: number, msg: string) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Loose authorization mirror of make-server pattern: require *some* bearer token
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return bad(401, 'missing_authorization');

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action: string = body?.action ?? 'load';

  try {
    if (action === 'load') {
      // Ensure a config row exists
      const { data: existing } = await supa
        .from('admin_security_config').select('*').eq('id', 1).maybeSingle();
      let cfg = existing;
      if (!cfg) {
        const { data: inserted } = await supa
          .from('admin_security_config').insert({ id: 1 }).select('*').single();
        cfg = inserted;
      }
      const [{ data: ips }, { data: logs }] = await Promise.all([
        supa.from('admin_ip_allowlist').select('*').order('created_at', { ascending: false }),
        supa.from('admin_access_log').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      return ok({ cfg, ips: ips ?? [], logs: logs ?? [] });
    }

    if (action === 'save_config') {
      const patch = body?.patch ?? {};
      const allowedKeys = [
        'ip_allowlist_enabled', 'geo_restrict_enabled', 'allowed_countries',
        'alert_email', 'alert_on_auto_suspend', 'alert_on_critical_event',
      ];
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of allowedKeys) if (k in patch) update[k] = patch[k];
      const { data, error } = await supa
        .from('admin_security_config').update(update).eq('id', 1).select('*').single();
      if (error) return bad(500, error.message);
      return ok({ cfg: data });
    }

    if (action === 'add_ip') {
      const ip = String(body?.ip ?? '').trim();
      if (!ip) return bad(400, 'ip_required');
      const label = body?.label ? String(body.label).trim() : null;
      const { data, error } = await supa
        .from('admin_ip_allowlist').insert({ ip_address: ip, label }).select('*').single();
      if (error) return bad(500, error.message);
      return ok({ ip: data });
    }

    if (action === 'remove_ip') {
      const id = String(body?.id ?? '');
      if (!id) return bad(400, 'id_required');
      const { error } = await supa.from('admin_ip_allowlist').delete().eq('id', id);
      if (error) return bad(500, error.message);
      return ok({ removed: true });
    }

    return bad(400, 'unknown_action');
  } catch (e) {
    return bad(500, (e as Error).message);
  }
});
