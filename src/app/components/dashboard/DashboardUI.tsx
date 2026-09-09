// @ts-nocheck
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Activity, TrendingUp, TrendingDown, Wallet, Brain, Target, Shield,
  Zap, BarChart3, Briefcase, AlertTriangle, CheckCircle2, ArrowUpRight,
  ArrowDownRight, Sparkles, Cpu, Gauge, LineChart as LineChartIcon, Loader2,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, RadialBarChart, RadialBar,
} from "recharts";
import { fetchWithAuth } from "../../utils/apiClient";

/* ──────────────────────────────────────────────────────────────────── */
/* Real-data hooks                                                       */

const INDEX_DEFS = [
  { sym: "NIFTY", securityId: "13" },
  { sym: "BANKNIFTY", securityId: "25" },
  { sym: "SENSEX", securityId: "51" },
];

async function fetchIntradayOHLC(serverUrl: string, accessToken: string, securityId: string, interval = "5") {
  const res = await fetchWithAuth(`${serverUrl}/intraday-ohlc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      securityId,
      exchangeSegment: "IDX_I",
      instrument: "INDEX",
      interval,
      includeOI: false,
    }),
  });
  if (!res.ok) throw new Error(`OHLC ${res.status}`);
  return res.json();
}

export function useLiveIndices(serverUrl?: string, accessToken?: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!serverUrl || !accessToken) return;
    try {
      const results = await Promise.all(
        INDEX_DEFS.map(async (def) => {
          try {
            const json = await fetchIntradayOHLC(serverUrl, accessToken, def.securityId, "5");
            const candles = json?.candles || [];
            if (!candles.length) return null;
            const last = candles[candles.length - 1];
            const first = candles[0];
            const price = Number(last.close);
            const open = Number(first.open || first.close);
            const pct = open ? ((price - open) / open) * 100 : 0;
            const series = candles.slice(-30).map((c: any, i: number) => ({ i, v: Number(c.close) }));
            return { sym: def.sym, price, pct, series, up: pct >= 0 };
          } catch { return null; }
        })
      );
      setData(results.filter(Boolean) as any[]);
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  return { data, loading, reload: load };
}

export function useFundLimits(serverUrl?: string, accessToken?: string) {
  const [funds, setFunds] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serverUrl || !accessToken) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${serverUrl}/fund-limits`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (alive && json?.success) setFunds(json.funds);
      } catch {} finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [serverUrl, accessToken]);

  return { funds, loading };
}

export function usePositions(serverUrl?: string, accessToken?: string) {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serverUrl || !accessToken) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchWithAuth(`${serverUrl}/positions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (alive) setPositions(json?.positions || json?.data || []);
      } catch {} finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [serverUrl, accessToken]);

  return { positions, loading };
}

/* ──────────────────────────────────────────────────────────────────── */
/* Animated number counter                                              */
export function CountUp({ value, prefix = "", suffix = "", decimals = 0 }: any) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display;
    const end = Number(value) || 0;
    const dur = 700;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(start + (end - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className="tabular-nums">
      {prefix}
      {display.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
type Tone = "profit" | "loss" | "ai" | "info" | "warning" | "neutral";
const toneRing: Record<Tone, string> = {
  profit: "ring-1 ring-[hsl(var(--profit)/0.25)]",
  loss: "ring-1 ring-[hsl(var(--loss)/0.25)]",
  ai: "ring-1 ring-[hsl(var(--ai)/0.25)]",
  info: "ring-1 ring-[hsl(var(--info)/0.25)]",
  warning: "ring-1 ring-[hsl(var(--warning)/0.25)]",
  neutral: "ring-1 ring-border/40",
};
const toneIconBg: Record<Tone, string> = {
  profit: "bg-[hsl(var(--profit)/0.12)] text-[hsl(var(--profit))]",
  loss: "bg-[hsl(var(--loss)/0.12)] text-[hsl(var(--loss))]",
  ai: "bg-[hsl(var(--ai)/0.12)] text-[hsl(var(--ai))]",
  info: "bg-[hsl(var(--info)/0.12)] text-[hsl(var(--info))]",
  warning: "bg-[hsl(var(--warning)/0.12)] text-[hsl(var(--warning))]",
  neutral: "bg-muted text-muted-foreground",
};
const toneStroke: Record<Tone, string> = {
  profit: "hsl(var(--profit))",
  loss: "hsl(var(--loss))",
  ai: "hsl(var(--ai))",
  info: "hsl(var(--info))",
  warning: "hsl(var(--warning))",
  neutral: "hsl(var(--muted-foreground))",
};

export function KpiCard({
  label, value, prefix, suffix, decimals = 0, delta, tone = "neutral", icon: Icon, spark,
}: any) {
  const sparkData = useMemo(() => (spark || []).map((v: number, i: number) => ({ i, v })), [spark]);
  return (
    <div className={`glass-card p-4 hover-lift ${toneRing[tone as Tone]} animate-fade-in`}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        {Icon && (
          <div className={`size-8 rounded-lg flex items-center justify-center ${toneIconBg[tone as Tone]}`}>
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight text-foreground">
        <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      <div className="flex items-center justify-between mt-2 h-8">
        {delta !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            delta >= 0 ? "text-[hsl(var(--profit))]" : "text-[hsl(var(--loss))]"
          }`}>
            {delta >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {Math.abs(delta).toFixed(2)}%
          </div>
        )}
        {sparkData.length > 1 && (
          <div className="flex-1 h-8 ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                <defs>
                  <linearGradient id={`spark-${tone}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={toneStroke[tone as Tone]} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={toneStroke[tone as Tone]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={toneStroke[tone as Tone]} strokeWidth={1.5} fill={`url(#spark-${tone})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
export function KpiGrid({
  totalPnL = 0, todayPnL = 0, winRate = 0, runningStrategies = 0,
  openTrades = 0, aiConfidence = 0, walletBalance = 0, marginUsed = 0, spark = [],
}: any) {
  const items = [
    { label: "Total P&L", value: totalPnL, prefix: "₹", decimals: 2, tone: totalPnL >= 0 ? "profit" : "loss", icon: Wallet, spark },
    { label: "Today's Profit", value: todayPnL, prefix: "₹", decimals: 2, tone: todayPnL >= 0 ? "profit" : "loss", icon: TrendingUp, spark },
    { label: "Win Rate", value: winRate, suffix: "%", decimals: 1, tone: "info", icon: Target },
    { label: "Running Strategies", value: runningStrategies, tone: "ai", icon: Cpu },
    { label: "Open Trades", value: openTrades, tone: "warning", icon: Activity },
    { label: "AI Confidence", value: aiConfidence, suffix: "%", decimals: 0, tone: "ai", icon: Brain },
    { label: "Account Balance", value: walletBalance, prefix: "₹", decimals: 2, tone: "profit", icon: Briefcase },
    { label: "Margin Used", value: marginUsed, prefix: "₹", decimals: 0, tone: "neutral", icon: Gauge },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {items.map((it, idx) => <KpiCard key={idx} {...(it as any)} />)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Live Market Overview — REAL DATA (NIFTY + BANKNIFTY + SENSEX only)    */
export function MarketOverview({ serverUrl, accessToken }: any) {
  const { data, loading } = useLiveIndices(serverUrl, accessToken);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LineChartIcon className="size-4 text-info" />
          <h3 className="font-semibold">Live Market Overview</h3>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="live-dot" /> Live from Dhan
        </span>
      </div>
      {loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin mr-2" /> Loading live prices…
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No data — check Dhan credentials in Broker Setup.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.map((w) => (
            <div key={w.sym} className="rounded-xl border border-border/40 bg-card/40 p-3 hover-lift">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-muted-foreground">{w.sym}</div>
                <div className={`text-[10px] font-bold ${w.up ? "text-profit" : "text-loss"}`}>
                  {w.up ? "▲" : "▼"} {Math.abs(w.pct).toFixed(2)}%
                </div>
              </div>
              <div className="text-lg font-bold tabular-nums">
                {w.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </div>
              <div className="h-12 -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={w.series}>
                    <Line type="monotone" dataKey="v" dot={false} strokeWidth={1.5}
                      stroke={w.up ? "hsl(var(--profit))" : "hsl(var(--loss))"} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Risk Center — REAL DATA from positions + funds                        */
export function RiskCenter({ serverUrl, accessToken, walletBalance = 0 }: any) {
  const { funds } = useFundLimits(serverUrl, accessToken);
  const { positions } = usePositions(serverUrl, accessToken);

  const totalPnL = positions.reduce((s, p) => s + Number(p.unrealizedProfit ?? p.pnl ?? p.unrealisedProfit ?? 0), 0);
  const totalExposure = positions.reduce(
    (s, p) => s + Math.abs(Number(p.netQty ?? p.quantity ?? 0) * Number(p.buyAvg ?? p.entryPrice ?? p.avgPrice ?? 0)), 0
  );

  const available = Number(funds?.availableBalance ?? walletBalance ?? 0);
  const utilized = Number(funds?.utilizationAmount ?? 0);
  const totalCap = Math.max(1, available + utilized);

  const dailyLossPct = available > 0 && totalPnL < 0 ? Math.min(100, (Math.abs(totalPnL) / available) * 100) : 0;
  const drawdownPct = totalPnL < 0 && totalCap > 0 ? Math.min(100, (Math.abs(totalPnL) / totalCap) * 100) : 0;
  const exposurePct = totalCap > 0 ? Math.min(100, (totalExposure / totalCap) * 100) : 0;
  const marginPct = totalCap > 0 ? Math.min(100, (utilized / totalCap) * 100) : 0;

  const items = [
    { label: "Daily Loss", value: Math.round(dailyLossPct), tone: "loss" },
    { label: "Drawdown", value: Math.round(drawdownPct), tone: "warning" },
    { label: "Exposure", value: Math.round(exposurePct), tone: "info" },
    { label: "Margin", value: Math.round(marginPct), tone: "ai" },
  ];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="size-4 text-info" />
        <h3 className="font-semibold">Risk Management</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Live Dhan account</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((it) => (
          <div key={it.label} className="text-center">
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ v: it.value, fill: toneStroke[it.tone as Tone] }]}
                  startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="v" cornerRadius={8} background={{ fill: "hsl(var(--secondary))" }} />
                </RadialBarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-sm font-bold -mt-2">{it.value}%</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{it.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="rounded-lg bg-secondary/40 border border-border/40 py-2">
          <div className="text-[10px] text-muted-foreground">Available</div>
          <div className="text-sm font-semibold">₹{available.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-lg bg-secondary/40 border border-border/40 py-2">
          <div className="text-[10px] text-muted-foreground">Utilized</div>
          <div className="text-sm font-semibold">₹{utilized.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="rounded-lg bg-secondary/40 border border-border/40 py-2">
          <div className="text-[10px] text-muted-foreground">Open P&L</div>
          <div className={`text-sm font-semibold ${totalPnL >= 0 ? "text-profit" : "text-loss"}`}>
            ₹{totalPnL.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Performance Chart — REAL: live NIFTY intraday equity proxy            */
export function PerformanceChart({ serverUrl, accessToken }: any) {
  const [series, setSeries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serverUrl || !accessToken) return;
    let alive = true;
    const load = async () => {
      try {
        const json = await fetchIntradayOHLC(serverUrl, accessToken, "13", "5"); // NIFTY
        const candles = json?.candles || [];
        if (!alive) return;
        const data = candles.slice(-60).map((c: any) => ({
          d: new Date((c.timestamp || c.date || Date.now()) * (String(c.timestamp).length <= 10 ? 1000 : 1))
            .toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          eq: Number(c.close),
          pnl: Number(c.close) - Number(c.open),
        }));
        setSeries(data);
      } catch {} finally { if (alive) setLoading(false); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [serverUrl, accessToken]);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-ai" />
          <h3 className="font-semibold">NIFTY Intraday — Live</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">5-minute candles · Real Dhan data</span>
      </div>
      {loading && series.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin mr-2" /> Loading live chart…
        </div>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--ai))" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="hsl(var(--ai))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Area type="monotone" dataKey="eq" stroke="hsl(var(--ai))" strokeWidth={2} fill="url(#eqGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="h-24 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <XAxis dataKey="d" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {series.map((d, i) => (
                    <Cell key={i} fill={d.pnl >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
export function SectionHeader({ icon: Icon, title, desc, action }: any) {
  return (
    <div className="flex items-end justify-between mb-3 mt-2">
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-ai" />}
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        </div>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Indices ticker — REAL data                                            */
export function IndicesTicker({ serverUrl, accessToken }: any) {
  const { data } = useLiveIndices(serverUrl, accessToken);
  if (!data.length) return null;
  const looped = [...data, ...data, ...data];
  return (
    <div className="overflow-hidden relative w-full">
      <div className="ticker-track flex gap-6 whitespace-nowrap">
        {looped.map((w, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-foreground/90">{w.sym}</span>
            <span className="tabular-nums text-foreground/70">
              {w.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </span>
            <span className={w.pct >= 0 ? "text-profit" : "text-loss"}>
              {w.pct >= 0 ? "▲" : "▼"}{Math.abs(w.pct).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
