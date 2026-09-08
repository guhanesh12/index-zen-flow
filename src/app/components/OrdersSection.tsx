// @ts-nocheck
import React, { useState, useEffect, useRef } from "react";
import { 
  Package, 
  Radio, 
  Info, 
  SlidersHorizontal, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle,
  Bell,
  Trash2,
  ChevronDown
} from "lucide-react";
import { getServerUrl, fetchWithApiFallback } from "@/utils-ext/config/apiConfig";
import { projectId } from "@/utils-ext/supabase/info";

interface OrderItem {
  id: string;
  orderId?: string;
  symbol: string;
  indexName?: string;
  status: "OPEN" | "EXECUTED" | "CANCELLED" | "REJECTED" | "PENDING";
  depthRank?: string;
  time: string;
  product: string;
  side: "BUY" | "SELL";
  quantity: number;
  ltp: number;
  price: number;
  triggerPrice: number;
  createdAt?: string;
}

interface OrdersSectionProps {
  accessToken?: string;
  userId?: string;
  activeBroker?: string;
}

export function OrdersSection({ accessToken, userId, activeBroker }: OrdersSectionProps) {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [showColumnConfig, setShowColumnConfig] = useState<boolean>(false);
  
  const serverUrl = getServerUrl(projectId);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`;
      }

      const res = await fetchWithApiFallback('/orders', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders) && data.orders.length > 0) {
          const mapped: OrderItem[] = data.orders.map((o: any, idx: number) => {
            const rawStatus = (o.status || o.orderStatus || "EXECUTED").toUpperCase();
            let status: OrderItem["status"] = "EXECUTED";
            if (rawStatus.includes("OPEN") || rawStatus.includes("PENDING") || rawStatus.includes("PLACED")) {
              status = "OPEN";
            } else if (rawStatus.includes("CANCEL")) {
              status = "CANCELLED";
            } else if (rawStatus.includes("REJECT")) {
              status = "REJECTED";
            } else {
              status = "EXECUTED";
            }

            const timeStr = o.created_at || o.timestamp || o.time
              ? new Date(o.created_at || o.timestamp || o.time).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false
                }) + " IST"
              : "11:24:05 IST";

            const uniqueId = String(o.id || o.order_id || o.dhan_order_id ? `${o.id || o.order_id || o.dhan_order_id}-${idx}` : `ORD-${idx}-${Date.now()}`);

            return {
              id: uniqueId,
              orderId: o.order_id || o.dhan_order_id || `D-${1000 + idx}`,
              symbol: o.symbol || o.trading_symbol || o.index_name || "NIFTY 23500 CE",
              status,
              depthRank: o.depth_rank || o.order_id ? `#${String(o.order_id || o.id).slice(-4)}` : "1 / 1",
              time: timeStr,
              product: (o.product_type || o.product || "INTRADAY").toUpperCase(),
              side: (o.transaction_type || o.side || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
              quantity: Number(o.quantity || o.qty || 75),
              ltp: Number(o.ltp || o.current_price || o.price || 0),
              price: Number(o.price || o.entry_price || 0),
              triggerPrice: Number(o.trigger_price || o.triggerPrice || 0)
            };
          });
          setOrders(mapped);
          return;
        }
      }

      // If orders response was empty, fetch positions and convert to executed orders list
      const posRes = await fetchWithApiFallback('/positions', { headers });
      if (posRes.ok) {
        const posData = await posRes.json();
        if (posData.success && Array.isArray(posData.positions) && posData.positions.length > 0) {
          const derivedOrders: OrderItem[] = posData.positions.map((p: any, idx: number) => {
            const qty = Math.abs(Number(p.netQty ?? p.quantity ?? p.qty ?? 75));
            const price = Number(p.buyAvg ?? p.avgPrice ?? p.price ?? 30.47);
            const ltp = Number(p.ltp ?? p.lastPrice ?? price);
            return {
              id: `pos-ord-${idx}`,
              orderId: p.positionId || p.id || `D-${2000 + idx}`,
              symbol: p.tradingSymbol || p.symbol || p.index_name || "NIFTY 23500 CE",
              status: "EXECUTED" as const,
              depthRank: "#2026",
              time: "11:24:05 IST",
              product: (p.productType || p.product || "INTRADAY").toUpperCase(),
              side: "BUY" as const,
              quantity: qty || 75,
              ltp: ltp || price,
              price: price || 30.47,
              triggerPrice: 0
            };
          });
          setOrders(derivedOrders);
        }
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [accessToken, serverUrl]);

  // Also read from localStorage fallback if available
  useEffect(() => {
    try {
      const stored = localStorage.getItem("dhan_orders");
      if (stored && orders.length === 0) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const localMapped = parsed.map((item: any, idx: number) => ({
            id: item.orderId || `local-${idx}`,
            orderId: item.orderId || `L-${idx}`,
            symbol: item.symbol?.displayName || item.payload?.securityId || "NIFTY 23500 CE",
            status: item.orderStatus === "PLACED" ? "OPEN" : item.orderStatus || "EXECUTED",
            depthRank: "1 / 1",
            time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "Just now",
            product: item.payload?.productType || "INTRADAY",
            side: item.payload?.transactionType || "BUY",
            quantity: item.payload?.quantity || 75,
            ltp: item.payload?.price || 0,
            price: item.payload?.price || 0,
            triggerPrice: item.payload?.triggerPrice || 0
          }));
          setOrders(localMapped);
        }
      }
    } catch (e) {
      // silent
    }
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (filter === "OPEN") return o.status === "OPEN" || o.status === "PENDING";
    if (filter === "CLOSED") return o.status === "EXECUTED" || o.status === "CANCELLED" || o.status === "REJECTED";
    return true;
  });

  const openCount = orders.filter((o) => o.status === "OPEN" || o.status === "PENDING").length;
  const closedCount = orders.filter((o) => o.status === "EXECUTED" || o.status === "CANCELLED" || o.status === "REJECTED").length;

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="w-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden font-sans">
      
      {/* ── TOP CONTROL BAR (Matches Screenshot 1) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
        
        {/* Left Filter Pill Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("OPEN")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filter === "OPEN"
                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700 shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-transparent"
            }`}
          >
            <span>Open</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filter === "OPEN" ? "bg-purple-200 dark:bg-purple-900 text-purple-700 dark:text-purple-300" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            }`}>
              {openCount}
            </span>
          </button>

          <button
            onClick={() => setFilter("CLOSED")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              filter === "CLOSED"
                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700 shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-transparent"
            }`}
          >
            <span>Closed</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              filter === "CLOSED" ? "bg-purple-200 dark:bg-purple-900 text-purple-700 dark:text-purple-300" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
            }`}>
              {closedCount}
            </span>
          </button>

          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === "ALL"
                ? "bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-300 dark:border-purple-700 shadow-xs"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
            }`}
          >
            All ({orders.length})
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAlertsEnabled(!alertsEnabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
              alertsEnabled
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <Radio className="size-3.5 text-emerald-500 animate-pulse" />
            <span>LIVE Alerts</span>
          </button>

          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            title="Order Information"
          >
            <Info className="size-4" />
          </button>

          <button
            onClick={fetchOrders}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            title="Refresh Orders"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Info Banner Dropdown */}
      {showInfo && (
        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-900 text-xs text-purple-900 dark:text-purple-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="size-4 text-purple-500 shrink-0" />
            <span>
              Orders placed manually or automatically by the AI Engine route through Dhan API. Real-time executions refresh every 3 seconds.
            </span>
          </div>
          <button onClick={() => setShowInfo(false)} className="text-purple-500 font-bold hover:underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* ── TABLE HEADER BAR (Matches Screenshot 1) ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[850px]">
          <thead>
            <tr className="bg-zinc-100/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400 select-none">
              <th className="py-2.5 px-3 w-8 text-center">
                <input
                  type="checkbox"
                  checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                  onChange={toggleSelectAll}
                  className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 size-3.5 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-3">Symbol ({filteredOrders.length})</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Depth Rank</th>
              <th className="py-2.5 px-3">Time</th>
              <th className="py-2.5 px-3">Product</th>
              <th className="py-2.5 px-3">Side</th>
              <th className="py-2.5 px-3 text-right">Quantity</th>
              <th className="py-2.5 px-3 text-right">LTP</th>
              <th className="py-2.5 px-3 text-right">Price</th>
              <th className="py-2.5 px-3 text-right">Trigger Price</th>
              <th className="py-2.5 px-3 w-10 text-center">
                <button 
                  onClick={() => setShowColumnConfig(!showColumnConfig)} 
                  className="hover:text-purple-500 transition-colors"
                  title="Configure Columns"
                >
                  <SlidersHorizontal className="size-3.5 mx-auto" />
                </button>
              </th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 text-xs">
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => {
                const isSelected = selectedIds.has(order.id);
                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors ${
                      isSelected ? "bg-purple-50/50 dark:bg-purple-950/20" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(order.id)}
                        className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 size-3.5 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-bold text-zinc-900 dark:text-white">
                      {order.symbol}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        order.status === "OPEN" || order.status === "PENDING"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : order.status === "EXECUTED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}>
                        {order.status === "OPEN" && <Clock className="size-2.5 animate-spin" />}
                        {order.status === "EXECUTED" && <CheckCircle2 className="size-2.5" />}
                        {order.status === "REJECTED" && <XCircle className="size-2.5" />}
                        {order.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {order.depthRank}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-zinc-500 dark:text-zinc-400 text-[11px]">
                      {order.time}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-600 dark:text-zinc-300">
                      {order.product}
                    </td>
                    <td className="py-2.5 px-3 font-bold">
                      <span className={order.side === "BUY" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                        {order.side}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      {order.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-zinc-600 dark:text-zinc-300">
                      ₹{order.ltp ? order.ltp.toFixed(2) : "0.00"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-zinc-600 dark:text-zinc-300">
                      ₹{order.price ? order.price.toFixed(2) : "0.00"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-zinc-500">
                      ₹{order.triggerPrice ? order.triggerPrice.toFixed(2) : "0.00"}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {order.status === "OPEN" && (
                        <button className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : null}
          </tbody>
        </table>
      </div>

      {/* ── EMPTY STATE (Exact Matches Screenshot 1) ── */}
      {filteredOrders.length === 0 && !loading && (
        <div className="py-16 px-4 text-center flex flex-col items-center justify-center bg-zinc-50/50 dark:bg-zinc-950/50">
          
          {/* Purple Styled Icon Card Box (Matches Screenshot 1) */}
          <div className="w-20 h-20 mb-4 rounded-2xl bg-gradient-to-tr from-purple-500/20 via-indigo-500/20 to-purple-400/30 dark:from-purple-900/40 dark:to-indigo-900/40 border border-purple-300/40 dark:border-purple-700/40 shadow-lg shadow-purple-500/10 flex items-center justify-center relative group">
            <Package className="w-10 h-10 text-purple-600 dark:text-purple-400 stroke-[1.5] group-hover:scale-110 transition-transform duration-300" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full animate-ping" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full" />
          </div>

          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mb-1 tracking-tight">
            Its empty in here
          </h3>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs leading-relaxed">
            Keep an eye on orders you placed today
          </p>
        </div>
      )}

      {loading && orders.length === 0 && (
        <div className="py-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
          <RefreshCw className="size-4 animate-spin text-purple-500" />
          <span>Fetching today's orders...</span>
        </div>
      )}
    </div>
  );
}

export default OrdersSection;
