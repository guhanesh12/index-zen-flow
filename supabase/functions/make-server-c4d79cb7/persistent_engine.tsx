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
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { checkAndDebitTiered } from "./tiered_debit.tsx";
import { resolveAutoSymbol } from "./instrument_refresh.tsx";

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
  if (rawValue === "CE" || rawValue === "CALL") return "CE";
  if (rawValue === "PE" || rawValue === "PUT") return "PE";
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
  private static instances: Map<string, NodeJS.Timeout> = new Map();
  private static engineStates: Map<string, EngineState> = new Map();
  private static activeLoops: Set<string> = new Set();
  private static activeLoopStartedAt: Map<string, number> = new Map();
  private static monitorLoops: Map<string, Promise<void>> = new Map();
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
      // ⚡ FAST MODE: Do NOT arm-and-wait. Leave lastProcessedCandle empty so the
      // very next tick analyzes the current candle immediately (no skipped morning entry).
      engineState.lastProcessedCandle = "";
      console.log(
        `⚡ FAST MODE: Engine started for ${userId} - will analyze current ${candleInterval}M candle on next tick (no wait).`,
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

  static async runCronTick(): Promise<any> {
    // ⚡ LOCK: Prevent concurrent cron ticks (duplicate signal prevention)
    const now = Date.now();
    if (now < this.cronLockUntil) {
      console.log(`⏸️ [CRON] Skipping - already processing (lock until ${new Date(this.cronLockUntil).toISOString()})`);
      return { success: true, skipped: true, message: "Concurrent tick blocked by lock" };
    }
    this.cronLockUntil = now + 4_500; // Short lock: position monitor now runs every 1 second

    console.log(`⏱️ [CRON] Starting 24/7 Engine Tick...`);

    // ⚡ BUG FIX 2 & 3: auto-resume engines that were stopped non-explicitly (pre-market + disconnect recovery)
    try {
      const ar = await this.autoResumeEngines();
      if (ar.resumed > 0) console.log(`🔄 [CRON] Auto-resumed ${ar.resumed} engine(s), skipped ${ar.skipped}`);
    } catch (_e) {
      /* non-fatal */
    }

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

      for (const engine of activeEngines) {
        try {
          const userId = engine.user_id;
          const settings = engine.strategy_settings || {};
          const symbols = engine.selected_symbols || [];

          // Get fresh Dhan credentials from DB first; KV can be stale after reconnect/token refresh.
          const credentials = await loadDhanCredentials(userId);
          if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) {
            console.warn(`⚠️ [CRON] No Dhan credentials for user ${userId}, skipping`);
            continue;
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
            const credentials = await loadDhanCredentials(uid);
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
        const credentials = await loadDhanCredentials(userId);
        if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) return;

        const dhanService = new DhanService({
          clientId: credentials.dhanClientId,
          accessToken: credentials.dhanAccessToken,
        });

        // ⚡ AUTO-IMPORT: any open broker position not yet in position_monitor_state
        try {
          const brokerPositions = await dhanService.getPositions();
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
              const cfgTarget = Number(cfg.targetAmount ?? 0);
              const cfgStopLoss = Number(cfg.stopLossAmount ?? 0);
              const cfgTrailingEnabled = !!cfg.trailingEnabled;
              const cfgTrailingStep = Number(cfg.stopLossJumpAmount ?? cfg.trailingStep ?? 0);

              const orderId = pos.orderId || pos.order_id || `auto-${userId}-${sid || Array.from(keys)[0] || sym}`;

              await supabaseAdmin.from("position_monitor_state").upsert(
                {
                  user_id: userId,
                  order_id: orderId,
                  symbol: sym,
                  symbol_id: sid || null,
                  exchange_segment: pos.exchangeSegment || (sym.includes("SENSEX") ? "BSE_FNO" : "NSE_FNO"),
                  index_name: sym.includes("BANKNIFTY") ? "BANKNIFTY" : sym.includes("SENSEX") ? "SENSEX" : "NIFTY",
                  entry_price: entry,
                  current_price: ltp,
                  quantity: qty,
                  pnl,
                  highest_pnl: Math.max(0, pnl),
                  target_amount: cfgTarget,
                  stop_loss_amount: cfgStopLoss,
                  trailing_enabled: cfgTrailingEnabled,
                  trailing_step: cfgTrailingStep,
                  is_active: true,
                  raw_position: {
                    ...pos,
                    autoImported: true,
                    importedAt: Date.now(),
                    trailingActivationAmount: Number(cfg.trailingActivationAmount ?? 0),
                    targetJumpAmount: Number(cfg.targetJumpAmount ?? 0),
                    stopLossJumpAmount: Number(cfg.stopLossJumpAmount ?? 0),
                    sourceSymbolConfig: cfg ? { targetAmount: cfgTarget, stopLossAmount: cfgStopLoss } : null,
                  },
                },
                { onConflict: "user_id,order_id" },
              );

              keys.forEach((key) => trackedKeys.add(key));

              console.log(
                `📥 [AUTO-IMPORT] ${userId} ← ${sym} (qty ${qty}, entry ₹${entry}, P&L ₹${pnl.toFixed(2)}, Tgt ₹${cfgTarget}, SL ₹${cfgStopLoss})`,
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

      // ⚡⚡⚡ ALWAYS MONITOR ACTIVE POSITIONS (EVERY TICK) ⚡⚡⚡
      await this.monitorPositions(userId, dhanService, state);

      const candleMinutes = parseInt(state.candleInterval);
      const minutesSinceOpen = currentTimeMinutes - marketOpen;

      if (minutesSinceOpen < candleMinutes) {
        console.log(`⏳ Waiting for first ${state.candleInterval}M candle to close for user ${userId}`);
        await kv.set(`engine_state_${userId}`, state);
        return;
      }

      // Check if new candle is ready for AI analysis
      const currentCandleTimestamp = this.getCurrentCandleTimestamp(istTime, candleMinutes);
      const dbLastProcessedCandle = liveEngineState?.strategy_settings?.lastProcessedCandle || "";

      console.log(
        `📊 Candle check: current=${currentCandleTimestamp} last=${state.lastProcessedCandle} dbLast=${dbLastProcessedCandle} interval=${candleMinutes}M symbols=${state.symbols.length}`,
      );

      if (currentCandleTimestamp === state.lastProcessedCandle || currentCandleTimestamp === dbLastProcessedCandle) {
        state.lastProcessedCandle = currentCandleTimestamp;
        console.log(`⏸️ Same candle ${currentCandleTimestamp} - monitoring positions only`);
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
      const batchSignalTimestamp = Date.now();

      for (const indexName of allIndices) {
        try {
          console.log(`\n📊 Analyzing index: ${indexName}`);

          // ⚡ Fetch OHLC candles from Dhan, then run AdvancedAI strategy directly
          const securityIdMap: Record<string, string> = { NIFTY: "13", BANKNIFTY: "25", SENSEX: "51" };
          const securityId = securityIdMap[indexName] || "13";
          let aiSignal: any = null;
          try {
            const dhanSvc = new DhanService({ clientId: dhanClientId, accessToken: dhanAccessToken });
            const ohlcDataRaw = await dhanSvc.getOHLCData(securityId, String(state.candleInterval), 50);
            const real15mDataRaw =
              state.candleInterval === "15" ? ohlcDataRaw : await dhanSvc.getOHLCData(securityId, "15", 80);
            let real1hData: any[] = [];
            try {
              real1hData = await dhanSvc.getOHLCData(securityId, "60", 40);
            } catch (_e) {
              real1hData = [];
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
            const ohlcData = stripForming(ohlcDataRaw, tfMin);
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
              const lastSignalTimestamp = (await kv.get(`last_signal_ts:${userId}:${indexName}`)) || 0;
              const lastSignalDirection = (await kv.get(`last_signal_dir:${userId}:${indexName}`)) || "WAIT";
              const lastStopLossTimestamp = (await kv.get(`last_sl_ts:${userId}:${indexName}`)) || 0;
              const lastStopLossDirection = (await kv.get(`last_sl_dir:${userId}:${indexName}`)) || null;
              const consecutiveLossCount = Number((await kv.get(`loss_streak:${userId}:${indexName}`)) || 0);
              const lastLossTimestamp = Number((await kv.get(`last_loss_ts:${userId}:${indexName}`)) || 0);
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
              if (sig.action === "BUY_CALL" || sig.action === "BUY_PUT") {
                await kv.set(
                  `last_signal_ts:${userId}:${indexName}`,
                  ohlcData[ohlcData.length - 1].timestamp || Date.now(),
                );
                await kv.set(`last_signal_dir:${userId}:${indexName}`, sig.action);
              }
              aiSignal = { signal: sig };
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
            continue;
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
          if (action !== "WAIT") {
            await this.saveSignalToDB(userId, pseudoSymbol, aiSignal);
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
          };

          console.log(`🎯 ${indexName} AI Decision: ${action} | Confidence: ${confidence}%`);

          if (action !== "WAIT")
            await this.saveUserNotification(userId, {
              id: `signal_${userId}_${indexName}_${currentCandleTimestamp}_${action}`,
              type: "SIGNAL_DETECTED",
              title: action === "WAIT" ? `⏸️ ${indexName} - Market Not Suitable` : `📊 ${indexName} Signal Detected`,
              message:
                action === "WAIT"
                  ? `WAIT ${indexName}${confidence ? ` (${confidence}% confidence)` : ""}${reason ? ` - ${reason.substring(0, 60)}...` : ""}`
                  : `BUY ${indexName}${confidence ? ` (${confidence}% confidence)` : ""}`,
              timestamp: Date.now(),
              read: false,
              data: {
                index: indexName,
                symbol: indexName,
                action: action === "WAIT" ? "WAIT" : "BUY",
                confidence,
                reasoning: reason,
                timeframe: state.candleInterval,
              },
            });

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
            continue;
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
          if (reversalPosition && confidence >= 80) {
            const exitReason = `Market Reversal (${normalizeOptionType(reversalPosition.optionType || reversalPosition.symbolName) || "OLD"} → ${action === "BUY_CALL" ? "CE" : "PE"}, ${confidence}% confidence)`;
            const exitResult = await placeOrderViaStaticIP(
              userId,
              { dhanClientId, dhanAccessToken },
              {
                securityId: reversalPosition.securityId,
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
            if (exitResult.orderId || exitResult.success) {
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
              state.activePositions = state.activePositions.filter((p: any) => p.status === "ACTIVE");
            } else {
              console.log(`❌ REVERSAL EXIT FAILED for ${reversalPosition.symbolName}: ${exitResult.error}`);
              continue;
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
              .select("slot, index_name, moneyness, lot_count, enabled")
              .eq("user_id", userId)
              .eq("enabled", true)
              .eq("index_name", indexName);

            if (autoSlots && autoSlots.length > 0) {
              autoSlotCount = autoSlots.length;
              const spotLtp = Number(ohlcData[ohlcData.length - 1]?.close) || 0;
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
                    targetAmount: 0,
                    stopLossAmount: 0,
                    trailingEnabled: false,
                    __autoSlot: slot.slot,
                    __moneyness: slot.moneyness,
                  });
                  console.log(
                    `🎯 [AUTO_SYMBOL] slot ${slot.slot}: ${indexName} ${slot.moneyness} ${targetOptionType} → ${r.symbol} SID ${r.security_id} strike ${r.strike_price} lotSize ${r.lot_size} × lots ${lotCount} = qty ${finalQuantity}`,
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
              continue;
            }

            if (await this.hasRecentOrderInDB(userId, normalizedSecurityId)) {
              console.log(`⏸️ SKIPPING DUPLICATE - Recent DB order exists for ${normalizedSymbolName}`);
              this.markRecentOrderKey(orderKey);
              continue;
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
                  pnl: dbPos.pnl,
                  status: "ACTIVE",
                }));
              }
            }

            const sameIndexPosition = state.activePositions.find(
              (p: any) => p.status === "ACTIVE" && p.index && indexName && p.index === indexName,
            );
            if (
              sameIndexPosition &&
              confidence >= 90 &&
              targetOptionType &&
              normalizeOptionType(sameIndexPosition.optionType || sameIndexPosition.symbolName) !== targetOptionType
            ) {
              const exitReason = `Market Reversal (${normalizeOptionType(sameIndexPosition.optionType || sameIndexPosition.symbolName) || "OLD"} → ${targetOptionType})`;
              const exitResult = await placeOrderViaStaticIP(
                userId,
                { dhanClientId, dhanAccessToken },
                {
                  securityId: sameIndexPosition.securityId,
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
              if (exitResult.orderId || exitResult.success) {
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
                state.activePositions = state.activePositions.filter((p: any) => p.status === "ACTIVE");
              } else {
                console.log(`❌ REVERSAL EXIT FAILED for ${sameIndexPosition.symbolName}: ${exitResult.error}`);
                continue;
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
              console.log(
                `⏸️ ALREADY RUNNING - Position open for ${indexName} (${symbol.name}). Skipping ${action} on next candle.`,
              );
              continue;
            }

            // ⚡ EXECUTE ORDER!
            if (action === "BUY_CALL" || action === "BUY_PUT") {
              this.markRecentOrderKey(orderKey);
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
                orderResult = await placeOrderViaStaticIP(
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
                this.recentOrderKeys.delete(orderKey);
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
      }

      if (Object.keys(latestSignalsSnapshot).length > 0) {
        await this.saveLatestSignalsSnapshot(userId, latestSignalsSnapshot);
        state.lastProcessedCandle = currentCandleTimestamp;
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
            exit_reason: "Duplicate monitor row removed",
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
        const trailingActivationAmount = numeric(
          symbolCfg?.trailingActivationAmount,
          numeric(rawPosition.trailingActivationAmount ?? rawPosition.trailing_activation_amount),
        );
        const targetJumpAmount = numeric(
          symbolCfg?.targetJumpAmount,
          numeric(rawPosition.targetJumpAmount ?? rawPosition.target_jump_amount),
        );
        const stopLossJumpAmount = numeric(
          symbolCfg?.stopLossJumpAmount,
          numeric(rawPosition.stopLossJumpAmount ?? rawPosition.stop_loss_jump_amount ?? dbPos.trailing_step),
        );
        const trailingEnabled = symbolCfg ? !!symbolCfg.trailingEnabled : !!dbPos.trailing_enabled;
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
      const dhanPositions = await dhanService.getPositions();
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
        if (!dhanPos || dhanPos.netQty === 0) {
          // Try to read realized P&L from Dhan so we can record it
          const realizedPnl = parseFloat(
            dhanPos?.realizedProfit || dhanPos?.realizedPnl || dhanPos?.realizedPnL || position.pnl || 0,
          );

          console.log(
            `🚪 Position CLOSED externally: ${position.symbolName} | Realized P&L: ₹${realizedPnl.toFixed(2)}`,
          );
          position.status = "CLOSED";
          state.stats.totalPnL += realizedPnl;

          await supabaseAdmin
            .from("position_monitor_state")
            .update({
              is_active: false,
              exit_reason: "Position closed externally",
              exited_at: new Date().toISOString(),
              pnl: realizedPnl,
            })
            .eq("user_id", userId)
            .eq("order_id", position.orderId);

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
        const quantity = Math.abs(Number(position.quantity || dhanPos.quantity || dhanPos.netQty || 1));
        const brokerPnl = parseFloat(dhanPos.unrealizedProfit || dhanPos.unrealizedPnl || dhanPos.unrealizedPnL || 0);
        const computedPnl = entryPrice && currentPrice ? (currentPrice - entryPrice) * quantity : 0;
        const pnl = Number.isFinite(brokerPnl) && brokerPnl !== 0 ? brokerPnl : computedPnl;

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

        const _baseTarget = Number(position.targetAmount || 0);
        const _baseSL = Number(position.stopLossAmount || 0);
        // ⚡ STRICT: only use the user-entered values. NO fallback to trailingStep
        // and NO automatic defaults — trailing must be fully user-configured.
        const _activation = Number(position.trailingActivationAmount ?? 0);
        const _targetJump = Number(position.targetJumpAmount ?? 0);
        const _slJump = Number(position.stopLossJumpAmount ?? 0);

        // Trailing runs ONLY if user explicitly enabled it AND entered all three values > 0.
        // (activation > 0, target+ > 0, SL- > 0). Otherwise target/SL stay at the base values.
        const _trailingConfigured =
          position.trailingEnabled === true && _activation > 0 && _targetJump > 0 && _slJump > 0;

        if (_trailingConfigured && position.highestPnl >= _activation) {
          const profitAboveActivation = Math.max(0, position.highestPnl - _activation);
          const numberOfJumps = Math.floor(profitAboveActivation / _targetJump);
          if (numberOfJumps > 0) {
            const newTarget = _baseTarget + numberOfJumps * _targetJump;
            // SL ratchets UP (in profit direction): baseSL is the loss limit (positive number),
            // each jump reduces it by _slJump. When it crosses 0 it becomes a guaranteed profit lock.
            const newSL = _baseSL - numberOfJumps * _slJump;
            if (newTarget !== position.currentTargetAmount || newSL !== position.currentStopLossAmount) {
              const oldT = position.currentTargetAmount;
              const oldS = position.currentStopLossAmount;
              position.currentTargetAmount = newTarget;
              position.currentStopLossAmount = newSL;
              const lockMsg = newSL <= 0 ? ` 🟢 PROFIT LOCKED at ₹${Math.abs(newSL).toFixed(2)}` : "";
              console.log(
                `⚡ TRAILING RATCHET ${position.symbolName}: Tgt ₹${oldT}→₹${newTarget} | SL ₹${oldS}→₹${newSL}${lockMsg}`,
              );
              await this.appendSharedLog(userId, {
                type: "TRAILING_UPDATE",
                timestamp: Date.now(),
                symbol: position.symbolName,
                message: `⚡ Trailing ${position.symbolName}: Tgt ₹${newTarget}, SL ₹${newSL}${lockMsg} (Peak ₹${position.highestPnl.toFixed(2)}, Jumps: ${numberOfJumps})`,
                pnl,
                data: {
                  peak: position.highestPnl,
                  jumps: numberOfJumps,
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

          if (
            (normalizeOptionType(position.optionType || position.symbolName) === "CE" &&
              currentSignal.action === "BUY_PUT" &&
              Number(currentSignal.confidence || 0) >= 90) ||
            (normalizeOptionType(position.optionType || position.symbolName) === "PE" &&
              currentSignal.action === "BUY_CALL" &&
              Number(currentSignal.confidence || 0) >= 90)
          ) {
            signalShouldExit = true;
            signalExitReason = `Strong Market Reversal (AI: ${currentSignal.action}, ${currentSignal.confidence}% confidence)`;
          } else if (!isAlignedWithMarket && pnl < -200) {
            signalShouldExit = true;
            signalExitReason = `Market Not Favorable (${marketMomentum} against ${positionDirection}, P&L ₹${pnl.toFixed(2)})`;
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

        if (!shouldExit && effectiveSL <= 0 && position.trailingEnabled) {
          const lockedProfit = Math.abs(effectiveSL);
          if (pnl <= lockedProfit) {
            shouldExit = true;
            exitReason = `Trailing Stop Loss Hit (Locked: ₹${lockedProfit.toFixed(2)}, Current: ₹${pnl.toFixed(2)}, Peak: ₹${(position.highestPnl || 0).toFixed(2)})`;
          }
        }

        if (!shouldExit && signalShouldExit) {
          shouldExit = true;
          exitReason = signalExitReason;
        }

        (position as any).monitorDecision = shouldExit ? "EXIT" : monitorDecision;

        if (shouldExit) {
          console.log(`\n🚪 EXIT TRIGGERED: ${exitReason}`);

          const exitParams = {
            securityId: position.securityId,
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

          const exitResult = await placeOrderViaStaticIP(
            userId,
            {
              dhanClientId: state.dhanClientId || "",
              dhanAccessToken: state.dhanAccessToken || "",
            },
            exitParams,
          );

          if (exitResult.orderId || exitResult.success) {
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
            console.log(`❌ EXIT ORDER FAILED: ${exitResult.error}`);
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
          // ⚡ BUG FIX 2/3: mark auto_resume on every start so pre-market cron can re-arm the engine
          auto_resume: state.isRunning ? true : undefined,
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
    let resumed = 0;
    let skipped = 0;
    try {
      // Only auto-resume during market hours (or just before open)
      const now = new Date();
      const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const dow = istTime.getUTCDay();
      if (dow === 0 || dow === 6) return { resumed: 0, skipped: 0 };
      const mins = istTime.getUTCHours() * 60 + istTime.getUTCMinutes();
      if (mins < 9 * 60 + 10 || mins > 15 * 60 + 30) return { resumed: 0, skipped: 0 };

      const { data: candidates } = await supabaseAdmin
        .from("trading_engine_state")
        .select("user_id, auto_resume, stopped_reason, selected_symbols, strategy_settings")
        .eq("is_running", false)
        .eq("auto_resume", true);

      for (const row of candidates || []) {
        // Never auto-resume engines the user explicitly stopped
        if (row.stopped_reason === "user") {
          skipped++;
          continue;
        }
        const hasManualSymbols = Array.isArray(row.selected_symbols) && (row.selected_symbols as any[]).length > 0;
        let hasAutoSymbolSlots = false;
        if (!hasManualSymbols) {
          const { data: autoSlots } = await supabaseAdmin
            .from("user_symbol_config")
            .select("slot")
            .eq("user_id", row.user_id)
            .eq("enabled", true)
            .limit(1);
          hasAutoSymbolSlots = Array.isArray(autoSlots) && autoSlots.length > 0;
        }
        if (!hasManualSymbols && !hasAutoSymbolSlots) {
          skipped++;
          continue;
        }
        try {
          await supabaseAdmin
            .from("trading_engine_state")
            .update({
              is_running: true,
              started_at: new Date().toISOString(),
              last_heartbeat: new Date().toISOString(),
              stopped_at: null,
              stopped_reason: null,
            })
            .eq("user_id", row.user_id);
          await this.appendSharedLog(row.user_id, {
            id: `engine_auto_resume_${Date.now()}`,
            timestamp: Date.now(),
            type: "ENGINE_START",
            message: `🔄 AI Trading Engine AUTO-RESUMED (pre-market / disconnect recovery)`,
          });
          resumed++;
          console.log(`🔄 [AUTO-RESUME] User ${row.user_id} engine re-armed`);
        } catch (e) {
          console.error(`❌ [AUTO-RESUME] Failed for ${row.user_id}:`, e);
        }
      }
    } catch (e) {
      console.error("❌ [AUTO-RESUME] Scan failed:", e);
    }
    return { resumed, skipped };
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
      await kv.set(`latest_signals:${userId}`, {
        ...existingSnapshot,
        ...latestSignals,
        __timestamp: Date.now(),
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
      if (action === "WAIT") return;

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
}

export { PersistentTradingEngine };
