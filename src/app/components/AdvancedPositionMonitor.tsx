// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Activity, TrendingUp, TrendingDown, Shield, Clock, Target, AlertTriangle, Zap, CheckCircle2, Eye, XCircle } from "lucide-react";
import { projectId } from "@/utils-ext/supabase/info";
import { getServerUrl } from "@/utils-ext/config/apiConfig";

interface Props {
  accessToken: string;
}

interface MonitorRow {
  id: string;
  order_id: string;
  symbol: string;
  index_name?: string;
  entry_price: number;
  current_price: number;
  quantity: number;
  pnl: number;
  highest_pnl: number;
  target_amount: number;
  stop_loss_amount: number;
  trailing_enabled: boolean;
  trailing_step: number;
  raw_position?: any;
  created_at: string;
  updated_at: string;
}

const fmt = (v: number) => `₹${(Number(v) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function AdvancedPositionMonitor({ accessToken }: Props) {
  const [rows, setRows] = useState<MonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number>(0);
  const timer = useRef<any>(null);
  const serverUrl = getServerUrl(projectId);

  const fetchRows = async () => {
    try {
      const res = await fetch(`${serverUrl}/position-monitor/list`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.positions)) {
        setRows(data.positions);
        setLastUpdate(Date.now());
      }
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    timer.current = setInterval(fetchRows, 1000); // 1s real-time
    return () => clearInterval(timer.current);
  }, []);

  const totals = rows.reduce(
    (acc, r) => {
      acc.pnl += Number(r.pnl) || 0;
      acc.peak += Number(r.highest_pnl) || 0;
      return acc;
    },
    { pnl: 0, peak: 0 }
  );

  return (
    <Card className="bg-gradient-to-br from-zinc-950 to-zinc-900 border-2 border-emerald-500/30 shadow-xl shadow-emerald-500/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <div className="relative">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />
            </div>
            Advanced Position Monitor
            <Badge variant="outline" className="ml-2 border-emerald-500/40 text-emerald-300">
              PRO
            </Badge>
          </CardTitle>
          <div className="text-xs text-zinc-400 flex items-center gap-3">
            <span>Live · 2s</span>
            <span className={totals.pnl >= 0 ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
              Net P&L: {fmt(totals.pnl)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-zinc-500">Loading monitor…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-zinc-500">
            <Eye className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <div className="text-sm">No active positions to monitor.</div>
            <div className="text-xs mt-1 text-zinc-600">
              Monitor activates as soon as the engine fills an order.
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const raw = r.raw_position || {};
              const decision = raw.monitorDecision || (Number(r.pnl) >= 0 ? "HOLD" : "WATCH");
              const favorable = !!raw.marketFavorable;
              const momentum = Number(raw.momentumScore || 0);
              const giveBack = Number(raw.giveBackPct || 0);
              const heldMin = Number(raw.heldMinutes || 0);
              const curTgt = Number(raw.currentTargetAmount ?? r.target_amount ?? 0);
              const curSL = Number(raw.currentStopLossAmount ?? r.stop_loss_amount ?? 0);
              const peak = Number(r.highest_pnl || 0);
              const pnl = Number(r.pnl || 0);
              const trailingActive = !!raw.trailingActive;
              const profitLocked = !!raw.profitLocked;

              const decisionColor =
                decision === "EXIT"
                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                  : decision === "HOLD"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";

              // progress to target/SL
              const tgtProgress = curTgt > 0 ? Math.max(0, Math.min(100, (pnl / curTgt) * 100)) : 0;
              const slProgress = curSL > 0 ? Math.max(0, Math.min(100, (-pnl / curSL) * 100)) : 0;

              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-4 transition-all ${
                    decision === "EXIT"
                      ? "border-red-500/40 bg-red-950/20"
                      : decision === "HOLD"
                      ? "border-emerald-500/30 bg-emerald-950/10"
                      : "border-yellow-500/30 bg-yellow-950/10"
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold text-white truncate">{r.symbol}</div>
                        {r.index_name && (
                          <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400">
                            {r.index_name}
                          </Badge>
                        )}
                        <Badge className={`text-[10px] border ${decisionColor}`}>
                          {decision === "EXIT" ? (
                            <XCircle className="w-3 h-3 mr-1" />
                          ) : decision === "HOLD" ? (
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                          ) : (
                            <Eye className="w-3 h-3 mr-1" />
                          )}
                          {decision}
                        </Badge>
                        {trailingActive && (
                          <Badge className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/40">
                            <Zap className="w-3 h-3 mr-1" />
                            TRAIL ON
                          </Badge>
                        )}
                        {profitLocked && (
                          <Badge className="text-[10px] bg-green-500/20 text-green-300 border border-green-500/40">
                            <Shield className="w-3 h-3 mr-1" />
                            PROFIT LOCKED
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 mt-1">
                        Entry {fmt(r.entry_price)} · LTP {fmt(r.current_price)} · Qty {r.quantity}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-2xl font-extrabold tabular-nums ${
                          pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {fmt(pnl)}
                      </div>
                      <div className="text-[10px] text-zinc-500">Peak {fmt(peak)}</div>
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3 text-emerald-400" /> Target {fmt(curTgt)}
                        </span>
                        <span className="text-emerald-400">{tgtProgress.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                          style={{ width: `${tgtProgress}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1">
                        <span className="flex items-center gap-1">
                          <Shield className="w-3 h-3 text-red-400" />
                          {curSL <= 0 ? `Locked ${fmt(Math.abs(curSL))}` : `SL ${fmt(curSL)}`}
                        </span>
                        <span className="text-red-400">{slProgress.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-red-400"
                          style={{ width: `${slProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Intelligence row */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <Stat
                      icon={momentum >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      label="Momentum"
                      value={`${momentum >= 0 ? "+" : ""}${momentum.toFixed(1)}`}
                      color={momentum >= 0 ? "text-emerald-400" : "text-red-400"}
                    />
                    <Stat
                      icon={<AlertTriangle className="w-3 h-3" />}
                      label="Give-back"
                      value={`${giveBack.toFixed(0)}%`}
                      color={giveBack < 30 ? "text-emerald-400" : giveBack < 60 ? "text-yellow-400" : "text-red-400"}
                    />
                    <Stat
                      icon={<Clock className="w-3 h-3" />}
                      label="Held"
                      value={`${heldMin.toFixed(0)}m`}
                      color="text-zinc-300"
                    />
                    <Stat
                      icon={favorable ? <CheckCircle2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      label="Market"
                      value={favorable ? "Favorable" : "Caution"}
                      color={favorable ? "text-emerald-400" : "text-yellow-400"}
                    />
                  </div>
                </div>
              );
            })}
            <div className="text-[10px] text-zinc-600 text-right pt-1">
              Updated {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "—"}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-zinc-900/60 rounded-lg p-2 border border-zinc-800">
      <div className={`flex items-center justify-center gap-1 ${color}`}>
        {icon}
        <span className="text-xs font-bold">{value}</span>
      </div>
      <div className="text-[9px] text-zinc-500 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export default AdvancedPositionMonitor;
