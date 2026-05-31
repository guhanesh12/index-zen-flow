// @ts-nocheck
/**
 * 🔒 BRUTE-FORCE LOGIN GUARD
 *
 * Protects admin + user logins against credential stuffing / brute force.
 * Backed by public.failed_login_attempts + public.is_login_locked RPC.
 *
 * Rule: 5 failed attempts within 15 minutes (per identifier OR per IP) -> locked.
 */
import { supabase } from '@/integrations/supabase/client';

async function getClientIP(): Promise<string | null> {
  try {
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

export const BruteForceGuard = {
  /** Returns true if identifier OR IP is currently locked. */
  async isLocked(identifier: string): Promise<boolean> {
    try {
      const ip = await getClientIP();
      const { data, error } = await supabase.rpc('is_login_locked', {
        _identifier: identifier.toLowerCase().trim(),
        _ip: ip,
      });
      if (error) {
        console.warn('[BruteForceGuard] rpc error:', error);
        return false;
      }
      return Boolean(data);
    } catch (err) {
      console.warn('[BruteForceGuard] isLocked failed:', err);
      return false;
    }
  },

  /** Record a failed attempt. Call after a wrong password / failed 2FA. */
  async recordFailure(
    identifier: string,
    opts: { attempt_type?: 'admin' | 'user' | 'otp'; reason?: string } = {}
  ): Promise<void> {
    try {
      const ip = await getClientIP();
      await supabase.from('failed_login_attempts').insert({
        identifier: identifier.toLowerCase().trim(),
        ip_address: ip,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
        attempt_type: opts.attempt_type || 'user',
        reason: opts.reason || null,
      });
    } catch (err) {
      console.warn('[BruteForceGuard] recordFailure failed:', err);
    }
  },

  /** Convenience: throws a user-friendly Error if locked. */
  async assertNotLocked(identifier: string): Promise<void> {
    if (await this.isLocked(identifier)) {
      throw new Error(
        'Too many failed login attempts. This account is temporarily locked for 15 minutes for your security.'
      );
    }
  },
};

export default BruteForceGuard;
