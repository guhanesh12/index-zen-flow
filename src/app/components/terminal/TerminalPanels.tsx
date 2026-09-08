// @ts-nocheck
/**
 * Terminal UI — clean, professional, single-accent (green profit / red loss) panels.
 * Presentation only: every panel reads existing backend endpoints or engine state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithAuth } from "../../utils/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { BrokerLogo } from "../../brokerLogos";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CircleDot,
  Clock,
  LogOut as ExitIcon,
  Loader2,
  Radio,
  ShieldCheck,
  Timer,
} from "lucide-react";

/* ───────────────────────── helpers ───────────────────────── */

export const money = (v: number, d = 2) =>
  `₹${(Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: d })}`;

export const signed = (v: number, d = 2) =>
  `${Number(v) >= 0 ? "+" : "−"}₹${Math.abs(Number(v) || 0).toLocaleString("en-IN", {
    maximumFractionDigits: d,
  })}`;

export const pnlClass = (v: number) =>
  Number(v) > 0 ? "text-emerald-400" : Number(v) < 0 ? "text-red-400" : "text-zinc-300";

export const posQty = (p: any) =>
  Number(p?.netQty ?? p?.net_quantity ?? p?.netQuantity ?? p?.quantity ?? p?.qty ?? p?.netTradedQuantity ?? 0);

export const posPnL = (p: any) => {
  const direct = p?.pnl ?? p?.PnL ?? p?.profitAndLoss ?? p?.unrealizedProfit ?? p?.unrealisedProfit ?? p?.unrealised_pnl;
  if (direct !== undefined && direct !== null && direct !== "") return Number(direct) || 0;
  const un = Number(p?.unrealizedPnl ?? p?.unrealisedPnl ?? p?.unrealized_pnl ?? 0) || 0;
  const re = Number(p?.realizedPnl ?? p?.realisedPnl ?? p?.realized_pnl ?? p?.realisedProfit ?? 0) || 0;
  return un + re;
};

export const posName = (p: any) =>
  p?.tradingSymbol || p?.tradingsymbol || p?.symbol || p?.symbolName || p?.instrument || "—";

export const posSecurityId = (p: any) =>
  p?.securityId || p?.security_id || p?.instrument_token || p?.token || p?.symbolId || "";

/** Live positions with a fast refresh (default 1s). */
export function useLivePositions(serverUrl?: string, accessToken?: string, ms = 1000) {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(0);

  const load = useCallback(async () => {
    if (!serverUrl || !accessToken) return;
    try {
      const res = await fetchWithAuth(`${serverUrl}/positions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await res.json();
      setPositions(json?.positions || json?.data || []);
      setUpdatedAt(Date.now());
    } catch {
      /* keep last good data */
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, ms]);

  const open = positions.filter((p) => posQty(p) !== 0);
  const closed = positions.filter((p) => posQty(p) === 0);

  return {
    positions,
    open,
    closed,
    openPnL: open.reduce((s, p) => s + posPnL(p), 0),
    closedPnL: closed.reduce((s, p) => s + posPnL(p), 0),
    totalPnL: positions.reduce((s, p) => s + posPnL(p), 0),
    loading,
    updatedAt,
    reload: load,
  };
}

/** Engine signals published by the trading engine (NIFTY / BANKNIFTY / SENSEX). */
export function useEngineSignals(ms = 1000) {
  const read = () => {
    try {
      const raw = localStorage.getItem("engine_signals");
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        NIFTY: parsed?.NIFTY || null,
        BANKNIFTY: parsed?.BANKNIFTY || null,
        SENSEX: parsed?.SENSEX || null,
        updatedAt: Number(localStorage.getItem("engine_signals_time") || 0),
        running: localStorage.getItem("engine_running") === "true",
        interval: localStorage.getItem("engine_interval") === "5" ? "5" : "15",
      };
    } catch {
      return { NIFTY: null, BANKNIFTY: null, SENSEX: null, updatedAt: 0, running: false, interval: "15" };
    }
  };
  const [state, setState] = useState(read);
  useEffect(() => {
    const t = setInterval(() => setState(read()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return state;
}

/** Normalise any engine action into the three states the user asked for. */
export function signalState(sig: any): "WAIT" | "BUY CALL" | "BUY PUT" {
  const a = String(sig?.action || sig?.signal || "").toUpperCase();
  if (a.includes("CALL") || a === "BUY_CE" || a === "CE" || a === "BUY") return "BUY CALL";
  if (a.includes("PUT") || a === "BUY_PE" || a === "PE" || a === "SELL") return "BUY PUT";
  return "WAIT";
}

/* ───────────────────────── left rail: symbols + P&L + exit ───────────────────────── */

export function PositionRail({ serverUrl, accessToken, compact = false }: any) {
  const { open, closed, openPnL, closedPnL, totalPnL, loading, updatedAt, reload } = useLivePositions(
    serverUrl,
    accessToken,
    1000
  );
  const [exiting, setExiting] = useState<string | null>(null);
  const [error, setError] = useState<string>("");

  const exitPosition = async (p: any) => {
    const id = posSecurityId(p) || posName(p);
    if (!id) return;
    setExiting(String(id));
    setError("");
    try {
      const qty = Math.abs(posQty(p));
      const res = await fetchWithAuth(`${serverUrl}/place-order`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          securityId: posSecurityId(p),
          transactionType: posQty(p) > 0 ? "SELL" : "BUY",
          quantity: qty,
          exchangeSegment: p?.exchangeSegment || "NSE_FNO",
        }),
      });
      const json = await res.json();
      if (!json?.success) setError(json?.error || json?.message || "Exit order failed");
      await reload();
    } catch (e: any) {
      setError(e?.message || "Exit order failed");
    } finally {
      setExiting(null);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <RailHeader
        title="Positions & P&L"
        right={
          <span className="text-[10px] text-zinc-500 flex items-center gap-1">
            <CircleDot className="w-3 h-3 text-emerald-500" /> 1s
          </span>
        }
      />

      {/* P&L summary — the only place colour is used */}
      <div className="grid grid-cols-3 border-b border-zinc-800 text-center">
        <Summary label="Running" value={openPnL} sub={`${open.length} open`} />
        <Summary label="Closed" value={closedPnL} sub={`${closed.length} done`} border />
        <Summary label="Total" value={totalPnL} sub="today" />
      </div>

      <div className={`divide-y divide-zinc-800/80 ${compact ? "max-h-[420px]" : "max-h-[560px]"} overflow-auto`}>
        {loading && open.length === 0 ? (
          <Empty text="Loading positions…" />
        ) : open.length === 0 ? (
          <Empty text="No running position" sub="Positions appear here the moment an order fills." />
        ) : (
          open.map((p, i) => {
            const pnl = posPnL(p);
            const id = String(posSecurityId(p) || posName(p));
            return (
              <div key={i} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-100 truncate">{posName(p)}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Qty {Math.abs(posQty(p))} · Avg {money(p?.buyAvg ?? p?.averagePrice ?? p?.avgPrice ?? 0)} · LTP{" "}
                      {money(p?.ltp ?? p?.lastPrice ?? p?.last_price ?? 0)}
                    </div>
                  </div>
                  <div className={`text-base font-bold tabular-nums ${pnlClass(pnl)}`}>{signed(pnl)}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={exiting === id}
                  onClick={() => exitPosition(p)}
                  className="mt-2 w-full h-8 border-zinc-700 text-zinc-200 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40"
                >
                  {exiting === id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ExitIcon className="w-3.5 h-3.5" />
                  )}
                  Exit at market
                </Button>
              </div>
            );
          })
        )}
      </div>

      {error && <div className="px-3 py-2 text-[11px] text-red-400 border-t border-zinc-800">{error}</div>}
      <div className="px-3 py-1.5 text-[10px] text-zinc-600 border-t border-zinc-800">
        Updated {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"}
      </div>
    </div>
  );
}

function Summary({ label, value, sub, border }: any) {
  return (
    <div className={`py-2.5 ${border ? "border-x border-zinc-800" : ""}`}>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${pnlClass(value)}`}>{signed(value, 0)}</div>
      <div className="text-[10px] text-zinc-600">{sub}</div>
    </div>
  );
}

function RailHeader({ title, right }: any) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
      {right}
    </div>
  );
}

function Empty({ text, sub }: any) {
  return (
    <div className="py-10 text-center">
      <div className="text-sm text-zinc-500">{text}</div>
      {sub && <div className="text-[11px] text-zinc-600 mt-1">{sub}</div>}
    </div>
  );
}

/* ───────────────────────── centre: signal board ───────────────────────── */

const INDEXES = ["NIFTY", "BANKNIFTY", "SENSEX"] as const;

export function SignalBoard() {
  const signals = useEngineSignals(1000);
  const [detail, setDetail] = useState<{ index: string; sig: any } | null>(null);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <RailHeader
        title="Live Signals"
        right={
          <span className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${signals.running ? "bg-emerald-500" : "bg-zinc-600"}`} />
            {signals.running ? `Engine running · ${signals.interval}M` : "Engine stopped"}
          </span>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
        {INDEXES.map((idx) => {
          const sig = (signals as any)[idx];
          const state = signalState(sig);
          const isWait = state === "WAIT";
          return (
            <button
              key={idx}
              type="button"
              onClick={() => setDetail({ index: idx, sig })}
              className="p-4 text-left hover:bg-zinc-900/70 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-100">{idx}</span>
                <span className="text-[10px] text-zinc-600">
                  {sig?.timestamp ? new Date(sig.timestamp).toLocaleTimeString() : "—"}
                </span>
              </div>
              <div
                className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-bold tracking-wide border ${
                  isWait
                    ? "border-zinc-700 text-zinc-400 bg-zinc-900"
                    : state === "BUY CALL"
                    ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                    : "border-red-500/40 text-red-400 bg-red-500/10"
                }`}
              >
                {isWait ? (
                  <Timer className="w-4 h-4" />
                ) : state === "BUY CALL" ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                {state}
              </div>
              <div className="mt-3 text-[11px] text-zinc-500">
                Confidence <span className="text-zinc-300 font-medium">{Number(sig?.confidence || 0).toFixed(0)}%</span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-600 underline underline-offset-2">View full details</div>
            </button>
          );
        })}
      </div>

      <SignalDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function SignalDetailDialog({ detail, onClose }: any) {
  const sig = detail?.sig;
  const state = signalState(sig);
  const rows: Array<[string, any]> = sig
    ? [
        ["Signal", state],
        ["Confidence", `${Number(sig.confidence || 0).toFixed(0)}%`],
        ["Spot price", sig.price ? money(sig.price) : "—"],
        ["Strike", sig.strike ?? "—"],
        ["Option type", sig.optionType ?? "—"],
        ["Trend", sig.trend ?? sig?.marketRegime?.type ?? "—"],
        ["RSI", sig?.indicators?.rsi ?? sig?.rsi ?? "—"],
        ["ADX", sig?.indicators?.adx ?? sig?.adx ?? "—"],
        ["Time", sig.timestamp ? new Date(sig.timestamp).toLocaleString() : "—"],
      ]
    : [];

  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{detail?.index} — signal details</DialogTitle>
        </DialogHeader>
        {!sig ? (
          <p className="text-sm text-zinc-500">
            No signal yet for {detail?.index}. The engine posts a signal at every candle close.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-zinc-500">{k}</span>
                  <span
                    className={
                      k === "Signal"
                        ? state === "BUY CALL"
                          ? "text-emerald-400 font-semibold"
                          : state === "BUY PUT"
                          ? "text-red-400 font-semibold"
                          : "text-zinc-300 font-semibold"
                        : "text-zinc-200"
                    }
                  >
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
            {(sig.reasoning || sig.reason) && (
              <div className="rounded-lg border border-zinc-800 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Why this signal</div>
                <p className="text-sm text-zinc-300">{sig.reasoning || sig.reason}</p>
              </div>
            )}
            {Array.isArray(sig.confirmations) && sig.confirmations.length > 0 && (
              <div className="rounded-lg border border-zinc-800 p-3">
                <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Confirmations</div>
                <ul className="text-sm text-zinc-300 space-y-0.5">
                  {sig.confirmations.map((c: any, i: number) => (
                    <li key={i}>{String(c)}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── right rail: activity / broker / engine ───────────────────────── */

export function ActivityRail({ logs = [] }: any) {
  const items = useMemo(() => (Array.isArray(logs) ? logs.slice(0, 40) : []), [logs]);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <RailHeader
        title="Recent Activity"
        right={<span className="text-[10px] text-zinc-500">{items.length}</span>}
      />
      <div className="max-h-[420px] overflow-auto divide-y divide-zinc-800/70">
        {items.length === 0 ? (
          <Empty text="Nothing yet" sub="Signals, orders and exits show up here." />
        ) : (
          items.map((log: any, i: number) => {
            const t = String(log?.type || "INFO").toUpperCase();
            const good = t.includes("SUCCESS") || t.includes("BUY") || t.includes("PROFIT");
            const bad = t.includes("ERROR") || t.includes("FAIL") || t.includes("LOSS");
            return (
              <div key={i} className="px-3 py-2 flex gap-2">
                <span className="text-[10px] text-zinc-600 font-mono shrink-0 w-14 pt-0.5">
                  {new Date(log?.timestamp || Date.now()).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className={`text-[12px] leading-snug ${
                    good ? "text-emerald-400" : bad ? "text-red-400" : "text-zinc-300"
                  }`}
                >
                  {String(log?.message || "")}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function BrokerStatusCard({ broker, brokerName, connected, funds, onOpenBroker }: any) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <RailHeader title="Broker Connection" />
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-3">
          <BrokerLogo id={broker} name={brokerName} size={32} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100">{brokerName}</div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className={connected ? "text-emerald-400" : "text-red-400"}>
                {connected ? "Connected" : "Not connected"}
              </span>
            </div>
          </div>
        </div>
        <Row label="Available funds" value={funds == null ? "—" : money(funds)} />
        <Button
          size="sm"
          variant="outline"
          className="w-full border-zinc-700 text-zinc-300"
          onClick={onOpenBroker}
        >
          <ShieldCheck className="w-3.5 h-3.5" /> Manage broker
        </Button>
      </div>
    </div>
  );
}

export function EngineStatusCard({ running, interval, signalsCount = 0, ordersCount = 0, onOpenEngine }: any) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <RailHeader
        title="Engine"
        right={
          <span className={`text-[10px] ${running ? "text-emerald-400" : "text-zinc-500"}`}>
            {running ? "Running" : "Stopped"}
          </span>
        }
      />
      <div className="p-3 space-y-2">
        <Row label="Candle slot" value={`${interval} minute`} icon={<Clock className="w-3.5 h-3.5 text-zinc-500" />} />
        <Row label="Signals today" value={String(signalsCount)} icon={<Radio className="w-3.5 h-3.5 text-zinc-500" />} />
        <Row label="Orders placed" value={String(ordersCount)} icon={<Activity className="w-3.5 h-3.5 text-zinc-500" />} />
        {onOpenEngine && (
          <Button size="sm" variant="outline" className="w-full border-zinc-700 text-zinc-300" onClick={onOpenEngine}>
            Engine controls
          </Button>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, icon }: any) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-zinc-500 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-zinc-200 font-medium tabular-nums">{value}</span>
    </div>
  );
}

/* ───────────────────────── orders & positions tabs ───────────────────────── */

export function OrdersView({ logs = [] }: any) {
  const orders = useMemo(
    () =>
      (Array.isArray(logs) ? logs : []).filter((l: any) => {
        const t = String(l?.type || "").toUpperCase();
        const m = String(l?.message || "").toUpperCase();
        return t.includes("ORDER") || t.includes("TRADE") || m.includes("ORDER");
      }),
    [logs]
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <RailHeader title="Orders" right={<span className="text-[10px] text-zinc-500">{orders.length}</span>} />
      {orders.length === 0 ? (
        <Empty text="No orders yet" sub="Every order placed by the engine is listed here." />
      ) : (
        <div className="divide-y divide-zinc-800/70 max-h-[600px] overflow-auto">
          {orders.map((o: any, i: number) => {
            const bad = String(o?.type || "").toUpperCase().includes("FAIL");
            return (
              <div key={i} className="px-3 py-2.5 flex items-start gap-3">
                <span className="text-[11px] text-zinc-600 font-mono w-16 shrink-0">
                  {new Date(o?.timestamp || Date.now()).toLocaleTimeString()}
                </span>
                <span className={`text-[13px] ${bad ? "text-red-400" : "text-zinc-200"}`}>{String(o?.message || "")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PositionsView({ serverUrl, accessToken }: any) {
  const { open, closed, openPnL, closedPnL } = useLivePositions(serverUrl, accessToken, 1000);
  return (
    <div className="space-y-4">
      <PositionTable title="Running positions" rows={open} total={openPnL} showExit serverUrl={serverUrl} accessToken={accessToken} />
      <PositionTable title="Closed positions" rows={closed} total={closedPnL} />
    </div>
  );
}

function PositionTable({ title, rows, total, showExit, serverUrl, accessToken }: any) {
  const [exiting, setExiting] = useState<string | null>(null);

  const exit = async (p: any) => {
    const id = String(posSecurityId(p) || posName(p));
    setExiting(id);
    try {
      await fetchWithAuth(`${serverUrl}/place-order`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          securityId: posSecurityId(p),
          transactionType: posQty(p) > 0 ? "SELL" : "BUY",
          quantity: Math.abs(posQty(p)),
          exchangeSegment: p?.exchangeSegment || "NSE_FNO",
        }),
      });
    } finally {
      setExiting(null);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{title}</h3>
        <span className={`text-sm font-bold tabular-nums ${pnlClass(total)}`}>{signed(total)}</span>
      </div>
      {rows.length === 0 ? (
        <Empty text="Nothing here" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-medium px-3 py-2">Symbol</th>
                <th className="text-right font-medium px-3 py-2">Qty</th>
                <th className="text-right font-medium px-3 py-2">Avg</th>
                <th className="text-right font-medium px-3 py-2">LTP</th>
                <th className="text-right font-medium px-3 py-2">P&L</th>
                {showExit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {rows.map((p: any, i: number) => {
                const pnl = posPnL(p);
                const id = String(posSecurityId(p) || posName(p));
                return (
                  <tr key={i}>
                    <td className="px-3 py-2 text-zinc-100">{posName(p)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">{Math.abs(posQty(p))}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                      {money(p?.buyAvg ?? p?.averagePrice ?? p?.avgPrice ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                      {money(p?.ltp ?? p?.lastPrice ?? p?.last_price ?? 0)}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${pnlClass(pnl)}`}>{signed(pnl)}</td>
                    {showExit && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={exiting === id}
                          onClick={() => exit(p)}
                          className="h-7 border-zinc-700 text-zinc-300 hover:text-red-400 hover:border-red-500/40"
                        >
                          {exiting === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Exit"}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── top symbol strip ───────────────────────── */

export function SymbolStrip({ serverUrl, accessToken, openPnL = 0, closedPnL = 0 }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const defs = [
    { sym: "NIFTY", securityId: "13" },
    { sym: "BANKNIFTY", securityId: "25" },
    { sym: "SENSEX", securityId: "51" },
  ];
  const busy = useRef(false);

  useEffect(() => {
    if (!serverUrl || !accessToken) return;
    let alive = true;
    const load = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const out = await Promise.all(
          defs.map(async (d) => {
            try {
              const res = await fetchWithAuth(`${serverUrl}/intraday-ohlc`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
                body: JSON.stringify({ securityId: d.securityId, exchangeSegment: "IDX_I", instrument: "INDEX", interval: "5", includeOI: false }),
              });
              const json = await res.json();
              const candles = json?.candles || [];
              if (!candles.length) return null;
              const price = Number(candles[candles.length - 1].close);
              const open = Number(candles[0].open || candles[0].close);
              const pct = open ? ((price - open) / open) * 100 : 0;
              return { sym: d.sym, price, pct };
            } catch {
              return null;
            }
          })
        );
        if (alive) setRows(out.filter(Boolean));
      } finally {
        busy.current = false;
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [serverUrl, accessToken]);

  return (
    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2">
      {rows.length === 0
        ? defs.map((d) => (
            <div key={d.sym} className="text-[12px] text-zinc-600 whitespace-nowrap">
              {d.sym} —
            </div>
          ))
        : rows.map((r) => (
            <div key={r.sym} className="whitespace-nowrap">
              <span className="text-[11px] text-zinc-500 mr-1.5">{r.sym}</span>
              <span className="text-sm font-semibold text-zinc-100 tabular-nums">
                {r.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
              </span>
              <span className={`text-[11px] ml-1.5 tabular-nums ${r.pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {r.pct >= 0 ? "+" : ""}
                {r.pct.toFixed(2)}%
              </span>
            </div>
          ))}
      <div className="ml-auto flex items-center gap-4 pl-4 border-l border-zinc-800 whitespace-nowrap">
        <div>
          <span className="text-[11px] text-zinc-500 mr-1.5">Running P&L</span>
          <span className={`text-sm font-bold tabular-nums ${pnlClass(openPnL)}`}>{signed(openPnL, 0)}</span>
        </div>
        <div>
          <span className="text-[11px] text-zinc-500 mr-1.5">Closed P&L</span>
          <span className={`text-sm font-bold tabular-nums ${pnlClass(closedPnL)}`}>{signed(closedPnL, 0)}</span>
        </div>
      </div>
    </div>
  );
}
