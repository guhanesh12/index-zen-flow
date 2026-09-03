// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { getBaseUrl } from "../utils/apiService";
import {
  FlaskConical, TrendingUp, TrendingDown, Calendar, Wallet, Trophy,
  Activity, Download, Loader2, BarChart3, ArrowUpRight, ArrowDownRight,
} from "lucide-react";

const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"] as const;
const STRATEGIES = [
  { key: "indexpilotai", label: "IndexPilotAI Strategy", desc: "Default multi-confirmation AI engine (live strategy)" },
];

const inr = (n: number) =>
  `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

const DURATIONS = [
  { label: "1 Month", days: 30 },
  { label: "3 Months", days: 91 },
  { label: "6 Months", days: 182 },
  { label: "1 Year", days: 365 },
];

export function StrategyBacktest({ accessToken }: { accessToken: string }) {
  const [strategy, setStrategy] = useState("indexpilotai");
  const [capital, setCapital] = useState(1000000);
  const [duration, setDuration] = useState(365);
  const [selected, setSelected] = useState<string[]>([...INDICES]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<any>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [view, setView] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [progress, setProgress] = useState(0);


  const headers = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }),
    [accessToken],
  );

  const loadHistory = async () => {
    try {
      const res = await fetch(`${getBaseUrl()}/backtest/strategy/history`, { headers });
      const data = await res.json();
      if (data.success) setHistory(data.runs || []);
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => {
    loadHistory();
    (async () => {
      try {
        const res = await fetch(`${getBaseUrl()}/wallet/balance`, { headers });
        const d = await res.json();
        if (typeof d.balance === "number") setWallet(d.balance);
      } catch (_e) { /* ignore */ }
    })();
  }, [accessToken]);

  const toggleIndex = (i: string) =>
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const run = async () => {
    if (!selected.length) { setError("Select at least one index"); return; }
    setLoading(true); setError(""); setReport(null); setProgress(0);
    try {
      const post = async (path: string, payload: any) => {
        const res = await fetch(`${getBaseUrl()}${path}`, {
          method: "POST", headers, body: JSON.stringify(payload),
        });
        const text = await res.text();
        let data: any = {};
        try { data = JSON.parse(text); } catch { /* non json */ }
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Backtest failed (HTTP ${res.status})`);
        }
        return data;
      };

      const begin = await post("/backtest/strategy/begin", {
        strategy,
        indices: selected,
        initialCapital: capital,
        fromDate: isoDaysAgo(duration),
        toDate: isoDaysAgo(1),
      });
      if (typeof begin.walletBalance === "number") setWallet(begin.walletBalance);

      const tasks: any[] = begin.tasks || [];
      // run segments with a small concurrency so each request stays light
      let done = 0;
      const queue = tasks.slice();
      const worker = async () => {
        while (queue.length) {
          const t = queue.shift();
          if (!t) break;
          await post("/backtest/strategy/segment", { runId: begin.runId, ...t });
          done += 1;
          setProgress(Math.round((done / tasks.length) * 100));
        }
      };
      await Promise.all([worker(), worker(), worker()]);

      const fin = await post("/backtest/strategy/finalize", { runId: begin.runId });
      setReport(fin.report);
      if (typeof fin.walletBalance === "number") setWallet(fin.walletBalance);
      loadHistory();
    } catch (e: any) {
      setError(e.message || "Backtest failed");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };


  const s = report?.summary;
  const periods = report ? report[view] || [] : [];
  const maxAbs = Math.max(1, ...periods.map((p: any) => Math.abs(p.pnl)));

  const downloadCsv = () => {
    if (!report) return;
    const rows = [
      ["Index", "Direction", "Entry", "Exit", "Lots", "P&L", "Reason"],
      ...report.trades.map((t: any) => [t.index, t.direction, t.entryTime, t.exitTime, t.lots, t.pnl, t.reason]),
    ];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `IndexPilotAI_Backtest_${report.fromDate}_${report.toDate}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-500">
      {/* Configuration */}
      <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-emerald-400" />
                Strategy Backtest
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Replay the live IndexPilotAI strategy on real NIFTY, BANKNIFTY & SENSEX market data.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30">₹5 per run</Badge>
              {wallet !== null && (
                <Badge className="bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center gap-1">
                  <Wallet className="w-3 h-3" /> {inr(wallet)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="text-sm text-zinc-400 mb-2">Strategy</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {STRATEGIES.map((st) => (
                <button
                  key={st.key}
                  onClick={() => setStrategy(st.key)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    strategy === st.key
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
                  }`}
                >
                  <div className="text-white text-sm font-medium flex items-center gap-2">
                    {st.label}
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px]">DEFAULT</Badge>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{st.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-2 block" htmlFor="bt-capital">Investment Amount (₹)</label>
              <input
                id="bt-capital"
                type="number"
                min={10000}
                step={10000}
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-white"
              />
              <div className="flex gap-2 mt-2 flex-wrap">
                {[100000, 500000, 1000000, 2500000].map((v) => (
                  <button key={v} onClick={() => setCapital(v)}
                    className="text-xs px-2 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                    {inr(v)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm text-zinc-400 mb-2">Duration (min 1 month · max 1 year)</div>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.days}
                    onClick={() => setDuration(d.days)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                      duration === d.days
                        ? "border-blue-500/60 bg-blue-500/10 text-white"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <Calendar className="w-3 h-3 inline mr-1" />{d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm text-zinc-400 mb-2">Indices</div>
            <div className="flex gap-2 flex-wrap">
              {INDICES.map((i) => (
                <button
                  key={i}
                  onClick={() => toggleIndex(i)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                    selected.includes(i)
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={run}
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white py-6 text-base"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Running backtest on live market data…</>
            ) : (
              <><FlaskConical className="w-5 h-5 mr-2" /> Run Backtest — ₹5</>
            )}
          </Button>
          {loading && (
            <p className="text-xs text-zinc-500 text-center">
              Fetching 15-minute candles and replaying every signal. Longer durations can take up to a minute.
            </p>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {s && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Net Profit" value={inr(s.netPnL)} accent={s.netPnL >= 0 ? "green" : "red"}
              icon={s.netPnL >= 0 ? TrendingUp : TrendingDown} sub={`ROI ${s.roi}%`} />
            <StatCard label="Win Rate" value={`${s.winRate}%`} accent="blue" icon={Trophy}
              sub={`${s.wins}W / ${s.losses}L`} />
            <StatCard label="Profit Days" value={`${s.profitDays}`} accent="green" icon={ArrowUpRight}
              sub={`${s.dayWinRate}% of ${s.tradingDays} days`} />
            <StatCard label="Loss Days" value={`${s.lossDays}`} accent="red" icon={ArrowDownRight}
              sub={`Flat ${s.flatDays}`} />
          </div>

          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" /> Earnings Projection on {inr(report.initialCapital)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Projection label="Daily Average" value={s.avgDaily} />
              <Projection label="Weekly Average" value={s.avgWeekly} />
              <Projection label="Monthly Average" value={s.avgMonthly} />
              <Projection label="Yearly (projected)" value={s.projectedYearly} />
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="bg-zinc-900/60 border-zinc-800 lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" /> P&L Breakdown
                  </CardTitle>
                  <div className="flex gap-1 bg-zinc-800/70 p-1 rounded-lg">
                    {(["daily", "weekly", "monthly", "yearly"] as const).map((v) => (
                      <button key={v} onClick={() => setView(v)}
                        className={`px-2.5 py-1 rounded-md text-xs capitalize ${
                          view === v ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                        }`}>{v}</button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-auto space-y-1.5 pr-1">
                  {periods.slice().reverse().map((p: any) => (
                    <div key={p.period} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400 w-24 shrink-0">{p.period}</span>
                      <div className="flex-1 h-2.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${p.pnl >= 0 ? "bg-emerald-500" : "bg-red-500"}`}
                          style={{ width: `${Math.max(3, (Math.abs(p.pnl) / maxAbs) * 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs w-24 text-right ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {inr(p.pnl)}
                      </span>
                    </div>
                  ))}
                  {!periods.length && <div className="text-sm text-zinc-500">No trades in this period.</div>}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/60 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" /> Index Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.byIndex.map((b: any) => (
                  <div key={b.index} className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-medium">{b.index}</span>
                      <span className={`text-sm ${b.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{inr(b.pnl)}</span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">{b.trades} trades · {b.winRate}% win rate</div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <MiniStat label="Profit Factor" value={String(s.profitFactor)} />
                  <MiniStat label="Max Drawdown" value={inr(s.maxDrawdown)} />
                  <MiniStat label="Avg Win" value={inr(s.avgWin)} />
                  <MiniStat label="Avg Loss" value={inr(s.avgLoss)} />
                  <MiniStat label="Best Trade" value={inr(s.bestTrade)} />
                  <MiniStat label="Worst Trade" value={inr(s.worstTrade)} />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-base">Recent Trades ({report.trades.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={downloadCsv}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <Download className="w-4 h-4 mr-1" /> CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-zinc-500 sticky top-0 bg-zinc-900">
                    <tr>
                      <th className="text-left p-2">Index</th>
                      <th className="text-left p-2">Side</th>
                      <th className="text-left p-2">Entry</th>
                      <th className="text-left p-2">Exit</th>
                      <th className="text-right p-2">Lots</th>
                      <th className="text-right p-2">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {report.trades.slice().reverse().map((t: any, i: number) => (
                      <tr key={i} className="border-t border-zinc-800">
                        <td className="p-2">{t.index}</td>
                        <td className={`p-2 ${t.direction === "BUY_CALL" ? "text-emerald-400" : "text-red-400"}`}>
                          {t.direction === "BUY_CALL" ? "CALL" : "PUT"}
                        </td>
                        <td className="p-2">{t.entryTime}</td>
                        <td className="p-2">{t.exitTime}</td>
                        <td className="p-2 text-right">{t.lots}</td>
                        <td className={`p-2 text-right ${t.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {inr(t.pnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="text-[11px] text-zinc-500">
            Backtests simulate ATM option trades from real index candles including brokerage, taxes and slippage.
            Past performance does not guarantee future returns.
          </p>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card className="bg-zinc-900/60 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">My Backtest History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 flex-wrap gap-2">
                <div>
                  <div className="text-sm text-white">{h.from_date} → {h.to_date}</div>
                  <div className="text-xs text-zinc-500">
                    {inr(h.initial_capital)} · {(h.indices || []).join(", ")} · {h.summary?.totalTrades || 0} trades
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm ${(h.summary?.netPnL || 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {inr(h.summary?.netPnL || 0)}
                  </div>
                  <div className="text-xs text-zinc-500">{h.summary?.winRate || 0}% win</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }: any) {
  const tone = accent === "green" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "text-blue-400";
  return (
    <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{label}</span>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <div className={`text-xl font-semibold mt-1 ${tone}`}>{value}</div>
      <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}

function Projection({ label, value }: any) {
  return (
    <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-lg font-semibold ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>{inr(value)}</div>
    </div>
  );
}

function MiniStat({ label, value }: any) {
  return (
    <div className="p-2 rounded-md bg-zinc-950/60 border border-zinc-800">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-xs text-zinc-200">{value}</div>
    </div>
  );
}

export default StrategyBacktest;
