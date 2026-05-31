// @ts-nocheck
/**
 * 🛡️ SECURITY ACTIVITY MONITOR
 * Real-time feed of all user & admin activity, failed logins, and suspended accounts.
 * Auto-suspend is enforced at the database level via the suspended_users table + RLS.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, Activity, UserX, RefreshCw, Search, Ban, CheckCircle2, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import AuditLogger from '@/utils-ext/security/AuditLogger';

type Tab = 'activity' | 'failed' | 'suspended';

export function SecurityActivityMonitor() {
  const [tab, setTab] = useState<Tab>('activity');
  const [loading, setLoading] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [failed, setFailed] = useState<any[]>([]);
  const [suspended, setSuspended] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ today: 0, failed24h: 0, suspended: 0, critical: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [a, f, s] = await Promise.all([
        supabase.from('security_audit_log').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('failed_login_attempts').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('suspended_users').select('*').order('suspended_at', { ascending: false }).limit(100),
      ]);
      setActivity(a.data || []);
      setFailed(f.data || []);
      setSuspended(s.data || []);

      setStats({
        today: (a.data || []).filter((x: any) => x.created_at >= since).length,
        failed24h: (f.data || []).filter((x: any) => x.created_at >= since).length,
        suspended: (s.data || []).filter((x: any) => !x.unsuspended_at).length,
        critical: (a.data || []).filter((x: any) => x.status === 'critical' || x.status === 'blocked').length,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel('sec-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_audit_log' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'failed_login_attempts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suspended_users' }, load)
      .subscribe();
    const t = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return { activity, failed, suspended };
    const m = (o: any) => JSON.stringify(o).toLowerCase().includes(q);
    return { activity: activity.filter(m), failed: failed.filter(m), suspended: suspended.filter(m) };
  }, [search, activity, failed, suspended]);

  const handleUnsuspend = async (userId: string) => {
    if (!confirm('Unsuspend this user and restore database access?')) return;
    const { error } = await supabase
      .from('suspended_users')
      .update({ unsuspended_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('unsuspended_at', null);
    if (error) return alert(error.message);
    await AuditLogger.log({ action: 'admin_unsuspend_user', resource: 'account', resource_id: userId, status: 'success' });
    load();
  };

  const handleSuspend = async () => {
    const userId = prompt('User ID to suspend:');
    if (!userId) return;
    const reason = prompt('Reason for suspension:') || 'Manual admin action';
    const { error } = await supabase
      .from('suspended_users')
      .insert({ user_id: userId, reason, auto: false, rule_triggered: 'manual' });
    if (error) return alert(error.message);
    await AuditLogger.log({ action: 'admin_suspend_user', resource: 'account', resource_id: userId, status: 'success', metadata: { reason } });
    load();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      success: 'bg-green-500/20 text-green-400 border-green-500/30',
      failed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      blocked: 'bg-red-500/20 text-red-400 border-red-500/30',
      critical: 'bg-red-500/30 text-red-300 border-red-500/50',
    };
    return map[s] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="size-6 text-cyan-400" />
            Security Activity Monitor
          </h2>
          <p className="text-gray-400 text-sm mt-1">Real-time user & admin activity. Auto-suspend enforced at DB level.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSuspend} className="px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold hover:bg-red-500/30 flex items-center gap-2">
            <Ban className="size-4" /> Suspend User
          </button>
          <button onClick={load} className="px-3 py-2 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-sm font-semibold hover:bg-cyan-500/30 flex items-center gap-2">
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Events (24h)', value: stats.today, icon: Activity, color: 'text-cyan-400' },
          { label: 'Failed Logins (24h)', value: stats.failed24h, icon: AlertTriangle, color: 'text-yellow-400' },
          { label: 'Suspended Accounts', value: stats.suspended, icon: UserX, color: 'text-red-400' },
          { label: 'Critical / Blocked', value: stats.critical, icon: Lock, color: 'text-red-300' },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-400 text-xs">{s.label}</span>
              <s.icon className={`size-4 ${s.color}`} />
            </div>
            <div className={`text-2xl font-bold mt-2 ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 relative min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, IP, action, metadata..."
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['activity', 'failed', 'suspended'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${tab === t ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {t === 'activity' ? `Activity (${filtered.activity.length})` : t === 'failed' ? `Failed Logins (${filtered.failed.length})` : `Suspended (${filtered.suspended.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          {tab === 'activity' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Actor</th>
                  <th className="text-left p-3">Action</th>
                  <th className="text-left p-3">Resource</th>
                  <th className="text-left p-3">IP</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.activity.map((e) => (
                  <tr key={e.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                    <td className="p-3 text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="p-3 text-white">{e.actor_email || e.actor_user_id?.slice(0, 8) || '—'}</td>
                    <td className="p-3 text-cyan-400 font-mono text-xs">{e.action}</td>
                    <td className="p-3 text-gray-300">{e.resource || '—'}</td>
                    <td className="p-3 text-gray-400 font-mono text-xs">{e.ip_address || '—'}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs border ${statusBadge(e.status)}`}>{e.status}</span></td>
                  </tr>
                ))}
                {filtered.activity.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No activity</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'failed' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left p-3">Time</th>
                  <th className="text-left p-3">Identifier</th>
                  <th className="text-left p-3">IP</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {filtered.failed.map((e) => (
                  <tr key={e.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                    <td className="p-3 text-gray-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="p-3 text-white">{e.identifier}</td>
                    <td className="p-3 text-gray-400 font-mono text-xs">{e.ip_address || '—'}</td>
                    <td className="p-3 text-yellow-400">{e.attempt_type}</td>
                    <td className="p-3 text-gray-300">{e.reason || '—'}</td>
                  </tr>
                ))}
                {filtered.failed.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-500">No failed logins</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'suspended' && (
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50 text-gray-400 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-left p-3">Suspended</th>
                  <th className="text-left p-3">User ID</th>
                  <th className="text-left p-3">Reason</th>
                  <th className="text-left p-3">Rule</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.suspended.map((e) => (
                  <tr key={e.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                    <td className="p-3 text-gray-400 whitespace-nowrap">{new Date(e.suspended_at).toLocaleString()}</td>
                    <td className="p-3 text-white font-mono text-xs">{e.user_id?.slice(0, 12)}…</td>
                    <td className="p-3 text-gray-300">{e.reason}</td>
                    <td className="p-3 text-orange-400 font-mono text-xs">{e.rule_triggered || '—'}</td>
                    <td className="p-3">{e.auto ? <span className="text-red-400">AUTO</span> : <span className="text-blue-400">MANUAL</span>}</td>
                    <td className="p-3">
                      {e.unsuspended_at
                        ? <span className="text-green-400 flex items-center gap-1 text-xs"><CheckCircle2 className="size-3" /> Active</span>
                        : <span className="text-red-400 flex items-center gap-1 text-xs"><Ban className="size-3" /> Blocked</span>}
                    </td>
                    <td className="p-3">
                      {!e.unsuspended_at && (
                        <button onClick={() => handleUnsuspend(e.user_id)} className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs hover:bg-green-500/30">
                          Unsuspend
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.suspended.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-500">No suspended accounts</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-xs text-blue-300">
        <strong>🔒 Auto-Suspend Active:</strong> Accounts with 10+ failed login attempts in 15 minutes are automatically suspended at the database level. Suspended users are blocked from reading or writing to trading, broker, wallet, and notification tables (enforced by RLS — cannot be bypassed from the client).
      </div>
    </div>
  );
}

export default SecurityActivityMonitor;
