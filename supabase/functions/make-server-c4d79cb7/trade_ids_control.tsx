/**
 * 🆔 TRADE IDENTITY + 🛑 KILL SWITCH / STRATEGY CONTROL
 *
 * Single source of truth for:
 *  - the strategy id (one per deployed rule set)
 *  - the per-user algo id (stable, derived from the user's client id)
 *  - signal ids + order ids stamped on every signal / order row
 *  - the global kill switch, per-user kill switch and strategy control flags
 *  - the per-order audit trail (order_audit_events)
 *
 * Everything here is best-effort and must never throw into the engine.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/** Bump this whenever the traded rule set changes. */
export const STRATEGY_ID = "STG-IPAI-V3";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const rand = (n = 4) =>
  Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

function istStamp(ts: number = Date.now()) {
  const d = new Date(ts + 5.5 * 60 * 60 * 1000);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  );
}

/** SIG-20260915-103015-NIFTY-A1B2 */
export function makeSignalCode(indexName: string, ts: number = Date.now()): string {
  return `SIG-${istStamp(ts)}-${String(indexName || "IDX").toUpperCase()}-${rand()}`;
}

/** ORD-20260915-103016-NIFTY-A1B2 */
export function makeOrderCode(indexName: string, ts: number = Date.now()): string {
  return `ORD-${istStamp(ts)}-${String(indexName || "IDX").toUpperCase()}-${rand()}`;
}

const algoCache = new Map<string, string>();

/** Stable per-user algo id — ALGO-<clientId> (falls back to the user id head). */
export async function getAlgoId(userId: string): Promise<string> {
  if (!userId) return "ALGO-UNKNOWN";
  const cached = algoCache.get(userId);
  if (cached) return cached;
  let algo = `ALGO-${String(userId).slice(0, 8).toUpperCase()}`;
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("client_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.client_id) algo = `ALGO-${String(data.client_id).toUpperCase()}`;
  } catch (_e) { /* best effort */ }
  algoCache.set(userId, algo);
  return algo;
}

/* ------------------------------------------------------------------ */
/* Kill switch + strategy control (5s cache, shared across requests)   */
/* ------------------------------------------------------------------ */

export interface KillSwitch {
  trading_enabled: boolean;
  new_signals_enabled: boolean;
  new_orders_enabled: boolean;
  broker_connect_enabled: boolean;
  strategy_creation_enabled: boolean;
  backtest_enabled: boolean;
}

export interface StrategyControl {
  strategy_id: string;
  enabled: boolean;
  nifty_enabled: boolean;
  banknifty_enabled: boolean;
  sensex_enabled: boolean;
  min_confidence: number;
  max_trades_per_index_per_day: number;
  entry_start_ist: string;
  entry_end_ist: string;
}

const KILL_DEFAULT: KillSwitch = {
  trading_enabled: true,
  new_signals_enabled: true,
  new_orders_enabled: true,
  broker_connect_enabled: true,
  strategy_creation_enabled: true,
  backtest_enabled: true,
};

const STRATEGY_DEFAULT: StrategyControl = {
  strategy_id: STRATEGY_ID,
  enabled: true,
  nifty_enabled: true,
  banknifty_enabled: true,
  sensex_enabled: true,
  min_confidence: 75,
  max_trades_per_index_per_day: 1,
  entry_start_ist: "09:30",
  entry_end_ist: "15:00",
};

let killCache: { at: number; value: KillSwitch } | null = null;
let strategyCache: { at: number; value: StrategyControl } | null = null;
const TTL_MS = 5000;

export async function getKillSwitch(): Promise<KillSwitch> {
  if (killCache && Date.now() - killCache.at < TTL_MS) return killCache.value;
  try {
    const { data } = await supabaseAdmin.from("kill_switch_config").select("*").eq("id", 1).maybeSingle();
    const value = { ...KILL_DEFAULT, ...(data || {}) } as KillSwitch;
    killCache = { at: Date.now(), value };
    return value;
  } catch (_e) {
    return killCache?.value || KILL_DEFAULT;
  }
}

export async function getStrategyControl(): Promise<StrategyControl> {
  if (strategyCache && Date.now() - strategyCache.at < TTL_MS) return strategyCache.value;
  try {
    const { data } = await supabaseAdmin.from("strategy_control").select("*").eq("id", 1).maybeSingle();
    const value = { ...STRATEGY_DEFAULT, ...(data || {}) } as StrategyControl;
    strategyCache = { at: Date.now(), value };
    return value;
  } catch (_e) {
    return strategyCache?.value || STRATEGY_DEFAULT;
  }
}

/* ------------------------------------------------------------------ */
/* Platform stop-loss / target mode (auto = engine rules, manual =     */
/* admin-set per-lot amounts applied as the default for every user).   */
/* ------------------------------------------------------------------ */

export interface PlatformRisk {
  mode: "auto" | "manual";
  trailingEnabled: boolean;
  perIndex: Record<string, { tgt: number; sl: number }>;
}

const RISK_DEFAULT: PlatformRisk = {
  mode: "auto",
  trailingEnabled: true,
  perIndex: {
    NIFTY: { tgt: 6000, sl: 3000 },
    BANKNIFTY: { tgt: 6000, sl: 3000 },
    SENSEX: { tgt: 6000, sl: 3000 },
  },
};

export async function getPlatformRisk(): Promise<PlatformRisk> {
  try {
    const k: any = await getKillSwitch();
    const num = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return {
      mode: k?.sl_tp_mode === "manual" ? "manual" : "auto",
      trailingEnabled: k?.trailing_enabled !== false,
      perIndex: {
        NIFTY: { tgt: num(k?.nifty_target_per_lot, 6000), sl: num(k?.nifty_stop_per_lot, 3000) },
        BANKNIFTY: { tgt: num(k?.banknifty_target_per_lot, 6000), sl: num(k?.banknifty_stop_per_lot, 3000) },
        SENSEX: { tgt: num(k?.sensex_target_per_lot, 6000), sl: num(k?.sensex_stop_per_lot, 3000) },
      },
    };
  } catch (_e) {
    return RISK_DEFAULT;
  }
}

export async function getUserKillSwitch(userId: string): Promise<{ new_signals_enabled: boolean; new_orders_enabled: boolean }> {
  try {
    const { data } = await supabaseAdmin
      .from("user_kill_switch")
      .select("new_signals_enabled,new_orders_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      new_signals_enabled: data?.new_signals_enabled !== false,
      new_orders_enabled: data?.new_orders_enabled !== false,
    };
  } catch (_e) {
    return { new_signals_enabled: true, new_orders_enabled: true };
  }
}

/** Are new signals allowed for this user right now? Returns a reason when blocked. */
export async function signalsAllowed(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const [k, u, s] = await Promise.all([getKillSwitch(), getUserKillSwitch(userId), getStrategyControl()]);
  if (!k.trading_enabled) return { allowed: false, reason: "Global kill switch: all trading is OFF" };
  if (!k.new_signals_enabled) return { allowed: false, reason: "Global kill switch: new signals are OFF" };
  if (!s.enabled) return { allowed: false, reason: "Strategy control: strategy is paused" };
  if (!u.new_signals_enabled) return { allowed: false, reason: "Your kill switch: new signals are OFF" };
  return { allowed: true };
}

/** Are new entry orders allowed for this user right now? */
export async function ordersAllowed(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const [k, u] = await Promise.all([getKillSwitch(), getUserKillSwitch(userId)]);
  if (!k.trading_enabled) return { allowed: false, reason: "Global kill switch: all trading is OFF" };
  if (!k.new_orders_enabled) return { allowed: false, reason: "Global kill switch: new orders are OFF" };
  if (!u.new_orders_enabled) return { allowed: false, reason: "Your kill switch: new orders are OFF" };
  return { allowed: true };
}

/** Is this index enabled in strategy control? */
export async function indexEnabled(indexName: string): Promise<boolean> {
  const s = await getStrategyControl();
  const key = String(indexName || "").toUpperCase();
  if (key.includes("BANK")) return s.banknifty_enabled;
  if (key.includes("SENSEX")) return s.sensex_enabled;
  if (key.includes("NIFTY")) return s.nifty_enabled;
  return true;
}

/* ------------------------------------------------------------------ */
/* Order audit trail                                                   */
/* ------------------------------------------------------------------ */

export interface OrderAuditEntry {
  userId: string;
  userEmail?: string | null;
  orderCode?: string | null;
  brokerOrderId?: string | null;
  signalCode?: string | null;
  strategyId?: string | null;
  algoId?: string | null;
  broker?: string | null;
  indexName?: string | null;
  symbol?: string | null;
  event: string;
  transactionType?: string | null;
  quantity?: number | null;
  averagePrice?: number | null;
  status?: "success" | "failed" | "blocked";
  message?: string | null;
  details?: Record<string, any>;
}

export async function logOrderAudit(entry: OrderAuditEntry): Promise<void> {
  try {
    await supabaseAdmin.from("order_audit_events").insert({
      user_id: String(entry.userId || ""),
      user_email: entry.userEmail || null,
      order_code: entry.orderCode || null,
      broker_order_id: entry.brokerOrderId ? String(entry.brokerOrderId) : null,
      signal_code: entry.signalCode || null,
      strategy_id: entry.strategyId || STRATEGY_ID,
      algo_id: entry.algoId || null,
      broker: entry.broker || null,
      index_name: entry.indexName || null,
      symbol: entry.symbol || null,
      event: entry.event,
      transaction_type: entry.transactionType || null,
      quantity: entry.quantity ?? null,
      average_price: entry.averagePrice ?? null,
      status: entry.status || "success",
      message: entry.message || null,
      details: entry.details || {},
    });
  } catch (err) {
    console.error("❌ order audit log failed:", err);
  }
}
