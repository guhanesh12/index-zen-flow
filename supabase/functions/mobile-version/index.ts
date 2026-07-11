// Public endpoint: GET /functions/v1/mobile-version
// Returns the current mobile app version config. No auth required.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supa = createClient(SUPA_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await supa
      .from('mobile_app_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;
    const cfg = data || {};

    return new Response(JSON.stringify({
      androidCurrentVersion: cfg.android_current_version || '1.0.0',
      androidMinimumVersion: cfg.android_minimum_version || '1.0.0',
      androidStoreUrl: cfg.android_store_url || '',
      iosCurrentVersion: cfg.ios_current_version || '1.0.0',
      iosMinimumVersion: cfg.ios_minimum_version || '1.0.0',
      iosStoreUrl: cfg.ios_store_url || '',
      forceUpdate: !!cfg.force_update,
      title: cfg.update_title || 'New Update Available',
      message: cfg.update_message || 'Please update to continue using the app.',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }, status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message || e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
