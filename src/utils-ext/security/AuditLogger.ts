// @ts-nocheck
/**
 * 🔒 SECURITY AUDIT LOGGER
 * Writes sensitive actions to the security_audit_log table.
 * Use for: admin actions, money movements, broker connect/disconnect,
 * permission changes, settings updates, etc.
 */
import { supabase } from '@/integrations/supabase/client';

export type AuditAction =
  | 'admin_login_success'
  | 'admin_login_failed'
  | 'admin_logout'
  | 'admin_2fa_enabled'
  | 'admin_2fa_disabled'
  | 'admin_user_created'
  | 'admin_user_deleted'
  | 'admin_permission_changed'
  | 'admin_hotkey_changed'
  | 'admin_settings_updated'
  | 'user_login_success'
  | 'user_login_failed'
  | 'user_password_changed'
  | 'user_email_changed'
  | 'broker_connected'
  | 'broker_disconnected'
  | 'wallet_topup'
  | 'wallet_debit'
  | 'order_placed'
  | 'order_cancelled'
  | 'engine_started'
  | 'engine_stopped'
  | 'suspicious_activity'
  | 'session_timeout'
  | 'devtools_opened'
  | 'rate_limit_hit';

interface AuditEntry {
  action: AuditAction | string;
  resource?: string;
  resource_id?: string;
  status?: 'success' | 'failed' | 'blocked';
  metadata?: Record<string, any>;
  actor_user_id?: string;
  actor_email?: string;
}

async function getClientIP(): Promise<string | null> {
  try {
    // Best-effort; backend should re-derive from headers for trust
    const cached = sessionStorage.getItem('__client_ip');
    if (cached) return cached;
    const r = await fetch('https://api.ipify.org?format=json', { cache: 'force-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.ip) sessionStorage.setItem('__client_ip', j.ip);
    return j?.ip || null;
  } catch {
    return null;
  }
}

export const AuditLogger = {
  async log(entry: AuditEntry): Promise<void> {
    try {
      let actorId = entry.actor_user_id;
      let actorEmail = entry.actor_email;

      if (!actorId) {
        const { data } = await supabase.auth.getUser();
        actorId = data?.user?.id;
        actorEmail = actorEmail || data?.user?.email || undefined;
      }

      const ip = await getClientIP();

      await supabase.from('security_audit_log').insert({
        actor_user_id: actorId || null,
        actor_email: actorEmail || null,
        action: entry.action,
        resource: entry.resource || null,
        resource_id: entry.resource_id || null,
        ip_address: ip,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
        status: entry.status || 'success',
        metadata: entry.metadata || {},
      });
    } catch (err) {
      // Never throw from the logger
      console.warn('[AuditLogger] failed:', err);
    }
  },

  async logSuspicious(reason: string, metadata: Record<string, any> = {}): Promise<void> {
    await this.log({
      action: 'suspicious_activity',
      status: 'blocked',
      metadata: { reason, ...metadata },
    });
  },
};

export default AuditLogger;
