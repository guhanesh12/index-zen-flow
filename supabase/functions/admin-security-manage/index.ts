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
const PERMANENT_SUPER_ADMIN_EMAIL = 'airoboengin@smilykart.com';
const TAB_KEYS = new Set([
  'dashboard', 'users', 'transactions', 'support', 'landing', 'adminUsers',
  'adminManagement', 'settings', 'referrals', 'communication', 'mobile', 'audit',
]);
const PERMISSION_MODULES = new Set([
  'dashboard', 'users', 'transactions', 'wallet', 'referrals', 'instruments',
  'journals', 'support', 'landing', 'communication', 'mobile', 'adminUsers',
  'adminManagement', 'security', 'audit', 'settings',
]);
const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const;
const PERMISSION_COL: Record<string, string> = {
  view: 'can_view', create: 'can_create', edit: 'can_edit',
  delete: 'can_delete', export: 'can_export', approve: 'can_approve',
};

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

  // 🔒 Require a verified admin user session (was: accepted any bearer token,
  // including the public anon key). Owner email OR user_roles(admin) required.
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  // Parse body once — we may need it for the hotkey/url_key fallback gate.
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action: string = body?.action ?? 'load';

  const OWNER_EMAIL = (Deno.env.get('PLATFORM_OWNER_EMAIL') || '').trim().toLowerCase();
  let authorized = false;
  let actorUserId: string | null = null;
  let actorEmail: string | null = null;

  // Path A: verified Supabase Auth session. Ignore the public anon JWT; it has
  // no user `sub` claim and causes noisy 403 auth logs if passed to getUser().
  if (token && token !== ANON_KEY) {
    try {
      const authClient = createClient(SUPA_URL, ANON_KEY || SERVICE_KEY);
      const { data: userData } = await authClient.auth.getUser(token);
      const user = userData?.user;
      if (user) {
        actorUserId = user.id;
        actorEmail = (user.email || '').trim().toLowerCase();
        if ((user.email || '').trim().toLowerCase() === PERMANENT_SUPER_ADMIN_EMAIL || (OWNER_EMAIL && (user.email || '').trim().toLowerCase() === OWNER_EMAIL)) {
          authorized = true;
        } else {
          const [{ data: roleRow }, { data: adminProfile }] = await Promise.all([
            supa.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle(),
            supa.from('admin_profiles').select('user_id,status').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
          ]);
          if (roleRow || adminProfile) authorized = true;
        }
      }
    } catch (e) {
      console.error('admin-security-manage auth error', e);
    }
  }

  // Path B: hotkey/URL-key session. Admin dashboard URLs can contain either a
  // permanent admin_profiles.url_key or a short-lived admin_unique_code_* issued
  // after 2FA; support both so management calls do not fail on hotkey routes.
  if (!authorized) {
    const urlKey = String(body?.url_key || body?.admin_code || '').trim();
    const hotkey = String(body?.hotkey_session || '').trim();
    if (urlKey || hotkey) {
      let q = supa.from('admin_profiles').select('user_id,email,status,is_super_admin').eq('status', 'active');
      if (urlKey) q = q.eq('url_key', urlKey);
      else q = q.ilike('hotkey', hotkey);
      const { data: prof } = await q.maybeSingle();
      if (prof) {
        actorUserId = prof.user_id;
        actorEmail = prof.email || null;
        authorized = true;
      } else if (urlKey) {
        const { data: sessionRow } = await supa
          .from('kv_store_c4d79cb7')
          .select('value')
          .eq('key', `admin_unique_code_${urlKey}`)
          .maybeSingle();
        const raw = sessionRow?.value;
        const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (session?.expiresAt && new Date(session.expiresAt).getTime() > Date.now()) {
          const sessionEmail = String(session.email || '').trim().toLowerCase();
          if (sessionEmail === PERMANENT_SUPER_ADMIN_EMAIL || (OWNER_EMAIL && sessionEmail === OWNER_EMAIL)) {
            actorEmail = sessionEmail;
            authorized = true;
          } else if (sessionEmail) {
            const { data: sessionProf } = await supa
              .from('admin_profiles')
              .select('user_id,email,status')
              .eq('email', sessionEmail)
              .eq('status', 'active')
              .maybeSingle();
            if (sessionProf) {
              actorUserId = sessionProf.user_id;
              actorEmail = sessionProf.email || sessionEmail;
              authorized = true;
            }
          }
        }
      }
    }
  }

  if (!authorized) return bad(403, 'admin_session_required');



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

    // ---------- Admin management ops ----------
    const randKey = (len = 12) => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let s = '';
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      for (let i = 0; i < len; i++) s += chars[bytes[i] % chars.length];
      return s;
    };

    const syncHotkeyKV = async (uid: string, hotkey: string, name: string) => {
      if (!hotkey) return;
      const key = `admin:hotkey:${uid}`;
      await supa.from('kv_store_c4d79cb7').upsert({
        key,
        value: { id: uid, adminId: uid, hotkey: hotkey.toUpperCase(), name, createdAt: new Date().toISOString() },
      }, { onConflict: 'key' });
    };
    const removeHotkeyKV = async (uid: string) => {
      await supa.from('kv_store_c4d79cb7').delete().eq('key', `admin:hotkey:${uid}`);
    };

    if (action === 'list_admins') {
      const { data, error } = await supa.from('admin_profiles').select('*')
        .order('is_super_admin', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) return bad(500, error.message);
      return ok({ admins: data || [] });
    }

    if (action === 'list_activity') {
      const { data, error } = await supa.from('admin_access_log').select('*')
        .order('created_at', { ascending: false }).limit(300);
      if (error) return bad(500, error.message);
      return ok({ activity: data || [] });
    }

    if (action === 'check_hotkey') {
      const hk = String(body?.hotkey ?? '').trim();
      const excludeUser = body?.exclude_user_id ? String(body.exclude_user_id) : null;
      if (!hk) return bad(400, 'hotkey_required');
      let q = supa.from('admin_profiles').select('user_id,email').ilike('hotkey', hk);
      if (excludeUser) q = q.neq('user_id', excludeUser);
      const { data } = await q.maybeSingle();
      return ok({ available: !data, taken_by: data?.email || null });
    }

    if (action === 'create_admin') {
      const email = String(body?.email || '').trim().toLowerCase();
      const password = String(body?.password || '');
      const full_name = String(body?.full_name || '').trim();
      const mobile = String(body?.mobile || '').trim();
      const employee_code = String(body?.employee_code || '').trim().toUpperCase();
      const username = String(body?.username || '').trim().toLowerCase();
      const hotkey = String(body?.hotkey || '').trim().toUpperCase();
      const role_label = String(body?.role_label || 'admin').trim();
      if (!email || !password || !hotkey || !username) return bad(400, 'missing_required_fields');
      if (password.length < 8) return bad(400, 'password_too_short');

      // Uniqueness pre-checks
      const { data: dupHk } = await supa.from('admin_profiles').select('user_id').ilike('hotkey', hotkey).maybeSingle();
      if (dupHk) return bad(409, 'hotkey_taken');
      const { data: dupUn } = await supa.from('admin_profiles').select('user_id').ilike('username', username).maybeSingle();
      if (dupUn) return bad(409, 'username_taken');
      if (employee_code) {
        const { data: dupEc } = await supa.from('admin_profiles').select('user_id').ilike('employee_code', employee_code).maybeSingle();
        if (dupEc) return bad(409, 'employee_code_taken');
      }

      // Create auth user
      const { data: created, error: cErr } = await supa.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, mobile },
      });
      if (cErr || !created?.user) return bad(500, cErr?.message || 'auth_create_failed');
      const uid = created.user.id;
      const url_key = randKey(12);

      const { error: pErr } = await supa.from('admin_profiles').upsert({
        user_id: uid, email, full_name, mobile, employee_code, username, hotkey,
        role_label, status: 'active', is_super_admin: false, url_key,
      }, { onConflict: 'user_id' });
      if (pErr) return bad(500, pErr.message);

      // Grant admin role
      await supa.from('user_roles').upsert({ user_id: uid, role: 'admin' }, { onConflict: 'user_id,role' });

      // Sync hotkey into KV so global hotkey listener picks it up
      await syncHotkeyKV(uid, hotkey, full_name || email);

      return ok({ success: true, user_id: uid, url_key });
    }

    if (action === 'update_admin') {
      const user_id = String(body?.user_id || '');
      if (!user_id) return bad(400, 'user_id_required');
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const fields = ['full_name', 'mobile', 'employee_code', 'username', 'role_label', 'hotkey', 'status'];
      for (const f of fields) if (f in (body || {})) {
        let v = body[f];
        if (typeof v === 'string') v = v.trim();
        if (f === 'hotkey' && typeof v === 'string') v = v.toUpperCase();
        if (f === 'username' && typeof v === 'string') v = v.toLowerCase();
        if (f === 'employee_code' && typeof v === 'string') v = v.toUpperCase();
        patch[f] = v;
      }

      if (patch.hotkey) {
        const { data: d } = await supa.from('admin_profiles').select('user_id').ilike('hotkey', String(patch.hotkey)).neq('user_id', user_id).maybeSingle();
        if (d) return bad(409, 'hotkey_taken');
      }
      if (patch.username) {
        const { data: d } = await supa.from('admin_profiles').select('user_id').ilike('username', String(patch.username)).neq('user_id', user_id).maybeSingle();
        if (d) return bad(409, 'username_taken');
      }
      const { error } = await supa.from('admin_profiles').update(patch).eq('user_id', user_id);
      if (error) return bad(500, error.message);
      // Refresh hotkey KV entry if hotkey/name changed
      if (patch.hotkey || patch.full_name) {
        const { data: prof } = await supa.from('admin_profiles')
          .select('hotkey,full_name,email').eq('user_id', user_id).maybeSingle();
        if (prof?.hotkey) await syncHotkeyKV(user_id, prof.hotkey, prof.full_name || prof.email);
      }
      return ok({ success: true });
    }

    if (action === 'set_password') {
      const user_id = String(body?.user_id || '');
      const password = String(body?.password || '');
      if (!user_id || password.length < 8) return bad(400, 'invalid_input');
      const { error } = await supa.auth.admin.updateUserById(user_id, { password });
      if (error) return bad(500, error.message);
      return ok({ success: true });
    }

    if (action === 'reset_totp') {
      const user_id = String(body?.user_id || '');
      if (!user_id) return bad(400, 'user_id_required');
      const { data: prof } = await supa.from('admin_profiles').select('email').eq('user_id', user_id).maybeSingle();
      const { error } = await supa.from('admin_totp_secrets').delete().eq('user_id', user_id);
      if (error) return bad(500, error.message);
      const email = String(prof?.email || '').trim().toLowerCase();
      if (email) {
        await supa.from('kv_store_c4d79cb7').delete().eq('key', `admin_2fa_enrolled:${email}`);
      }
      return ok({ success: true });
    }

    if (action === 'rotate_url_key') {
      const user_id = String(body?.user_id || '');
      if (!user_id) return bad(400, 'user_id_required');
      const url_key = randKey(12);
      const { error } = await supa.from('admin_profiles').update({ url_key }).eq('user_id', user_id);
      if (error) return bad(500, error.message);
      return ok({ success: true, url_key });
    }

    if (action === 'delete_admin') {
      const user_id = String(body?.user_id || '');
      if (!user_id) return bad(400, 'user_id_required');
      const { data: prof } = await supa.from('admin_profiles').select('is_super_admin').eq('user_id', user_id).maybeSingle();
      if (prof?.is_super_admin) return bad(400, 'cannot_delete_super_admin');
      await supa.from('admin_profiles').delete().eq('user_id', user_id);
      await supa.from('user_roles').delete().eq('user_id', user_id).eq('role', 'admin');
      await removeHotkeyKV(user_id);
      await supa.auth.admin.deleteUser(user_id).catch(() => {});
      return ok({ success: true });
    }

    // ---------- Tab access (per-admin visibility of dashboard tabs) ----------
    if (action === 'get_tab_access') {
      // Returns { is_super_admin, has_config, allowed: string[] } for a given user_id.
      // Used both by the Edit dialog (to prefill toggles) and by useAllowedTabs
      // on the logged-in admin's dashboard (so it works without a supabase
      // auth session, since admin login stores its token in sessionStorage
      // rather than calling supabase.auth.setSession()).
      const user_id = String(body?.user_id || actorUserId || '');
      if (!user_id) return bad(400, 'user_id_required');
      const bodyEmail = String(body?.email || '').trim().toLowerCase();
      const { data: prof } = await supa
        .from('admin_profiles')
        .select('email,is_super_admin,status')
        .eq('user_id', user_id)
        .maybeSingle();
      const profileEmail = String(prof?.email || bodyEmail || '').trim().toLowerCase();
      const isSuper = !!(prof?.status === 'active' && (prof?.is_super_admin || profileEmail === PERMANENT_SUPER_ADMIN_EMAIL));
      if (isSuper && profileEmail === PERMANENT_SUPER_ADMIN_EMAIL && !prof?.is_super_admin) {
        await supa.from('admin_profiles').update({ is_super_admin: true, status: 'active' }).eq('user_id', user_id);
      }
      const { data: rows } = await supa
        .from('admin_permissions')
        .select('module,can_view')
        .eq('admin_user_id', user_id);
      const relevantRows = (rows || []).filter((r: any) => {
        const module = String(r?.module || '');
        if (module.startsWith('tab:')) return true;
        return TAB_KEYS.has(module);
      });
      const allowed = relevantRows.filter((r: any) => r.can_view).map((r: any) => {
        const module = String(r.module || '');
        return module.startsWith('tab:') ? module : `tab:${module}`;
      });
      return ok({
        is_super_admin: isSuper,
        has_config: isSuper || relevantRows.length > 0,
        allowed,
      });
    }

    if (action === 'get_permissions') {
      const user_id = String(body?.user_id || '');
      if (!user_id) return bad(400, 'user_id_required');
      const { data: prof } = await supa
        .from('admin_profiles')
        .select('email,is_super_admin,status')
        .eq('user_id', user_id)
        .maybeSingle();
      const email = String(prof?.email || '').trim().toLowerCase();
      const isSuper = !!(prof?.status === 'active' && (prof?.is_super_admin || email === PERMANENT_SUPER_ADMIN_EMAIL));
      const { data: rows, error } = await supa
        .from('admin_permissions')
        .select('*')
        .eq('admin_user_id', user_id)
        .in('module', Array.from(PERMISSION_MODULES));
      if (error) return bad(500, error.message);
      if (isSuper) {
        const permissions = Array.from(PERMISSION_MODULES).map((module) => ({
          module, can_view: true, can_create: true, can_edit: true,
          can_delete: true, can_export: true, can_approve: true,
        }));
        return ok({ permissions, is_super_admin: true });
      }
      return ok({ permissions: rows || [], is_super_admin: false });
    }

    if (action === 'save_permissions') {
      const user_id = String(body?.user_id || '');
      const permissions = (body?.permissions || {}) as Record<string, Record<string, boolean>>;
      if (!user_id) return bad(400, 'user_id_required');
      const { data: prof } = await supa
        .from('admin_profiles')
        .select('email,is_super_admin,status')
        .eq('user_id', user_id)
        .maybeSingle();
      const email = String(prof?.email || '').trim().toLowerCase();
      if (prof?.status === 'active' && (prof?.is_super_admin || email === PERMANENT_SUPER_ADMIN_EMAIL)) {
        return ok({ success: true, skipped: 'super_admin' });
      }
      const rows: Record<string, unknown>[] = [];
      const tabRows: Record<string, unknown>[] = [];
      for (const [module, acts] of Object.entries(permissions)) {
        if (!PERMISSION_MODULES.has(module)) continue;
        const row: Record<string, unknown> = { admin_user_id: user_id, module };
        for (const actionName of PERMISSION_ACTIONS) {
          row[PERMISSION_COL[actionName]] = !!acts?.[actionName];
        }
        rows.push(row);
        if (TAB_KEYS.has(module)) {
          tabRows.push({
            admin_user_id: user_id,
            module: `tab:${module}`,
            can_view: !!acts?.view,
            can_create: false, can_edit: false, can_delete: false,
            can_export: false, can_approve: false,
          });
        }
      }
      const upserts = [...rows, ...tabRows];
      if (upserts.length) {
        const { error } = await supa
          .from('admin_permissions')
          .upsert(upserts, { onConflict: 'admin_user_id,module' });
        if (error) return bad(500, error.message);
      }
      return ok({ success: true, count: upserts.length });
    }

    if (action === 'save_tab_access') {
      // body.user_id + body.tab_access: { [mainKey]: bool, [`${main}:${sub}`]: bool }
      const user_id = String(body?.user_id || '');
      const tabAccess = (body?.tab_access || {}) as Record<string, boolean>;
      if (!user_id) return bad(400, 'user_id_required');
      const { data: prof } = await supa
        .from('admin_profiles').select('is_super_admin').eq('user_id', user_id).maybeSingle();
      if (prof?.is_super_admin) return ok({ success: true, skipped: 'super_admin' });
      const rows = Object.entries(tabAccess).map(([k, v]) => {
        const module = k.includes(':') ? `tab:${k}` : `tab:${k}`;
        return {
          admin_user_id: user_id,
          module,
          can_view: !!v,
          can_create: false, can_edit: false, can_delete: false,
          can_export: false, can_approve: false,
        };
      });
      if (rows.length === 0) return ok({ success: true });
      const { error } = await supa
        .from('admin_permissions')
        .upsert(rows, { onConflict: 'admin_user_id,module' });
      if (error) return bad(500, error.message);
      return ok({ success: true, count: rows.length });
    }

    if (action === 'load_mobile_config') {
      const { data } = await supa.from('mobile_app_config').select('*').eq('id', 1).maybeSingle();
      return ok({ config: data || null });
    }

    if (action === 'save_mobile_config') {
      const cfg = body?.config || {};
      const { error } = await supa.from('mobile_app_config').upsert({
        id: 1, ...cfg, updated_by: actorUserId, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) return bad(500, error.message);
      return ok({ success: true });
    }

    if (action === 'broadcast_mobile_update') {
      // Save first, then broadcast via admin-push-send using INTERNAL_SYNC_KEY
      const cfg = body?.config || {};
      const { error: upErr } = await supa.from('mobile_app_config').upsert({
        id: 1, ...cfg, updated_by: actorUserId, updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (upErr) return bad(500, upErr.message);

      const INTERNAL = Deno.env.get('INTERNAL_SYNC_KEY') || '';
      const resp = await fetch(`${SUPA_URL}/functions/v1/admin-push-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': INTERNAL,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          title: cfg.update_title || 'New Update Available',
          description: `${cfg.update_message || ''}\n\nLatest: Android ${cfg.android_current_version} • iOS ${cfg.ios_current_version}`,
          targetUrl: 'app://check-update',
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return bad(resp.status, json?.message || 'broadcast_failed');
      return ok(json);
    }

    return bad(400, 'unknown_action');
  } catch (e) {
    return bad(500, (e as Error).message);
  }
});

