// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { getBaseUrl } from "../utils/apiService";
import { FlaskConical, RefreshCw, Users, Wallet, Trophy, Search } from "lucide-react";

const inr = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

export function AdminBacktests() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("admin_access_token") || localStorage.getItem("access_token") || "";
      const res = await fetch(`${getBaseUrl()}/admin/strategy-backtests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to load backtests");
      setRuns(data.runs || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((r) =>
      `${r.user_name || ""} ${r.user_email || ""} ${(r.indices || []).join(" ")}`.toLowerCase().includes(needle));
  }, [runs, q]);

  const totals = useMemo(() => {
    const users = new Set(runs.map((r) => r.user_id)).size;
    const revenue = runs.reduce((s, r) => s + Number(r.cost || 0), 0);
    const avgWin = runs.length
      ? runs.reduce((s, r) => s + Number(r.summary?.winRate || 0), 0) / runs.length
      : 0;
    return { users, revenue, avgWin: avgWin.toFixed(1) };
  }, [runs]);

  return (
    <div className="space-y-4">
      <Card className="bg-zinc-900/60 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-emerald-400" /> User Backtests
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Every strategy backtest run by users — index-wise results and ₹5 run revenue.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={load}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={FlaskConical} label="Total Runs" value={String(runs.length)} />
            <Stat icon={Users} label="Unique Users" value={String(totals.users)} />
            <Stat icon={Wallet} label="Backtest Revenue" value={inr(totals.revenue)} />
            <Stat icon={Trophy} label="Avg Win Rate" value={`${totals.avgWin}%`} />
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search user or index…"
              aria-label="Search backtests"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white"
            />
          </div>

          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

          <div className="space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-lg bg-zinc-950/60 border border-zinc-800">
                <button
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="w-full text-left p-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div>
                    <div className="text-sm text-white">{r.user_name}</div>
                    <div className="text-xs text-zinc-500">
                      {r.from_date} → {r.to_date} · {inr(r.initial_capital)} · {(r.indices || []).join(", ")}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700">{r.strategy}</Badge>
                    <div className="text-right">
                      <div className={`text-sm ${(r.summary?.netPnL || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {inr(r.summary?.netPnL || 0)}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {r.summary?.winRate || 0}% · {r.summary?.totalTrades || 0} trades
                      </div>
                    </div>
                  </div>
                </button>
                {expanded === r.id && (
                  <div className="px-3 pb-3 grid sm:grid-cols-3 gap-2">
                    {(r.by_index || []).map((b: any) => (
                      <div key={b.index} className="p-2 rounded-md bg-zinc-900 border border-zinc-800">
                        <div className="text-xs text-zinc-400">{b.index}</div>
                        <div className={`text-sm ${b.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{inr(b.pnl)}</div>
                        <div className="text-[11px] text-zinc-500">{b.trades} trades · {b.winRate}%</div>
                      </div>
                    ))}
                    <div className="p-2 rounded-md bg-zinc-900 border border-zinc-800 sm:col-span-3 text-[11px] text-zinc-400">
                      Profit days {r.summary?.profitDays || 0} · Loss days {r.summary?.lossDays || 0} ·
                      {" "}Max DD {inr(r.summary?.maxDrawdown || 0)} · ROI {r.summary?.roi || 0}%
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!loading && !filtered.length && (
              <div className="text-sm text-zinc-500 py-6 text-center">No backtests yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <Icon className="w-4 h-4 text-emerald-400" />
      </div>
      <div className="text-lg text-white mt-1">{value}</div>
    </div>
  );
}

export default AdminBacktests;
