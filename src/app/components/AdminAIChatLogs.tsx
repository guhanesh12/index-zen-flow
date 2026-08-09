// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Bot, RefreshCw, Search, User, IndianRupee, MessageSquare } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`;

async function apiGet(path: string) {
  // Prefer the live Supabase session (auto-refreshed); fall back to the stored
  // admin token, and retry with the other one if the first is expired.
  const { data: { session } } = await supabase.auth.getSession();
  const stored = localStorage.getItem('admin_access_token') || '';
  const tokens = [session?.access_token || '', stored].filter(Boolean);

  let last: any = {};
  for (const token of tokens) {
    const res = await fetch(`${FN_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    last = await res.json().catch(() => ({}));
    if (res.status !== 401) return last;
  }
  return last;
}

const verdictColor = (v: string) => ({
  PLACE: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  EXIT: 'bg-red-500/15 text-red-300 border-red-500/30',
  HOLD: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  WAIT: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}[v] || 'bg-blue-500/15 text-blue-300 border-blue-500/30');

export function AdminAIChatLogs() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<{ profile: any; messages: any[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const res = await apiGet('?action=admin-chat-users');
    setUsers(res?.users || []);
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const openThread = async (userId: string) => {
    setSelected(userId);
    setThreadLoading(true);
    const res = await apiGet(`?action=admin-chat-history&userId=${encodeURIComponent(userId)}`);
    setThread({ profile: res?.profile || null, messages: res?.messages || [] });
    setThreadLoading(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const p = u.profile || {};
      return [p.full_name, p.email, p.mobile, p.client_id, u.user_id]
        .filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q));
    });
  }, [users, query]);

  const totalCharged = users.reduce((s, u) => s + Number(u.charged || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Bot className="size-5 text-blue-400" /> AI Assistant Chats
          </h2>
          <p className="text-sm text-slate-400">
            {users.length} user(s) · ₹{totalCharged.toFixed(2)} billed
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadUsers} disabled={loading}>
          <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-3 bg-slate-900/60 border-slate-800">
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search user, email, client id…"
              className="pl-8 bg-slate-950/60 border-slate-800 text-sm"
            />
          </div>
          <ScrollArea className="h-[520px] pr-2">
            <div className="space-y-1">
              {!loading && filtered.length === 0 && (
                <p className="text-sm text-slate-500 px-2 py-6 text-center">No AI chats yet.</p>
              )}
              {filtered.map((u) => {
                const p = u.profile || {};
                const active = selected === u.user_id;
                return (
                  <button
                    key={u.user_id}
                    onClick={() => openThread(u.user_id)}
                    className={`w-full text-left rounded-xl p-2.5 flex items-start gap-2.5 transition-colors
                      ${active ? 'bg-blue-600/20 ring-1 ring-blue-500/40' : 'hover:bg-slate-800/60'}`}
                  >
                    {p.photo_url
                      ? <img src={p.photo_url} alt={p.full_name || 'User avatar'} className="size-9 rounded-full object-cover shrink-0" />
                      : <span className="size-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                          <User className="size-4 text-slate-400" />
                        </span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-white truncate">{p.full_name || p.email || u.user_id.slice(0, 8)}</span>
                      <span className="block text-xs text-slate-500 truncate">{u.last_message || '—'}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                        <MessageSquare className="size-3" />{u.messages}
                        <IndianRupee className="size-3" />{Number(u.charged || 0).toFixed(2)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </Card>

        <Card className="p-4 bg-slate-900/60 border-slate-800 min-h-[560px]">
          {!selected && (
            <div className="h-[520px] flex flex-col items-center justify-center text-slate-500 gap-2">
              <Bot className="size-8" />
              <p className="text-sm">Select a user to view their AI conversation.</p>
            </div>
          )}

          {selected && (
            <>
              <div className="flex items-center gap-3 pb-3 mb-3 border-b border-slate-800">
                {thread?.profile?.photo_url
                  ? <img src={thread.profile.photo_url} alt={thread.profile.full_name || 'User avatar'} className="size-10 rounded-full object-cover" />
                  : <span className="size-10 rounded-full bg-slate-800 flex items-center justify-center"><User className="size-4 text-slate-400" /></span>}
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{thread?.profile?.full_name || 'Unknown user'}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {thread?.profile?.email || selected} · {thread?.profile?.client_id || '—'}
                  </p>
                </div>
              </div>

              <ScrollArea className="h-[480px] pr-3">
                {threadLoading && <p className="text-sm text-slate-500 py-6 text-center">Loading conversation…</p>}
                <div className="space-y-3">
                  {(thread?.messages || []).map((m: any) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap
                        ${m.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-slate-800/70 text-slate-100 rounded-bl-sm'}`}>
                        {m.role === 'assistant' && (m.verdict || m.action_type) && (
                          <div className="flex flex-wrap gap-1.5 mb-1.5">
                            {m.verdict && (
                              <Badge variant="outline" className={`text-[10px] ${verdictColor(m.verdict)}`}>{m.verdict}</Badge>
                            )}
                            {m.action_type && m.action_type !== 'none' && (
                              <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-300">
                                {m.action_type}
                              </Badge>
                            )}
                          </div>
                        )}
                        {m.content}
                        <div className="mt-1.5 flex items-center gap-2 text-[10px] opacity-60">
                          <span>{new Date(m.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                          {Number(m.charged) > 0 && <span>· ₹{Number(m.charged).toFixed(2)}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  {!threadLoading && (thread?.messages || []).length === 0 && (
                    <p className="text-sm text-slate-500 py-6 text-center">No messages.</p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default AdminAIChatLogs;
