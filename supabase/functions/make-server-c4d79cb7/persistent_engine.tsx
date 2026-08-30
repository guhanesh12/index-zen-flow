/**
 * ⚡⚡⚡ PERSISTENT TRADING ENGINE - RUNS ON SERVER ⚡⚡⚡
 *
 * This engine runs INDEPENDENTLY on the backend server.
 * It does NOT stop when:
 * - Browser tab closes
 * - Screen turns off
 * - System goes to sleep
 * - User logs out
 * - Page refreshes
 *
 * It ONLY stops when explicitly commanded via API.
 *
 * Data is persisted to Supabase tables:
 * - trading_engine_state
 * - trading_signals
 * - trading_orders
 * - position_monitor_state
 * - signal_stats
 */

import { DhanService } from "./dhan_service.tsx";
import { AdvancedAI } from "./advanced_ai.tsx";
import * as kv from "./kv_store.tsx";
import { placeOrderViaStaticIP } from "./static_ip_helper.tsx";
import * as BrokerRouter from "./broker_router.tsx";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { checkAndDebitTiered } from "./tiered_debit.tsx";
import { resolveAutoSymbol } from "./instrument_refresh.tsx";
import { sendPushToUser } from "./push_notifications.tsx";
import { getCentralOHLC, getCachedCentralSignal, saveCentralSignal, getCentralCredentials } from "./central_market_data.tsx";

// 📧 Fire-and-forget email sender (best-effort, never blocks engine)
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function sendEmailAsync(template: string, userId: string, data: any = {}) {
  try {
    fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        apikey: SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ template, userId, data }),
    })
      .then((r) => {
        if (!r.ok) console.warn(`[email:${template}]`, r.status);
      })
      .catch((e) => console.warn(`[email:${template}]`, e?.message));
  } catch (e) {
    console.warn(`[email:${template}] threw`, e);
  }
}

// Trading-day check (uses Asia/Kolkata)
function isTradingHourIST(now = new Date()): { open: boolean; reason?: string; nextSession?: string } {
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dow = ist.getDay(); // 0=Sun 6=Sat
  if (dow === 0 || dow === 6)
    return { open: false, reason: "Weekend (markets closed)", nextSession: "Monday 09:15 IST" };
  const mins = ist.getHours() * 60 + ist.getMinutes();
  if (mins < 9 * 60 + 15) return { open: false, reason: "Pre-market hours", nextSession: "Today 09:15 IST" };
  if (mins > 15 * 60 + 30)
    return { open: false, reason: "Market closed for the day", nextSession: "Next trading day 09:15 IST" };
  return { open: true };
}
async function isTradingDayDB(): Promise<boolean> {
  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data } = await supa.rpc("is_trading_day");
    return data === true;
  } catch {
    return true;
  }
}

const SUPPORTED_INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"] as const;
type SupportedIndex = (typeof SUPPORTED_INDICES)[number];

function normalizeIndexName(symbol: any): SupportedIndex {
  const rawValue = String(
    symbol?.index ??
      symbol?.indexName ??
      symbol?.index_name ??
      symbol?.underlyingSymbol ??
      symbol?.underlying ??
      symbol?.symbol ??
      symbol?.symbolName ??
      symbol?.name ??
      "",
  )
    .toUpperCase()
    .replace(/\s+/g, "");

  if (rawValue.includes("BANKNIFTY")) return "BANKNIFTY";
  if (rawValue.includes("SENSEX")) return "SENSEX";
  return "NIFTY";
}

function normalizeOptionType(value: any): "CE" | "PE" | "" {
  const rawValue = String(value ?? "")
    .toUpperCase()
    .trim();
  if (!rawValue) return "";
  if (rawValue === "CE" || rawValue === "CALL") return "CE";
  if (rawValue === "PE" || rawValue === "PUT") return "PE";
  // Handle full trading symbols like "NIFTY-MAY2026-24100-CE" or "SENSEX26MAY76500PE"
  if (/(^|[^A-Z])CE($|[^A-Z])/.test(rawValue) || /CALL/.test(rawValue)) return "CE";
  if (/(^|[^A-Z])PE($|[^A-Z])/.test(rawValue) || /PUT/.test(rawValue)) return "PE";
  if (rawValue.endsWith("CE")) return "CE";
  if (rawValue.endsWith("PE")) return "PE";
  return "";
}

function numeric(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getSecurityId(value: any): string {
  return String(value?.securityId ?? value?.symbol_id ?? value?.symbolId ?? value?.security_id ?? "").trim();
}

function getPositionSymbol(value: any): string {
  return String(value?.symbol ?? value?.symbolName ?? value?.tradingSymbol ?? value?.name ?? value?.displayName ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function getStrikeOptionKey(value: any): string {
  const sid = getSecurityId(value);
  if (sid) return `SID:${sid}`;
  const symbol = getPositionSymbol(value);
  const option = normalizeOptionType(value?.optionType || value?.option_type || symbol);
  const index = normalizeIndexName(value);
  const strikeMatch = symbol.match(/(\d{4,6})(?=(CE|PE)?$)/);
  const strike = strikeMatch?.[1] || "";
  if (index && option && strike) return `${index}:${strike}:${option}`;
  return symbol ? `SYM:${symbol}` : "";
}

function getComparablePositionKeys(value: any): Set<string> {
  const keys = new Set<string>();
  const sid = getSecurityId(value);
  const symbol = getPositionSymbol(value);
  const option = normalizeOptionType(value?.optionType || value?.option_type || symbol);
  const index = normalizeIndexName(value);
  const strike = extractStrikePrice(value);

  if (sid) keys.add(`SID:${sid}`);
  if (symbol) keys.add(`SYM:${symbol}`);
  if (index && option && strike) keys.add(`OPT:${index}:${strike}:${option}`);

  return keys;
}

function hasAnyPositionKeyOverlap(a: any, b: any): boolean {
  const aKeys = getComparablePositionKeys(a);
  const bKeys = getComparablePositionKeys(b);
  for (const key of aKeys) {
    if (bKeys.has(key)) return true;
  }
  return false;
}

function positionsMatch(a: any, b: any): boolean {
  const aSid = getSecurityId(a);
  const bSid = getSecurityId(b);
  if (aSid && bSid && aSid === bSid) return true;
  return hasAnyPositionKeyOverlap(a, b);
}

function findSymbolConfigForPosition(position: any, symbols: any[]): any | null {
  return (
    symbols.find((s: any) => positionsMatch(s, position)) ||
    symbols.find((s: any) => getPositionSymbol(s) && getPositionSymbol(s) === getPositionSymbol(position)) ||
    null
  );
}

function resolveSymbolExchangeSegment(symbol: any): string {
  const rawValue = String(symbol?.exchangeSegment ?? symbol?.exchange_segment ?? symbol?.exchange ?? "")
    .toUpperCase()
    .trim();
  if (rawValue === "BSE" || rawValue === "BSE_FNO") return "BSE_FNO";
  if (rawValue === "NSE" || rawValue === "NSE_FNO") return "NSE_FNO";
  return normalizeIndexName(symbol) === "SENSEX" ? "BSE_FNO" : "NSE_FNO";
}

function getSymbolDisplayName(symbol: any): string {
  return symbol?.symbolName || symbol?.name || symbol?.symbol_name || symbol?.displayName || "UNKNOWN";
}

function extractStrikePrice(value: any): number | null {
  const direct = numeric(
    value?.strikePrice ??
      value?.strike_price ??
      value?.strike ??
      value?.raw_data?.strikePrice ??
      value?.raw_data?.strike_price,
    NaN,
  );
  if (Number.isFinite(direct) && direct > 0) return direct;

  const compactSymbol = getPositionSymbol(value);
  const match = compactSymbol.match(/(\d{4,6})(?=(CE|PE)$)/);
  const parsed = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getStrikeStep(indexName: SupportedIndex): number {
  return indexName === "BANKNIFTY" || indexName === "SENSEX" ? 100 : 50;
}

function selectNearestAtmSymbol(symbols: any[], aiAtmStrike: number | null, indexName: SupportedIndex): any[] {
  if (symbols.length === 0) return [];
  if (!aiAtmStrike) return [symbols[0]];
  const strikeStep = getStrikeStep(indexName);
  const ranked = symbols
    .map((symbol: any) => {
      const strike = extractStrikePrice(symbol);
      const distance = strike ? Math.abs(strike - aiAtmStrike) : Number.MAX_SAFE_INTEGER;
      return { symbol, strike, distance };
    })
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        String(getSymbolDisplayName(a.symbol)).localeCompare(String(getSymbolDisplayName(b.symbol))),
    );
  const best = ranked[0];
  if (!best) return [];
  if (best.distance > strikeStep) {
    console.warn(
      `⚠️ AUTO-STRIKE: nearest available strike is ${best.distance} pts away from AI ATM ${aiAtmStrike}. Proceeding with nearest configured contract.`,
    );
  }
  return [best.symbol];
}

async function loadUserSymbolsFromDB(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin.from("user_symbols").select("*").eq("user_id", userId);

    if (error) {
      console.error(`❌ Failed loading user symbols from DB for ${userId}:`, error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...(row.raw_data || {}),
      id: row.raw_data?.id || `SYM_${row.symbol_id || crypto.randomUUID()}`,
      name: row.raw_data?.name || row.symbol_name || "UNKNOWN",
      symbolName: row.raw_data?.symbolName || row.symbol_name || "UNKNOWN",
      displayName: row.raw_data?.displayName || row.symbol_name || "UNKNOWN",
      index: row.raw_data?.index || row.index_name || "NIFTY",
      indexName: row.raw_data?.indexName || row.index_name || "NIFTY",
      optionType: row.raw_data?.optionType || row.option_type || "",
      transactionType: row.raw_data?.transactionType || "BUY",
      exchangeSegment:
        row.raw_data?.exchangeSegment || row.exchange_segment || (row.index_name === "SENSEX" ? "BSE_FNO" : "NSE_FNO"),
      productType: row.raw_data?.productType || "INTRADAY",
      orderType: "MARKET",
      validity: row.raw_data?.validity || "DAY",
      securityId: String(row.raw_data?.securityId || row.symbol_id || ""),
      quantity: row.raw_data?.quantity || row.lot_size || 1,
      lotSize: row.raw_data?.lotSize || row.lot_size || 1,
      strikePrice: row.raw_data?.strikePrice || row.strike_price || null,
      expiry: row.raw_data?.expiry || row.expiry || null,
      active: row.raw_data?.active ?? true,
      targetAmount: row.raw_data?.targetAmount ?? 0,
      stopLossAmount: row.raw_data?.stopLossAmount ?? 0,
      trailingEnabled: row.raw_data?.trailingEnabled ?? false,
      trailingActivationAmount: row.raw_data?.trailingActivationAmount ?? 0,
      targetJumpAmount: row.raw_data?.targetJumpAmount ?? 0,
      stopLossJumpAmount: row.raw_data?.stopLossJumpAmount ?? 0,
    }));
  } catch (error) {
    console.error(`❌ Unexpected error loading user symbols for ${userId}:`, error);
    return [];
  }
}

// 🧮 Per-lot risk defaults for MANUAL broker positions (user adds lots in Dhan app).
// Reads any enabled user_symbol_config slot for that index, else falls back to defaults.
// Applies moneyness multiplier (ITM slower, OTM faster).
const _MONEYNESS_MULT: Record<string, { tgt: number; sl: number }> = {
  ITM2: { tgt: 0.7, sl: 1.3 }, ITM1: { tgt: 0.85, sl: 1.15 },
  ATM:  { tgt: 1.0, sl: 1.0 },
  OTM1: { tgt: 1.2, sl: 0.85 }, OTM2: { tgt: 1.5, sl: 0.7 },
};
function _inferIndexName(sym: string): string {
  const s = (sym || "").toUpperCase();
  if (s.includes("BANKNIFTY")) return "BANKNIFTY";
  if (s.includes("SENSEX")) return "SENSEX";
  return "NIFTY";
}

// 🧮 Index option lot sizes. A lot size of 1 is NEVER valid for index options —
// falling back to 1 made lotCount == raw share quantity (e.g. 195), which
// multiplied the user's configured Target/SL by ~65-75x so they could never be hit.
const _INDEX_LOT_SIZE: Record<string, number> = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };
function _resolveLotSize(indexName: string, ...candidates: any[]): number {
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 1) return n;
  }
  return _INDEX_LOT_SIZE[(indexName || "NIFTY").toUpperCase()] || 65;
}

/**
 * 🛡️ RISK SANITY CLAMP
 * An option BUY can never lose more than the premium paid, so a stop-loss larger
 * than the notional is unreachable (the position then only ever exits via
 * "closed externally" or an AI reversal). Target is capped at 5x notional.
 */
function _sanitizeRisk(
  target: number,
  stopLoss: number,
  entryPrice: number,
  quantity: number,
): { target: number; stopLoss: number; clamped: boolean } {
  const notional = Math.abs(Number(entryPrice) || 0) * Math.abs(Number(quantity) || 0);
  let t = Number(target) || 0;
  let s = Number(stopLoss) || 0;
  if (notional <= 0) return { target: t, stopLoss: s, clamped: false };
  const maxSL = notional;            // cannot lose more than the premium paid
  const maxTgt = notional * 5;       // 500% of premium is already extreme
  let clamped = false;
  if (s > maxSL) { s = +(notional * 0.5).toFixed(2); clamped = true; }
  if (t > maxTgt) { t = +(notional * 1.0).toFixed(2); clamped = true; }
  return { target: t, stopLoss: s, clamped };
}

async function computeManualLotRisk(
  userId: string,
  indexName: string,
  qty: number,
  lotSize: number,
  moneyness?: string,
): Promise<{
  targetAmount: number; stopLossAmount: number;
  trailingEnabled: boolean; trailingActivationAmount: number;
  targetJumpAmount: number; stopLossJumpAmount: number;
  lotCount: number; perLot: { tgt: number; sl: number; tAct: number; tStep: number };
}> {
  const safeLot = Math.max(1, Number(lotSize) || 1);
  const lotCount = Math.max(1, Math.round(Math.abs(Number(qty) || safeLot) / safeLot));

  let tgtPerLot = 6000, slPerLot = 3000, tActPerLot = 4000, tStepPerLot = 1000;
  let trailingEnabled = true;
  try {
    const { data } = await supabaseAdmin
      .from("user_symbol_config")
      .select("target_per_lot, stop_loss_per_lot, trailing_activation_per_lot, trailing_step_per_lot, trailing_enabled, index_name")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("index_name", { ascending: indexName !== "NIFTY" });
    const rows = (data || []) as any[];
    const match = rows.find((r) => (r.index_name || "").toUpperCase() === indexName.toUpperCase()) || rows[0];
    if (match) {
      tgtPerLot = Number(match.target_per_lot) || tgtPerLot;
      slPerLot = Number(match.stop_loss_per_lot) || slPerLot;
      tActPerLot = Number(match.trailing_activation_per_lot) || Math.round(tgtPerLot * 0.66);
      tStepPerLot = Number(match.trailing_step_per_lot) || Math.round(slPerLot * 0.33);
      trailingEnabled = match.trailing_enabled !== false;
    }
  } catch (_e) { /* fallback to defaults */ }

  const mm = _MONEYNESS_MULT[(moneyness || "ATM").toUpperCase()] || _MONEYNESS_MULT.ATM;
  const targetAmount = +(tgtPerLot * lotCount * mm.tgt).toFixed(2);
  const stopLossAmount = +(slPerLot * lotCount * mm.sl).toFixed(2);
  const trailingActivationAmount = +(tActPerLot * lotCount * mm.tgt).toFixed(2);
  const trailingStep = +(tStepPerLot * lotCount).toFixed(2);
  return {
    targetAmount, stopLossAmount,
    trailingEnabled: trailingEnabled && trailingActivationAmount > 0 && trailingStep > 0,
    trailingActivationAmount,
    targetJumpAmount: trailingStep,
    stopLossJumpAmount: trailingStep,
    lotCount,
    perLot: { tgt: tgtPerLot, sl: slPerLot, tAct: tActPerLot, tStep: tStepPerLot },
  };
}

async function getFreshSymbolsForEngine(userId: string, stateSymbols: any[]): Promise<any[]> {
  const dbSymbols = await loadUserSymbolsFromDB(userId);
  if (dbSymbols.length === 0) {
    return stateSymbols || [];
  }

  const kvSymbols = (await kv.get(`symbols:${userId}`)) || [];
  const candidates = [...dbSymbols, ...kvSymbols, ...(stateSymbols || [])];
  const deduped = new Map<string, any>();

  for (const symbol of candidates) {
    const key = String(symbol?.securityId || symbol?.symbolId || symbol?.symbol_id || symbol?.id || "");
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, symbol);
    }
  }

  return Array.from(deduped.values());
}

// Supabase client for DB operations
const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

async function loadDhanCredentials(userId: string): Promise<{ dhanClientId: string; dhanAccessToken: string } | null> {
  const { data } = await supabaseAdmin
    .from("broker_credentials")
    .select("dhan_client_id, access_token, last_status")
    .eq("user_id", userId)
    .eq("broker", "dhan")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.dhan_client_id && data?.access_token) {
    const fresh = { dhanClientId: data.dhan_client_id, dhanAccessToken: data.access_token };
    await kv.set(`api_credentials:${userId}`, fresh);
    return fresh;
  }

  const legacy = await kv.get(`api_credentials:${userId}`);
  return legacy?.dhanClientId && legacy?.dhanAccessToken ? legacy : null;
}

/**
 * 🔀 Broker-aware engine credentials.
 * Dhan users keep the exact old behaviour. For Zerodha/Groww/Upstox users the
 * Dhan KV session is intentionally wiped by selectBroker(), so we fall back to
 * the CENTRAL market-data Dhan credentials purely for candles/LTP — orders,
 * positions and funds still route through BrokerRouter (*Smart helpers).
 */
async function loadEngineCredentials(
  userId: string,
): Promise<{ dhanClientId: string; dhanAccessToken: string } | null> {
  const own = await loadDhanCredentials(userId);
  if (own) return own;

  try {
    const broker = await BrokerRouter.getActiveBroker(userId);
    if (broker === "dhan") return null;

    // Only run when that broker actually has a live session.
    const connected =
      broker === "zerodha"
        ? !!(await BrokerRouter.getKiteCredentials(userId))?.accessToken
        : broker === "groww"
          ? !!(await BrokerRouter.getGrowwCredentials(userId))?.accessToken
          : broker === "upstox"
            ? !!(await BrokerRouter.getUpstoxCredentials(userId))?.accessToken
            : broker === "fyers"
              ? !!(await BrokerRouter.getFyersCredentials(userId))?.accessToken
              : broker === "angelone"
                ? !!(await BrokerRouter.getAngelOneCredentials(userId))?.jwtToken
                : broker === "aliceblue"
                  ? !!(await BrokerRouter.getAliceblueCredentials(userId))?.sessionId
                  : broker === "5paisa"
                    ? !!(await BrokerRouter.getFivepaisaCredentials(userId))?.accessToken
                    : false;

    if (!connected) return null;

    const central = await getCentralCredentials();
    if (!central?.clientId || !central?.accessToken) {
      console.warn(`⚠️ [ENGINE] ${broker} user ${userId} has no central market-data credentials`);
      return null;
    }
    return { dhanClientId: central.clientId, dhanAccessToken: central.accessToken };
  } catch (e) {
    console.error("[ENGINE] broker-aware credential load failed:", (e as any)?.message || e);
    return null;
  }
}


interface EngineState {
  isRunning: boolean;
  userId: string;
  candleInterval: "5" | "15";
  symbols: any[];
  lastProcessedCandle: string;
  activePositions: any[];
  stats: {
    totalSignals: number;
    totalOrders: number;
    totalPnL: number;
  };
  startTime: number;
  lastHeartbeat: number;
  dhanClientId?: string;
  dhanAccessToken?: string;
}

interface EngineConfig {
  userId: string;
  candleInterval: "5" | "15";
  symbols: any[];
  dhanClientId: string;
  dhanAccessToken: string;
}

/**
 * ⚡ SINGLETON PATTERN - ONE ENGINE PER USER
 */
class PersistentTradingEngine {
  /**
   * A broker accepting an exit request does not mean the position was closed.
   * Wait for the exit order to be fully filled before mutating monitor state or
   * sending a "Position Closed" notification.
   */
  private async confirmExitFilled(
    userId: string,
    exitResult: any,
    position: any,
    dhanService: any,
  ): Promise<{ confirmed: boolean; error?: string }> {
    const exitOrderId = String(exitResult?.orderId || "").trim();
    if (!exitOrderId) {
      if (!exitResult?.success) {
        return { confirmed: false, error: exitResult?.error || "Broker did not return an exit order ID" };
      }
      // Some brokers accept and fill an exit without echoing an order ID.
      // Never assume the fill — verify against the broker's live position book.
      const gone = await this.positionGoneAtBroker(userId, position, dhanService);
      if (gone === true) return { confirmed: true };
      return {
        confirmed: false,
        error: gone === false
          ? "Exit accepted but position still open at broker"
          : "Exit accepted but fill could not be verified (no order ID, position book unavailable)",
      };
    }

    const expectedQuantity = Math.abs(Number(position?.quantity || 0));
    const filledStatuses = new Set(["COMPLETE", "COMPLETED", "FILLED", "EXECUTED", "TRADED", "SUCCESS"]);
    const failedStatuses = new Set(["REJECTED", "CANCELLED", "CANCELED", "FAILED", "ERROR"]);
    let lastStatus = "PENDING";
    let statusApiResponded = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 750));
      const status = await BrokerRouter.getOrderStatusSmart(
        userId,
        exitOrderId,
        () => dhanService.getOrderStatus(exitOrderId),
      ).catch(() => null);
      if (status) statusApiResponded = true;
      const rawStatus = String(
        status?.orderStatus || status?.order_status || status?.status || status?.raw?.orderStatus || "PENDING",
      ).toUpperCase();
      lastStatus = rawStatus;
      const tradedQuantity = Math.abs(Number(
        status?.tradedQuantity ?? status?.filledQty ?? status?.filled_quantity ?? status?.quantity ?? 0,
      ));

      if (failedStatuses.has(rawStatus)) {
        return { confirmed: false, error: `Exit order ${rawStatus}` };
      }
      if (filledStatuses.has(rawStatus) && (expectedQuantity === 0 || tradedQuantity === 0 || tradedQuantity >= expectedQuantity)) {
        return { confirmed: true };
      }
    }

    // Order-status APIs are unreliable for several brokers, so instead of either
    // stalling forever or blindly assuming a fill, fall back to the broker's own
    // position book — that is the source of truth for "is this trade still open?".
    const gone = await this.positionGoneAtBroker(userId, position, dhanService);
    if (gone === true) {
      console.warn(
        `⚠️ Exit ${exitOrderId} unconfirmed by order status (last: ${lastStatus}) but position is gone from the broker position book — treating as filled`,
      );
      return { confirmed: true };
    }

    const reason = gone === false
      ? `Exit order not filled (last status: ${lastStatus}) — position still open at broker`
      : `Exit order not filled (last status: ${lastStatus}, statusApiResponded: ${statusApiResponded}) — could not verify against broker positions`;
    console.warn(`⚠️ ${reason}`);
    return { confirmed: false, error: reason };
  }

  /**
   * Source-of-truth check: is this position still present (non-zero qty) in the
   * broker's live position book?
   * @returns true = gone (exit really filled), false = still open, null = unknown
   */
  private async positionGoneAtBroker(
    userId: string,
    position: any,
    dhanService: any,
  ): Promise<boolean | null> {
    try {
      const brokerPositions = await BrokerRouter.getPositionsSmart(userId, () => dhanService.getPositions());
      if (!Array.isArray(brokerPositions)) return null;
      const stillOpen = brokerPositions.some(
        (bp: any) => positionsMatch(bp, position) && Math.abs(Number(bp?.netQty ?? bp?.net_qty ?? 0)) > 0,
      );
      return !stillOpen;
    } catch (e) {
      console.warn(`⚠️ positionGoneAtBroker lookup failed: ${(e as any)?.message || e}`);
      return null;
    }
  }



  private static instances: Map<string, NodeJS.Timeout> = new Map();
  private static engineStates: Map<string, EngineState> = new Map();
  private static activeLoops: Set<string> = new Set();
  private static activeLoopStartedAt: Map<string, number> = new Map();
  private static monitorLoops: Map<string, Promise<void>> = new Map();
  private static positionMonitorLoopUntil = 0;
  private static recentOrderKeys: Map<string, number> = new Map();
  private static readonly RECENT_ORDER_WINDOW_MS = 3 * 60 * 1000;
  private static readonly ACTIVE_LOOP_STALE_MS = 90 * 1000;
  private static readonly POSITION_MONITOR_INTERVAL_MS = 1000;

  /**
   * Update an in-memory active position's target/stop-loss (called from manual edit endpoint)
   */
  static updateActivePositionTargets(
    userId: string,
    orderId: string,
    targetAmount: number,
    stopLossAmount: number,
  ): boolean {
    const state = this.engineStates.get(userId);
    if (!state || !state.activePositions) return false;
    const pos = state.activePositions.find((p: any) => p.orderId === orderId);
    if (!pos) return false;
    pos.targetAmount = targetAmount;
    pos.stopLossAmount = stopLossAmount;
    pos.currentTargetAmount = targetAmount;
    pos.currentStopLossAmount = stopLossAmount;
    console.log(`✏️ [MANUAL EDIT] In-memory updated ${pos.symbolName} → Tgt ₹${targetAmount} SL ₹${stopLossAmount}`);
    return true;
  }

  /**
   * START ENGINE FOR USER
   */
  static async startEngine(config: EngineConfig): Promise<{ success: boolean; message: string }> {
    const { userId, candleInterval, dhanClientId, dhanAccessToken } = config;
    const symbols = Array.isArray(config.symbols) ? config.symbols : [];

    // Check if engine already running
    if (this.instances.has(userId)) {
      return {
        success: false,
        message: "⚠️ Engine already running for this user",
      };
    }

    const { data: enabledAutoSlots } = await supabaseAdmin
      .from("user_symbol_config")
      .select("slot")
      .eq("user_id", userId)
      .eq("enabled", true)
      .limit(1);
    const hasAutoSymbolMode = Array.isArray(enabledAutoSlots) && enabledAutoSlots.length > 0;

    // Validate at least one execution source: auto-symbol slots OR manual symbols
    if (symbols.length === 0 && !hasAutoSymbolMode) {
      return {
        success: false,
        message: "❌ No execution source configured. Add an Auto Symbol slot or add manual symbols.",
      };
    }

    // Initialize engine state
    const engineState: EngineState = {
      isRunning: true,
      userId,
      candleInterval,
      symbols,
      lastProcessedCandle: "",
      activePositions: [],
      stats: {
        totalSignals: 0,
        totalOrders: 0,
        totalPnL: 0,
      },
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      dhanClientId,
      dhanAccessToken,
    };

    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffsetMs);
    const currentTimeMinutes = istTime.getUTCHours() * 60 + istTime.getUTCMinutes();
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;

    if (currentTimeMinutes >= marketOpen && currentTimeMinutes <= marketClose) {
      // Start cleanly on the NEXT selected timeframe close. If the engine is
      // started at 10:43 on 15M, do not generate a stale 10:30 snapshot and
      // show it as a 10:43 signal in the UI.
      engineState.lastProcessedCandle = this.getCurrentCandleTimestamp(istTime, parseInt(candleInterval));
      console.log(
        `⚡ SYNC MODE: Engine started for ${userId} - armed after ${engineState.lastProcessedCandle}; next signal on next ${candleInterval}M close.`,
      );
    }

    this.engineStates.set(userId, engineState);

    // Save state to KV store (legacy)
    await kv.set(`engine_state_${userId}`, engineState);

    // ⚡ Save to new Supabase table
    await this.saveEngineStateToDB(userId, engineState);

    console.log(`🚀 STARTING PERSISTENT ENGINE for user ${userId}`);
    console.log(`   Interval: ${candleInterval}M`);
    console.log(`   Symbols: ${symbols.length}`);
    console.log(`   Auto Symbol Mode: ${hasAutoSymbolMode ? "ON" : "OFF"}`);

    const staleTimer = this.instances.get(userId);
    if (staleTimer) {
      clearInterval(staleTimer);
      this.instances.delete(userId);
    }

    // 📱 Write user-visible log so START is shown on website + app no matter which device started it
    await this.appendSharedLog(userId, {
      id: `engine_start_${Date.now()}`,
      timestamp: Date.now(),
      type: "ENGINE_START",
      message: `🚀 AI Trading Engine STARTED | ${candleInterval}M Candles | ${hasAutoSymbolMode ? "Auto Symbol ON" : `${symbols.length} manual symbols active`} | 📱 Synced across all devices`,
    });

    return {
      success: true,
      message: `✅ Engine started successfully! Waiting for the next ${candleInterval}M candle close.`,
    };
  }

  /**
   * STOP ENGINE FOR USER
   */
  static async stopEngine(userId: string): Promise<{ success: boolean; message: string }> {
    const timerId = this.instances.get(userId);

    const writeStopLog = async (msg: string) => {
      await this.appendSharedLog(userId, {
        id: `engine_stop_${Date.now()}`,
        timestamp: Date.now(),
        type: "ENGINE_STOP",
        message: msg,
      });
    };

    if (!timerId) {
      // Even if no in-memory timer, mark DB as stopped
      await this.markEngineStoppedInDB(userId);
      await writeStopLog("🛑 AI Trading Engine STOPPED | 📱 Synced across all devices");
      return {
        success: true,
        message: "✅ Engine stopped (was running via cron)",
      };
    }

    // Stop interval
    clearInterval(timerId);
    this.instances.delete(userId);

    // Update KV state
    const state = this.engineStates.get(userId);
    if (state) {
      state.isRunning = false;
      state.lastHeartbeat = Date.now();
      await kv.set(`engine_state_${userId}`, state);
    }

    this.engineStates.delete(userId);

    // ⚡ Mark stopped in DB
    await this.markEngineStoppedInDB(userId);

    console.log(`🛑 STOPPED PERSISTENT ENGINE for user ${userId}`);
    await writeStopLog("🛑 AI Trading Engine STOPPED | 📱 Synced across all devices");

    return {
      success: true,
      message: "✅ Engine stopped successfully",
    };
  }

  /**
   * ⚡⚡⚡ CRON JOB TICK - PROCESSES ALL ACTIVE ENGINES ⚡⚡⚡
   * This is called every 1 minute by pg_cron
   */
  private static cronLockUntil = 0;

  static async runCronTick(force = false): Promise<any> {
    // ⚡ LOCK: Prevent concurrent cron ticks (duplicate signal prevention)
    const now = Date.now();
    if (!force && now < this.cronLockUntil) {
      console.log(`⏸️ [CRON] Skipping - already processing (lock until ${new Date(this.cronLockUntil).toISOString()})`);
      return { success: true, skipped: true, message: "Concurrent tick blocked by lock" };
    }
    this.cronLockUntil = now + 4_500; // Short lock: position monitor now runs every 1 second


    console.log(`⏱️ [CRON] Starting 24/7 Engine Tick...`);

    try {
      // ⚡ Load active engines from Supabase DB table (more reliable than KV)
      const { data: activeEngines, error: dbError } = await supabaseAdmin
        .from("trading_engine_state")
        .select("*")
        .eq("is_running", true);

      if (dbError) {
        console.error(`❌ [CRON] DB error loading engines:`, dbError);
        // Fallback to KV store
        return await this.runCronTickFromKV();
      }

      if (!activeEngines || activeEngines.length === 0) {
        console.log(`⏱️ [CRON] No active engines found in DB.`);
        return { success: true, processed: 0, message: "No active engines" };
      }

      let processedCount = 0;

      // ⚡ SPEED: users used to be processed one-by-one, so the last user in the
      // list could get their order minutes after the candle closed. Run them in
      // parallel batches instead (order placement is per-user isolated).
      const runEngineForUser = async (engine: any) => {
        try {
          const userId = engine.user_id;

          const settings = engine.strategy_settings || {};
          const symbols = engine.selected_symbols || [];

          // Get fresh Dhan credentials from DB first; KV can be stale after reconnect/token refresh.
          const credentials = await loadEngineCredentials(userId);
          if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) {
            console.warn(`⚠️ [CRON] No usable broker credentials for user ${userId}, skipping`);
            return;
          }


          // Hydrate/sync memory state from DB every tick. Edge isolates keep module memory
          // between requests; after a stop/start, an old in-memory `isRunning:false` state
          // can survive while DB correctly says running, causing heartbeat-only ticks with
          // no candle analysis. Treat DB as source of truth for active cron engines.
          const existingState = this.engineStates.get(userId);
          if (!existingState) {
            this.engineStates.set(userId, {
              isRunning: true,
              userId,
              candleInterval: settings.candleInterval || "15",
              symbols,
              lastProcessedCandle: settings.lastProcessedCandle || "",
              activePositions: [],
              stats: {
                totalSignals: settings.totalSignals || 0,
                totalOrders: settings.totalOrders || 0,
                totalPnL: settings.totalPnL || 0,
              },
              startTime: new Date(engine.started_at || engine.created_at).getTime(),
              lastHeartbeat: Date.now(),
              dhanClientId: credentials.dhanClientId,
              dhanAccessToken: credentials.dhanAccessToken,
            });
          } else {
            existingState.isRunning = true;
            existingState.candleInterval = settings.candleInterval || existingState.candleInterval || "15";
            existingState.symbols = symbols;
            existingState.lastProcessedCandle = settings.lastProcessedCandle || existingState.lastProcessedCandle || "";
            existingState.stats = {
              totalSignals: Math.max(existingState.stats?.totalSignals || 0, settings.totalSignals || 0),
              totalOrders: Math.max(existingState.stats?.totalOrders || 0, settings.totalOrders || 0),
              totalPnL: Number(settings.totalPnL ?? existingState.stats?.totalPnL ?? 0),
            };
            existingState.startTime = new Date(engine.started_at || engine.created_at).getTime();
            existingState.lastHeartbeat = Date.now();
            existingState.dhanClientId = credentials.dhanClientId;
            existingState.dhanAccessToken = credentials.dhanAccessToken;
          }

          const dhanService = new DhanService({
            clientId: credentials.dhanClientId,
            accessToken: credentials.dhanAccessToken,
          });

          // Execute engine loop
          await this.engineLoop(userId, dhanService, credentials.dhanClientId, credentials.dhanAccessToken);

          // Update heartbeat in DB
          await supabaseAdmin
            .from("trading_engine_state")
            .update({ last_heartbeat: new Date().toISOString() })
            .eq("user_id", userId);

          processedCount++;
        } catch (engineErr) {
          console.error(`❌ [CRON] Error processing engine for user ${engine.user_id}:`, engineErr);
        }
      };

      const CONCURRENCY = 10;
      for (let i = 0; i < activeEngines.length; i += CONCURRENCY) {
        await Promise.all(activeEngines.slice(i, i + CONCURRENCY).map(runEngineForUser));
      }


      // ⚡⚡⚡ ALSO MONITOR USERS WITH OPEN POSITIONS BUT ENGINE STOPPED ⚡⚡⚡
      // (so SL/Target still triggers even if user clicks "Stop Engine")
      let monitoredOnlyCount = 0;
      try {
        const activeEngineIds = new Set(activeEngines.map((e: any) => e.user_id));
        const { data: orphanPositions } = await supabaseAdmin
          .from("position_monitor_state")
          .select("user_id")
          .eq("is_active", true);
        const orphanUserIds = Array.from(
          new Set(
            (orphanPositions || [])
              .map((p: any) => p.user_id)
              .filter((uid: string) => uid && !activeEngineIds.has(uid)),
          ),
        );
        for (const uid of orphanUserIds) {
          try {
            const credentials = await loadEngineCredentials(uid);
            if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) continue;
            const dhanService = new DhanService({
              clientId: credentials.dhanClientId,
              accessToken: credentials.dhanAccessToken,
            });
            // Build a minimal state and run only the position monitor
            const minimalState: any = {
              isRunning: false,
              userId: uid,
              activePositions: [],
              stats: { totalSignals: 0, totalOrders: 0, totalPnL: 0 },
              dhanClientId: credentials.dhanClientId,
              dhanAccessToken: credentials.dhanAccessToken,
            };
            await this.monitorPositions(uid, dhanService, minimalState);
            monitoredOnlyCount++;
          } catch (orphanErr) {
            console.error(`❌ [CRON] Orphan monitor failed for ${uid}:`, orphanErr);
          }
        }
      } catch (orphanScanErr) {
        console.error(`❌ [CRON] Orphan scan failed:`, orphanScanErr);
      }

      // ⚡ Auto-cleanup: delete signals older than 24 hours
      await this.cleanupOldSignals();

      console.log(
        `⏱️ [CRON] Tick complete. Processed ${processedCount} engines + ${monitoredOnlyCount} orphan monitors.`,
      );
      return { success: true, processed: processedCount, orphanMonitored: monitoredOnlyCount };
    } catch (error) {
      console.error(`❌ [CRON] Tick error:`, error);
      return { success: false, error: String(error) };
    }
  }

  static async runPositionMonitorTick(targetUserId?: string): Promise<any> {
    const startedAt = Date.now();
    let monitoredCount = 0;

    let positionsQuery = supabaseAdmin.from("position_monitor_state").select("user_id").eq("is_active", true);

    if (targetUserId) positionsQuery = positionsQuery.eq("user_id", targetUserId);

    const { data: activePositions, error } = await positionsQuery;

    if (error) {
      console.error("❌ [POSITION-MONITOR] Failed loading active positions:", error);
      return { success: false, error: error.message };
    }

    const userIdSet = new Set<string>((activePositions || []).map((p: any) => p.user_id).filter(Boolean));

    // ⚡ ALSO include any user whose engine is running — so we can auto-pickup
    // broker positions that aren't yet tracked in position_monitor_state.
    const { data: engineRows } = await supabaseAdmin
      .from("trading_engine_state")
      .select("user_id")
      .eq("is_running", true);
    for (const row of engineRows || []) {
      if (row?.user_id && (!targetUserId || row.user_id === targetUserId)) {
        userIdSet.add(row.user_id);
      }
    }
    if (targetUserId) userIdSet.add(targetUserId);

    const userIds = Array.from(userIdSet);

    for (const userId of userIds) {
      if (this.monitorLoops.has(userId)) continue;

      const loop = (async () => {
        const credentials = await loadEngineCredentials(userId);
        if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) return;

        const dhanService = new DhanService({
          clientId: credentials.dhanClientId,
          accessToken: credentials.dhanAccessToken,
        });

        // ⚡ AUTO-IMPORT: any open broker position not yet in position_monitor_state
        try {
          const brokerPositions = await BrokerRouter.getPositionsSmart(userId, () => dhanService.getPositions());
          const openPositions = (brokerPositions || []).filter((p: any) => Math.abs(Number(p.netQty || 0)) > 0);

          if (openPositions.length > 0) {
            const { data: tracked } = await supabaseAdmin
              .from("position_monitor_state")
              .select("symbol, symbol_id, raw_position")
              .eq("user_id", userId)
              .eq("is_active", true);
            const trackedKeys = new Set<string>();
            for (const t of tracked || []) {
              getComparablePositionKeys({ ...t.raw_position, symbol: t.symbol, securityId: t.symbol_id }).forEach(
                (key) => trackedKeys.add(key),
              );
            }

            // Load user-configured symbols (target/SL/trailing settings) from user_symbols
            const userConfiguredSymbols = await loadUserSymbolsFromDB(userId);

            for (const pos of openPositions) {
              const sym = pos.tradingSymbol || pos.symbol || "";
              const sid = String(pos.securityId || "");
              const keys = getComparablePositionKeys({ ...pos, symbol: sym, securityId: sid });
              if (!sym || Array.from(keys).some((key) => trackedKeys.has(key))) continue;

              const qty = Math.abs(Number(pos.netQty || 1));
              const entry = parseFloat(pos.buyAvg || pos.avgPrice || pos.costPrice || 0);
              const ltp = parseFloat(pos.lastPrice || pos.ltp || pos.currentPrice || 0);
              const brokerPnl = parseFloat(pos.unrealizedProfit || pos.unrealizedPnl || pos.unrealizedPnL || 0);
              const computedPnl = entry && ltp ? (ltp - entry) * qty : 0;
              const pnl = Number.isFinite(brokerPnl) && brokerPnl !== 0 ? brokerPnl : computedPnl;

              // Use user-configured target/SL from Symbols section (no hardcoded defaults)
              const cfg =
                findSymbolConfigForPosition({ ...pos, symbol: sym, securityId: sid }, userConfiguredSymbols) || {};
              const idxName = sym.includes("BANKNIFTY") ? "BANKNIFTY" : sym.includes("SENSEX") ? "SENSEX" : "NIFTY";
              const lotSize = _resolveLotSize(idxName, cfg.lotSize, pos.lotSize, pos.lot_size);

              // 🧮 LOT-BASED AUTO RISK: scale target/SL/trailing by LOT COUNT (never by raw
              // share quantity) so manual buys in the broker app get proportional SL/Target.
              const autoRisk = await computeManualLotRisk(userId, idxName, qty, lotSize, cfg.moneyness);
              // The user's configured amounts are TOTALS for the lots they configured, so
              // convert to per-lot first and re-scale to the lots actually held.
              const cfgLots = Math.max(1, Math.round(Math.abs(Number(cfg.quantity) || lotSize) / lotSize));
              const rescale = (v: any, fallback: number) => {
                const n = Number(v);
                return n > 0 ? +((n / cfgLots) * autoRisk.lotCount).toFixed(2) : fallback;
              };
              const rawTarget = rescale(cfg.targetAmount, autoRisk.targetAmount);
              const rawStopLoss = rescale(cfg.stopLossAmount, autoRisk.stopLossAmount);
              const _safe = _sanitizeRisk(rawTarget, rawStopLoss, entry, qty);
              if (_safe.clamped) {
                console.warn(
                  `🛡️ [RISK-CLAMP] ${sym}: Tgt ₹${rawTarget}/SL ₹${rawStopLoss} exceeded premium notional (₹${(entry * qty).toFixed(2)}) → Tgt ₹${_safe.target} SL ₹${_safe.stopLoss}`,
                );
              }
              const cfgTarget = _safe.target;
              const cfgStopLoss = _safe.stopLoss;
              const cfgTrailingEnabled = cfg.trailingEnabled !== undefined
                ? !!cfg.trailingEnabled
                : autoRisk.trailingEnabled;
              const cfgTrailingActivation = Math.min(
                rescale(cfg.trailingActivationAmount, autoRisk.trailingActivationAmount),
                Math.max(1, cfgTarget * 0.8),
              );
              const cfgTargetJump = Math.min(
                rescale(cfg.targetJumpAmount, autoRisk.targetJumpAmount),
                Math.max(1, cfgTarget * 0.5),
              );
              const cfgSlJump = Math.min(
                rescale(cfg.stopLossJumpAmount, autoRisk.stopLossJumpAmount),
                Math.max(1, cfgStopLoss * 0.5),
              );


              const orderId = pos.orderId || pos.order_id || `auto-${userId}-${sid || Array.from(keys)[0] || sym}`;

              await supabaseAdmin.from("position_monitor_state").upsert(
                {
                  user_id: userId,
                  order_id: orderId,
                  symbol: sym,
                  symbol_id: sid || null,
                  exchange_segment: pos.exchangeSegment || (sym.includes("SENSEX") ? "BSE_FNO" : "NSE_FNO"),
                  index_name: idxName,
                  entry_price: entry,
                  current_price: ltp,
                  quantity: qty,
                  pnl,
                  highest_pnl: Math.max(0, pnl),
                  target_amount: cfgTarget,
                  stop_loss_amount: cfgStopLoss,
                  trailing_enabled: cfgTrailingEnabled,
                  trailing_step: cfgSlJump,
                  is_active: true,
                  raw_position: {
                    ...pos,
                    autoImported: true,
                    importedAt: Date.now(),
                    lotSize,
                    lotCount: autoRisk.lotCount,
                    perLotRisk: autoRisk.perLot,
                    trailingActivationAmount: cfgTrailingActivation,
                    targetJumpAmount: cfgTargetJump,
                    stopLossJumpAmount: cfgSlJump,
                    sourceSymbolConfig: { targetAmount: cfgTarget, stopLossAmount: cfgStopLoss, lotCount: autoRisk.lotCount },
                  },
                },
                { onConflict: "user_id,order_id" },
              );

              keys.forEach((key) => trackedKeys.add(key));

              console.log(
                `📥 [AUTO-IMPORT] ${userId} ← ${sym} (qty ${qty}, ${autoRisk.lotCount} lot(s), entry ₹${entry}, P&L ₹${pnl.toFixed(2)}, Tgt ₹${cfgTarget}, SL ₹${cfgStopLoss}, Trail ${cfgTrailingEnabled ? `act ₹${cfgTrailingActivation}/step ₹${cfgSlJump}` : "OFF"})`,
              );
            }
          }
        } catch (err) {
          console.error(`❌ [AUTO-IMPORT] failed for ${userId}:`, err);
        }

        const state =
          this.engineStates.get(userId) ||
          ({
            isRunning: false,
            userId,
            candleInterval: "15",
            symbols: [],
            lastProcessedCandle: "",
            activePositions: [],
            stats: { totalSignals: 0, totalOrders: 0, totalPnL: 0 },
            startTime: startedAt,
            lastHeartbeat: startedAt,
            dhanClientId: credentials.dhanClientId,
            dhanAccessToken: credentials.dhanAccessToken,
          } as EngineState);

        await this.monitorPositions(userId, dhanService, state);
        await kv.set(`engine_state_${userId}`, state);
      })().finally(() => this.monitorLoops.delete(userId));

      this.monitorLoops.set(userId, loop);
      monitoredCount++;
    }

    return { success: true, intervalMs: this.POSITION_MONITOR_INTERVAL_MS, monitored: monitoredCount };
  }

  static async runPositionMonitorLoop(targetUserId?: string, durationMs = 58_000): Promise<any> {
    const now = Date.now();
    if (!targetUserId && now < this.positionMonitorLoopUntil) {
      return {
        success: true,
        skipped: true,
        intervalMs: this.POSITION_MONITOR_INTERVAL_MS,
        message: "1-second position monitor loop already running",
      };
    }

    if (!targetUserId) this.positionMonitorLoopUntil = now + Math.max(1_000, durationMs - 2_000);

    const startedAt = Date.now();
    const maxRunMs = Math.max(this.POSITION_MONITOR_INTERVAL_MS, Math.min(durationMs, 58_000));
    let ticks = 0;
    let monitoredTotal = 0;
    let lastResult: any = null;

    try {
      while (Date.now() - startedAt < maxRunMs) {
        lastResult = await this.runPositionMonitorTick(targetUserId);
        ticks++;
        monitoredTotal += Number(lastResult?.monitored || 0);

        const elapsed = Date.now() - startedAt;
        const nextTickAt = startedAt + ticks * this.POSITION_MONITOR_INTERVAL_MS;
        const waitMs = Math.min(nextTickAt - Date.now(), maxRunMs - elapsed);
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      return {
        success: true,
        intervalMs: this.POSITION_MONITOR_INTERVAL_MS,
        ticks,
        monitoredTotal,
        durationMs: Date.now() - startedAt,
        lastResult,
      };
    } finally {
      if (!targetUserId) this.positionMonitorLoopUntil = 0;
    }
  }

  // ============================================================
  // ⚡⚡⚡ ULTRA-FAST CANDLE-CLOSE WATCHER (millisecond precision)
  // pg_cron only fires once per minute, so a 15M candle closing at
  // 09:30:00 was analysed up to ~60s late. This watcher polls the
  // clock every 150ms and triggers the engine tick within ~2s of the
  // candle close (e.g. 09:30:02) so orders go out on time.
  // ============================================================
  private static readonly CANDLE_WATCH_POLL_MS = 100;
  private static readonly CANDLE_SETTLE_MS = 700; // let broker publish the closed candle
  // Safety re-fire in the same minute: if the broker had not published the closed
  // candle at +700ms, this second pass still executes the order inside the minute
  // (duplicate orders are blocked by the atomic order claim).
  private static readonly CANDLE_RETRY_MS = 6_000;
  private static candleWatchUntil = 0;
  private static lastCandleFireKey = "";
  private static lastCandleRetryKey = "";


  static async runCandleWatchLoop(durationMs = 58_000): Promise<any> {
    const now = Date.now();
    if (now < this.candleWatchUntil) {
      return { success: true, skipped: true, message: "Candle watcher already running" };
    }

    const maxRunMs = Math.max(2_000, Math.min(durationMs, 58_000));
    this.candleWatchUntil = now + maxRunMs - 1_000;

    const startedAt = Date.now();
    let fires = 0;
    let polls = 0;
    let lastLatencyMs = -1;
    const inflight: Promise<any>[] = [];

    try {
      while (Date.now() - startedAt < maxRunMs) {
        polls++;
        const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const h = istNow.getUTCHours();
        const m = istNow.getUTCMinutes();
        const msIntoMinute = istNow.getUTCSeconds() * 1000 + istNow.getUTCMilliseconds();
        const minuteOfDay = h * 60 + m;

        // Only during market hours (9:15 – 15:30 IST)
        const inMarket = minuteOfDay >= 9 * 60 + 15 && minuteOfDay <= 15 * 60 + 30;
        const key = `${istNow.getUTCFullYear()}-${istNow.getUTCMonth()}-${istNow.getUTCDate()}-${minuteOfDay}`;

        if (inMarket && msIntoMinute >= this.CANDLE_SETTLE_MS && key !== this.lastCandleFireKey) {
          this.lastCandleFireKey = key;
          // 🛰️ Publish the shared central signal FIRST (independent of any user engine)
          // so every user's tick reuses the exact same signal from cache instantly.
          inflight.push(
            this.publishCentralSignals(istNow).catch((e: any) =>
              console.error(`❌ [CENTRAL-PUB] ${e?.message || e}`)
            ),
          );

          lastLatencyMs = msIntoMinute;
          fires++;
          console.log(
            `⚡ [CANDLE-WATCH] Minute boundary ${h}:${String(m).padStart(2, "0")} → firing engine tick at +${msIntoMinute}ms`,
          );
          // Fire immediately (forced: bypass the 1-minute cron lock) and keep polling.
          inflight.push(
            this.runCronTick(true).catch((e: any) =>
              console.error(`❌ [CANDLE-WATCH] Tick failed: ${e?.message || e}`)
            ),
          );
        }

        if (inMarket && msIntoMinute >= this.CANDLE_RETRY_MS && key !== this.lastCandleRetryKey) {
          this.lastCandleRetryKey = key;
          fires++;
          console.log(`🔁 [CANDLE-WATCH] Safety re-fire at +${msIntoMinute}ms for ${h}:${String(m).padStart(2, "0")}`);
          // Re-fetch and overwrite the shared signal after the broker's settlement
          // window. The first +700ms pass may legitimately not contain the just-closed bar.
          inflight.push(
            this.publishCentralSignals(istNow, true).catch((e: any) =>
              console.error(`❌ [CENTRAL-PUB] Retry failed: ${e?.message || e}`)
            ),
          );
          inflight.push(
            this.runCronTick(true).catch((e: any) =>
              console.error(`❌ [CANDLE-WATCH] Retry tick failed: ${e?.message || e}`)
            ),
          );
        }


        await new Promise((r) => setTimeout(r, this.CANDLE_WATCH_POLL_MS));
      }

      await Promise.allSettled(inflight);

      return {
        success: true,
        fires,
        polls,
        lastLatencyMs,
        pollMs: this.CANDLE_WATCH_POLL_MS,
        settleMs: this.CANDLE_SETTLE_MS,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      this.candleWatchUntil = 0;
    }
  }


  /**
   * Fallback: run cron from KV store (legacy)
   */
  private static async runCronTickFromKV(): Promise<any> {
    try {
      const allEngines = await kv.getByPrefix("engine_state_");
      if (!allEngines || allEngines.length === 0) {
        return { success: true, processed: 0, message: "No active engines (KV fallback)" };
      }

      let processedCount = 0;
      for (const item of allEngines) {
        const state = item.value as EngineState;
        if (state && state.isRunning && state.userId && state.dhanClientId && state.dhanAccessToken) {
          if (!this.engineStates.has(state.userId)) {
            this.engineStates.set(state.userId, state);
          }
          const dhanService = new DhanService({
            clientId: state.dhanClientId,
            accessToken: state.dhanAccessToken,
          });
          await this.engineLoop(state.userId, dhanService, state.dhanClientId, state.dhanAccessToken);
          processedCount++;
        }
      }
      return { success: true, processed: processedCount, source: "kv_fallback" };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * GET ENGINE STATUS FOR USER
   */
  static async getEngineStatus(userId: string): Promise<any> {
    // Try memory first
    let state = this.engineStates.get(userId);

    // If not in memory, load from DB
    if (!state) {
      const { data } = await supabaseAdmin.from("trading_engine_state").select("*").eq("user_id", userId).maybeSingle();

      if (data) {
        // Also load active positions from DB
        const { data: positions } = await supabaseAdmin
          .from("position_monitor_state")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true);

        // Load today's stats
        const today = new Date().toISOString().split("T")[0];
        const { data: stats } = await supabaseAdmin
          .from("signal_stats")
          .select("*")
          .eq("user_id", userId)
          .eq("stat_date", today)
          .maybeSingle();

        return {
          isRunning: data.is_running,
          candleInterval: data.strategy_settings?.candleInterval || "15",
          symbols: data.selected_symbols || [],
          activePositions: positions || [],
          stats: {
            totalSignals: stats?.signal_count || 0,
            totalOrders: stats?.order_count || 0,
            totalPnL: stats?.total_pnl || 0,
          },
          startTime: data.started_at ? new Date(data.started_at).getTime() : 0,
          lastHeartbeat: data.last_heartbeat ? new Date(data.last_heartbeat).getTime() : 0,
          source: "database",
        };
      }

      // Fallback to KV
      const stored = await kv.get(`engine_state_${userId}`);
      if (stored) {
        state = stored as EngineState;
      }
    }

    return state || null;
  }

  /**
   * ⚡⚡⚡ MAIN ENGINE LOOP ⚡⚡⚡
   */
  private static async engineLoop(
    userId: string,
    dhanService: DhanService,
    dhanClientId: string,
    dhanAccessToken: string,
  ): Promise<void> {
    if (this.activeLoops.has(userId)) {
      const startedAt = this.activeLoopStartedAt.get(userId) || 0;
      if (startedAt && Date.now() - startedAt > this.ACTIVE_LOOP_STALE_MS) {
        console.warn(`⚠️ Stale engine loop lock cleared for ${userId} after ${Math.round((Date.now() - startedAt) / 1000)}s`);
        this.activeLoops.delete(userId);
        this.activeLoopStartedAt.delete(userId);
      } else {
      console.log(`⏸️ Skipping overlapping engine loop for ${userId}`);
      return;
      }
    }

    const state = this.engineStates.get(userId);
    if (!state || !state.isRunning) {
      console.log(`⚠️ Engine loop called but state not found or not running for ${userId}`);
      return;
    }

    this.activeLoops.add(userId);
    this.activeLoopStartedAt.set(userId, Date.now());

    try {
      const liveEngineState = await this.getLiveEngineState(userId);
      if (!liveEngineState?.is_running) {
        console.log(`🛑 Engine is stopped in DB for ${userId} - blocking all trading`);
        state.isRunning = false;

        const timerId = this.instances.get(userId);
        if (timerId) {
          clearInterval(timerId);
          this.instances.delete(userId);
        }

        this.engineStates.delete(userId);
        await kv.set(`engine_state_${userId}`, state);
        return;
      }

      // Update heartbeat
      state.lastHeartbeat = Date.now();

      // ⚡ IST = UTC + 5:30 (use offset directly, toLocaleString unreliable in Deno)
      const now = new Date();
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(now.getTime() + istOffsetMs);

      // Check market hours (9:15 AM - 3:30 PM IST)
      const hours = istTime.getUTCHours();
      const minutes = istTime.getUTCMinutes();
      const currentTimeMinutes = hours * 60 + minutes;
      const marketOpen = 9 * 60 + 15; // 9:15 AM
      const marketClose = 15 * 60 + 30; // 3:30 PM

      console.log(
        `⏰ IST Time: ${hours}:${minutes.toString().padStart(2, "0")} (${currentTimeMinutes}min) | Market: ${marketOpen}-${marketClose}`,
      );

      if (currentTimeMinutes < marketOpen || currentTimeMinutes > marketClose) {
        console.log(
          `💤 Market closed (IST ${hours}:${minutes.toString().padStart(2, "0")}) - Engine idle for user ${userId}`,
        );
        return;
      }

      const candleMinutes = parseInt(state.candleInterval);
      const minutesSinceOpen = currentTimeMinutes - marketOpen;

      if (minutesSinceOpen < candleMinutes) {
        console.log(`⏳ Waiting for first ${state.candleInterval}M candle to close for user ${userId}`);
        await this.monitorPositions(userId, dhanService, state);
        await kv.set(`engine_state_${userId}`, state);
        return;
      }

      // Check if the selected timeframe candle has actually CLOSED.
      // pg_cron can hit seconds before/after a boundary; only process once the
      // close minute is reached, then label the signal with that candle close.
      const currentCandleTimestamp = this.getCurrentCandleTimestamp(istTime, candleMinutes);
      const currentCandleCloseTimeMs = this.getCandleCloseTimeMs(istTime, candleMinutes);
      const dbLastProcessedCandle = liveEngineState?.strategy_settings?.lastProcessedCandle || "";

      console.log(
        `📊 Candle check: current=${currentCandleTimestamp} last=${state.lastProcessedCandle} dbLast=${dbLastProcessedCandle} interval=${candleMinutes}M symbols=${state.symbols.length}`,
      );

      if (currentCandleTimestamp === state.lastProcessedCandle || currentCandleTimestamp === dbLastProcessedCandle) {
        state.lastProcessedCandle = currentCandleTimestamp;
        console.log(`⏸️ Same candle ${currentCandleTimestamp} - monitoring positions only`);
        await this.monitorPositions(userId, dhanService, state);
        await kv.set(`engine_state_${userId}`, state);
        return;
      }

      console.log(`\n🔥 NEW CANDLE DETECTED! Processing ${state.candleInterval}M candle at ${currentCandleTimestamp}`);

      // ⚡ Do NOT mark this candle processed yet. Marking before AI/data/order work
      // caused failed or slow candle-close analysis to be skipped forever, leaving
      // the UI stuck on the previous snapshot. We commit lastProcessedCandle only
      // after the latest signal snapshot has been produced.

      // ⚡⚡⚡ ANALYZE ALL 3 INDICES INDEPENDENTLY (like frontend does) ⚡⚡⚡
      const allIndices = ["NIFTY", "BANKNIFTY", "SENSEX"];
      const analyzedIndices = new Set<string>();
      const latestSignalsSnapshot: Record<string, any> = {};
      const batchSignalTimestamp = currentCandleCloseTimeMs;
      let actionableOrderAttempted = false;
      let actionableOrderSucceeded = false;

      await Promise.all(
        allIndices.map(async (indexName) => {
        try {
          console.log(`\n📊 Analyzing index: ${indexName}`);

          // ⚡ Fetch OHLC candles from Dhan, then run AdvancedAI strategy directly
          const securityIdMap: Record<string, string> = { NIFTY: "13", BANKNIFTY: "25", SENSEX: "51" };
          const securityId = securityIdMap[indexName] || "13";
          let aiSignal: any = null;
          let ohlcData: any[] = [];
          try {
            const dhanSvc = new DhanService({ clientId: dhanClientId, accessToken: dhanAccessToken });
            // 🛰️ CENTRAL MARKET DATA: index candles come from the ADMIN Dhan data
            // subscription so EVERY user analyses the exact same bars (no rate limits,
            // no per-user data drift). Falls back to the user's own token if the admin
            // credentials are not configured / failing.
            const primary = await getCentralOHLC(securityId, String(state.candleInterval), 50, dhanSvc);
            const ohlcDataRaw = primary.candles;
            const real15mDataRaw =
              state.candleInterval === "15"
                ? ohlcDataRaw
                : (await getCentralOHLC(securityId, "15", 80, dhanSvc)).candles;
            let real1hData: any[] = [];
            try {
              real1hData = (await getCentralOHLC(securityId, "60", 40, dhanSvc)).candles;
            } catch (_e) {
              real1hData = [];
            }
            if (primary.source === "user") {
              console.warn(`🟡 [CENTRAL] ${indexName} fell back to user market data (${userId})`);
            }
            // ⚡ Dhan index candles use close-time timestamps (09:30 means 09:15-09:30 CLOSED).
            // Keep the latest bar as soon as its timestamp is <= the current closed boundary;
            // only strip future/actively-forming close timestamps.
            const stripForming = (arr: any[], tfMin: number) => {
              if (!arr || arr.length < 2) return arr;
              const lastTs = arr[arr.length - 1]?.timestamp ?? 0;
              const lastTsMs = lastTs < 1e12 ? lastTs * 1000 : lastTs;
              const tfMs = tfMin * 60 * 1000;
              const currentClosedBoundaryMs = Math.floor(Date.now() / tfMs) * tfMs;
              return lastTsMs > currentClosedBoundaryMs ? arr.slice(0, -1) : arr;
            };
            // ⚡ BUG FIX 1: Resample primary lower-TF candles into 15m if separate 15m feed is sparse/stale.
            const resampleTo15m = (arr: any[], srcTfMin: number) => {
              if (!arr || arr.length < 3 || srcTfMin >= 15) return arr;
              const ratio = Math.round(15 / srcTfMin);
              if (ratio < 2) return arr;
              const out: any[] = [];
              for (let i = 0; i + ratio <= arr.length; i += ratio) {
                const chunk = arr.slice(i, i + ratio);
                out.push({
                  timestamp: chunk[0].timestamp,
                  open: chunk[0].open,
                  high: Math.max(...chunk.map((c: any) => c.high)),
                  low: Math.min(...chunk.map((c: any) => c.low)),
                  close: chunk[chunk.length - 1].close,
                  volume: chunk.reduce((s: number, c: any) => s + (c.volume || 0), 0),
                });
              }
              return out;
            };
            const tfMin = Number(state.candleInterval);
            ohlcData = stripForming(ohlcDataRaw, tfMin);
            let real15mData = stripForming(real15mDataRaw, 15);
            const real1hDataClosed = stripForming(real1hData, 60);
            // Fallback: if separate 15m feed is sparse, resample primary
            if ((!real15mData || real15mData.length < 15) && ohlcData && ohlcData.length >= 15 && tfMin < 15) {
              const resampled = resampleTo15m(ohlcData, tfMin);
              console.log(
                `⚠️ [HTF] ${indexName} separate 15m sparse (${real15mData?.length || 0} bars) — using resampled ${resampled.length} bars from ${tfMin}m`,
              );
              real15mData = resampled;
            }
            const lastHtfTs = real15mData?.[real15mData.length - 1]?.timestamp;
            const lastHtfMs = lastHtfTs ? (lastHtfTs < 1e12 ? lastHtfTs * 1000 : lastHtfTs) : 0;
            const htfAgeMin = lastHtfMs ? Math.round((Date.now() - lastHtfMs) / 60000) : -1;
            console.log(`📊 [HTF] ${indexName} 15m bars=${real15mData?.length || 0}, lastBarAge=${htfAgeMin}min`);
            if (ohlcData && ohlcData.length > 0) {
              // 🛰️ ONE SIGNAL PER INDEX PER CANDLE, SHARED BY ALL USERS.
              // If another user's engine already analysed this candle, reuse that exact
              // signal instead of re-running the strategy with per-user state.
              const cachedSignal = await getCachedCentralSignal(indexName, tfMin, currentCandleTimestamp);
              if (cachedSignal) {
                console.log(`♻️ [CENTRAL] ${indexName} reusing shared signal for candle ${currentCandleTimestamp}`);
                aiSignal = { signal: cachedSignal };
              } else {
                // Cooldown/streak state is GLOBAL (not per-user) so the strategy output is
                // identical for every user on the same candle.
                const lastSignalTimestamp = (await kv.get(`central:last_signal_ts:${indexName}`)) || 0;
                const lastSignalDirection = (await kv.get(`central:last_signal_dir:${indexName}`)) || "WAIT";
                const lastStopLossTimestamp = (await kv.get(`central:last_sl_ts:${indexName}`)) || 0;
                const lastStopLossDirection = (await kv.get(`central:last_sl_dir:${indexName}`)) || null;
                const consecutiveLossCount = Number((await kv.get(`central:loss_streak:${indexName}`)) || 0);
                const lastLossTimestamp = Number((await kv.get(`central:last_loss_ts:${indexName}`)) || 0);
                const sig = AdvancedAI.generateAdvancedSignal(ohlcData, 100000, {
                  higherTimeframeData: real15mData,
                  hourlyTimeframeData: real1hDataClosed,
                  timeframeMinutes: tfMin,
                  lastSignalTimestamp,
                  lastSignalDirection,
                  lastStopLossTimestamp,
                  lastStopLossDirection,
                  stopLossCooldownBars: 2,
                  consecutiveLossCount,
                  lastLossTimestamp,
                  consecutiveLossThreshold: 3,
                  consecutiveLossCooldownMs: 30 * 60 * 1000,
                  minimumBarsBetweenSignals: 1, // ⚡ FAST MODE: reduced 2→1 (still directional, opposite reversal allowed)
                  blockNewEntriesAfterMinutes: 15 * 60 + 15, // 15:15 IST cutoff
                });
                (sig as any).timestamp = ohlcData[ohlcData.length - 1]?.timestamp || Date.now();
                (sig as any).signalSource = primary.source === "central" ? "CENTRAL_DATA" : "USER_DATA";
                if (sig.action === "BUY_CALL" || sig.action === "BUY_PUT") {
                  await kv.set(
                    `central:last_signal_ts:${indexName}`,
                    ohlcData[ohlcData.length - 1].timestamp || Date.now(),
                  );
                  await kv.set(`central:last_signal_dir:${indexName}`, sig.action);
                }
                await saveCentralSignal(indexName, tfMin, currentCandleTimestamp, sig);
                aiSignal = { signal: sig };
              }

              const finalAction = aiSignal?.signal?.action;
              if (finalAction === "BUY_CALL" || finalAction === "BUY_PUT") {
                await kv.set(
                  `last_signal_ts:${userId}:${indexName}`,
                  ohlcData[ohlcData.length - 1].timestamp || Date.now(),
                );
                await kv.set(`last_signal_dir:${userId}:${indexName}`, finalAction);
              }
            }
          } catch (e) {
            console.error(`❌ ${indexName} OHLC/AI error:`, (e as any)?.message || e);
          }

          analyzedIndices.add(indexName);

          if (!aiSignal || !aiSignal.signal) {
            console.log(`⚠️ No signal generated for ${indexName} (no OHLC data)`);
            const pseudoSymbol = { index: indexName, symbolName: indexName, name: indexName };
            await this.saveSignalToDB(userId, pseudoSymbol, {
              signal: { action: "WAIT", confidence: 0, reasoning: "AI analysis failed - no data" },
            });
            return;
          }

          const action = aiSignal.signal.action;
          const confidence = aiSignal.signal.confidence;
          const reason =
            aiSignal.signal.reason ||
            aiSignal.signal.reasoning ||
            aiSignal.signal.debugInfo?.finalDecisionReason ||
            aiSignal.signal.debugInfo?.blockedReason ||
            "";
          const signalTimestamp = batchSignalTimestamp;

          // Store latest UI snapshot for every index. Count every analysis (including WAIT)
          // toward the daily signal stat so the Performance panel reflects real activity.
          const pseudoSymbol = { index: indexName, symbolName: indexName, name: indexName };
          state.stats.totalSignals++;
          await this.incrementSignalStats(userId, "signal");
          await this.saveSignalToDB(userId, pseudoSymbol, aiSignal);
          if (action !== "WAIT") {
            await kv.set(
              `last_signal_ts:${userId}:${indexName}`,
              aiSignal.signal?.riskManagement?.suggestedEntry ? aiSignal.signal?.timestamp || Date.now() : Date.now(),
            );
          }

          latestSignalsSnapshot[indexName] = {
            ...aiSignal.signal,
            index: indexName,
            timeframe: aiSignal.signal.timeframe || `${state.candleInterval}M`,
            timestamp: signalTimestamp,
            candleClose: currentCandleTimestamp,
            generatedAt: Date.now(),
          };

          console.log(`🎯 ${indexName} AI Decision: ${action} | Confidence: ${confidence}%`);

          if (action !== "WAIT") {
            await this.saveUserNotification(userId, {
              id: `signal_${userId}_${indexName}_${currentCandleTimestamp}_${action}`,
              type: "SIGNAL_DETECTED",
              title: `📊 ${indexName} Signal Detected`,
              message: `BUY ${indexName}${confidence ? ` (${confidence}% confidence)` : ""}`,
              timestamp: Date.now(),
              read: false,
              data: {
                index: indexName, symbol: indexName,
                action: "BUY", confidence, reasoning: reason,
                timeframe: state.candleInterval,
              },
            });
            // 🔔 FCM push to user device (mobile/web)
            sendPushToUser(userId, {
              title: `${action === "BUY_CALL" ? "📈" : "📉"} ${indexName} ${action === "BUY_CALL" ? "CALL" : "PUT"} Signal`,
              body: `${confidence}% confidence • ${(reason || "").slice(0, 80)}`,
              targetUrl: "/dashboard",
              data: { type: "TRADE_SIGNAL", index: indexName, action, confidence: String(confidence) },
            }).catch((e) => console.error("FCM push (signal) failed:", e));
          }

          // ⚡ Save signal log to user's persistent logs
          await this.appendSharedLog(userId, {
            type: action === "WAIT" ? "WAIT" : action.includes("BUY") ? "AI_SIGNAL" : "INFO",
            timestamp: signalTimestamp,
            message: `🎯 ${indexName}: ${action} (${confidence}%) - ${reason || "AI analysis complete"} | TF: ${state.candleInterval}M`,
            data: {
              index: indexName,
              action,
              confidence,
              timeframe: `${state.candleInterval}M`,
              reasoning: aiSignal.signal.reasoning || aiSignal.signal.reason || "",
              confirmations: aiSignal.signal.confirmations?.details || [],
              confirmationsPassed: aiSignal.signal.confirmations?.total || 0,
              patterns: aiSignal.signal.patterns || [],
              marketRegime: aiSignal.signal.marketRegime || {},
              volumeAnalysis: aiSignal.signal.volumeAnalysis || {},
              riskManagement: aiSignal.signal.riskManagement || {},
              indicators: aiSignal.signal.indicators || {},
            },
          });

          // ⚡ BUY means execute: confidence is now informational only. If the strategy emits
          // BUY_CALL / BUY_PUT, auto/manual symbol selection and Dhan order placement must run.
          if (action === "WAIT") {
            console.log(`⏸️ ${indexName} SKIP — WAIT signal | conf=${confidence}% | reason: ${reason || "n/a"}`);
            await this.appendSharedLog(userId, {
              type: "SKIP",
              timestamp: Date.now(),
              message: `⏸️ ${indexName} SKIP (WAIT) | ${confidence}% | ${reason || "no reason"}`,
            });
            return;
          }
          if (confidence < 65) {
            console.log(
              `⚡ ${indexName} BUY signal accepted despite ${confidence}% confidence — proceeding to symbol resolution/order`,
            );
            await this.appendSharedLog(userId, {
              type: "INFO",
              timestamp: Date.now(),
              message: `⚡ ${indexName} ${action} signal accepted (${confidence}%) — auto/manual order execution enabled`,
            });
          }

          if (!state.activePositions || state.activePositions.length === 0) {
            const { data: dbPositions } = await supabaseAdmin
              .from("position_monitor_state")
              .select("*")
              .eq("user_id", userId)
              .eq("is_active", true);
            state.activePositions = (dbPositions || []).map((dbPos: any) => ({
              orderId: dbPos.order_id,
              symbolName: dbPos.symbol,
              securityId: dbPos.symbol_id,
              index: dbPos.index_name,
              optionType: normalizeOptionType(
                dbPos.raw_position?.optionType || dbPos.raw_position?.option_type || dbPos.symbol,
              ),
              exchangeSegment: dbPos.exchange_segment,
              quantity: dbPos.quantity,
                  targetAmount: dbPos.target_amount,
                  stopLossAmount: dbPos.stop_loss_amount,
                  currentTargetAmount: dbPos.raw_position?.currentTargetAmount ?? dbPos.target_amount,
                  currentStopLossAmount: dbPos.raw_position?.currentStopLossAmount ?? dbPos.stop_loss_amount,
              trailingActivatedAt: dbPos.raw_position?.trailingActivatedAt ?? null,
              trailingStepCount: Number(dbPos.raw_position?.trailingStepCount || 0),
              pnl: dbPos.pnl,
              status: "ACTIVE",
            }));
          }

          const reversalPosition = state.activePositions.find(
            (p: any) =>
              p.status === "ACTIVE" &&
              p.index === indexName &&
              ((normalizeOptionType(p.optionType || p.symbolName) === "CE" && action === "BUY_PUT") ||
                (normalizeOptionType(p.optionType || p.symbolName) === "PE" && action === "BUY_CALL")),
          );
          // Protect open positions from noisy candle-to-candle direction changes.
          // A reversal is actionable only when the counter-signal is exceptionally
          // strong and the running trade has already lost at least half its SL.
          const reversalPnl = Number(reversalPosition?.pnl || 0);
          const reversalSL = Math.max(300, Number(reversalPosition?.stopLossAmount || 0) * 0.5);
          const reversalConfirmed =
            Boolean(reversalPosition) && confidence >= 90 && reversalPnl <= -reversalSL;
          if (reversalPosition && !reversalConfirmed) {
            console.log(
              `🛡️ ${indexName} reversal ignored — confidence ${confidence}% (need 90%), P&L ₹${reversalPnl.toFixed(2)} (must be ≤ -₹${reversalSL.toFixed(2)})`,
            );
          }
          if (reversalPosition && reversalConfirmed) {
            const exitReason = `Market Reversal (${normalizeOptionType(reversalPosition.optionType || reversalPosition.symbolName) || "OLD"} → ${action === "BUY_CALL" ? "CE" : "PE"}, ${confidence}% confidence)`;
            const exitResult = await BrokerRouter.placeOrderSmart(
              userId,
              { dhanClientId, dhanAccessToken },
              {
                securityId: reversalPosition.securityId,
                symbol: reversalPosition.symbolName,
                transactionType: "SELL",
                exchangeSegment:
                  reversalPosition.exchangeSegment || (reversalPosition.index === "SENSEX" ? "BSE_FNO" : "NSE_FNO"),
                productType: "INTRADAY",
                orderType: "MARKET",
                validity: "DAY",
                quantity: reversalPosition.quantity || 1,
                disclosedQuantity: 0,
                price: 0,
                triggerPrice: 0,
                afterMarketOrder: false,
                amoTime: "",
              },
            );
            const exitConfirmation = await this.confirmExitFilled(userId, exitResult, reversalPosition, dhanService);
            if (exitConfirmation.confirmed) {
              reversalPosition.status = "CLOSED";
              await supabaseAdmin
                .from("position_monitor_state")
                .update({
                  is_active: false,
                  exit_reason: exitReason,
                  exited_at: new Date().toISOString(),
                  pnl: reversalPosition.pnl || 0,
                })
                .eq("user_id", userId)
                .eq("order_id", reversalPosition.orderId);
              await this.appendSharedLog(userId, {
                type: "POSITION_CLOSED",
                timestamp: Date.now(),
                symbol: reversalPosition.symbolName,
                pnl: reversalPosition.pnl || 0,
                reason: exitReason,
                message: `🚪 POSITION CLOSED: ${reversalPosition.symbolName} | ${exitReason} | P&L: ${(reversalPosition.pnl || 0) >= 0 ? "+" : ""}₹${Number(reversalPosition.pnl || 0).toFixed(2)}`,
              });
              const _pnl = Number(reversalPosition.pnl || 0);
              sendPushToUser(userId, {
                title: `${_pnl >= 0 ? "✅ Profit Booked" : "🛑 Loss Booked"}: ${reversalPosition.symbolName}`,
                body: `P&L: ${_pnl >= 0 ? "+" : ""}₹${_pnl.toFixed(2)} • ${exitReason}`,
                targetUrl: "/dashboard",
                data: { type: "POSITION_CLOSED", symbol: String(reversalPosition.symbolName || ""), pnl: String(_pnl) },
              }).catch((e) => console.error("FCM push (close) failed:", e));
              state.activePositions = state.activePositions.filter((p: any) => p.status === "ACTIVE");
            } else {
              const failure = exitConfirmation.error || exitResult.error || "Exit was not confirmed";
              console.log(`❌ REVERSAL EXIT FAILED for ${reversalPosition.symbolName}: ${failure}`);
              sendPushToUser(userId, {
                title: `⚠️ Exit not confirmed: ${reversalPosition.symbolName}`,
                body: `${failure}. Position monitoring remains active; check your broker immediately.`,
                targetUrl: "/dashboard",
                data: { type: "EXIT_FAILED", symbol: String(reversalPosition.symbolName || "") },
              }).catch((e) => console.error("FCM push (exit failure) failed:", e));
              return;
            }
          }

          const freshSymbols = await getFreshSymbolsForEngine(userId, state.symbols || []);
          if (freshSymbols.length !== (state.symbols || []).length) {
            state.symbols = freshSymbols;
            await kv.set(`engine_state_${userId}`, state);
            await this.saveEngineStateToDB(userId, state);
          }

          // Find matching symbols for this index to place orders
          // ⚡ BUY_CALL → only CE/CALL symbols, BUY_PUT → only PE/PUT symbols for the SAME index only
          const targetOptionType = action === "BUY_CALL" ? "CE" : action === "BUY_PUT" ? "PE" : "";
          const symbolsForIndex = state.symbols.filter((s) => normalizeIndexName(s) === indexName);
          const matchingSymbols = symbolsForIndex.filter((s) => {
            if (s.active === false) return false;
            if (normalizeOptionType(s.optionType || s.option_type || s.symbolName || s.name) !== targetOptionType)
              return false;
            if (!s.securityId && !s.symbolId && !s.symbol_id) return false;
            return true;
          });

          // 🎯 AUTO-SYMBOL MODE (NEW): if user has user_symbol_config slots for this index,
          // resolve them from the centralized instrument_master and use those instead of
          // (or alongside) manually-added symbols. This lets the user pick ATM / ITM / OTM
          // and a lot count — the engine fetches the matching contract at signal time.
          let autoSelectedSymbols = matchingSymbols;
          let autoSlotCount = 0;
          let autoResolveFailures = 0;
          try {
            const { data: autoSlots } = await supabaseAdmin
              .from("user_symbol_config")
              .select("slot, index_name, moneyness, lot_count, enabled, target_per_lot, stop_loss_per_lot, trailing_enabled, trailing_activation_per_lot, trailing_step_per_lot")
              .eq("user_id", userId)
              .eq("enabled", true)
              .eq("index_name", indexName);


            if (autoSlots && autoSlots.length > 0) {
              autoSlotCount = autoSlots.length;
              const spotLtp =
                Number(ohlcData[ohlcData.length - 1]?.close) ||
                Number(aiSignal?.signal?.riskManagement?.suggestedEntry) ||
                Number(aiSignal?.signal?.price) ||
                0;
              if (spotLtp > 0) {
                const resolved: any[] = [];
                for (const slot of autoSlots) {
                  const lotCount = Math.max(1, Number(slot.lot_count) || 1);
                  const r = await resolveAutoSymbol({
                    index_name: indexName as any,
                    ltp: spotLtp,
                    option_type: targetOptionType as any,
                    moneyness: (slot.moneyness || "ATM") as any,
                  });
                  if (!r) {
                    autoResolveFailures++;
                    console.warn(
                      `⚠️ [AUTO_SYMBOL] slot ${slot.slot} ${indexName} ${slot.moneyness} ${targetOptionType} not found in instrument_master`,
                    );
                    await this.appendSharedLog(userId, {
                      type: "ERROR",
                      timestamp: Date.now(),
                      message: `❌ AUTO SYMBOL NOT FOUND: Slot ${slot.slot} ${indexName} ${slot.moneyness} ${targetOptionType}. Instrument master has no matching contract near spot ${spotLtp}.`,
                      data: {
                        index: indexName,
                        action,
                        slot: slot.slot,
                        moneyness: slot.moneyness,
                        optionType: targetOptionType,
                        spotLtp,
                      },
                    });
                    continue;
                  }
                  const finalQuantity = r.lot_size * lotCount;

                  // 🧮 Dynamic risk: per-lot × lot_count, then moneyness multiplier.
                  // ITM = slower/safer (bigger SL, smaller target); OTM = faster (smaller SL, bigger target).
                  const MONEYNESS_MULT: Record<string, { tgt: number; sl: number }> = {
                    ITM2: { tgt: 0.70, sl: 1.30 },
                    ITM1: { tgt: 0.85, sl: 1.15 },
                    ATM:  { tgt: 1.00, sl: 1.00 },
                    OTM1: { tgt: 1.20, sl: 0.85 },
                    OTM2: { tgt: 1.50, sl: 0.70 },
                  };
                  const mm = MONEYNESS_MULT[slot.moneyness] || MONEYNESS_MULT.ATM;
                  const tgtPerLot = Number(slot.target_per_lot) || 6000;
                  const slPerLot = Number(slot.stop_loss_per_lot) || 3000;
                  const trailActPerLot = Number(slot.trailing_activation_per_lot) || Math.round(tgtPerLot * 0.66);
                  const trailStepPerLot = Number(slot.trailing_step_per_lot) || Math.round(slPerLot * 0.33);
                  const targetAmount = +(tgtPerLot * lotCount * mm.tgt).toFixed(2);
                  const stopLossAmount = +(slPerLot * lotCount * mm.sl).toFixed(2);
                  const trailingActivationAmount = +(trailActPerLot * lotCount * mm.tgt).toFixed(2);
                  const trailingStep = +(trailStepPerLot * lotCount).toFixed(2);
                  const targetJumpAmount = trailingStep;
                  const trailingEnabled = !!slot.trailing_enabled && trailingActivationAmount > 0 && trailingStep > 0;

                  resolved.push({
                    id: `AUTO_${slot.slot}_${r.security_id}`,
                    name: r.symbol,
                    symbolName: r.symbol,
                    displayName: r.symbol,
                    index: indexName,
                    indexName,
                    optionType: r.option_type,
                    transactionType: "BUY",
                    exchangeSegment: r.exchange_segment,
                    productType: "INTRADAY",
                    orderType: "MARKET",
                    validity: "DAY",
                    securityId: String(r.security_id),
                    symbolId: String(r.security_id),
                    quantity: finalQuantity,
                    lotSize: r.lot_size,
                    lotCount,
                    strikePrice: r.strike_price,
                    expiry: r.expiry_date,
                    active: true,
                    targetAmount,
                    stopLossAmount,
                    trailingEnabled,
                    trailingActivationAmount,
                    targetJumpAmount,
                    stopLossJumpAmount: trailingStep,
                    trailingStep,
                    __autoSlot: slot.slot,
                    __moneyness: slot.moneyness,
                  });
                  console.log(
                    `🎯 [AUTO_SYMBOL] slot ${slot.slot}: ${indexName} ${slot.moneyness} ${targetOptionType} → ${r.symbol} qty ${finalQuantity} | Tgt ₹${targetAmount} SL ₹${stopLossAmount} ${trailingEnabled ? `TRAIL act ₹${trailingActivationAmount} step ₹${trailingStep}` : "trail OFF"}`,
                  );

                }
                if (resolved.length > 0) {
                  console.log(
                    `🎯 [AUTO_SYMBOL] ${indexName} ${action}: resolved ${resolved.length} auto-config slots @ spot ${spotLtp}`,
                  );
                  autoSelectedSymbols = resolved;
                }
              } else {
                autoResolveFailures = autoSlotCount;
                await this.appendSharedLog(userId, {
                  type: "ERROR",
                  timestamp: Date.now(),
                  message: `❌ AUTO SYMBOL SKIPPED: ${indexName} spot price was unavailable, so ATM/ITM/OTM contract could not be selected.`,
                  data: { index: indexName, action, targetOptionType },
                });
              }
            }
          } catch (autoErr: any) {
            console.error(`❌ [AUTO_SYMBOL] resolution failed for ${indexName}:`, autoErr?.message || autoErr);
            autoResolveFailures = Math.max(autoResolveFailures, autoSlotCount || 1);
            await this.appendSharedLog(userId, {
              type: "ERROR",
              timestamp: Date.now(),
              message: `❌ AUTO SYMBOL ERROR: ${indexName} ${action} contract resolution failed - ${autoErr?.message || autoErr}`,
              data: { index: indexName, action, targetOptionType },
            });
          }
          if (autoSelectedSymbols.length === 0 && matchingSymbols.length === 0) {
            const skipMessage =
              autoSlotCount > 0
                ? `❌ ${indexName} ${action} signal skipped - ${autoSlotCount} auto-symbol slot(s) enabled but no ${targetOptionType || "option"} contract could be resolved from today's instrument master. Refresh instruments and check ATM/ITM/OTM settings.`
                : `❌ ${indexName} ${action} signal skipped - no auto-symbol slot and no manually-added active ${targetOptionType || "option"} symbol found. Add an auto slot or a manual ${targetOptionType} contract for ${indexName}.`;
            console.log(
              `⚠️ NO ORDERABLE SYMBOLS for ${indexName} ${action}! Auto slots: ${autoSlotCount}, auto failures: ${autoResolveFailures}. Symbols for index:`,
              JSON.stringify(
                symbolsForIndex.map((s) => ({
                  name: s.name,
                  optionType: s.optionType || s.option_type,
                  active: s.active,
                  securityId: s.securityId || s.symbolId || s.symbol_id,
                })),
                null,
                2,
              ),
            );
            await this.appendSharedLog(userId, {
              type: "ERROR",
              timestamp: Date.now(),
              message: skipMessage,
              data: {
                index: indexName,
                action,
                targetOptionType,
                autoSlotCount,
                autoResolveFailures,
                symbolsForIndex: symbolsForIndex.map((s) => ({
                  name: getSymbolDisplayName(s),
                  index: normalizeIndexName(s),
                  optionType: normalizeOptionType(s.optionType || s.option_type || s.symbolName || s.name),
                  active: s.active !== false,
                  securityId: String(s.securityId || s.symbolId || s.symbol_id || ""),
                })),
              },
            });
          }

          for (const symbol of autoSelectedSymbols) {
            const normalizedExchangeSegment = resolveSymbolExchangeSegment(symbol);
            const normalizedSymbolName = getSymbolDisplayName(symbol);
            const normalizedOptionType = normalizeOptionType(symbol.optionType || symbol.option_type);
            const normalizedSecurityId = String(symbol.securityId || symbol.symbolId || symbol.symbol_id || "");
            const orderKey = `${userId}:${currentCandleTimestamp}:${normalizedSecurityId}:${action}`;

            if (!(await this.isEngineStillRunning(userId))) {
              console.log(`🛑 Engine stopped before placing order for ${normalizedSymbolName}`);
              return;
            }

            if (this.hasRecentOrderKey(orderKey)) {
              console.log(`⏸️ SKIPPING DUPLICATE - Recent in-memory order key exists for ${normalizedSymbolName}`);
              return;
            }

            if (await this.hasRecentOrderInDB(userId, normalizedSecurityId)) {
              console.log(`⏸️ SKIPPING DUPLICATE - Recent DB order exists for ${normalizedSymbolName}`);
              this.markRecentOrderKey(orderKey);
              return;
            }

            // ✅ DUPLICATE-SIGNAL BLOCK: If a position is ALREADY RUNNING for this
            // symbol OR for the same INDEX (NIFTY / BANKNIFTY / SENSEX), skip the
            // order on the next candle and just log "already running".
            // Always re-hydrate from DB so the very first signal of a new candle is checked.
            if (!state.activePositions || state.activePositions.length === 0) {
              const { data: dbPositions } = await supabaseAdmin
                .from("position_monitor_state")
                .select("*")
                .eq("user_id", userId)
                .eq("is_active", true);
              if (dbPositions && dbPositions.length > 0) {
                state.activePositions = dbPositions.map((dbPos: any) => ({
                  orderId: dbPos.order_id,
                  symbolName: dbPos.symbol,
                  securityId: dbPos.symbol_id,
                  index: dbPos.index_name,
                  optionType: normalizeOptionType(
                    dbPos.raw_position?.optionType || dbPos.raw_position?.option_type || dbPos.symbol,
                  ),
                  exchangeSegment: dbPos.exchange_segment,
                  quantity: dbPos.quantity,
                  targetAmount: dbPos.target_amount,
                  stopLossAmount: dbPos.stop_loss_amount,
                  currentTargetAmount: dbPos.raw_position?.currentTargetAmount ?? dbPos.target_amount,
                  currentStopLossAmount: dbPos.raw_position?.currentStopLossAmount ?? dbPos.stop_loss_amount,
                  trailingActivatedAt: dbPos.raw_position?.trailingActivatedAt ?? null,
                  trailingStepCount: Number(dbPos.raw_position?.trailingStepCount || 0),
                  pnl: dbPos.pnl,
                  status: "ACTIVE",
                }));
              }
            }

            const sameIndexPosition = state.activePositions.find(
              (p: any) => p.status === "ACTIVE" && p.index && indexName && p.index === indexName,
            );
            // Apply the same guarded reversal rule used by the central signal path.
            // This prevents manual/configured symbols from bypassing the protection.
            const sameIndexPnl = Number(sameIndexPosition?.pnl || 0);
            const sameIndexSL = Math.max(300, Number(sameIndexPosition?.stopLossAmount || 0) * 0.5);
            const isOppositeSignal =
              Boolean(sameIndexPosition) &&
              Boolean(targetOptionType) &&
              normalizeOptionType(sameIndexPosition?.optionType || sameIndexPosition?.symbolName) !== targetOptionType;
            const sameIndexReversalConfirmed =
              isOppositeSignal && confidence >= 90 && sameIndexPnl <= -sameIndexSL;
            if (isOppositeSignal && !sameIndexReversalConfirmed) {
              console.log(
                `🛡️ ${indexName} configured-symbol reversal ignored — confidence ${confidence}% (need 90%), P&L ₹${sameIndexPnl.toFixed(2)} (must be ≤ -₹${sameIndexSL.toFixed(2)})`,
              );
            }
            if (
              sameIndexPosition &&
              sameIndexReversalConfirmed
            ) {
              const exitReason = `Market Reversal (${normalizeOptionType(sameIndexPosition.optionType || sameIndexPosition.symbolName) || "OLD"} → ${targetOptionType})`;
              const exitResult = await BrokerRouter.placeOrderSmart(
                userId,
                { dhanClientId, dhanAccessToken },
                {
                  securityId: sameIndexPosition.securityId,
                  symbol: sameIndexPosition.symbolName,
                  transactionType: "SELL",
                  exchangeSegment:
                    sameIndexPosition.exchangeSegment || (sameIndexPosition.index === "SENSEX" ? "BSE_FNO" : "NSE_FNO"),
                  productType: "INTRADAY",
                  orderType: "MARKET",
                  validity: "DAY",
                  quantity: sameIndexPosition.quantity || 1,
                  disclosedQuantity: 0,
                  price: 0,
                  triggerPrice: 0,
                  afterMarketOrder: false,
                  amoTime: "",
                },
              );
              const exitConfirmation = await this.confirmExitFilled(userId, exitResult, sameIndexPosition, dhanService);
              if (exitConfirmation.confirmed) {
                sameIndexPosition.status = "CLOSED";
                await supabaseAdmin
                  .from("position_monitor_state")
                  .update({
                    is_active: false,
                    exit_reason: exitReason,
                    exited_at: new Date().toISOString(),
                    pnl: sameIndexPosition.pnl || 0,
                  })
                  .eq("user_id", userId)
                  .eq("order_id", sameIndexPosition.orderId);
                await this.appendSharedLog(userId, {
                  type: "POSITION_CLOSED",
                  timestamp: Date.now(),
                  symbol: sameIndexPosition.symbolName,
                  pnl: sameIndexPosition.pnl || 0,
                  reason: exitReason,
                  message: `🚪 POSITION CLOSED: ${sameIndexPosition.symbolName} | ${exitReason} | P&L: ${(sameIndexPosition.pnl || 0) >= 0 ? "+" : ""}₹${Number(sameIndexPosition.pnl || 0).toFixed(2)}`,
                });
                {
                  const _pnl2 = Number(sameIndexPosition.pnl || 0);
                  sendPushToUser(userId, {
                    title: `${_pnl2 >= 0 ? "✅ Profit Booked" : "🛑 Loss Booked"}: ${sameIndexPosition.symbolName}`,
                    body: `P&L: ${_pnl2 >= 0 ? "+" : ""}₹${_pnl2.toFixed(2)} • ${exitReason}`,
                    targetUrl: "/dashboard",
                    data: { type: "POSITION_CLOSED", symbol: String(sameIndexPosition.symbolName || ""), pnl: String(_pnl2) },
                  }).catch((e) => console.error("FCM push (close2) failed:", e));
                }
                state.activePositions = state.activePositions.filter((p: any) => p.status === "ACTIVE");
              } else {
                const failure = exitConfirmation.error || exitResult.error || "Exit was not confirmed";
                console.log(`❌ REVERSAL EXIT FAILED for ${sameIndexPosition.symbolName}: ${failure}`);
                return;
              }
            }

            const hasPosition = state.activePositions.some(
              (p: any) =>
                p.status === "ACTIVE" &&
                (p.symbolName === normalizedSymbolName ||
                  p.securityId === normalizedSecurityId ||
                  (p.index && indexName && p.index === indexName)),
            );

            if (hasPosition) {
              const activePosition = state.activePositions.find(
                (p: any) =>
                  p.status === "ACTIVE" &&
                  (p.symbolName === normalizedSymbolName ||
                    p.securityId === normalizedSecurityId ||
                    (p.index && indexName && p.index === indexName)),
              );
              const activeOptionType = normalizeOptionType(activePosition?.optionType || activePosition?.symbolName);
              console.log(
                `⏸️ ALREADY RUNNING - Position open for ${indexName} (${activePosition?.symbolName || symbol.name}, ${activeOptionType || "UNKNOWN"}). Skipping ${action}; same-direction signal (opposite direction auto-flips).`,
              );
              await this.appendSharedLog(userId, {
                type: "SKIP",
                timestamp: Date.now(),
                message: `⏸️ ${indexName} ${action} skipped — active ${activeOptionType || "option"} position already running (${activePosition?.symbolName || symbol.name}).`,
                data: {
                  index: indexName,
                  action,
                  confidence,
                  activeSymbol: activePosition?.symbolName || normalizedSymbolName,
                  activeOptionType,
                  reason: "active-position-same-index",
                },
              });
              return;
            }

            // ⚡ EXECUTE ORDER!
            if (action === "BUY_CALL" || action === "BUY_PUT") {
              // 🔒 Atomic cross-isolate claim — blocks the cron tick and the
              // candle-watcher from both firing the SAME order (double quantity).
              const claimed = await this.claimOrderKeyGlobal(orderKey);
              if (!claimed) {
                console.log(`⏸️ SKIPPING DUPLICATE - order already claimed elsewhere for ${normalizedSymbolName}`);
                return;
              }
              actionableOrderAttempted = true;

              console.log(
                `\n💰 PLACING ORDER: ${normalizedSymbolName} (${normalizedOptionType || symbol.optionType || symbol.option_type || "UNKNOWN"}) for ${action} on ${normalizedExchangeSegment}`,
              );

              const orderParams = {
                securityId: normalizedSecurityId,
                transactionType: "BUY",
                exchangeSegment: normalizedExchangeSegment,
                productType: "INTRADAY",
                orderType: "MARKET",
                validity: symbol.validity || "DAY",
                quantity: symbol.quantity || symbol.lotSize || symbol.lot_size || 15,
                disclosedQuantity: symbol.disclosedQuantity || symbol.disclosed_quantity || 0,
                price: 0,
                triggerPrice: 0,
                afterMarketOrder: Boolean(symbol.afterMarketOrder || symbol.after_market_order),
                amoTime: symbol.amoTime || symbol.amo_time || "",
              };

              let orderResult: any;
              try {
                orderResult = await BrokerRouter.placeOrderSmart(
                  userId,
                  {
                    dhanClientId: dhanClientId,
                    dhanAccessToken: dhanAccessToken,
                  },
                  orderParams,
                );
              } catch (orderError: any) {
                orderResult = {
                  success: false,
                  error: orderError?.message || String(orderError),
                  code: orderError?.code || null,
                };
              }

              if (orderResult.orderId) {
                actionableOrderSucceeded = true;
                console.log(`✅ ORDER PLACED! ID: ${orderResult.orderId}`);

                const positionData = {
                  orderId: orderResult.orderId,
                  symbolName: normalizedSymbolName,
                  securityId: normalizedSecurityId,
                  optionType: normalizedOptionType || "CE",
                  exchangeSegment: normalizedExchangeSegment,
                  index: indexName,
                  entryPrice: orderResult.averagePrice || orderResult.price || 0,
                  currentPrice: orderResult.averagePrice || orderResult.price || 0,
                  quantity: symbol.quantity || symbol.lotSize || symbol.lot_size || 15,
                  targetAmount: symbol.targetAmount || 0,
                  stopLossAmount: symbol.stopLossAmount || 0,
                  trailingEnabled: symbol.trailingEnabled || false,
                  trailingActivationAmount: symbol.trailingActivationAmount || 0,
                  targetJumpAmount: symbol.targetJumpAmount || 0,
                  stopLossJumpAmount: symbol.stopLossJumpAmount || 0,
                  currentTargetAmount: symbol.targetAmount || 0,
                  currentStopLossAmount: symbol.stopLossAmount || 0,
                  pnl: 0,
                  entryTime: Date.now(),
                  status: "ACTIVE",
                };

                state.activePositions.push(positionData);
                state.stats.totalOrders++;

                // ⚡ Save order to database
                await this.saveOrderToDB(userId, symbol, orderResult, action);

                // ⚡ Save position to database
                await this.savePositionToDB(userId, positionData, symbol);

                // ⚡ Update order stats
                await this.incrementSignalStats(userId, "order");

                // Save log to user's logs
                await this.appendSharedLog(userId, {
                  type: "ORDER_PLACED",
                  timestamp: Date.now(),
                  message: `💰 ORDER PLACED: ${symbol.name} | ${action} | Confidence: ${confidence}% | OrderID: ${orderResult.orderId}`,
                  data: {
                    index: indexName,
                    symbol: symbol.name,
                    action,
                    confidence,
                    orderId: orderResult.orderId,
                    quantity: symbol.quantity || 15,
                    price: orderResult.averagePrice || orderResult.price || 0,
                  },
                });

                await this.saveUserNotification(userId, {
                  id: `order_${orderResult.orderId}`,
                  type: "ORDER_PLACED",
                  title: "💰 Order Placed",
                  message: `BUY ${symbol.quantity || 15} x ${symbol.name} @ ₹${(orderResult.averagePrice || orderResult.price || 0).toFixed(2)}`,
                  timestamp: Date.now(),
                  read: false,
                  data: {
                    index: indexName,
                    symbol: symbol.name,
                    quantity: symbol.quantity || 15,
                    price: orderResult.averagePrice || orderResult.price || 0,
                    action: "BUY",
                    orderId: orderResult.orderId,
                  },
                });
              } else {
                console.log(`❌ ORDER FAILED: ${orderResult.error}`);
                await this.saveOrderToDB(userId, symbol, orderResult, action, "failed");
                await this.appendSharedLog(userId, {
                  type: "ERROR",
                  timestamp: Date.now(),
                  message: `❌ ORDER FAILED: ${normalizedSymbolName} | ${action} | Qty ${orderParams.quantity} | ${orderResult.error || orderResult.message || "Dhan/VPS rejected order"}`,
                  data: { index: indexName, symbol: normalizedSymbolName, action, orderParams, orderResult },
                });
                await this.releaseOrderKeyGlobal(orderKey);

              }
            } else {
              await this.appendSharedLog(userId, {
                type: "ERROR",
                timestamp: Date.now(),
                message: `❌ ORDER NOT SENT: Unsupported signal action ${action} for ${normalizedSymbolName}`,
                data: { index: indexName, symbol: normalizedSymbolName, action },
              });
            }
          }
        } catch (error) {
          console.error(`❌ Error analyzing ${indexName}:`, error);
        }
        }),
      );

      const shouldRetryActionableOrder = actionableOrderAttempted && !actionableOrderSucceeded;

      if (Object.keys(latestSignalsSnapshot).length > 0 && !shouldRetryActionableOrder) {
        await this.saveLatestSignalsSnapshot(userId, latestSignalsSnapshot);
        state.lastProcessedCandle = currentCandleTimestamp;
      } else if (shouldRetryActionableOrder) {
        await this.saveLatestSignalsSnapshot(userId, latestSignalsSnapshot);
        console.warn(`⚠️ BUY signal order failed for ${currentCandleTimestamp}; keeping candle unprocessed so backend cron retries while signal remains valid.`);
        await this.appendSharedLog(userId, {
          type: "INFO",
          timestamp: Date.now(),
          message: `⚠️ BUY signal detected but order failed — backend will retry this ${state.candleInterval}M candle automatically until order succeeds or signal changes.`,
        });
      } else {
        console.warn(`⚠️ No signal snapshot saved for ${currentCandleTimestamp}; candle will be retried on next tick.`);
      }

      // 📧 ONE consolidated email per candle covering ALL actionable signals
      try {
        const actionable = Object.entries(latestSignalsSnapshot)
          .filter(([, s]: any) => s && (s.action === "BUY_CALL" || s.action === "BUY_PUT"))
          .map(([idx, s]: any) => ({
            index: idx,
            action: s.action,
            confidence: Math.round(Number(s.confidence || 0) * 100) / 100,
            entry: Number(s?.riskManagement?.suggestedEntry || s?.price || 0),
            target: s?.riskManagement?.target,
            sl: s?.riskManagement?.stopLoss,
            risk: s?.riskManagement?.riskLevel || "Medium",
            timeframe: s?.timeframe || `${state.candleInterval}M`,
            reason: s?.reason || s?.reasoning || "",
          }));

        if (actionable.length > 0) {
          const market = isTradingHourIST();
          const tradingDay = await isTradingDayDB();
          if (!market.open || !tradingDay) {
            sendEmailAsync("market_closed", userId, {
              symbol: actionable.map((a) => `${a.index} ${a.action.replace("BUY_", "")}`).join(", "),
              signalType: "MULTI",
              reason: !tradingDay ? "Today is a market holiday" : market.reason,
              nextSession: market.nextSession || "Next trading day · 09:15 IST",
            });
          } else {
            sendEmailAsync("signals_combined", userId, {
              signals: actionable,
              candleTimestamp: currentCandleTimestamp,
              timeframe: `${state.candleInterval}M`,
            });
          }
        }
      } catch (emailErr) {
        console.warn("⚠️ Consolidated signal email failed:", emailErr);
      }

      // Save state to KV (legacy)
      await kv.set(`engine_state_${userId}`, state);

      // ⚡ Update engine state in DB
      await this.saveEngineStateToDB(userId, state);

      console.log(
        `✅ Engine loop complete | Signals: ${state.stats.totalSignals} | Orders: ${state.stats.totalOrders}`,
      );
    } catch (error) {
      console.error(`❌ Engine loop error for ${userId}:`, error);
      await kv.set(`engine_error_${userId}_${Date.now()}`, {
        timestamp: Date.now(),
        error: String(error),
      });
    } finally {
      this.activeLoops.delete(userId);
      this.activeLoopStartedAt.delete(userId);
    }
  }

  /**
   * ⚡⚡⚡ MONITOR ACTIVE POSITIONS ⚡⚡⚡
   */
  private static async monitorPositions(userId: string, dhanService: DhanService, state: EngineState): Promise<void> {
    // Always refresh active positions from DB so edited Target/SL and trailing settings apply immediately
    const { data: dbPositions } = await supabaseAdmin
      .from("position_monitor_state")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (dbPositions && dbPositions.length > 0) {
      const sortedDbPositions = [...dbPositions].sort(
        (a: any, b: any) =>
          new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime(),
      );
      const seenPositionKeys = new Set<string>();
      const activeDbPositions: any[] = [];
      const duplicateIds: string[] = [];
      for (const dbPos of sortedDbPositions) {
        const keys = getComparablePositionKeys({
          ...dbPos.raw_position,
          symbol: dbPos.symbol,
          securityId: dbPos.symbol_id,
        });
        const isDuplicate = Array.from(keys).some((key) => seenPositionKeys.has(key));
        if (keys.size > 0 && isDuplicate) duplicateIds.push(dbPos.id);
        else {
          keys.forEach((key) => seenPositionKeys.add(key));
          activeDbPositions.push(dbPos);
        }
      }
      if (duplicateIds.length > 0) {
        await supabaseAdmin
          .from("position_monitor_state")
          .update({
            is_active: false,
            exit_reason: "housekeeping: duplicate monitor row removed",
            exited_at: new Date().toISOString(),
          })
          .in("id", duplicateIds);
        console.log(`🧹 Removed ${duplicateIds.length} duplicate position monitor row(s) for user ${userId}`);
      }

      const userSymbolConfigs = await loadUserSymbolsFromDB(userId);
      const dbOrderIds = new Set(activeDbPositions.map((p: any) => p.order_id));
      state.activePositions = state.activePositions.filter((p: any) => dbOrderIds.has(p.orderId));

      for (const dbPos of activeDbPositions) {
        const existing = state.activePositions.find((p: any) => p.orderId === dbPos.order_id);
        const rawPosition = dbPos.raw_position || {};
        const symbolCfg = findSymbolConfigForPosition(
          { ...rawPosition, symbol: dbPos.symbol, securityId: dbPos.symbol_id },
          userSymbolConfigs,
        );
        const manualRiskEdit = !!rawPosition.manualEditAt;
        const targetAmount = manualRiskEdit
          ? numeric(rawPosition.targetAmount, numeric(dbPos.target_amount))
          : numeric(symbolCfg?.targetAmount, numeric(dbPos.target_amount));
        const stopLossAmount = manualRiskEdit
          ? numeric(rawPosition.stopLossAmount, numeric(dbPos.stop_loss_amount))
          : numeric(symbolCfg?.stopLossAmount, numeric(dbPos.stop_loss_amount));
        // 🛠️ FIX: never let a 0 from one source wipe a real value from another.
        // Pick the first STRICTLY POSITIVE value across cfg → raw_position → db column.
        const firstPositive = (...vals: any[]) => {
          for (const v of vals) {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) return n;
          }
          return 0;
        };
        let trailingActivationAmount = firstPositive(
          symbolCfg?.trailingActivationAmount,
          rawPosition.trailingActivationAmount,
          rawPosition.trailing_activation_amount,
        );
        let stopLossJumpAmount = firstPositive(
          symbolCfg?.stopLossJumpAmount,
          rawPosition.stopLossJumpAmount,
          rawPosition.stop_loss_jump_amount,
          dbPos.trailing_step,
        );
        let targetJumpAmount = firstPositive(
          symbolCfg?.targetJumpAmount,
          rawPosition.targetJumpAmount,
          rawPosition.target_jump_amount,
          stopLossJumpAmount, // same ladder step for target when not configured separately
        );
        const trailingEnabled =
          symbolCfg && symbolCfg.trailingEnabled !== undefined
            ? !!symbolCfg.trailingEnabled
            : rawPosition.trailingEnabled !== undefined
              ? !!rawPosition.trailingEnabled
              : !!dbPos.trailing_enabled;

        // 🛠️ FIX: trailing switched ON but ladder numbers missing → derive sane defaults
        // so trailing can never silently stay dormant.
        if (trailingEnabled) {
          if (stopLossJumpAmount <= 0) stopLossJumpAmount = Math.max(1, Math.round(stopLossAmount * 0.33));
          if (targetJumpAmount <= 0) targetJumpAmount = stopLossJumpAmount;
          if (trailingActivationAmount <= 0) trailingActivationAmount = Math.max(1, Math.round(targetAmount * 0.5));
        }
        const dbState = {
          orderId: dbPos.order_id,
          symbolName: dbPos.symbol,
          securityId: dbPos.symbol_id,
          exchangeSegment: dbPos.exchange_segment,
          index: dbPos.index_name,
          optionType: normalizeOptionType(
            dbPos.raw_position?.optionType || dbPos.raw_position?.option_type || dbPos.symbol,
          ),
          entryPrice: dbPos.entry_price,
          currentPrice: dbPos.current_price,
          quantity: dbPos.quantity,
          targetAmount,
          stopLossAmount,
          pnl: dbPos.pnl,
          highestPnl: dbPos.highest_pnl,
          trailingEnabled,
          trailingStep: stopLossJumpAmount,
          trailingActivationAmount,
          targetJumpAmount,
          stopLossJumpAmount,
          currentTargetAmount: dbPos.raw_position?.currentTargetAmount ?? targetAmount,
          currentStopLossAmount: dbPos.raw_position?.currentStopLossAmount ?? stopLossAmount,
          trailingActivatedAt: rawPosition.trailingActivatedAt ?? null,
          trailingStepCount: Number(rawPosition.trailingStepCount || 0),
          entryTime: new Date(dbPos.created_at).getTime(),
          status: "ACTIVE",
        };

        if (existing) Object.assign(existing, dbState);
        else state.activePositions.push(dbState);
      }
      console.log(`📊 Synced ${dbPositions.length} active position(s) from DB for user ${userId}`);
    }

    if (state.activePositions.length === 0) {
      return;
    }

    console.log(`\n🔍 MONITORING ${state.activePositions.length} POSITIONS for user ${userId}`);

    await this.appendSharedLog(userId, {
      type: "POSITION_MONITOR_TICK",
      timestamp: Date.now(),
      message: `🔍 Position monitor tick — checking ${state.activePositions.length} active position(s)`,
    });

    try {
      // Fetch fresh positions from Dhan
      const dhanPositions = await BrokerRouter.getPositionsSmart(userId, () => dhanService.getPositions());
      const monitorSignalCache = new Map<string, any>();
      const getMonitorSignal = async (indexName: SupportedIndex) => {
        if (monitorSignalCache.has(indexName)) return monitorSignalCache.get(indexName);
        const securityIdMap: Record<string, string> = { NIFTY: "13", BANKNIFTY: "25", SENSEX: "51" };
        try {
          const ohlcDataRaw = await dhanService.getOHLCData(
            securityIdMap[indexName],
            String(state.candleInterval || "5"),
            50,
          );
          const real15mDataRaw =
            state.candleInterval === "15"
              ? ohlcDataRaw
              : await dhanService.getOHLCData(securityIdMap[indexName], "15", 80);
          const tfMin = Number(state.candleInterval || "5");
          const stripForming = (arr: any[], tfM: number) => {
            if (!arr || arr.length < 2) return arr;
            const lastTs = arr[arr.length - 1]?.timestamp ?? 0;
            const lastTsMs = lastTs < 1e12 ? lastTs * 1000 : lastTs;
            const tfMs = tfM * 60 * 1000;
            const currentClosedBoundaryMs = Math.floor(Date.now() / tfMs) * tfMs;
            return lastTsMs > currentClosedBoundaryMs ? arr.slice(0, -1) : arr;
          };
          const ohlcData = stripForming(ohlcDataRaw, tfMin);
          const real15mData = stripForming(real15mDataRaw, 15);
          const signal =
            ohlcData && ohlcData.length > 0
              ? AdvancedAI.generateAdvancedSignal(ohlcData, 100000, {
                  higherTimeframeData: real15mData,
                  timeframeMinutes: tfMin,
                  minimumBarsBetweenSignals: 1, // ⚡ FAST MODE
                })
              : null;
          monitorSignalCache.set(indexName, signal);
          return signal;
        } catch (err: any) {
          console.error(`❌ Monitor AI signal failed for ${indexName}:`, err?.message || err);
          monitorSignalCache.set(indexName, null);
          return null;
        }
      };

      for (const position of state.activePositions) {
        if (position.status !== "ACTIVE") continue;

        // Find matching Dhan position
        const dhanPos = dhanPositions.find(
          (dp: any) => dp.tradingSymbol === position.symbolName || dp.securityId === position.securityId?.toString(),
        );

        // Check if position is closed
        if (!dhanPos) {
          const missingCount = Number((position as any).missingBrokerPositionCount || 0) + 1;
          (position as any).missingBrokerPositionCount = missingCount;
          // Position APIs can briefly return an empty/stale snapshot. Never declare a live
          // trade closed from one response; require ten consecutive successful monitor ticks.
          if (missingCount < 10) {
            console.warn(`⚠️ ${position.symbolName} absent from broker positions (${missingCount}/10); keeping monitor active`);
            continue;
          }
        } else {
          (position as any).missingBrokerPositionCount = 0;
        }

        if (!dhanPos || Number(dhanPos.netQty ?? dhanPos.quantity ?? 0) === 0) {
          // Try to read realized P&L from Dhan so we can record it
          const realizedPnl = parseFloat(
            dhanPos?.realizedProfit || dhanPos?.realizedPnl || dhanPos?.realizedPnL || position.pnl || 0,
          );

          console.log(
            `🚪 Position CLOSED externally: ${position.symbolName} | Realized P&L: ₹${realizedPnl.toFixed(2)}`,
          );
          position.status = "CLOSED";

          // Only the monitor invocation that actually transitions this row may
          // record an external close. A concurrent AI/SL exit may already have
          // saved the real reason; never overwrite it with the generic label.
          const { data: externallyClosedRow } = await supabaseAdmin
            .from("position_monitor_state")
            .update({
              is_active: false,
              exit_reason: "Position closed externally",
              exited_at: new Date().toISOString(),
              pnl: realizedPnl,
            })
            .eq("user_id", userId)
            .eq("order_id", position.orderId)
            .eq("is_active", true)
            .select("id")
            .maybeSingle();

          if (!externallyClosedRow) {
            console.log(`ℹ️ ${position.symbolName} was already closed by another exit path; preserving its recorded reason`);
            continue;
          }

          state.stats.totalPnL += realizedPnl;

          // ⚡ Record into signal_stats so wallet auto-debit can read today's profit
          await this.updatePnLStats(userId, realizedPnl);

          // 💰 Trigger wallet auto-debit (server-side, no browser required)
          await this.runWalletAutoDebit(userId, state).catch((err) => {
            console.error(`❌ Wallet auto-debit failed for ${userId}:`, err);
          });

          await this.appendSharedLog(userId, {
            type: "POSITION_CLOSED",
            timestamp: Date.now(),
            symbol: position.symbolName,
            message: `🚪 ${position.symbolName} closed externally | P&L: ${realizedPnl >= 0 ? "+" : ""}₹${realizedPnl.toFixed(2)}`,
            reason: "Position closed externally",
            pnl: realizedPnl,
          });

          continue;
        }

        // Update P&L from live Dhan price, with computed fallback when broker P&L is absent/stale
        const currentPrice = parseFloat(
          dhanPos.lastPrice || dhanPos.ltp || dhanPos.currentPrice || position.currentPrice || 0,
        );
        const entryPrice = parseFloat(
          position.entryPrice || dhanPos.buyAvg || dhanPos.avgPrice || dhanPos.costPrice || 0,
        );
        const brokerQty = Math.abs(Number(dhanPos.netQty || dhanPos.quantity || 0));
        const trackedQty = Math.abs(Number(position.quantity || 0));
        const quantity = brokerQty || trackedQty || 1;
        const brokerPnl = parseFloat(dhanPos.unrealizedProfit || dhanPos.unrealizedPnl || dhanPos.unrealizedPnL || 0);
        const computedPnl = entryPrice && currentPrice ? (currentPrice - entryPrice) * quantity : 0;
        const pnl = Number.isFinite(brokerPnl) && brokerPnl !== 0 ? brokerPnl : computedPnl;

        // 🔁 LOT CHANGE DETECTION: user added/removed lots manually in Dhan app.
        // Recompute target/SL/trailing scaled to the new lot count and persist.
        if (brokerQty > 0 && trackedQty > 0 && brokerQty !== trackedQty) {
          const idxName = position.index || _inferIndexName(position.symbolName || "");
          const lotSize = _resolveLotSize(idxName, position.lotSize, dhanPos.lotSize, dhanPos.lot_size);
          const newRisk = await computeManualLotRisk(userId, idxName, brokerQty, lotSize, position.moneyness);
          const oldLots = Math.max(1, Math.round(trackedQty / lotSize));
          // Derive PER-LOT values from the current totals and re-scale — never multiply the
          // running totals repeatedly (that compounded into unreachable Target/SL).
          const perLot = (v: any, fb: number) => {
            const n = Number(v) || 0;
            return n > 0 ? n / oldLots : fb / Math.max(1, newRisk.lotCount);
          };
          const nextTarget = +(perLot(position.targetAmount, newRisk.targetAmount) * newRisk.lotCount).toFixed(2);
          const nextSL = +(perLot(position.stopLossAmount, newRisk.stopLossAmount) * newRisk.lotCount).toFixed(2);
          const safe = _sanitizeRisk(nextTarget, nextSL, entryPrice, brokerQty);
          position.quantity = brokerQty;
          position.targetAmount = safe.target || newRisk.targetAmount;
          position.stopLossAmount = safe.stopLoss || newRisk.stopLossAmount;
          position.currentTargetAmount = position.targetAmount;
          position.currentStopLossAmount = position.stopLossAmount;
          position.trailingActivationAmount = Math.min(
            +(perLot(position.trailingActivationAmount, newRisk.trailingActivationAmount) * newRisk.lotCount).toFixed(2) || newRisk.trailingActivationAmount,
            Math.max(1, position.targetAmount * 0.8),
          );
          position.targetJumpAmount = Math.min(
            +(perLot(position.targetJumpAmount, newRisk.targetJumpAmount) * newRisk.lotCount).toFixed(2) || newRisk.targetJumpAmount,
            Math.max(1, position.targetAmount * 0.5),
          );
          position.stopLossJumpAmount = Math.min(
            +(perLot(position.stopLossJumpAmount, newRisk.stopLossJumpAmount) * newRisk.lotCount).toFixed(2) || newRisk.stopLossJumpAmount,
            Math.max(1, position.stopLossAmount * 0.5),
          );
          position.trailingStep = position.stopLossJumpAmount;

          console.log(`🔁 [LOT-CHANGE] ${position.symbolName}: qty ${trackedQty}→${brokerQty} (${oldLots}→${newRisk.lotCount} lots) | Tgt ₹${position.targetAmount} SL ₹${position.stopLossAmount} TrailStep ₹${position.stopLossJumpAmount}`);
          await supabaseAdmin.from("position_monitor_state").update({
            quantity: brokerQty,
            target_amount: position.targetAmount,
            stop_loss_amount: position.stopLossAmount,
            trailing_enabled: !!position.trailingEnabled,
            trailing_step: position.stopLossJumpAmount,
          }).eq("user_id", userId).eq("order_id", position.orderId);
          await this.appendSharedLog(userId, {
            type: "POSITION_LOT_CHANGE",
            timestamp: Date.now(),
            symbol: position.symbolName,
            message: `🔁 ${position.symbolName} lot change ${oldLots}→${newRisk.lotCount} | Tgt ₹${position.targetAmount} SL ₹${position.stopLossAmount}`,
          });
        }

        position.currentPrice = currentPrice;
        position.pnl = pnl;

        // Track highest P&L for trailing
        if (!position.highestPnl || pnl > position.highestPnl) {
          position.highestPnl = pnl;
        }

        // ⚡⚡⚡ RATCHET TRAILING (LADDER STYLE) ⚡⚡⚡
        // Initialize "current" target/SL on first run from base values
        if (position.currentTargetAmount === undefined || position.currentTargetAmount === null) {
          position.currentTargetAmount = Number(position.targetAmount || 0);
        }
        if (position.currentStopLossAmount === undefined || position.currentStopLossAmount === null) {
          position.currentStopLossAmount = Number(position.stopLossAmount || 0);
        }

        let _baseTarget = Number(position.targetAmount || 0);
        let _baseSL = Number(position.stopLossAmount || 0);

        // 🤖 AUTO-DEFAULT RISK (for manual symbols / positions without user-configured Tgt/SL)
        // 5% target, 2.5% SL of notional (R:R ≈ 2:1). Trailing auto-enabled with sensible jumps.
        if (_baseTarget <= 0 && _baseSL <= 0 && entryPrice > 0 && quantity > 0) {
          const notional = entryPrice * quantity;
          _baseTarget = Math.max(100, Math.round(notional * 0.05));
          _baseSL = Math.max(75, Math.round(notional * 0.025));
          position.targetAmount = _baseTarget;
          position.stopLossAmount = _baseSL;
          position.currentTargetAmount = _baseTarget;
          position.currentStopLossAmount = _baseSL;
          if (!position.trailingActivationAmount || position.trailingActivationAmount <= 0) {
            position.trailingEnabled = true;
            position.trailingActivationAmount = Math.round(_baseTarget * 0.5); // activate at 50% of target
            position.targetJumpAmount = Math.round(_baseTarget * 0.25);
            position.stopLossJumpAmount = Math.round(_baseSL * 0.35);
          }
        }

        // 🛡️ RUNTIME RISK CLAMP — repairs already-persisted inflated rows (Aug 20+ bug):
        // an unreachable SL/Target meant the position could only exit via "closed externally"
        // or an AI reversal, so profitable moves were never banked.
        {
          const safe = _sanitizeRisk(_baseTarget, _baseSL, entryPrice, quantity);
          if (safe.clamped) {
            console.warn(
              `🛡️ [RISK-CLAMP] ${position.symbolName}: stored Tgt ₹${_baseTarget}/SL ₹${_baseSL} > premium notional ₹${(entryPrice * quantity).toFixed(2)} → Tgt ₹${safe.target} SL ₹${safe.stopLoss}`,
            );
            _baseTarget = safe.target;
            _baseSL = safe.stopLoss;
            position.targetAmount = _baseTarget;
            position.stopLossAmount = _baseSL;
            position.currentTargetAmount = Math.min(Number(position.currentTargetAmount || _baseTarget), _baseTarget);
            position.currentStopLossAmount = Math.min(Number(position.currentStopLossAmount || _baseSL), _baseSL);
            if (Number(position.trailingActivationAmount) > _baseTarget * 0.8) {
              position.trailingActivationAmount = +(_baseTarget * 0.5).toFixed(2);
            }
            if (Number(position.targetJumpAmount) > _baseTarget * 0.5) {
              position.targetJumpAmount = +(_baseTarget * 0.25).toFixed(2);
            }
            if (Number(position.stopLossJumpAmount) > _baseSL * 0.5) {
              position.stopLossJumpAmount = +(_baseSL * 0.33).toFixed(2);
              position.trailingStep = position.stopLossJumpAmount;
            }
            await supabaseAdmin.from("position_monitor_state").update({
              target_amount: _baseTarget,
              stop_loss_amount: _baseSL,
              trailing_step: position.stopLossJumpAmount || null,
            }).eq("user_id", userId).eq("order_id", position.orderId);
          }
        }


        let _activation = Number(position.trailingActivationAmount ?? 0);
        let _slJump = Number(position.stopLossJumpAmount ?? 0);
        let _targetJump = Number(position.targetJumpAmount ?? 0);

        // 🛠️ Self-heal missing ladder numbers when trailing is ON (never stay dormant)
        if (position.trailingEnabled === true) {
          if (_slJump <= 0) _slJump = Math.max(1, Math.round(_baseSL * 0.33));
          if (_targetJump <= 0) _targetJump = _slJump;
          if (_activation <= 0) _activation = Math.max(1, Math.round(_baseTarget * 0.5));
          position.trailingActivationAmount = _activation;
          position.targetJumpAmount = _targetJump;
          position.stopLossJumpAmount = _slJump;
        }

        const _trailingConfigured =
          position.trailingEnabled === true && _activation > 0 && _targetJump > 0 && _slJump > 0;

        if (_trailingConfigured && position.highestPnl >= _activation) {
          // 🔔 One-time ACTIVATION notification
          if (!position.trailingActivatedAt) {
            position.trailingActivatedAt = Date.now();
            position.trailingStepCount = 0;
            const actBody =
              `Profit hit ₹${position.highestPnl.toFixed(2)} (activation ₹${_activation}). ` +
              `Trailing is now ON for ${position.symbolName}. ` +
              `Base Target ₹${_baseTarget} / Base SL ₹${_baseSL}. ` +
              `Each step moves Target +₹${_targetJump} and SL +₹${_slJump} in your favour.`;
            const activationPush = await sendPushToUser(userId, {
              title: `🔥 Trailing Activated — ${position.symbolName}`,
              body: actBody,
              targetUrl: "/dashboard",
              data: {
                type: "TRAILING_ACTIVATED",
                symbol: String(position.symbolName || ""),
                orderId: String(position.orderId || ""),
                pnl: String(pnl.toFixed(2)),
                peak: String(position.highestPnl.toFixed(2)),
                activation: String(_activation),
                targetJump: String(_targetJump),
                slJump: String(_slJump),
                baseTarget: String(_baseTarget),
                baseStopLoss: String(_baseSL),
              },
            });
            if (!activationPush.success || activationPush.failed > 0) {
              console.error("FCM push (trailing activated) incomplete:", activationPush);
            } else {
              console.log(`✅ Trailing activation push delivered to ${activationPush.delivered} device(s)`);
            }
            await this.appendSharedLog(userId, {
              type: "TRAILING_ACTIVATED",
              timestamp: Date.now(),
              symbol: position.symbolName,
              message: `🔥 Trailing ACTIVATED for ${position.symbolName} — ${actBody}`,
              pnl,
              data: { activation: _activation, targetJump: _targetJump, slJump: _slJump, baseTarget: _baseTarget, baseStopLoss: _baseSL },
            });
          }

          // Ladder is driven by the ACTIVATION amount: every multiple of the
          // activation profit (600, 1200, 1800 ...) triggers the next step,
          // and each step moves Target +stepAmount and SL +stepAmount in favour.
          const numberOfJumps = Math.floor(position.highestPnl / _activation);

          const previousStepCount = Number(position.trailingStepCount || 0);
          if (numberOfJumps > previousStepCount) {
            const appliedJumps = numberOfJumps;
            const newTarget = _baseTarget + appliedJumps * _targetJump;
            // SL ratchets UP (in profit direction): baseSL is the loss limit (positive number),
            // each jump reduces it by _slJump. When it crosses 0 it becomes a guaranteed profit lock.
            const newSL = _baseSL - appliedJumps * _slJump;
            if (newTarget !== position.currentTargetAmount || newSL !== position.currentStopLossAmount) {
              const oldT = position.currentTargetAmount;
              const oldS = position.currentStopLossAmount;
              position.currentTargetAmount = newTarget;
              position.currentStopLossAmount = newSL;
              position.trailingStepCount = appliedJumps;
              const lockMsg = newSL <= 0 ? ` 🟢 PROFIT LOCKED at ₹${Math.abs(newSL).toFixed(2)}` : "";
              console.log(
                `⚡ TRAILING RATCHET ${position.symbolName}: Tgt ₹${oldT}→₹${newTarget} | SL ₹${oldS}→₹${newSL}${lockMsg}`,
              );
              // 🔔 STEP notification — clear before/after explanation
              const slLine =
                newSL <= 0
                  ? `SL ₹${oldS} → PROFIT LOCK ₹${Math.abs(newSL).toFixed(2)} (no loss possible now)`
                  : `SL ₹${oldS} → ₹${newSL}`;
              const stepBody =
                `Step ${appliedJumps} • Current profit ₹${pnl.toFixed(2)} (peak ₹${position.highestPnl.toFixed(2)}). ` +
                `Target ₹${oldT} → ₹${newTarget}. ${slLine}.`;
              const stepPush = await sendPushToUser(userId, {
                title: `⚡ Trailing Step ${appliedJumps} — ${position.symbolName}`,
                body: stepBody,
                targetUrl: "/dashboard",
                data: {
                  type: "TRAILING_STEP",
                  symbol: String(position.symbolName || ""),
                  orderId: String(position.orderId || ""),
                  step: String(appliedJumps),
                  pnl: String(pnl.toFixed(2)),
                  peak: String(position.highestPnl.toFixed(2)),
                  oldTarget: String(oldT),
                  newTarget: String(newTarget),
                  oldStopLoss: String(oldS),
                  newStopLoss: String(newSL),
                  profitLocked: String(newSL <= 0),
                },
              });
              if (!stepPush.success || stepPush.failed > 0) {
                console.error("FCM push (trailing step) incomplete:", stepPush);
              } else {
                console.log(`✅ Trailing step ${appliedJumps} push delivered to ${stepPush.delivered} device(s)`);
              }
              await this.appendSharedLog(userId, {
                type: "TRAILING_UPDATE",
                timestamp: Date.now(),
                symbol: position.symbolName,
                message: `⚡ Trailing ${position.symbolName}: Tgt ₹${newTarget}, SL ₹${newSL}${lockMsg} (Peak ₹${position.highestPnl.toFixed(2)}, Step ${appliedJumps})`,
                pnl,
                data: {
                  peak: position.highestPnl,
                  jumps: appliedJumps,
                  step: appliedJumps,
                  oldTarget: oldT,
                  newTarget,
                  oldStopLoss: oldS,
                  newStopLoss: newSL,
                  profitLocked: newSL <= 0,
                  activation: _activation,
                  targetJump: _targetJump,
                  slJump: _slJump,
                },
              });
            }
          }
        }


        console.log(
          `📊 ${position.symbolName} | P&L: ₹${pnl.toFixed(2)} | Highest: ₹${(position.highestPnl || 0).toFixed(2)} | CurTgt ₹${position.currentTargetAmount} | CurSL ₹${position.currentStopLossAmount}`,
        );

        // ⚡ Push monitor heartbeat into shared logs (visible in UI)
        const _curTgt = Number(position.currentTargetAmount ?? position.targetAmount ?? 0);
        const _curSL = Number(position.currentStopLossAmount ?? position.stopLossAmount ?? 0);
        const _trailingActive =
          position.trailingEnabled &&
          position.highestPnl >= Number(position.trailingActivationAmount || 0) &&
          Number(position.trailingActivationAmount || 0) > 0;
        await this.appendSharedLog(userId, {
          type: "POSITION_MONITOR",
          timestamp: Date.now(),
          symbol: position.symbolName,
          message: `📊 ${position.symbolName} | LTP ₹${currentPrice.toFixed(2)} | P&L ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(2)} | Peak ₹${(position.highestPnl || 0).toFixed(2)} | Tgt ₹${_curTgt} | SL ₹${_curSL}${_trailingActive ? " 🔥 TRAIL ON" : ""}${_curSL <= 0 && position.trailingEnabled ? " 🟢 LOCKED" : ""}`,
          pnl,
          data: {
            symbol: position.symbolName,
            currentPrice,
            pnl,
            highestPnl: position.highestPnl || 0,
            targetAmount: position.targetAmount,
            stopLossAmount: position.stopLossAmount,
            currentTargetAmount: _curTgt,
            currentStopLossAmount: _curSL,
            trailingEnabled: position.trailingEnabled,
            trailingActivationAmount: position.trailingActivationAmount,
            trailingActive: _trailingActive,
            profitLocked: position.trailingEnabled && _curSL <= 0,
          },
        });

        // ⚡⚡⚡ ADVANCED MONITOR INTELLIGENCE (compute BEFORE DB write so UI sees fresh values) ⚡⚡⚡
        const _now = Date.now();
        const _hist = Array.isArray((position as any).history) ? (position as any).history : [];
        _hist.push({ t: _now, price: currentPrice, pnl });
        while (_hist.length > 12) _hist.shift();
        (position as any).history = _hist;

        let momentumScore = 0;
        if (_hist.length >= 6) {
          const recent = _hist.slice(-3).reduce((a: number, h: any) => a + h.pnl, 0) / 3;
          const prior = _hist.slice(-6, -3).reduce((a: number, h: any) => a + h.pnl, 0) / 3;
          momentumScore = recent - prior;
        }
        const giveBack = Math.max(0, (position.highestPnl || 0) - pnl);
        const giveBackPct = position.highestPnl > 0 ? (giveBack / position.highestPnl) * 100 : 0;
        const heldMinutes = position.entryTime ? (_now - position.entryTime) / 60000 : 0;
        let marketFavorable = momentumScore >= 0 && pnl >= (position.highestPnl || 0) * 0.6;
        (position as any).momentumScore = Number(momentumScore.toFixed(2));
        (position as any).giveBackPct = Number(giveBackPct.toFixed(1));
        (position as any).heldMinutes = Number(heldMinutes.toFixed(1));
        (position as any).marketFavorable = marketFavorable;

        // ⚡ Same Engaged engine monitor confirmation: fetch fresh AI signal and exit strong reversal.
        const monitorIndex = normalizeIndexName(position);
        // Only refresh AI signal once per candle close (not every 1-second tick)
        const _candleKey = `${monitorIndex}:${state.candleInterval}:${state.lastProcessedCandle}`;
        const currentSignal = monitorSignalCache.has(_candleKey)
          ? monitorSignalCache.get(_candleKey)
          : await getMonitorSignal(monitorIndex).then((s) => {
              monitorSignalCache.set(_candleKey, s);
              return s;
            });
        const indicators = currentSignal?.indicators || {};
        let signalShouldExit = false;
        let signalExitReason = "";
        let monitorDecision: "HOLD" | "WATCH" | "EXIT" = marketFavorable ? "HOLD" : "WATCH";
        let monitorReasoning = `⏳ Monitoring P&L ₹${pnl.toFixed(2)}`;
        let marketMomentum: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
        let momentumStrength = 0;

        if (currentSignal) {
          const trendDirection = Number(indicators.ema9 || 0) > Number(indicators.ema21 || 0) ? "BULLISH" : "BEARISH";
          const rsiStrength = Number(indicators.rsi || 50) > 50 ? "BULLISH" : "BEARISH";
          const macdStrength = indicators.macdBullish ? "BULLISH" : "BEARISH";
          let bullishCount = 0;
          let bearishCount = 0;
          if (trendDirection === "BULLISH") bullishCount++;
          else bearishCount++;
          if (indicators.priceAboveVWAP) bullishCount++;
          else bearishCount++;
          if (rsiStrength === "BULLISH") bullishCount++;
          else bearishCount++;
          if (macdStrength === "BULLISH") bullishCount++;
          else bearishCount++;
          if (currentSignal.volumeAnalysis?.orderFlow === "BULLISH") bullishCount++;
          if (currentSignal.volumeAnalysis?.orderFlow === "BEARISH") bearishCount++;
          marketMomentum =
            bullishCount > bearishCount ? "BULLISH" : bearishCount > bullishCount ? "BEARISH" : "NEUTRAL";
          momentumStrength = Math.max(bullishCount, bearishCount);
          const positionDirection =
            normalizeOptionType(position.optionType || position.symbolName) === "CE" ? "BULLISH" : "BEARISH";
          const isAlignedWithMarket = positionDirection === marketMomentum;
          marketFavorable = isAlignedWithMarket && momentumStrength >= 3;

          // 🔒 RULE: a running position is only closed on a STRONG opposite signal.
          // A single low-confidence flip is market noise and must not close a live
          // trade that can still recover. Sideways / WAIT / neutral also keep running.
          const _oppositeAction =
            normalizeOptionType(position.optionType || position.symbolName) === "CE" ? "BUY_PUT" : "BUY_CALL";
          const _isOppositeSignal = currentSignal.action === _oppositeAction;

          const _oppositeSignalConfirmed =
            _isOppositeSignal && Number(currentSignal.confidence || 0) >= 80 && momentumStrength >= 4;

          if (_oppositeSignalConfirmed) {
            signalShouldExit = true;
            signalExitReason = `Strong Signal Flip (AI: ${currentSignal.action}, ${currentSignal.confidence}% confidence, momentum ${momentumStrength}/6)`;
          } else if (_isOppositeSignal) {
            monitorReasoning = `⚠️ HOLD - Unconfirmed flip ${currentSignal.action} (${currentSignal.confidence || 0}%, momentum ${momentumStrength}/6); waiting for strong confirmation`;
          } else if (isAlignedWithMarket && momentumStrength >= 3) {

            monitorReasoning = `✅ HOLD - ${marketMomentum} momentum matches ${positionDirection} position (${momentumStrength}/6 confirmations)`;
          } else {
            monitorReasoning = `⚠️ WATCH - Market ${marketMomentum}, AI ${currentSignal.action} (${currentSignal.confidence || 0}%), P&L ₹${pnl.toFixed(2)}`;
          }
          monitorDecision = signalShouldExit ? "EXIT" : marketFavorable ? "HOLD" : "WATCH";
        }

        (position as any).monitorDecision = monitorDecision;
        (position as any).marketFavorable = marketFavorable;

        // ⚡ Update position in DB (also persist entry_price the first time we see it)
        await supabaseAdmin
          .from("position_monitor_state")
          .update({
            target_amount: _baseTarget,
            stop_loss_amount: _baseSL,
            trailing_enabled: _trailingConfigured,
            trailing_step: _slJump,
            current_price: currentPrice,
            entry_price: entryPrice,
            pnl: pnl,
            highest_pnl: position.highestPnl || 0,
            raw_position: {
              ...dhanPos,
              optionType: position.optionType || normalizeOptionType(position.symbolName),
              trailingActivationAmount: position.trailingActivationAmount || 0,
              targetJumpAmount: position.targetJumpAmount || 0,
              stopLossJumpAmount: position.stopLossJumpAmount || 0,
              currentTargetAmount: _curTgt,
              currentStopLossAmount: _curSL,
              trailingActive: _trailingActive,
              trailingEnabled: !!position.trailingEnabled,
              trailingStepCount: Number(position.trailingStepCount || 0),
              trailingActivatedAt: position.trailingActivatedAt || null,
              baseTargetAmount: _baseTarget,
              baseStopLossAmount: _baseSL,
              profitLocked: position.trailingEnabled && _curSL <= 0,

              lastMonitorAt: Date.now(),
              momentumScore: (position as any).momentumScore,
              giveBackPct: (position as any).giveBackPct,
              heldMinutes: (position as any).heldMinutes,
              marketFavorable,
              monitorDecision: (position as any).monitorDecision,
              history: _hist,
            },
          })
          .eq("user_id", userId)
          .eq("order_id", position.orderId);

        await this.runWalletAutoDebit(userId, state).catch((err) => {
          console.error(`❌ Running wallet auto-debit failed for ${userId}:`, err);
        });

        // (momentumScore / giveBackPct / heldMinutes / marketFavorable already computed above)

        // ⚡ Check exit conditions using Engaged engine order: Target/SL first, then strong reversal.
        let shouldExit = false;
        let exitReason = "";

        const effectiveTarget = Number(position.currentTargetAmount ?? position.targetAmount ?? 0);
        const effectiveSL = Number(position.currentStopLossAmount ?? position.stopLossAmount ?? 0);
        const baseTarget = Number(position.targetAmount ?? 0);
        const baseSL = Number(position.stopLossAmount ?? 0);

        if (!shouldExit && effectiveTarget > 0 && pnl >= effectiveTarget) {
          shouldExit = true;
          exitReason = `Target Achieved (Target: ₹${effectiveTarget.toFixed(2)}, Current: ₹${pnl.toFixed(2)})`;
          // FIX G: winning exit resets consecutive-loss streak.
          try {
            await kv.set(`loss_streak:${userId}:${position.index}`, 0);
          } catch (_e) {
            /* non-fatal */
          }
        }

        if (!shouldExit && effectiveSL > 0 && pnl <= -effectiveSL) {
          shouldExit = true;
          exitReason = `Stop Loss Hit (SL: ₹${effectiveSL.toFixed(2)}, Current: ₹${pnl.toFixed(2)})`;
          // FIX D: persist last SL hit so AdvancedAI applies the 2-bar revenge-trade cooldown.
          // FIX G: increment consecutive-loss streak for 30-min lockout after 3 in a row.
          try {
            const slDir =
              position.action === "BUY_CALL" || /CE$/i.test(position.symbolName || "") ? "BUY_CALL" : "BUY_PUT";
            const now = Date.now();
            await kv.set(`last_sl_ts:${userId}:${position.index}`, now);
            await kv.set(`last_sl_dir:${userId}:${position.index}`, slDir);
            const prevStreak = Number((await kv.get(`loss_streak:${userId}:${position.index}`)) || 0);
            await kv.set(`loss_streak:${userId}:${position.index}`, prevStreak + 1);
            await kv.set(`last_loss_ts:${userId}:${position.index}`, now);
          } catch (_e) {
            /* non-fatal */
          }
        }

        // Profit-lock stop: only valid AFTER trailing actually activated (never on a fresh 0 SL).
        if (!shouldExit && effectiveSL <= 0 && position.trailingEnabled && position.trailingActivatedAt) {
          const lockedProfit = Math.abs(effectiveSL);
          if (pnl <= lockedProfit) {
            shouldExit = true;
            exitReason = `Trailing Stop Loss Hit (Locked: ₹${lockedProfit.toFixed(2)}, Current: ₹${pnl.toFixed(2)}, Peak: ₹${(position.highestPnl || 0).toFixed(2)})`;
          }
        }

        // ⚡⚡⚡ ADVANCED PREDICTIVE EXIT INTELLIGENCE ⚡⚡⚡
        // Goal: lock profit on early reversal, cut loss BEFORE full SL when market turns hard against,
        // and HOLD aggressively when trend is strongly aligned (let winners run).
        const _posDir = normalizeOptionType(position.optionType || position.symbolName) === "CE" ? "BULLISH" : "BEARISH";
        const _alignedNow = currentSignal ? _posDir === marketMomentum : true;
        const _strongAgainst = !!currentSignal && !_alignedNow && momentumStrength >= 4;
        const _strongWith = !!currentSignal && _alignedNow && momentumStrength >= 4;
        const _baseTgtForCalc = Math.max(_baseTarget, effectiveTarget) || 0;
        const _baseSLForCalc = Math.max(_baseSL, Math.abs(effectiveSL)) || 0;
        // Grace period: don't allow predictive/AI-reversal exits in the first 45s after entry.
        // Hard TP / SL / trailing SL above still apply.
        const _entryTs = Number((position as any).entryTime || (position as any).createdAt || (position as any).entryTimestamp || 0);
        const _ageMs = _entryTs > 0 ? Date.now() - _entryTs : Number.MAX_SAFE_INTEGER;
        const _withinGrace = _ageMs < 45_000;

        // 🔒 Direction-flip gate: predictive exits require an opposite signal with
        // at least 80% confidence and 4/6 momentum confirmations. This prevents a
        // temporary counter-move from closing a position just before recovery.
        const _oppActionNow = _posDir === "BULLISH" ? "BUY_PUT" : "BUY_CALL";
        const _flipSignalNow =
          !!currentSignal &&
          currentSignal.action === _oppActionNow &&
          Number(currentSignal.confidence || 0) >= 80 &&
          momentumStrength >= 4;

        // 1) PROFIT PROTECTION — only on a confirmed direction flip with heavy give-back.
        if (
          !shouldExit &&
          !_withinGrace &&
          _flipSignalNow &&
          (position.highestPnl || 0) > 0 &&
          pnl > 0 &&
          !_strongWith
        ) {
          const peak = position.highestPnl || 0;
          const profitFloor = _baseTgtForCalc > 0 ? _baseTgtForCalc * 0.6 : Math.max(300, peak * 0.6);
          const inProfitZone = peak >= profitFloor;
          const heavyGiveBack = giveBackPct >= 70;
          const reversingMomentum = momentumScore < 0;
          if (inProfitZone && heavyGiveBack && reversingMomentum) {
            shouldExit = true;
            exitReason = `Profit Protection (Peak ₹${peak.toFixed(2)} → Now ₹${pnl.toFixed(2)}, Give-back ${giveBackPct.toFixed(0)}%, signal flipped ${currentSignal?.action})`;
          }
        }

        // 2) EARLY LOSS CUT — only when the signal has actually flipped to the opposite side.
        if (!shouldExit && !_withinGrace && _flipSignalNow && pnl < 0 && _baseSLForCalc > 0 && momentumScore < 0) {
          const lossPct = Math.abs(pnl) / _baseSLForCalc;
          if (lossPct >= 0.45) {
            shouldExit = true;
            exitReason = `Early Reversal Cut (signal flipped to ${currentSignal?.action}, Loss ₹${pnl.toFixed(2)} = ${(lossPct * 100).toFixed(0)}% of SL)`;
          }
        }

        // 3) AI REVERSAL CONFIRMED — opposite-direction signal.
        if (!shouldExit && !_withinGrace && _flipSignalNow) {
          const conf = Number(currentSignal.confidence || 0);
          shouldExit = true;
          exitReason = `AI Reversal Confirmed (${currentSignal.action} ${conf}%)`;
        }

        // 4) Signal-flip exit from the monitor block (final safety net).
        if (!shouldExit && !_withinGrace && signalShouldExit) {
          shouldExit = true;
          exitReason = signalExitReason;
        }


        (position as any).monitorDecision = shouldExit ? "EXIT" : monitorDecision;

        if (shouldExit) {
          console.log(`\n🚪 EXIT TRIGGERED: ${exitReason}`);

          const exitParams = {
            securityId: position.securityId,
            symbol: position.symbolName,
            transactionType: "SELL",
            exchangeSegment: position.exchangeSegment || (position.index === "SENSEX" ? "BSE_FNO" : "NSE_FNO"),
            productType: "INTRADAY",
            orderType: "MARKET",
            validity: "DAY",
            quantity: position.quantity,
            disclosedQuantity: 0,
            price: 0,
            triggerPrice: 0,
            afterMarketOrder: false,
            amoTime: "",
          };

          const exitResult = await BrokerRouter.placeOrderSmart(
            userId,
            {
              dhanClientId: state.dhanClientId || "",
              dhanAccessToken: state.dhanAccessToken || "",
            },
            exitParams,
          );

          const exitConfirmation = await this.confirmExitFilled(userId, exitResult, position, dhanService);
          if (exitConfirmation.confirmed) {
            console.log(`✅ EXIT ORDER PLACED! ${exitReason}`);
            position.status = "CLOSED";
            state.stats.totalPnL += pnl;

            // ⚡ Update position in DB
            await supabaseAdmin
              .from("position_monitor_state")
              .update({
                is_active: false,
                exit_reason: exitReason,
                exited_at: new Date().toISOString(),
                pnl: pnl,
              })
              .eq("user_id", userId)
              .eq("order_id", position.orderId);

            // ⚡ Update P&L in stats
            await this.updatePnLStats(userId, pnl);

            // 💰 AUTO-DEBIT WALLET on realized profit (server-side, no browser required)
            await this.runWalletAutoDebit(userId, state).catch((err) => {
              console.error(`❌ Wallet auto-debit failed for ${userId}:`, err);
            });

            // Save log
            await kv.set(`engine_log_${userId}_${Date.now()}`, {
              type: "POSITION_CLOSED",
              timestamp: Date.now(),
              symbol: position.symbolName,
              reason: exitReason,
              pnl: pnl,
            });

            await this.appendSharedLog(userId, {
              type: "POSITION_CLOSED",
              timestamp: Date.now(),
              message: `🚪 POSITION CLOSED: ${position.symbolName} | ${exitReason} | P&L: ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(2)}`,
              symbol: position.symbolName,
              pnl,
              reason: exitReason,
              data: {
                symbol: position.symbolName,
                pnl,
                exitReason,
                orderId: position.orderId,
              },
            });

            await this.saveUserNotification(userId, {
              id: `exit_${position.orderId}_${Date.now()}`,
              type: "POSITION_CLOSED",
              title: pnl >= 0 ? "🎉 Position Closed" : "📉 Position Closed",
              message: `${position.symbolName} | ${exitReason} | P&L: ${pnl >= 0 ? "+" : ""}₹${pnl.toFixed(2)}`,
              timestamp: Date.now(),
              read: false,
              data: {
                symbol: position.symbolName,
                pnl,
                exitReason,
              },
            });

            // 📧 Profit / Loss email (best-effort)
            try {
              const entry = Number(position.entryPrice || position.entry_price || 0);
              const exit = Number(position.currentPrice || position.exit_price || 0);
              const qty = Number(position.quantity || 1);
              const returnPct = entry > 0 ? (((exit - entry) / entry) * 100).toFixed(2) : "—";
              sendEmailAsync(pnl >= 0 ? "position_closed_profit" : "position_closed_loss", userId, {
                symbol: position.symbolName,
                entry,
                exit,
                qty,
                pnl: Math.round(pnl * 100) / 100,
                returnPct,
                reason: exitReason,
              });
            } catch {}
          } else {
            const failure = exitConfirmation.error || exitResult.error || "Exit was not confirmed";
            console.log(`❌ EXIT ORDER FAILED: ${failure}`);
            await this.appendSharedLog(userId, {
              type: "EXIT_FAILED",
              timestamp: Date.now(),
              symbol: position.symbolName,
              message: `⚠️ EXIT NOT CONFIRMED: ${position.symbolName} | ${failure} | Monitoring continues`,
              reason: failure,
            });
            sendPushToUser(userId, {
              title: `⚠️ Exit not confirmed: ${position.symbolName}`,
              body: `${failure}. Position monitoring remains active; check your broker immediately.`,
              targetUrl: "/dashboard",
              data: { type: "EXIT_FAILED", symbol: String(position.symbolName || "") },
            }).catch((e) => console.error("FCM push (exit failure) failed:", e));
          }
        }
      }

      // Remove closed positions from memory
      state.activePositions = state.activePositions.filter((p) => p.status === "ACTIVE");
    } catch (error) {
      console.error("❌ Position monitoring error:", error);
    }
  }

  // ==================== DATABASE HELPERS ====================

  /**
   * Save engine state to trading_engine_state table
   */
  private static async saveEngineStateToDB(userId: string, state: EngineState): Promise<void> {
    try {
      await supabaseAdmin.from("trading_engine_state").upsert(
        {
          user_id: userId,
          is_running: state.isRunning,
          selected_symbols: state.symbols,
          strategy_settings: {
            candleInterval: state.candleInterval,
            lastProcessedCandle: state.lastProcessedCandle,
            totalSignals: state.stats.totalSignals,
            totalOrders: state.stats.totalOrders,
            totalPnL: state.stats.totalPnL,
          },
          started_at: state.isRunning ? new Date(state.startTime).toISOString() : null,
          last_heartbeat: new Date().toISOString(),
          // Restart is manual-only; cron must never re-arm a stopped engine.
          auto_resume: false,
          stopped_reason: state.isRunning ? null : undefined,
        },
        { onConflict: "user_id" },
      );
    } catch (err) {
      console.error("❌ Failed to save engine state to DB:", err);
    }
  }

  /**
   * Mark engine as stopped in DB
   * @param reason 'user' (explicit) | 'transient' (network/error) | 'market_close'
   */
  private static async markEngineStoppedInDB(
    userId: string,
    reason: "user" | "transient" | "market_close" = "user",
  ): Promise<void> {
    try {
      await supabaseAdmin
        .from("trading_engine_state")
        .update({
          is_running: false,
          stopped_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          stopped_reason: reason,
          auto_resume: false,
        })
        .eq("user_id", userId);
    } catch (err) {
      console.error("❌ Failed to mark engine stopped in DB:", err);
    }
  }

  /**
   * ⚡⚡⚡ BUG FIX 2 & 3: AUTO-RESUME ENGINES ⚡⚡⚡
   * Called by pg_cron at 09:10 IST daily AND inside each cron tick.
   * Re-arms any engine that:
   *   - has auto_resume = true
   *   - is currently is_running = false
   *   - was NOT stopped explicitly by user (stopped_reason != 'user')
   * This catches: pre-market start (Bug 2) + intraday disconnect recovery (Bug 3).
   */
  static async autoResumeEngines(): Promise<{ resumed: number; skipped: number }> {
    console.log("⏸️ [AUTO-RESUME] Disabled — engine requires an explicit user start");
    return { resumed: 0, skipped: 0 };
  }

  private static async saveUserNotification(userId: string, notification: any): Promise<void> {
    try {
      const existingNotifications = (await kv.get(`user_notifications:${userId}`)) || [];
      const duplicateExists = existingNotifications.some(
        (existing: any) =>
          (existing?.id && notification?.id && existing.id === notification.id) ||
          (existing?.type === notification?.type &&
            existing?.title === notification?.title &&
            existing?.message === notification?.message &&
            Math.abs((existing?.timestamp || 0) - (notification?.timestamp || 0)) <= 60000),
      );

      if (duplicateExists) return;

      existingNotifications.unshift(notification);
      if (existingNotifications.length > 100) {
        existingNotifications.length = 100;
      }

      await kv.set(`user_notifications:${userId}`, existingNotifications);
    } catch (err) {
      console.error("❌ Failed to save user notification:", err);
    }
  }

  private static async appendSharedLog(userId: string, logEntry: any): Promise<void> {
    try {
      const existingLogs = (await kv.get(`logs:${userId}`)) || [];
      existingLogs.unshift(logEntry);
      if (existingLogs.length > 500) {
        existingLogs.length = 500;
      }
      await kv.set(`logs:${userId}`, existingLogs);
    } catch (err) {
      console.error("❌ Failed to append shared log:", err);
    }
  }

  private static async saveLatestSignalsSnapshot(userId: string, latestSignals: Record<string, any>): Promise<void> {
    try {
      const existingSnapshot = (await kv.get(`latest_signals:${userId}`)) || {};
      const signalTimestamps = Object.values(latestSignals)
        .map((signal: any) => Number(signal?.timestamp || 0))
        .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);
      const snapshotTimestamp = signalTimestamps.length > 0 ? Math.max(...signalTimestamps) : Date.now();
      await kv.set(`latest_signals:${userId}`, {
        ...existingSnapshot,
        ...latestSignals,
        __timestamp: snapshotTimestamp,
      });
    } catch (err) {
      console.error("❌ Failed to save latest signals snapshot:", err);
    }
  }

  /**
   * Save signal to trading_signals table
   */
  private static async saveSignalToDB(userId: string, symbol: any, aiSignal: any): Promise<void> {
    try {
      const normalizedIndex = normalizeIndexName(symbol);
      const normalizedSymbolName = getSymbolDisplayName(symbol);
      const action = aiSignal?.signal?.action || "WAIT";

      if (action === "WAIT") {
        const tsRaw = aiSignal?.signal?.timestamp || Date.now();
        const tsMs = Number(tsRaw) < 1e12 ? Number(tsRaw) * 1000 : Number(tsRaw);
        const bucket = Math.floor(tsMs / (15 * 60 * 1000)) * (15 * 60 * 1000);
        const waitKey = `wait_saved:${userId}:${normalizedIndex}:${bucket}`;
        if (await kv.get(waitKey)) return;
        await kv.set(waitKey, true);
      }

      const targetOptionType =
        action === "BUY_CALL"
          ? "CE"
          : action === "BUY_PUT"
            ? "PE"
            : normalizeOptionType(symbol.optionType || symbol.option_type);
      const currentPrice = Number(
        aiSignal?.signal?.riskManagement?.suggestedEntry ||
          aiSignal?.signal?.price ||
          aiSignal?.ohlcData?.[aiSignal?.ohlcData?.length - 1]?.close ||
          0,
      );
      const strikeStep = getStrikeStep(normalizedIndex);
      const derivedStrike = currentPrice > 0 ? Math.round(currentPrice / strikeStep) * strikeStep : null;

      await supabaseAdmin.from("trading_signals").insert({
        user_id: userId,
        symbol: normalizedSymbolName,
        signal_type: action,
        index_name: normalizedIndex,
        price: currentPrice || null,
        strike_price: symbol.strikePrice || symbol.strike_price || derivedStrike,
        option_type: targetOptionType || null,
        expiry: symbol.expiry || null,
        confidence: aiSignal?.signal?.confidence || 0,
        raw_data: aiSignal || {},
        status: "detected",
      });

      // 📧 Email is now sent ONCE per candle (consolidated for all indices)
      // — see runEngineForUser() after the index loop. Do not send per-index here.
    } catch (err) {
      console.error("❌ Failed to save signal to DB:", err);
    }
  }

  /**
   * Save order to trading_orders table
   */
  private static async saveOrderToDB(
    userId: string,
    symbol: any,
    orderResult: any,
    action: string,
    status: string = "completed",
  ): Promise<void> {
    try {
      const normalizedIndex = normalizeIndexName(symbol);
      const normalizedSymbolName = getSymbolDisplayName(symbol);
      const normalizedExchangeSegment = resolveSymbolExchangeSegment(symbol);

      await supabaseAdmin.from("trading_orders").insert({
        user_id: userId,
        symbol: normalizedSymbolName,
        index_name: normalizedIndex,
        order_type: symbol.orderType || symbol.order_type || "MARKET",
        transaction_type: "BUY",
        quantity: symbol.quantity || symbol.lotSize || symbol.lot_size || 15,
        price: orderResult.averagePrice || orderResult.price || 0,
        dhan_order_id: orderResult.orderId || null,
        exchange_segment: normalizedExchangeSegment,
        symbol_id: String(symbol.securityId || symbol.symbolId || symbol.symbol_id || "") || null,
        status: status,
        broker: String(orderResult?.broker || (await BrokerRouter.getActiveBroker(userId)) || "dhan"),
        error_message: orderResult.error || null,
        raw_response: orderResult || {},
      });
    } catch (err) {
      console.error("❌ Failed to save order to DB:", err);
    }
  }

  /**
   * Save position to position_monitor_state table
   */
  private static async savePositionToDB(userId: string, position: any, symbol: any): Promise<void> {
    try {
      const normalizedIndex = normalizeIndexName(symbol);
      const normalizedSymbolName = position.symbolName || getSymbolDisplayName(symbol);
      const normalizedExchangeSegment = position.exchangeSegment || resolveSymbolExchangeSegment(symbol);

      await supabaseAdmin.from("position_monitor_state").upsert(
        {
          user_id: userId,
          order_id: position.orderId,
          symbol: normalizedSymbolName,
          index_name: normalizedIndex,
          symbol_id:
            position.securityId?.toString() ||
            String(symbol.securityId || symbol.symbolId || symbol.symbol_id || "") ||
            null,
          exchange_segment: normalizedExchangeSegment,
          entry_price: position.entryPrice || 0,
          current_price: position.currentPrice || 0,
          quantity: position.quantity || 15,
          pnl: 0,
          target_amount: position.targetAmount || 0,
          stop_loss_amount: position.stopLossAmount || 0,
          trailing_enabled: position.trailingEnabled || false,
          trailing_step: Number(position.stopLossJumpAmount ?? position.trailingStep ?? 0),
          highest_pnl: 0,
          raw_position: {
            ...(symbol.raw_data || {}),
            optionType: position.optionType || normalizeOptionType(normalizedSymbolName),
            targetAmount: position.targetAmount || 0,
            stopLossAmount: position.stopLossAmount || 0,
            currentTargetAmount: position.currentTargetAmount || position.targetAmount || 0,
            currentStopLossAmount: position.currentStopLossAmount || position.stopLossAmount || 0,
            trailingActivationAmount: position.trailingActivationAmount || symbol.trailingActivationAmount || 0,
            targetJumpAmount: position.targetJumpAmount || symbol.targetJumpAmount || 0,
            stopLossJumpAmount: position.stopLossJumpAmount || symbol.stopLossJumpAmount || 0,
          },
          is_active: true,
        },
        { onConflict: "user_id,order_id" },
      );
    } catch (err) {
      console.error("❌ Failed to save position to DB:", err);
    }
  }

  /**
   * Increment signal stats for today
   */
  private static async incrementSignalStats(userId: string, type: "signal" | "order" | "speed"): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];

      // Try to get existing row
      const { data: existing } = await supabaseAdmin
        .from("signal_stats")
        .select("*")
        .eq("user_id", userId)
        .eq("stat_date", today)
        .maybeSingle();

      if (existing) {
        const updates: any = {};
        if (type === "signal") updates.signal_count = (existing.signal_count || 0) + 1;
        if (type === "order") updates.order_count = (existing.order_count || 0) + 1;
        if (type === "speed") updates.speed_count = (existing.speed_count || 0) + 1;

        await supabaseAdmin.from("signal_stats").update(updates).eq("id", existing.id);
      } else {
        await supabaseAdmin.from("signal_stats").insert({
          user_id: userId,
          stat_date: today,
          signal_count: type === "signal" ? 1 : 0,
          order_count: type === "order" ? 1 : 0,
          speed_count: type === "speed" ? 1 : 0,
        });
      }
    } catch (err) {
      console.error("❌ Failed to update signal stats:", err);
    }
  }

  /**
   * Update P&L in signal stats
   */
  private static async updatePnLStats(userId: string, pnl: number): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabaseAdmin
        .from("signal_stats")
        .select("*")
        .eq("user_id", userId)
        .eq("stat_date", today)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from("signal_stats")
          .update({
            total_pnl: (existing.total_pnl || 0) + pnl,
            successful_orders: pnl > 0 ? (existing.successful_orders || 0) + 1 : existing.successful_orders,
            failed_orders: pnl <= 0 ? (existing.failed_orders || 0) + 1 : existing.failed_orders,
          })
          .eq("id", existing.id);
      }
    } catch (err) {
      console.error("❌ Failed to update P&L stats:", err);
    }
  }

  /**
   * 💰 Server-side wallet auto-debit.
   * Uses only confirmed live running positions from position_monitor_state.
   * Failed orders or estimated frontend P&L must never trigger wallet debit.
   */
  private static async runWalletAutoDebit(userId: string, _state: EngineState): Promise<void> {
    try {
      const today = new Date().toISOString().split("T")[0];
      const startIso = `${today}T00:00:00.000Z`;
      const { data: activePositions, error: activePositionsError } = await supabaseAdmin
        .from("position_monitor_state")
        .select("pnl")
        .eq("user_id", userId)
        .eq("is_active", true)
        .gte("created_at", startIso);

      if (activePositionsError) {
        console.error(`❌ Failed to load active positions for wallet debit (${userId}):`, activePositionsError);
        return;
      }

      const todayProfit = (activePositions || []).reduce((sum: number, position: any) => {
        const pnl = Number(position?.pnl || 0);
        return pnl > 0 ? sum + pnl : sum;
      }, 0);

      if (todayProfit < 100) {
        return; // FREE tier / no confirmed running profit milestone
      }

      const { data: stats } = await supabaseAdmin
        .from("signal_stats")
        .select("total_pnl")
        .eq("user_id", userId)
        .eq("stat_date", today)
        .maybeSingle();

      let email = "";
      try {
        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
        email = userRes?.user?.email || "";
      } catch (_e) {
        console.warn(`⚠️ Could not resolve email for ${userId}`);
      }

      const platformOwnerEmail = Deno.env.get("PLATFORM_OWNER_EMAIL") || "";
      const result = await checkAndDebitTiered(userId, email, todayProfit, platformOwnerEmail);

      if (result.deducted) {
        console.log(`💳 [AUTO-DEBIT] ₹${result.amount} debited from ${userId} (${result.currentTier})`);
        await this.appendSharedLog(userId, {
          type: "WALLET_DEBIT",
          timestamp: Date.now(),
          message: `💳 ₹${result.amount} auto-debited (${result.currentTier}) | Running Profit: ₹${todayProfit.toFixed(2)} | Realized Today: ₹${Number(stats?.total_pnl || 0).toFixed(2)} | Balance: ₹${result.newBalance}`,
          data: {
            amount: result.amount,
            tier: result.currentTier,
            newBalance: result.newBalance,
            profit: todayProfit,
            realizedProfit: Number(stats?.total_pnl || 0),
          },
        });
      } else if (result.error === "Insufficient wallet balance") {
        await this.appendSharedLog(userId, {
          type: "WALLET_ERROR",
          timestamp: Date.now(),
          message: `⚠️ Wallet auto-debit failed: insufficient balance (need ₹${result.required}, have ₹${result.available})`,
          data: result,
        });
      }
    } catch (err: any) {
      console.error(`❌ runWalletAutoDebit error for ${userId}:`, err?.message || err);
    }
  }

  private static async cleanupOldSignals(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin.from("trading_signals").delete().lt("created_at", cutoff);

      if (!error) {
        console.log(`🧹 Cleaned up signals older than 24 hours`);
      }
    } catch (err) {
      console.error("❌ Failed to cleanup old signals:", err);
    }
  }

  /**
   * Get interval in milliseconds
   */
  private static getIntervalMilliseconds(interval: "5" | "15"): number {
    return 1000; // Run every 1 second
  }

  private static async getLiveEngineState(
    userId: string,
  ): Promise<{ is_running: boolean; strategy_settings?: any } | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from("trading_engine_state")
        .select("is_running, strategy_settings")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error(`❌ Failed to fetch live engine state for ${userId}:`, error);
        return null;
      }

      return data;
    } catch (error) {
      console.error(`❌ Failed to read live engine state for ${userId}:`, error);
      return null;
    }
  }

  private static async isEngineStillRunning(userId: string): Promise<boolean> {
    const liveState = await this.getLiveEngineState(userId);
    return liveState?.is_running === true;
  }

  private static pruneRecentOrderKeys(): void {
    const cutoff = Date.now() - this.RECENT_ORDER_WINDOW_MS;
    for (const [key, timestamp] of this.recentOrderKeys.entries()) {
      if (timestamp < cutoff) {
        this.recentOrderKeys.delete(key);
      }
    }
  }

  private static hasRecentOrderKey(orderKey: string): boolean {
    this.pruneRecentOrderKeys();
    return this.recentOrderKeys.has(orderKey);
  }

  private static markRecentOrderKey(orderKey: string): void {
    this.pruneRecentOrderKeys();
    this.recentOrderKeys.set(orderKey, Date.now());
  }

  /**
   * 🔒 CROSS-ISOLATE ORDER CLAIM
   * In-memory keys only dedupe inside ONE edge isolate. The pg_cron tick and the
   * millisecond candle-watcher run in DIFFERENT isolates, so both could place the
   * same order (user saw 15 lots executed twice = 30 lots). This takes an atomic
   * claim in the kv table (PK conflict = someone else already claimed the candle).
   */
  private static async claimOrderKeyGlobal(orderKey: string): Promise<boolean> {
    const key = `order_claim:${orderKey}`;
    try {
      const { error } = await supabaseAdmin
        .from("kv_store_c4d79cb7")
        .insert({ key, value: { at: Date.now() } });
      if (!error) {
        this.markRecentOrderKey(orderKey);
        return true;
      }
      // 23505 = unique violation → another isolate already owns this order
      if ((error as any).code === "23505") {
        this.markRecentOrderKey(orderKey);
        return false;
      }
      console.error("⚠️ claimOrderKeyGlobal failed:", error.message);
      // Fail-safe: on infra errors fall back to in-memory guard only
      const owned = !this.hasRecentOrderKey(orderKey);
      this.markRecentOrderKey(orderKey);
      return owned;
    } catch (e: any) {
      console.error("⚠️ claimOrderKeyGlobal exception:", e?.message || e);
      const owned = !this.hasRecentOrderKey(orderKey);
      this.markRecentOrderKey(orderKey);
      return owned;
    }
  }

  private static async releaseOrderKeyGlobal(orderKey: string): Promise<void> {
    this.recentOrderKeys.delete(orderKey);
    try {
      await supabaseAdmin.from("kv_store_c4d79cb7").delete().eq("key", `order_claim:${orderKey}`);
    } catch (_e) {
      /* best effort */
    }
  }


  private static async hasRecentOrderInDB(userId: string, symbolId: string): Promise<boolean> {
    if (!symbolId) return false;

    try {
      const since = new Date(Date.now() - this.RECENT_ORDER_WINDOW_MS).toISOString();
      const { data, error } = await supabaseAdmin
        .from("trading_orders")
        .select("id, created_at, status, dhan_order_id")
        .eq("user_id", userId)
        .eq("symbol_id", symbolId)
        .gt("created_at", since)
        .limit(1);

      if (error) {
        console.error(`❌ Failed duplicate-order lookup for ${symbolId}:`, error);
        return false;
      }

      return Boolean(data && data.length > 0);
    } catch (error) {
      console.error(`❌ Duplicate-order DB check failed for ${symbolId}:`, error);
      return false;
    }
  }

  /**
   * Get current candle timestamp
   */
  private static getCurrentCandleTimestamp(istDate: Date, interval: number): string {
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const candleMinute = Math.floor(minutes / interval) * interval;
    return `${hours.toString().padStart(2, "0")}:${candleMinute.toString().padStart(2, "0")}`;
  }

  private static getCandleCloseTimeMs(istDate: Date, interval: number): number {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const intervalMs = interval * 60 * 1000;
    return Math.floor(istDate.getTime() / intervalMs) * intervalMs - istOffsetMs;
  }

  // ============================================================
  // 🛰️ CENTRAL SIGNAL PUBLISHER
  // Runs at every candle close (5m / 15m) from the millisecond
  // watcher, independent of whether any user engine is running.
  // Every user tick then reads this cached signal → identical
  // signal for all users, generated within ms of the close.
  // ============================================================
  private static readonly CENTRAL_PUBLISH_INDEXES: Array<{ name: string; securityId: string }> = [
    { name: "NIFTY", securityId: "13" },
    { name: "BANKNIFTY", securityId: "25" },
    { name: "SENSEX", securityId: "51" },
  ];

  static async publishCentralSignals(
    istNow: Date = new Date(Date.now() + 5.5 * 60 * 60 * 1000),
    forceRefresh = false,
  ) {
    const minuteOfDay = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
    const tfs = [5, 15].filter((tf) => (minuteOfDay - (9 * 60 + 15)) % tf === 0);
    if (tfs.length === 0) return { published: 0 };

    const creds = await getCentralCredentials();
    if (!creds) return { published: 0, reason: "no central credentials" };

    let published = 0;
    await Promise.all(
      tfs.flatMap((tf) =>
        this.CENTRAL_PUBLISH_INDEXES.map(async (idx) => {
          try {
            const stamp = this.getCurrentCandleTimestamp(istNow, tf);
            if (!forceRefresh && (await getCachedCentralSignal(idx.name, tf, stamp))) return;

            const primary = await getCentralOHLC(idx.securityId, String(tf), 150, null);
            const candles = primary.candles || [];
            if (candles.length < 30) return;
            const lastTimestamp = Number(candles[candles.length - 1]?.timestamp || 0);
            const lastTimestampMs = lastTimestamp < 1e12 ? lastTimestamp * 1000 : lastTimestamp;
            const expectedClosedBoundaryMs = Math.floor(Date.now() / (tf * 60 * 1000)) * tf * 60 * 1000;
            if (!lastTimestampMs || lastTimestampMs < expectedClosedBoundaryMs) {
              console.warn(
                `⏳ [CENTRAL-PUB] ${idx.name} ${tf}m ${stamp} not published — latest broker candle is stale`,
              );
              return;
            }
            if (lastTimestampMs > expectedClosedBoundaryMs) {
              console.warn(
                `⏳ [CENTRAL-PUB] ${idx.name} ${tf}m ${stamp} not published — latest broker candle is still forming`,
              );
              return;
            }
            const htf =
              tf < 15 ? (await getCentralOHLC(idx.securityId, "15", 100, null)).candles || candles : candles;

            const sig = AdvancedAI.generateAdvancedSignal(candles, 100000, {
              higherTimeframeData: htf,
              timeframeMinutes: tf,
              minimumBarsBetweenSignals: 1,
              blockNewEntriesAfterMinutes: 15 * 60 + 15,
            });
            (sig as any).timestamp = lastTimestamp || Date.now();
            (sig as any).signalSource = "CENTRAL_DATA";
            await saveCentralSignal(idx.name, tf, stamp, sig);
            published++;
            console.log(`🛰️ [CENTRAL-PUB] ${idx.name} ${tf}m ${stamp} → ${sig.action} (${sig.confidence}%)`);
          } catch (e: any) {
            console.error(`❌ [CENTRAL-PUB] ${idx.name} ${tf}m: ${e?.message || e}`);
          }
        })
      )
    );
    return { published };
  }
}

export { PersistentTradingEngine };

