// @ts-nocheck
/**
 * Admin operations API helper.
 *
 * Admin panel sessions authenticate with a hotkey token stored in
 * sessionStorage — they are not a normal Supabase auth session, so direct
 * table reads from the browser return nothing. Every admin operations screen
 * goes through these service-role backed endpoints instead.
 */
import { projectId } from '@/utils-ext/supabase/info';

export const adminServerUrl = (serverUrl?: string) =>
  serverUrl || `https://${projectId}.supabase.co/functions/v1/make-server-c4d79cb7`;

export const adminToken = (accessToken?: string) =>
  accessToken ||
  sessionStorage.getItem('admin_access_token') ||
  localStorage.getItem('admin_access_token') ||
  '';

export async function adminGet(path: string, serverUrl?: string, accessToken?: string) {
  const r = await fetch(`${adminServerUrl(serverUrl)}${path}`, {
    headers: { Authorization: `Bearer ${adminToken(accessToken)}`, 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

export async function adminPost(path: string, body: any, serverUrl?: string, accessToken?: string) {
  const r = await fetch(`${adminServerUrl(serverUrl)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken(accessToken)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}
