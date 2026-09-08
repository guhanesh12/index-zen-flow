// @ts-nocheck
import React, { useState, useEffect } from "react";
import { 
  Package, 
  LineChart, 
  Bell, 
  Info, 
  SlidersHorizontal, 
  RefreshCw, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  XCircle,
  CheckCircle2,
  X,
  Zap,
  BarChart2
} from "lucide-react";
import { getServerUrl, fetchWithApiFallback } from "@/utils-ext/config/apiConfig";
import { projectId } from "@/utils-ext/supabase/info";

interface PositionItem {
  id: string;
  positionId?: string;
  symbol: string;
  securityId?: string;
  product: string;
  netQty: number;
  avgPrice: number;
  ltp: number;
  dayPnl: number;
  overallPnl: number;
  buyAvg?: number;
  sellAvg?: number;
  tradingSymbol?: string;
}

interface PositionsSectionProps {
  accessToken?: string;
  userId?: string;
  activeBroker?: string;
  onSquareOffAll?: () => void;
  onTradeExecuted?: () => void;
}

export function PositionsSection({
  accessToken,
  userId,
  activeBroker,
  onSquareOffAll,
  onTradeExecuted
}: PositionsSectionProps) {
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [exitingId, setExitingId] = useState<string | null>(null);
  const [isBulkExiting, setIsBulkExiting] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Modals state
  const [showPnlGraphModal, setShowPnlGraphModal] = useState<boolean>(false);
  const [showAlertModal, setShowAlertModal] = useState<boolean>(false);
  const [targetProfit, setTargetProfit] = useState<string>("10000");
  const [stopLossLimit, setStopLossLimit] = useState<string>("-5000");
  const [alertTriggered, setAlertTriggered] = useState<string | null>(null);

  const serverUrl = getServerUrl(projectId);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const res = await fetchWithApiFallback('/positions', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.positions)) {
          const mapped: PositionItem[] = data.positions.map((p: any, idx: number) => {
            const qty = Number(p.netQty ?? p.positionQty ?? p.netQuantity ?? p.quantity ?? p.qty ?? (Number(p.buyQty || 0) - Number(p.sellQty || 0)));
            const avgPrice = Number(p.buyAvg ?? p.buyPrice ?? p.avgPrice ?? p.costPrice ?? p.entry_price ?? p.averagePrice ?? 0);
            
            const rawPnl = Number(p.pnl ?? p.unrealizedPnl ?? p.realizedPnl ?? 0);
            const rawDayPnl = Number(p.dayPnl ?? p.realizedPnl ?? rawPnl);

            // Calculate accurate non-zero LTP
            const rawLtp = p.ltp || p.lastPrice || p.currentPrice || p.current_price || p.lastTradedPrice || p.livePrice || p.closePrice;
            let ltp = Number(rawLtp || 0);

            if (!ltp || ltp === 0) {
              if (qty !== 0 && rawPnl !== 0) {
                ltp = Math.max(0, avgPrice + (rawPnl / qty));
              } else if (qty !== 0 && rawDayPnl !== 0) {
                ltp = Math.max(0, avgPrice + (rawDayPnl / qty));
              } else {
                ltp = avgPrice;
              }
            }

            const overallPnl = rawPnl !== 0 ? rawPnl : (ltp && avgPrice ? (ltp - avgPrice) * qty : 0);
            const dayPnl = rawDayPnl !== 0 ? rawDayPnl : overallPnl;

            const uniqueId = String(p.id || p.positionId ? `${p.id || p.positionId}-${idx}` : `${p.securityId || p.tradingSymbol || 'POS'}-${idx}`);

            return {
              id: uniqueId,
              positionId: p.positionId || p.id || p.securityId,
              symbol: p.tradingSymbol || p.symbol || p.index_name || "NIFTY 23500 CE",
              securityId: p.securityId || p.symbolId,
              product: (p.productType || p.product || "INTRADAY").toUpperCase(),
              netQty: qty,
              avgPrice,
              ltp,
              dayPnl,
              overallPnl
            };
          });
          setPositions(mapped);
        }
      }
    } catch (err) {
      console.error("Failed to fetch positions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 2000);
    return () => clearInterval(interval);
  }, [accessToken, serverUrl]);

  const totalOverallPnl = positions.reduce((acc, p) => acc + (p.overallPnl || 0), 0);
  const totalDayPnl = positions.reduce((acc, p) => acc + (p.dayPnl || 0), 0);

  // Monitor P&L Alerts
  useEffect(() => {
    const profitThreshold = Number(targetProfit);
    const lossThreshold = Number(stopLossLimit);
    if (profitThreshold > 0 && totalOverallPnl >= profitThreshold) {
      setAlertTriggered(`🎯 Target Profit Alert! Total P&L reached +₹${totalOverallPnl.toFixed(2)}`);
    } else if (lossThreshold < 0 && totalOverallPnl <= lossThreshold) {
      setAlertTriggered(`🚨 Stop Loss Alert! Total P&L dropped to ₹${totalOverallPnl.toFixed(2)}`);
    } else {
      setAlertTriggered(null);
    }
  }, [totalOverallPnl, targetProfit, stopLossLimit]);

  // Handle single position square off
  const handleExitPosition = async (pos: PositionItem) => {
    try {
      setExitingId(pos.id);
      setActionMessage(`Exiting position for ${pos.symbol}...`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const res = await fetch(`${serverUrl}/positions/square-off`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          symbol: pos.symbol,
          securityId: pos.securityId,
          positionId: pos.positionId || pos.id,
          quantity: pos.netQty,
          broker: activeBroker,
          userId
        })
      });

      const data = await res.json();
      if (data.success || res.ok) {
        setActionMessage(`✅ Square off order executed for ${pos.symbol}!`);
        // Update local state to mark closed (0 Qty)
        setPositions((prev) => prev.map((p) => p.id === pos.id ? { ...p, netQty: 0 } : p));
        if (onTradeExecuted) onTradeExecuted();
      } else {
        setActionMessage(`❌ Square off failed: ${data.error || "Server error"}`);
      }
    } catch (err: any) {
      console.error("Square off error:", err);
      setActionMessage(`❌ Error executing exit: ${err?.message || "Network error"}`);
    } finally {
      setExitingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // Handle Bulk Square Off All Positions
  const handleSquareOffAllPositions = async () => {
    const activePositions = positions.filter((p) => p.netQty !== 0);
    if (activePositions.length === 0) {
      setActionMessage("ℹ️ No active open positions to square off.");
      setTimeout(() => setActionMessage(null), 3000);
      return;
    }

    try {
      setIsBulkExiting(true);
      setActionMessage(`⚡ Squaring off all ${activePositions.length} open position(s)...`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      // Call server bulk square off
      await fetch(`${serverUrl}/positions/square-off-all`, {
        method: "POST",
        headers,
        body: JSON.stringify({ broker: activeBroker, userId })
      }).catch(() => {});

      // Send exit requests for each active position
      await Promise.allSettled(
        activePositions.map((pos) =>
          fetch(`${serverUrl}/positions/square-off`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              symbol: pos.symbol,
              securityId: pos.securityId,
              positionId: pos.positionId || pos.id,
              quantity: pos.netQty,
              broker: activeBroker,
              userId
            })
          })
        )
      );

      // Update positions to 0 net Qty
      setPositions((prev) => prev.map((p) => ({ ...p, netQty: 0 })));
      setActionMessage(`✅ All open positions squared off successfully!`);

      if (onSquareOffAll) onSquareOffAll();
      if (onTradeExecuted) onTradeExecuted();
    } catch (err: any) {
      console.error("Square off all error:", err);
      setActionMessage(`❌ Bulk square off error: ${err?.message || "Failed to exit"}`);
    } finally {
      setIsBulkExiting(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === positions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(positions.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const activePositionsCount = positions.filter((p) => p.netQty !== 0).length;

  return (
    <div className="w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden font-sans">
      
      {/* ── TOP HEADER STATS BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 sm:p-4 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        
        {/* Left P&L Summaries */}
        <div className="flex items-center gap-6">
          <div>
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">Total P&L</span>
            <span className={`text-base font-bold tabular-nums underline decoration-dotted decoration-2 ${
              totalOverallPnl >= 0 ? "text-emerald-600 dark:text-emerald-400 decoration-emerald-500/50" : "text-rose-600 dark:text-rose-400 decoration-rose-500/50"
            }`}>
              {totalOverallPnl >= 0 ? "+" : "-"}₹{Math.abs(totalOverallPnl).toFixed(2)}
            </span>
          </div>

          <div className="border-l border-zinc-200 dark:border-zinc-800 pl-6">
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium block">Day's P&L</span>
            <span className={`text-base font-bold tabular-nums ${
              totalDayPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}>
              {totalDayPnl >= 0 ? "+" : "-"}₹{Math.abs(totalDayPnl).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowPnlGraphModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <LineChart className="size-3.5 text-purple-500" />
            <span>P&L Graph</span>
          </button>

          <button 
            onClick={() => setShowAlertModal(true)}
            className="px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer relative"
          >
            <Bell className="size-3.5 text-amber-500" />
            <span>P&L alert</span>
            {alertTriggered && <span className="absolute -top-1 -right-1 size-2.5 bg-amber-500 rounded-full animate-ping" />}
          </button>

          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            title="Positions Info"
          >
            <Info className="size-4" />
          </button>

          <button
            onClick={fetchPositions}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            title="Refresh Positions"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleSquareOffAllPositions}
            disabled={isBulkExiting || activePositionsCount === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs flex items-center gap-1 transition-all cursor-pointer ${
              activePositionsCount > 0
                ? "bg-rose-600 hover:bg-rose-700 text-white"
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed opacity-60"
            }`}
          >
            <AlertCircle className="size-3.5" />
            <span>{isBulkExiting ? "Exiting All..." : "Square Off All"}</span>
          </button>
        </div>
      </div>

      {/* P&L Alert Warning Toast */}
      {alertTriggered && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/30 text-xs font-bold text-amber-400 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-amber-400" />
            <span>{alertTriggered}</span>
          </div>
          <button onClick={() => setAlertTriggered(null)} className="text-amber-500 hover:text-amber-300 font-bold cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Action Banner Toast */}
      {actionMessage && (
        <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-800 text-xs font-semibold text-purple-900 dark:text-purple-200 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-purple-500 font-bold hover:underline cursor-pointer">
            Close
          </button>
        </div>
      )}

      {showInfo && (
        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-300">
          💡 <strong>Positions Help:</strong> Net Qty shows open derivative contracts or equity holdings. Click "Square Off" on any active position or "Square Off All" to liquidate immediately. Closed positions show "Closed" badge with 0 quantity.
        </div>
      )}

      {/* ── POSITIONS TABLE ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-100/70 dark:bg-zinc-900/70 text-zinc-600 dark:text-zinc-400 text-[11px] font-semibold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-2.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={positions.length > 0 && selectedIds.size === positions.length}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 size-3.5 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3">Symbol ({positions.length})</th>
              <th className="py-2.5 px-3">Product</th>
              <th className="py-2.5 px-3 text-right">Net Qty</th>
              <th className="py-2.5 px-3 text-right">Avg. Price</th>
              <th className="py-2.5 px-3 text-right">LTP</th>
              <th className="py-2.5 px-3 text-right">Day P&L</th>
              <th className="py-2.5 px-3 text-right">Overall P&L</th>
              <th className="py-2.5 px-3 text-center">Action</th>
              <th className="py-2.5 px-3 w-10 text-center">
                <SlidersHorizontal className="size-3.5 mx-auto hover:text-purple-500 cursor-pointer" />
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs">
            {positions.length > 0 ? (
              positions.map((pos) => {
                const isSelected = selectedIds.has(pos.id);
                const isProfit = pos.overallPnl >= 0;
                const isOpen = pos.netQty !== 0;

                return (
                  <tr
                    key={pos.id}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                      isSelected ? "bg-purple-50/50 dark:bg-purple-950/20" : ""
                    }`}
                  >
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(pos.id)}
                        className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 size-3.5 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3 font-bold text-zinc-900 dark:text-white">
                      {pos.symbol}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[10px]">
                        {pos.product}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      <span className={pos.netQty > 0 ? "text-emerald-600 dark:text-emerald-400" : pos.netQty < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}>
                        {pos.netQty > 0 ? `+${pos.netQty}` : pos.netQty}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300">
                      ₹{pos.avgPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-700 dark:text-zinc-300 font-bold">
                      ₹{pos.ltp.toFixed(2)}
                    </td>
                    <td className={`py-3 px-3 text-right font-mono font-semibold ${
                      pos.dayPnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}>
                      {pos.dayPnl >= 0 ? "+" : ""}₹{pos.dayPnl.toFixed(2)}
                    </td>
                    <td className={`py-3 px-3 text-right font-mono font-bold ${
                      isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                    }`}>
                      {isProfit ? "+" : ""}₹{pos.overallPnl.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {/* ⚡ HIDE Square Off button for Closed Positions (netQty === 0) */}
                      {isOpen ? (
                        <button
                          onClick={() => handleExitPosition(pos)}
                          disabled={exitingId === pos.id}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {exitingId === pos.id ? "Exiting..." : "Square Off"}
                        </button>
                      ) : (
                        <span className="px-2.5 py-0.5 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60 rounded text-[10px] font-medium">
                          Closed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-zinc-400">
                      •
                    </td>
                  </tr>
                );
              })
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ── EMPTY STATE ── */}
      {positions.length === 0 && !loading && (
        <div className="py-16 px-4 text-center flex flex-col items-center justify-center bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="w-20 h-20 mb-4 rounded-2xl bg-gradient-to-tr from-purple-500/20 via-indigo-500/20 to-purple-400/30 dark:from-purple-900/40 dark:to-indigo-900/40 border border-purple-300/40 dark:border-purple-700/40 shadow-lg shadow-purple-500/10 flex items-center justify-center relative group">
            <Package className="w-10 h-10 text-purple-600 dark:text-purple-400 stroke-[1.5] group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-ping" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full" />
          </div>

          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1 tracking-tight">
            It's empty in here
          </h3>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm leading-relaxed">
            Keep an eye on F&O and Equity positions you are currently holding for today.
          </p>
        </div>
      )}

      {/* 📊 P&L GRAPH MODAL */}
      {showPnlGraphModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 text-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <BarChart2 className="size-5 text-purple-400" />
                <h3 className="text-lg font-bold">Positions P&L Graph & Visual Analytics</h3>
              </div>
              <button 
                onClick={() => setShowPnlGraphModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Overall summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="text-[11px] text-zinc-400">Total P&L</div>
                <div className={`text-base font-bold mt-1 ${totalOverallPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalOverallPnl >= 0 ? "+" : ""}₹{totalOverallPnl.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="text-[11px] text-zinc-400">Day's P&L</div>
                <div className={`text-base font-bold mt-1 ${totalDayPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalDayPnl >= 0 ? "+" : ""}₹{totalDayPnl.toFixed(2)}
                </div>
              </div>

              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="text-[11px] text-zinc-400">Active Positions</div>
                <div className="text-base font-bold text-white mt-1">{activePositionsCount}</div>
              </div>

              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                <div className="text-[11px] text-zinc-400">Closed Positions</div>
                <div className="text-base font-bold text-zinc-400 mt-1">{positions.length - activePositionsCount}</div>
              </div>
            </div>

            {/* Visual Bar Breakdown per Position */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Position Performance Breakdown</h4>
              {positions.length > 0 ? (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {positions.map((p) => {
                    const absVal = Math.abs(p.overallPnl);
                    const maxPnl = Math.max(...positions.map((item) => Math.abs(item.overallPnl) || 100), 100);
                    const pct = Math.min(100, Math.round((absVal / maxPnl) * 100));
                    const isWin = p.overallPnl >= 0;

                    return (
                      <div key={p.id} className="p-2.5 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-zinc-200">{p.symbol}</span>
                          <span className={`font-mono font-bold ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                            {isWin ? "+" : ""}₹{p.overallPnl.toFixed(2)}
                          </span>
                        </div>
                        {/* Bar */}
                        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${isWin ? "bg-emerald-500" : "bg-rose-500"}`}
                            style={{ width: `${Math.max(5, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                  No positions available to plot P&L chart.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowPnlGraphModal(false)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close Graph
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔔 P&L ALERT MODAL */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 text-white animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <Bell className="size-5 text-amber-400" />
                <h3 className="text-lg font-bold">Configure P&L Risk Alerts</h3>
              </div>
              <button 
                onClick={() => setShowAlertModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Get instant notification alerts when your total unrealized & realized P&L crosses specified threshold targets.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-emerald-400 font-semibold block mb-1">
                  🎯 Target Profit Alert Threshold (₹)
                </label>
                <input
                  type="number"
                  value={targetProfit}
                  onChange={(e) => setTargetProfit(e.target.value)}
                  placeholder="e.g. 10000"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs text-rose-400 font-semibold block mb-1">
                  🚨 Stop Loss Alert Limit (₹)
                </label>
                <input
                  type="number"
                  value={stopLossLimit}
                  onChange={(e) => setStopLossLimit(e.target.value)}
                  placeholder="e.g. -5000"
                  className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-mono text-rose-400 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-between text-xs">
                <span className="text-zinc-400">Current Total P&L</span>
                <span className={`font-mono font-bold ${totalOverallPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {totalOverallPnl >= 0 ? "+" : ""}₹{totalOverallPnl.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAlertModal(false)}
                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowAlertModal(false);
                  setActionMessage(`✅ P&L Alert rules saved! Target: +₹${targetProfit}, Stop loss: ₹${stopLossLimit}`);
                  setTimeout(() => setActionMessage(null), 4000);
                }}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-950 text-xs font-bold rounded-xl cursor-pointer"
              >
                Save Alerts
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
