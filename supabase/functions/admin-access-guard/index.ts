// Validates whether the caller is allowed to access the admin panel.
// Checks IP allowlist and country (geo) whitelist when enabled.
// Logs every attempt to admin_access_log.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function getClientIp(req: Request): string {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip')
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';
}

async function lookupCountry(ip: string): Promise<string | null> {
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::1')) return null;
  try {
    // Free, no-key, IPv4/IPv6 supported
    const r = await fetch(`https://ipapi.co/${ip}/country/`, {
      headers: { 'User-Agent': 'IndexPilot-AdminGuard/1.0' },
      signal: AbortSignal.timeout(2500),
    });
    if (!r.ok) return null;
    const txt = (await r.text()).trim().toUpperCase();
    return /^[A-Z]{2}$/.test(txt) ? txt : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const ip = getClientIp(req);
  const ua = req.headers.get('user-agent') ?? '';
  const supa = createClient(SUPA_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let userId: string | null = null;
  let email: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    userId = body?.userId ?? null;
    email = body?.email ?? null;
  } catch { /* noop */ }

  const { data: cfg } = await supa.from('admin_security_config').select('*').eq('id', 1).maybeSingle();
  const ipEnabled = !!cfg?.ip_allowlist_enabled;
  const geoEnabled = !!cfg?.geo_restrict_enabled;
  const allowedCountries: string[] = cfg?.allowed_countries ?? ['IN'];

  let country: string | null = null;
  let allowed = true;
  let reason = 'ok';

  if (ipEnabled) {
    const { data: hit } = await supa.from('admin_ip_allowlist').select('id').eq('ip_address', ip).maybeSingle();
    if (!hit) { allowed = false; reason = `ip_not_allowlisted:${ip}`; }
  }

  if (allowed && geoEnabled) {
    country = await lookupCountry(ip);
    if (country && !allowedCountries.includes(country)) {
      allowed = false; reason = `country_blocked:${country}`;
    }
  }

  await supa.from('admin_access_log').insert({
    user_id: userId, email, ip_address: ip, country_code: country, user_agent: ua,
    allowed, reason,
  });

  return new Response(JSON.stringify({ allowed, reason, ip, country }), {
    status: allowed ? 200 : 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
