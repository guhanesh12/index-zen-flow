/**
 * 💡 VPS Power Scheduler
 *
 * Cost-saver: powers DigitalOcean droplets OFF outside Indian market hours
 * and back ON before market open. Admins can override via /vps-power/all-on
 * or /vps-power/all-off, and toggle the auto-schedule entirely.
 *
 * Times (IST, Asia/Kolkata):
 *   • Market days (Mon-Fri): 08:55 IST -> startup
 *                            15:31 IST -> shutdown (also stops trading engine)
 *   • Sat/Sun: stay OFF until Monday 08:55 IST
 *   • Special trading sessions: admin uses /vps-power/all-on to keep ON
 */

import * as kv from './kv_store.tsx';
import * as IPPoolManager from './ip_pool_manager.tsx';

const POWER_PREFIX = 'vps_power:';                  // vps_power:{userId}
const SCHEDULE_FLAG_KEY = 'vps_power:schedule_enabled';
const SPECIAL_SESSION_KEY = 'vps_power:special_session_date'; // YYYY-MM-DD when admin keeps ON

export interface VpsPowerState {
  userId: string;
  dropletId?: string;
  ipAddress?: string;
  state: 'on' | 'off' | 'unknown';
  source: 'cron' | 'admin' | 'user' | 'system';
  at: string;
  lastError?: string;
}

const DO_BASE = 'https://api.digitalocean.com/v2';

function getToken(): string | null {
  return Deno.env.get('DIGITALOCEAN_API_TOKEN') || null;
}

async function doAction(dropletId: string, type: 'shutdown' | 'power_on' | 'power_off', ipAddress?: string): Promise<{ ok: boolean; error?: string; dropletId?: string }> {
  const token = getToken();
  if (!token) return { ok: false, error: 'No DIGITALOCEAN_API_TOKEN' };
  const doCall = async (id: string) => fetch(`${DO_BASE}/droplets/${id}/actions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  try {
    let r = await doCall(dropletId);
    if (r.status === 404 && ipAddress) {
      // Stale dropletId — resolve by IP and heal
      const fresh = await resolveDropletIdByIp(ipAddress);
      if (fresh && fresh !== dropletId) {
        await updateStoredDropletId(ipAddress, fresh);
        r = await doCall(fresh);
        if (r.ok) return { ok: true, dropletId: fresh };
      }
    }
    if (!r.ok) {
      const text = await r.text();
      return { ok: false, error: `DO ${r.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function getDropletStatus(dropletId: string, ipAddress?: string): Promise<{ status: 'active' | 'off' | 'unknown'; dropletId: string }> {
  const token = getToken();
  if (!token) return { status: 'unknown', dropletId };
  try {
    let r = await fetch(`${DO_BASE}/droplets/${dropletId}`, { headers: { 'Authorization': `Bearer ${token}` } });
    let id = dropletId;
    if (r.status === 404 && ipAddress) {
      const fresh = await resolveDropletIdByIp(ipAddress);
      if (fresh) {
        await updateStoredDropletId(ipAddress, fresh);
        id = fresh;
        r = await fetch(`${DO_BASE}/droplets/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      }
    }
    if (!r.ok) return { status: 'unknown', dropletId: id };
    const data = await r.json();
    const s = data?.droplet?.status;
    return { status: s === 'active' ? 'active' : s === 'off' ? 'off' : 'unknown', dropletId: id };
  } catch {
    return { status: 'unknown', dropletId };
  }
}

/** Query all droplets and find the one that owns this public IPv4. */
async function resolveDropletIdByIp(ip: string): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    let page = 1;
    while (page <= 5) {
      const r = await fetch(`${DO_BASE}/droplets?per_page=200&page=${page}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!r.ok) return null;
      const data = await r.json();
      const droplets = data?.droplets || [];
      for (const d of droplets) {
        const v4 = d?.networks?.v4 || [];
        if (v4.some((n: any) => n?.ip_address === ip && n?.type === 'public')) {
          return String(d.id);
        }
      }
      if (droplets.length < 200) break;
      page++;
    }
    return null;
  } catch { return null; }
}

async function updateStoredDropletId(ip: string, dropletId: string) {
  try {
    const cur = await kv.get(`ip_pool:${ip}`) as any;
    if (!cur) return;
    cur.metadata = { ...(cur.metadata || {}), dropletId };
    await kv.set(`ip_pool:${ip}`, cur);
    console.log(`🔧 [vps] Healed stale dropletId for ${ip} -> ${dropletId}`);
  } catch (e: any) {
    console.warn(`[vps] updateStoredDropletId failed: ${e?.message}`);
  }
}


async function setPowerState(state: VpsPowerState) {
  await kv.set(`${POWER_PREFIX}${state.userId}`, state);
}

export async function getPowerState(userId: string): Promise<VpsPowerState | null> {
  return await kv.get(`${POWER_PREFIX}${userId}`) as VpsPowerState | null;
}

export async function isScheduleEnabled(): Promise<boolean> {
  const v = await kv.get(SCHEDULE_FLAG_KEY);
  return v === null || v === undefined ? true : Boolean(v);
}

export async function setScheduleEnabled(enabled: boolean) {
  await kv.set(SCHEDULE_FLAG_KEY, enabled);
}

export async function getSpecialSessionDate(): Promise<string | null> {
  return (await kv.get(SPECIAL_SESSION_KEY)) as string | null;
}

export async function setSpecialSessionDate(dateIso: string | null) {
  if (dateIso) await kv.set(SPECIAL_SESSION_KEY, dateIso);
  else await kv.del(SPECIAL_SESSION_KEY);
}

/** Returns IST day-of-week 0=Sun..6=Sat */
function istDayOfWeek(d = new Date()): number {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs);
  return ist.getUTCDay();
}

function istDateString(d = new Date()): string {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs);
  return ist.toISOString().slice(0, 10);
}

/** Returns all assigned active VPS users */
async function listAssignedVps(): Promise<Array<{ userId: string; ipAddress: string; dropletId?: string }>> {
  const entries = await kv.getByPrefix('user_ip_assignment:');
  const out: Array<{ userId: string; ipAddress: string; dropletId?: string }> = [];
  for (const e of entries) {
    const v: any = e.value;
    if (!v?.userId || !v?.ipAddress) continue;
    if (v.subscriptionStatus && v.subscriptionStatus !== 'active') continue;
    let dropletId: string | undefined;
    try {
      const ip = await kv.get(`ip_pool:${v.ipAddress}`) as any;
      dropletId = ip?.metadata?.dropletId;
    } catch {}
    out.push({ userId: v.userId, ipAddress: v.ipAddress, dropletId });
  }
  return out;
}

async function applyToAll(action: 'shutdown' | 'power_on', source: VpsPowerState['source']) {
  const list = await listAssignedVps();
  const results: Array<{ userId: string; ok: boolean; error?: string; skipped?: boolean }> = [];
  for (const v of list) {
    if (!v.dropletId) {
      results.push({ userId: v.userId, ok: false, error: 'No dropletId', skipped: true });
      continue;
    }
    // skip no-op
    const cur = await getDropletStatus(v.dropletId);
    if (action === 'shutdown' && cur === 'off') {
      await setPowerState({ userId: v.userId, dropletId: v.dropletId, ipAddress: v.ipAddress, state: 'off', source, at: new Date().toISOString() });
      results.push({ userId: v.userId, ok: true, skipped: true });
      continue;
    }
    if (action === 'power_on' && cur === 'active') {
      await setPowerState({ userId: v.userId, dropletId: v.dropletId, ipAddress: v.ipAddress, state: 'on', source, at: new Date().toISOString() });
      results.push({ userId: v.userId, ok: true, skipped: true });
      continue;
    }
    const r = await doAction(v.dropletId, action);
    await setPowerState({
      userId: v.userId,
      dropletId: v.dropletId,
      ipAddress: v.ipAddress,
      state: r.ok ? (action === 'shutdown' ? 'off' : 'on') : 'unknown',
      source,
      at: new Date().toISOString(),
      lastError: r.ok ? undefined : r.error,
    });
    results.push({ userId: v.userId, ok: r.ok, error: r.error });
  }
  return results;
}

/**
 * 15:30 IST safety cutoff: force-stop ALL engines, then power OFF all VPS.
 * Engine-driven model means VPS normally follows engine state; this cron
 * guarantees nothing keeps running past market close.
 */
export async function autoShutdownAll() {
  if (!(await isScheduleEnabled())) return { skipped: 'schedule_disabled' };
  const special = await getSpecialSessionDate();
  if (special && special === istDateString()) {
    return { skipped: 'special_session' };
  }
  const dow = istDayOfWeek();
  if (dow === 0 || dow === 6) return { skipped: 'weekend' };
  await stopAllEngines();
  const results = await applyToAll('shutdown', 'cron');
  return { ok: true, results };
}

/** Engine-driven mode: VPS only powers ON when user starts engine. */
export async function autoStartupAll() {
  return { skipped: 'engine_driven_mode' };
}

/**
 * Reconcile VPS power with engine state for ALL assigned users:
 *   engine running -> VPS must be ON
 *   engine stopped -> VPS must be OFF
 * Called periodically from the engine-tick cron so drift self-heals.
 */
export async function reconcileAllWithEngine() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const engineRunning = new Map<string, boolean>();
  if (supabaseUrl && serviceKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/trading_engine_state?select=user_id,is_running`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (r.ok) {
        const rows = await r.json();
        for (const row of rows) engineRunning.set(row.user_id, !!row.is_running);
      }
    } catch (e) {
      console.warn('[vps reconcile] engine fetch failed', (e as any)?.message);
    }
  }
  // Fallback / merge with KV engine state
  try {
    const kvMod = await import('./kv_store.tsx');
    const all = await kvMod.getByPrefix('engine_state:');
    for (const e of all) {
      const v: any = e.value;
      const uid = v?.userId || e.key.split(':')[1];
      if (!uid) continue;
      if (!engineRunning.has(uid)) engineRunning.set(uid, !!(v?.isRunning || v?.is_running));
    }
  } catch {}

  const list = await listAssignedVps();
  const results: Array<{ userId: string; ip?: string; action: string; ok?: boolean; error?: string }> = [];
  for (const v of list) {
    if (!v.dropletId) continue;
    const shouldBeOn = engineRunning.get(v.userId) === true;
    const cur = await getDropletStatus(v.dropletId);
    if (shouldBeOn && cur !== 'active') {
      const r = await doAction(v.dropletId, 'power_on');
      await setPowerState({
        userId: v.userId, dropletId: v.dropletId, ipAddress: v.ipAddress,
        state: r.ok ? 'on' : 'unknown', source: 'system',
        at: new Date().toISOString(), lastError: r.ok ? undefined : r.error,
      });
      results.push({ userId: v.userId, ip: v.ipAddress, action: 'power_on', ok: r.ok, error: r.error });
      console.log(`🔧 [vps reconcile] ${v.ipAddress} engine=ON vps=${cur} -> power_on (ok=${r.ok})`);
    } else if (!shouldBeOn && cur === 'active') {
      const r = await doAction(v.dropletId, 'shutdown');
      await setPowerState({
        userId: v.userId, dropletId: v.dropletId, ipAddress: v.ipAddress,
        state: r.ok ? 'off' : 'unknown', source: 'system',
        at: new Date().toISOString(), lastError: r.ok ? undefined : r.error,
      });
      results.push({ userId: v.userId, ip: v.ipAddress, action: 'shutdown', ok: r.ok, error: r.error });
      console.log(`🔧 [vps reconcile] ${v.ipAddress} engine=OFF vps=active -> shutdown (ok=${r.ok})`);
    }
  }
  return { ok: true, checked: list.length, changed: results.length, results };
}

export async function adminAllOn(markSpecial = false) {
  const results = await applyToAll('power_on', 'admin');
  if (markSpecial) await setSpecialSessionDate(istDateString());
  return { ok: true, results, special: markSpecial };
}

export async function adminAllOff() {
  await stopAllEngines();
  const results = await applyToAll('shutdown', 'admin');
  return { ok: true, results };
}

/** Engine-driven: power ON this user's VPS (called from engine/start). */
export async function userPowerOn(userId: string): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const list = await listAssignedVps();
  const v = list.find(x => x.userId === userId);
  if (!v) return { ok: false, skipped: 'no_vps_assigned' };
  if (!v.dropletId) return { ok: false, skipped: 'no_droplet_id' };
  const cur = await getDropletStatus(v.dropletId);
  if (cur === 'active') {
    await setPowerState({ userId, dropletId: v.dropletId, ipAddress: v.ipAddress, state: 'on', source: 'user', at: new Date().toISOString() });
    return { ok: true, skipped: 'already_on' };
  }
  const r = await doAction(v.dropletId, 'power_on');
  await setPowerState({
    userId, dropletId: v.dropletId, ipAddress: v.ipAddress,
    state: r.ok ? 'on' : 'unknown',
    source: 'user', at: new Date().toISOString(),
    lastError: r.ok ? undefined : r.error,
  });
  return r;
}

/** Engine-driven: power OFF this user's VPS (called from engine/stop). */
export async function userPowerOff(userId: string): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const list = await listAssignedVps();
  const v = list.find(x => x.userId === userId);
  if (!v) return { ok: false, skipped: 'no_vps_assigned' };
  if (!v.dropletId) return { ok: false, skipped: 'no_droplet_id' };
  const cur = await getDropletStatus(v.dropletId);
  if (cur === 'off') {
    await setPowerState({ userId, dropletId: v.dropletId, ipAddress: v.ipAddress, state: 'off', source: 'user', at: new Date().toISOString() });
    return { ok: true, skipped: 'already_off' };
  }
  const r = await doAction(v.dropletId, 'shutdown');
  await setPowerState({
    userId, dropletId: v.dropletId, ipAddress: v.ipAddress,
    state: r.ok ? 'off' : 'unknown',
    source: 'user', at: new Date().toISOString(),
    lastError: r.ok ? undefined : r.error,
  });
  return r;
}

export async function adminTogglePower(userId: string, target: 'on' | 'off') {
  const list = await listAssignedVps();
  const v = list.find(x => x.userId === userId);
  if (!v || !v.dropletId) return { ok: false, error: 'User has no provisioned VPS' };
  const r = await doAction(v.dropletId, target === 'on' ? 'power_on' : 'shutdown');
  await setPowerState({
    userId,
    dropletId: v.dropletId,
    ipAddress: v.ipAddress,
    state: r.ok ? target : 'unknown',
    source: 'admin',
    at: new Date().toISOString(),
    lastError: r.ok ? undefined : r.error,
  });
  return r;
}

/** Stop all running trading engines (used at 15:31 IST and admin all-off). */
async function stopAllEngines() {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return;
    const r = await fetch(`${supabaseUrl}/rest/v1/trading_engine_state?is_running=eq.true`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        is_running: false,
        stopped_at: new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      }),
    });
    if (!r.ok) console.error('stopAllEngines DB error', r.status, await r.text());
    // also clear KV state
    const all = await kv.getByPrefix('engine_state:');
    for (const e of all) {
      const v: any = e.value;
      if (v?.isRunning) {
        v.isRunning = false;
        v.lastUpdated = Date.now();
        v.stoppedBy = 'auto_market_close';
        await kv.set(e.key, v);
      }
    }
  } catch (e) {
    console.error('stopAllEngines error', e);
  }
}

/** Status snapshot for admin dashboard */
export async function getStatusSnapshot() {
  const list = await listAssignedVps();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Bulk fetch engine states
  const engineMap = new Map<string, any>();
  if (supabaseUrl && serviceKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/trading_engine_state?select=user_id,is_running,last_heartbeat,started_at,stopped_at`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (r.ok) {
        const rows = await r.json();
        for (const row of rows) engineMap.set(row.user_id, row);
      }
    } catch {}
  }

  const out = [];
  for (const v of list) {
    const power = await getPowerState(v.userId);
    let email: string | undefined;
    try {
      const profile = await kv.get(`user_profile:${v.userId}`) as any;
      email = profile?.email;
    } catch {}
    const engine = engineMap.get(v.userId);
    out.push({
      userId: v.userId,
      email,
      ipAddress: v.ipAddress,
      dropletId: v.dropletId,
      powerState: power?.state || 'unknown',
      powerSource: power?.source,
      powerAt: power?.at,
      powerError: power?.lastError,
      engineRunning: Boolean(engine?.is_running),
      engineHeartbeat: engine?.last_heartbeat,
      engineStartedAt: engine?.started_at,
      engineStoppedAt: engine?.stopped_at,
    });
  }
  return {
    scheduleEnabled: await isScheduleEnabled(),
    specialSessionDate: await getSpecialSessionDate(),
    istDate: istDateString(),
    istDow: istDayOfWeek(),
    vps: out,
  };
}

/** User-facing status (their own VPS only) */
export async function getUserPowerStatus(userId: string) {
  const power = await getPowerState(userId);
  const scheduleEnabled = await isScheduleEnabled();
  const special = await getSpecialSessionDate();
  const isSpecialToday = special === istDateString();
  return {
    state: power?.state || 'unknown',
    source: power?.source,
    at: power?.at,
    scheduleEnabled,
    specialSessionToday: isSpecialToday,
  };
}
