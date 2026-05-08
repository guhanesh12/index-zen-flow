// @ts-nocheck
import { useEffect, useState, useMemo } from "react";
import {
  Activity, TrendingUp, TrendingDown, Wallet, Brain, Target, Shield,
  Zap, BarChart3, Briefcase, AlertTriangle, CheckCircle2, ArrowUpRight,
  ArrowDownRight, Sparkles, Cpu, Gauge, LineChart as LineChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, RadialBarChart, RadialBar,
} from "recharts";

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
      {display.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* KPI Card                                                              */
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
  label, value, prefix, suffix, decimals = 0, delta, tone = "neutral",
  icon: Icon, spark,
}: {
  label: string; value: number; prefix?: string; suffix?: string; decimals?: number;
  delta?: number; tone?: Tone; icon?: any; spark?: number[];
}) {
  const sparkData = useMemo(
    () => (spark || []).map((v, i) => ({ i, v })),
    [spark]
  );
  return (
    <div className={`glass-card p-4 hover-lift ${toneRing[tone]} animate-fade-in`}>
      <div className="flex items-start justify-between mb-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </div>
        {Icon && (
          <div className={`size-8 rounded-lg flex items-center justify-center ${toneIconBg[tone]}`}>
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
                    <stop offset="0%" stopColor={toneStroke[tone]} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={toneStroke[tone]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={toneStroke[tone]} strokeWidth={1.5}
                  fill={`url(#spark-${tone})`} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* KPI Grid                                                              */
export function KpiGrid({
  totalPnL = 0, todayPnL = 0, winRate = 0, runningStrategies = 0,
  openTrades = 0, aiConfidence = 0, walletBalance = 0, marginUsed = 0,
  spark = [],
}: any) {
  const items = [
    { label: "Total P&L", value: totalPnL, prefix: "₹", decimals: 2, tone: totalPnL >= 0 ? "profit" : "loss", icon: Wallet, delta: 0, spark },
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
      {items.map((it, idx) => (
        <KpiCard key={idx} {...(it as any)} />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Market Overview Strip                                                 */
const INDEX_LIST = [
  { sym: "NIFTY", base: 24850 },
  { sym: "BANKNIFTY", base: 51200 },
  { sym: "SENSEX", base: 81400 },
  { sym: "FINNIFTY", base: 23900 },
  { sym: "MIDCPNIFTY", base: 12450 },
];

export function MarketOverview() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 2500); return () => clearInterval(t); }, []);

  const widgets = useMemo(() => INDEX_LIST.map((m) => {
    const drift = (Math.sin((Date.now() / 90000) + m.base) + Math.random() * 0.3 - 0.15) * 0.004;
    const price = m.base * (1 + drift);
    const pct = drift * 100;
    const series = Array.from({ length: 24 }).map((_, i) => ({
      i, v: m.base * (1 + Math.sin((i + tick) / 3 + m.base / 100) * 0.003 + (Math.random() - 0.5) * 0.001),
    }));
    return { ...m, price, pct, series, up: pct >= 0 };
  }), [tick]);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LineChartIcon className="size-4 text-info" />
          <h3 className="font-semibold">Live Market Overview</h3>
        </div>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="live-dot" /> Streaming
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {widgets.map((w) => (
          <div key={w.sym} className="rounded-xl border border-border/40 bg-card/40 p-3 hover-lift">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs font-semibold text-muted-foreground">{w.sym}</div>
              <div className={`text-[10px] font-bold ${w.up ? "text-profit" : "text-loss"}`}>
                {w.up ? "▲" : "▼"} {Math.abs(w.pct).toFixed(2)}%
              </div>
            </div>
            <div className="text-base font-bold tabular-nums">
              {w.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
            <div className="h-10 -mx-1">
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
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* AI Signal Card                                                        */
export function SignalCard({ signal }: any) {
  const dir = (signal?.direction || signal?.action || "HOLD").toUpperCase();
  const isBuy = dir.includes("BUY") || dir === "LONG";
  const isSell = dir.includes("SELL") || dir.includes("PUT") || dir === "SHORT";
  const isExit = dir === "EXIT";
  const tone = isBuy ? "profit" : isSell ? "loss" : isExit ? "warning" : "ai";
  const glow = tone === "profit" ? "glow-profit" : tone === "loss" ? "glow-loss" : "glow-ai";
  const grad = tone === "profit" ? "gradient-profit" : tone === "loss" ? "gradient-loss" : "gradient-ai";
  const conf = Math.round(signal?.confidence ?? signal?.aiScore ?? 0);

  return (
    <div className={`glass-card p-4 ${glow} animate-signal-pop`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{signal?.symbol || "AI Signal"}</div>
          <div className={`text-xl font-extrabold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ai"}`}>
            {dir}
          </div>
        </div>
        <div className={`size-12 rounded-full ${grad} flex items-center justify-center text-white font-bold shadow-lg`}>
          {conf}%
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <Stat label="Entry" value={signal?.entry ?? "—"} />
        <Stat label="SL" value={signal?.stopLoss ?? "—"} tone="loss" />
        <Stat label="Target" value={signal?.target ?? "—"} tone="profit" />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          ["EMA", signal?.ema],
          ["RSI", signal?.rsi],
          ["MACD", signal?.macd],
          ["VWAP", signal?.vwap],
          ["VOL", signal?.volume],
        ].map(([k, v]: any) => v ? (
          <span key={k} className="text-[10px] px-2 py-0.5 rounded-md bg-secondary/60 border border-border/40 text-foreground/80">
            {k}: <span className="font-semibold">{v}</span>
          </span>
        ) : null)}
      </div>

      <button className={`w-full py-2.5 rounded-xl text-white font-semibold ${grad} hover:opacity-90 transition`}>
        {isBuy ? "Take Buy Trade" : isSell ? "Take Sell Trade" : isExit ? "Exit Position" : "Hold & Watch"}
      </button>
    </div>
  );
}
function Stat({ label, value, tone = "neutral" as Tone }: any) {
  return (
    <div className="rounded-lg bg-secondary/40 border border-border/40 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : ""}`}>
        {value}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Risk Center                                                           */
export function RiskCenter({ dailyLoss = 30, drawdown = 12, exposure = 45, margin = 22 }: any) {
  const items = [
    { label: "Daily Loss", value: dailyLoss, tone: "loss" },
    { label: "Drawdown", value: drawdown, tone: "warning" },
    { label: "Exposure", value: exposure, tone: "info" },
    { label: "Margin", value: margin, tone: "ai" },
  ];
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="size-4 text-info" />
        <h3 className="font-semibold">Risk Management</h3>
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
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Equity / Performance Chart                                            */
export function PerformanceChart({ data }: { data?: { d: string; pnl: number }[] }) {
  const series = data?.length
    ? data
    : Array.from({ length: 14 }).map((_, i) => ({
        d: `D${i + 1}`,
        pnl: Math.round((Math.sin(i / 2) + Math.random()) * 1500),
      }));
  const cumulative = series.reduce((acc: any[], cur, i) => {
    const prev = acc[i - 1]?.eq ?? 0;
    acc.push({ ...cur, eq: prev + cur.pnl });
    return acc;
  }, []);
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-ai" />
          <h3 className="font-semibold">Strategy Performance</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">Last 14 days</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={cumulative}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--ai))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--ai))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="d" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
            <Area type="monotone" dataKey="eq" stroke="hsl(var(--ai))" strokeWidth={2} fill="url(#eqGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="h-24 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series}>
            <XAxis dataKey="d" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {series.map((d, i) => (
                <Cell key={i} fill={d.pnl >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* Section Header helper                                                 */
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
/* Indices ticker                                                        */
export function IndicesTicker() {
  const items = useMemo(() => INDEX_LIST.map((m) => {
    const drift = (Math.sin(Date.now() / 90000 + m.base) + Math.random() * 0.3) * 0.004;
    return { sym: m.sym, price: m.base * (1 + drift), pct: drift * 100 };
  }), []);
  const looped = [...items, ...items, ...items];
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
