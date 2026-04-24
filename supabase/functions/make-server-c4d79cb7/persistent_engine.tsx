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

import { DhanService } from './dhan_service.tsx';
import { AdvancedAI } from './advanced_ai.tsx';
import * as kv from './kv_store.tsx';
import { placeOrderViaStaticIP } from './static_ip_helper.tsx';
import { createClient } from "npm:@supabase/supabase-js";
import { checkAndDebitTiered } from './tiered_debit.tsx';

const SUPPORTED_INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const;
type SupportedIndex = typeof SUPPORTED_INDICES[number];

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
    ''
  ).toUpperCase().replace(/\s+/g, '');

  if (rawValue.includes('BANKNIFTY')) return 'BANKNIFTY';
  if (rawValue.includes('SENSEX')) return 'SENSEX';
  return 'NIFTY';
}

function normalizeOptionType(value: any): 'CE' | 'PE' | '' {
  const rawValue = String(value ?? '').toUpperCase().trim();
  if (rawValue === 'CE' || rawValue === 'CALL') return 'CE';
  if (rawValue === 'PE' || rawValue === 'PUT') return 'PE';
  return '';
}

function resolveSymbolExchangeSegment(symbol: any): string {
  const rawValue = String(symbol?.exchangeSegment ?? symbol?.exchange_segment ?? symbol?.exchange ?? '').toUpperCase().trim();
  if (rawValue === 'BSE' || rawValue === 'BSE_FNO') return 'BSE_FNO';
  if (rawValue === 'NSE' || rawValue === 'NSE_FNO') return 'NSE_FNO';
  return normalizeIndexName(symbol) === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
}

function getSymbolDisplayName(symbol: any): string {
  return symbol?.symbolName || symbol?.name || symbol?.symbol_name || symbol?.displayName || 'UNKNOWN';
}

async function loadUserSymbolsFromDB(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_symbols')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error(`❌ Failed loading user symbols from DB for ${userId}:`, error);
      return [];
    }

    return (data || []).map((row: any) => ({
      ...(row.raw_data || {}),
      id: row.raw_data?.id || `SYM_${row.symbol_id || crypto.randomUUID()}`,
      name: row.raw_data?.name || row.symbol_name || 'UNKNOWN',
      symbolName: row.raw_data?.symbolName || row.symbol_name || 'UNKNOWN',
      displayName: row.raw_data?.displayName || row.symbol_name || 'UNKNOWN',
      index: row.raw_data?.index || row.index_name || 'NIFTY',
      indexName: row.raw_data?.indexName || row.index_name || 'NIFTY',
      optionType: row.raw_data?.optionType || row.option_type || '',
      transactionType: row.raw_data?.transactionType || 'BUY',
      exchangeSegment: row.raw_data?.exchangeSegment || row.exchange_segment || (row.index_name === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO'),
      productType: row.raw_data?.productType || 'INTRADAY',
      orderType: row.raw_data?.orderType || 'MARKET',
      validity: row.raw_data?.validity || 'DAY',
      securityId: String(row.raw_data?.securityId || row.symbol_id || ''),
      quantity: row.raw_data?.quantity || row.lot_size || 1,
      lotSize: row.raw_data?.lotSize || row.lot_size || 1,
      strikePrice: row.raw_data?.strikePrice || row.strike_price || null,
      expiry: row.raw_data?.expiry || row.expiry || null,
      active: row.raw_data?.active ?? true,
      targetAmount: row.raw_data?.targetAmount ?? 500,
      stopLossAmount: row.raw_data?.stopLossAmount ?? 300,
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

  const kvSymbols = await kv.get(`symbols:${userId}`) || [];
  const candidates = [...dbSymbols, ...kvSymbols, ...(stateSymbols || [])];
  const deduped = new Map<string, any>();

  for (const symbol of candidates) {
    const key = String(symbol?.securityId || symbol?.symbolId || symbol?.symbol_id || symbol?.id || '');
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, symbol);
    }
  }

  return Array.from(deduped.values());
}

// Supabase client for DB operations
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

interface EngineState {
  isRunning: boolean;
  userId: string;
  candleInterval: '5' | '15';
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
  candleInterval: '5' | '15';
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
  private static monitorLoops: Map<string, Promise<void>> = new Map();
  private static recentOrderKeys: Map<string, number> = new Map();
  private static readonly RECENT_ORDER_WINDOW_MS = 3 * 60 * 1000;
  private static readonly POSITION_MONITOR_INTERVAL_MS = 1000;
  
  /**
   * START ENGINE FOR USER
   */
  static async startEngine(config: EngineConfig): Promise<{ success: boolean; message: string }> {
    const { userId, candleInterval, symbols, dhanClientId, dhanAccessToken } = config;
    
    // Check if engine already running
    if (this.instances.has(userId)) {
      return {
        success: false,
        message: '⚠️ Engine already running for this user'
      };
    }
    
    // Validate symbols
    if (!symbols || symbols.length === 0) {
      return {
        success: false,
        message: '❌ No active symbols configured'
      };
    }
    
    // Initialize engine state
    const engineState: EngineState = {
      isRunning: true,
      userId,
      candleInterval,
      symbols,
      lastProcessedCandle: '',
      activePositions: [],
      stats: {
        totalSignals: 0,
        totalOrders: 0,
        totalPnL: 0
      },
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      dhanClientId,
      dhanAccessToken
    };

    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffsetMs);
    const currentTimeMinutes = (istTime.getUTCHours() * 60) + istTime.getUTCMinutes();
    const marketOpen = 9 * 60 + 15;
    const marketClose = 15 * 60 + 30;

    if (currentTimeMinutes >= marketOpen && currentTimeMinutes <= marketClose) {
      engineState.lastProcessedCandle = this.getCurrentCandleTimestamp(istTime, parseInt(candleInterval));
      console.log(`⏱️ Engine armed for ${userId} at candle ${engineState.lastProcessedCandle} - waiting for next ${candleInterval}M candle close`);
    }
    
    this.engineStates.set(userId, engineState);
    
    // Save state to KV store (legacy)
    await kv.set(`engine_state_${userId}`, engineState);
    
    // ⚡ Save to new Supabase table
    await this.saveEngineStateToDB(userId, engineState);
    
    console.log(`🚀 STARTING PERSISTENT ENGINE for user ${userId}`);
    console.log(`   Interval: ${candleInterval}M`);
    console.log(`   Symbols: ${symbols.length}`);

    const staleTimer = this.instances.get(userId);
    if (staleTimer) {
      clearInterval(staleTimer);
      this.instances.delete(userId);
    }
    
    return {
      success: true,
      message: `✅ Engine started successfully! Waiting for the next ${candleInterval}M candle close.`
    };
  }
  
  /**
   * STOP ENGINE FOR USER
   */
  static async stopEngine(userId: string): Promise<{ success: boolean; message: string }> {
    const timerId = this.instances.get(userId);
    
    if (!timerId) {
      // Even if no in-memory timer, mark DB as stopped
      await this.markEngineStoppedInDB(userId);
      return {
        success: true,
        message: '✅ Engine stopped (was running via cron)'
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
    
    return {
      success: true,
      message: '✅ Engine stopped successfully'
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
    
    try {
      // ⚡ Load active engines from Supabase DB table (more reliable than KV)
      const { data: activeEngines, error: dbError } = await supabaseAdmin
        .from('trading_engine_state')
        .select('*')
        .eq('is_running', true);
      
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
          
          // Get Dhan credentials from KV
          const credentials = await kv.get(`api_credentials:${userId}`);
          if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) {
            console.warn(`⚠️ [CRON] No Dhan credentials for user ${userId}, skipping`);
            continue;
          }
          
          // Hydrate memory state if needed
          if (!this.engineStates.has(userId)) {
            this.engineStates.set(userId, {
              isRunning: true,
              userId,
              candleInterval: settings.candleInterval || '15',
              symbols,
              lastProcessedCandle: settings.lastProcessedCandle || '',
              activePositions: [],
              stats: {
                totalSignals: settings.totalSignals || 0,
                totalOrders: settings.totalOrders || 0,
                totalPnL: settings.totalPnL || 0
              },
              startTime: new Date(engine.started_at || engine.created_at).getTime(),
              lastHeartbeat: Date.now(),
              dhanClientId: credentials.dhanClientId,
              dhanAccessToken: credentials.dhanAccessToken
            });
          }
          
          const dhanService = new DhanService({
            clientId: credentials.dhanClientId,
            accessToken: credentials.dhanAccessToken
          });
          
          // Execute engine loop
          await this.engineLoop(userId, dhanService, credentials.dhanClientId, credentials.dhanAccessToken);
          
          // Update heartbeat in DB
          await supabaseAdmin
            .from('trading_engine_state')
            .update({ last_heartbeat: new Date().toISOString() })
            .eq('user_id', userId);
          
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
          .from('position_monitor_state')
          .select('user_id')
          .eq('is_active', true);
        const orphanUserIds = Array.from(new Set(
          (orphanPositions || [])
            .map((p: any) => p.user_id)
            .filter((uid: string) => uid && !activeEngineIds.has(uid))
        ));
        for (const uid of orphanUserIds) {
          try {
            const credentials = await kv.get(`api_credentials:${uid}`);
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
      
      console.log(`⏱️ [CRON] Tick complete. Processed ${processedCount} engines + ${monitoredOnlyCount} orphan monitors.`);
      return { success: true, processed: processedCount, orphanMonitored: monitoredOnlyCount };
      
    } catch (error) {
      console.error(`❌ [CRON] Tick error:`, error);
      return { success: false, error: String(error) };
    }
  }

  static async runPositionMonitorTick(): Promise<any> {
    const startedAt = Date.now();
    let monitoredCount = 0;

    const { data: activePositions, error } = await supabaseAdmin
      .from('position_monitor_state')
      .select('user_id')
      .eq('is_active', true);

    if (error) {
      console.error('❌ [POSITION-MONITOR] Failed loading active positions:', error);
      return { success: false, error: error.message };
    }

    const userIds = Array.from(new Set((activePositions || []).map((p: any) => p.user_id).filter(Boolean)));

    for (const userId of userIds) {
      if (this.monitorLoops.has(userId)) continue;

      const loop = (async () => {
        const credentials = await kv.get(`api_credentials:${userId}`);
        if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) return;

        const dhanService = new DhanService({ clientId: credentials.dhanClientId, accessToken: credentials.dhanAccessToken });
        const state = this.engineStates.get(userId) || {
          isRunning: false,
          userId,
          candleInterval: '15',
          symbols: [],
          lastProcessedCandle: '',
          activePositions: [],
          stats: { totalSignals: 0, totalOrders: 0, totalPnL: 0 },
          startTime: startedAt,
          lastHeartbeat: startedAt,
          dhanClientId: credentials.dhanClientId,
          dhanAccessToken: credentials.dhanAccessToken,
        } as EngineState;

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
      const allEngines = await kv.getByPrefix('engine_state_');
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
            accessToken: state.dhanAccessToken
          });
          await this.engineLoop(state.userId, dhanService, state.dhanClientId, state.dhanAccessToken);
          processedCount++;
        }
      }
      return { success: true, processed: processedCount, source: 'kv_fallback' };
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
      const { data } = await supabaseAdmin
        .from('trading_engine_state')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (data) {
        // Also load active positions from DB
        const { data: positions } = await supabaseAdmin
          .from('position_monitor_state')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);
        
        // Load today's stats
        const today = new Date().toISOString().split('T')[0];
        const { data: stats } = await supabaseAdmin
          .from('signal_stats')
          .select('*')
          .eq('user_id', userId)
          .eq('stat_date', today)
          .maybeSingle();
        
        return {
          isRunning: data.is_running,
          candleInterval: data.strategy_settings?.candleInterval || '15',
          symbols: data.selected_symbols || [],
          activePositions: positions || [],
          stats: {
            totalSignals: stats?.signal_count || 0,
            totalOrders: stats?.order_count || 0,
            totalPnL: stats?.total_pnl || 0
          },
          startTime: data.started_at ? new Date(data.started_at).getTime() : 0,
          lastHeartbeat: data.last_heartbeat ? new Date(data.last_heartbeat).getTime() : 0,
          source: 'database'
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
    dhanAccessToken: string
  ): Promise<void> {
    if (this.activeLoops.has(userId)) {
      console.log(`⏸️ Skipping overlapping engine loop for ${userId}`);
      return;
    }

    const state = this.engineStates.get(userId);
    if (!state || !state.isRunning) {
      console.log(`⚠️ Engine loop called but state not found or not running for ${userId}`);
      return;
    }

    this.activeLoops.add(userId);
    
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
      const marketOpen = 9 * 60 + 15;  // 9:15 AM
      const marketClose = 15 * 60 + 30; // 3:30 PM
      
      console.log(`⏰ IST Time: ${hours}:${minutes.toString().padStart(2,'0')} (${currentTimeMinutes}min) | Market: ${marketOpen}-${marketClose}`);
      
      if (currentTimeMinutes < marketOpen || currentTimeMinutes > marketClose) {
        console.log(`💤 Market closed (IST ${hours}:${minutes.toString().padStart(2,'0')}) - Engine idle for user ${userId}`);
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
      const dbLastProcessedCandle = liveEngineState?.strategy_settings?.lastProcessedCandle || '';
      
      console.log(`📊 Candle check: current=${currentCandleTimestamp} last=${state.lastProcessedCandle} dbLast=${dbLastProcessedCandle} interval=${candleMinutes}M symbols=${state.symbols.length}`);
      
      if (currentCandleTimestamp === state.lastProcessedCandle || currentCandleTimestamp === dbLastProcessedCandle) {
        state.lastProcessedCandle = currentCandleTimestamp;
        console.log(`⏸️ Same candle ${currentCandleTimestamp} - monitoring positions only`);
        await kv.set(`engine_state_${userId}`, state);
        return;
      }
      
      console.log(`\n🔥 NEW CANDLE DETECTED! Processing ${state.candleInterval}M candle at ${currentCandleTimestamp}`);
      
      // Mark as processed
      state.lastProcessedCandle = currentCandleTimestamp;
      await this.saveEngineStateToDB(userId, state);
      
      // ⚡⚡⚡ ANALYZE ALL 3 INDICES INDEPENDENTLY (like frontend does) ⚡⚡⚡
      const allIndices = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
      const analyzedIndices = new Set<string>();
      const latestSignalsSnapshot: Record<string, any> = {};
      
      for (const indexName of allIndices) {
        try {
          console.log(`\n📊 Analyzing index: ${indexName}`);
          
          const aiSignal = await AdvancedAI.analyzeMarket(
            dhanService,
            indexName,
            state.candleInterval,
            100000
          );
          
          analyzedIndices.add(indexName);
          state.stats.totalSignals++;
          
          if (!aiSignal || !aiSignal.signal) {
            console.log(`⚠️ No signal generated for ${indexName} (analyzeMarket returned null)`);
            // Save as WAIT instead of NONE when AI fails
            const pseudoSymbol = { index: indexName, symbolName: indexName, name: indexName };
            await this.saveSignalToDB(userId, pseudoSymbol, { signal: { action: 'WAIT', confidence: 0, reasoning: 'AI analysis failed - no data' } });
            continue;
          }

          // ⚡ Save signal to database AFTER validation (not before!)
          const pseudoSymbol = { index: indexName, symbolName: indexName, name: indexName };
          await this.saveSignalToDB(userId, pseudoSymbol, aiSignal);
          await this.incrementSignalStats(userId, 'signal');

          const action = aiSignal.signal.action;
          const confidence = aiSignal.signal.confidence;
          const reason = aiSignal.signal.reason || '';
          const signalTimestamp = Date.now();

          latestSignalsSnapshot[indexName] = {
            ...aiSignal.signal,
            index: indexName,
            timeframe: aiSignal.signal.timeframe || `${state.candleInterval}M`,
            timestamp: signalTimestamp,
          };

          console.log(`🎯 ${indexName} AI Decision: ${action} | Confidence: ${confidence}%`);

          await this.saveUserNotification(userId, {
            id: `signal_${userId}_${indexName}_${currentCandleTimestamp}_${action}`,
            type: 'SIGNAL_DETECTED',
            title: action === 'WAIT'
              ? `⏸️ ${indexName} - Market Not Suitable`
              : `📊 ${indexName} Signal Detected`,
            message: action === 'WAIT'
              ? `WAIT ${indexName}${confidence ? ` (${confidence}% confidence)` : ''}${reason ? ` - ${reason.substring(0, 60)}...` : ''}`
              : `BUY ${indexName}${confidence ? ` (${confidence}% confidence)` : ''}`,
            timestamp: Date.now(),
            read: false,
            data: {
              index: indexName,
              symbol: indexName,
              action: action === 'WAIT' ? 'WAIT' : 'BUY',
              confidence,
              reasoning: reason,
              timeframe: state.candleInterval,
            }
          });

          // ⚡ Save signal log to user's persistent logs
          await this.appendSharedLog(userId, {
            type: action === 'WAIT' ? 'WAIT' : action.includes('BUY') ? 'AI_SIGNAL' : 'INFO',
            timestamp: signalTimestamp,
            message: `🎯 ${indexName}: ${action} (${confidence}%) - ${reason || 'AI analysis complete'} | TF: ${state.candleInterval}M`,
            data: {
              index: indexName,
              action,
              confidence,
              timeframe: `${state.candleInterval}M`,
              reasoning: aiSignal.signal.reasoning || aiSignal.signal.reason || '',
              confirmations: aiSignal.signal.confirmations?.details || [],
              confirmationsPassed: aiSignal.signal.confirmations?.total || 0,
              patterns: aiSignal.signal.patterns || [],
              marketRegime: aiSignal.signal.marketRegime || {},
              volumeAnalysis: aiSignal.signal.volumeAnalysis || {},
              riskManagement: aiSignal.signal.riskManagement || {},
              indicators: aiSignal.signal.indicators || {},
            }
          });

          // Check if we should trade (only for symbols that match this index)
          if (action === 'WAIT' || confidence < 85) {
            console.log(`⏸️ ${indexName} SKIPPING - Low confidence or WAIT signal`);
            continue;
          }
          
          const freshSymbols = await getFreshSymbolsForEngine(userId, state.symbols || []);
          if (freshSymbols.length !== (state.symbols || []).length) {
            state.symbols = freshSymbols;
            await kv.set(`engine_state_${userId}`, state);
            await this.saveEngineStateToDB(userId, state);
          }

          // Find matching symbols for this index to place orders
          // ⚡ BUY_CALL → only CE/CALL symbols, BUY_PUT → only PE/PUT symbols for the SAME index only
          const targetOptionType = action === 'BUY_CALL' ? 'CE' : action === 'BUY_PUT' ? 'PE' : '';
          const symbolsForIndex = state.symbols.filter(s => normalizeIndexName(s) === indexName);
          const matchingSymbols = symbolsForIndex.filter(s => {
            if (s.active === false) return false;
            if (normalizeOptionType(s.optionType || s.option_type) !== targetOptionType) return false;
            if (!s.securityId && !s.symbolId && !s.symbol_id) return false;
            return true;
          });

          console.log(`🔍 ${indexName} ${action}: Found ${matchingSymbols.length} matching symbols (from ${symbolsForIndex.length} total for index, targetOptionType=${targetOptionType})`);
          if (matchingSymbols.length === 0) {
            console.log(`⚠️ NO MATCHING SYMBOLS for ${indexName} ${action}! Symbols for index:`, JSON.stringify(symbolsForIndex.map(s => ({ name: s.name, optionType: s.optionType || s.option_type, active: s.active, securityId: s.securityId || s.symbolId || s.symbol_id })), null, 2));
            await this.appendSharedLog(userId, {
              type: 'ERROR',
              timestamp: Date.now(),
              message: `❌ ${indexName} ${action} signal skipped - no matching active ${targetOptionType || 'option'} symbol found for order placement`,
              data: {
                index: indexName,
                action,
                targetOptionType,
                symbolsForIndex: symbolsForIndex.map(s => ({
                  name: getSymbolDisplayName(s),
                  index: normalizeIndexName(s),
                  optionType: normalizeOptionType(s.optionType || s.option_type),
                  active: s.active !== false,
                  securityId: String(s.securityId || s.symbolId || s.symbol_id || ''),
                })),
              }
            });
          }
          
          for (const symbol of matchingSymbols) {
            const normalizedExchangeSegment = resolveSymbolExchangeSegment(symbol);
            const normalizedSymbolName = getSymbolDisplayName(symbol);
            const normalizedOptionType = normalizeOptionType(symbol.optionType || symbol.option_type);
            const normalizedSecurityId = String(symbol.securityId || symbol.symbolId || symbol.symbol_id || '');
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
                .from('position_monitor_state')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true);
              if (dbPositions && dbPositions.length > 0) {
                state.activePositions = dbPositions.map((dbPos: any) => ({
                  orderId: dbPos.order_id,
                  symbolName: dbPos.symbol,
                  securityId: dbPos.symbol_id,
                  index: dbPos.index_name,
                  status: 'ACTIVE',
                }));
              }
            }

            const hasPosition = state.activePositions.some((p: any) =>
              p.status === 'ACTIVE' && (
                p.symbolName === normalizedSymbolName ||
                p.securityId === normalizedSecurityId ||
                (p.index && indexName && p.index === indexName)
              )
            );

            if (hasPosition) {
              console.log(`⏸️ ALREADY RUNNING - Position open for ${indexName} (${symbol.name}). Skipping ${action} on next candle.`);
              continue;
            }
            
            // ⚡ EXECUTE ORDER!
            if (action === 'BUY_CALL' || action === 'BUY_PUT') {
              this.markRecentOrderKey(orderKey);
              console.log(`\n💰 PLACING ORDER: ${normalizedSymbolName} (${normalizedOptionType || symbol.optionType || symbol.option_type || 'UNKNOWN'}) for ${action} on ${normalizedExchangeSegment}`);

              const orderParams = {
                securityId: normalizedSecurityId,
                transactionType: 'BUY',
                exchangeSegment: normalizedExchangeSegment,
                productType: symbol.productType || symbol.product_type || 'INTRADAY',
                orderType: symbol.orderType || symbol.order_type || 'MARKET',
                validity: symbol.validity || 'DAY',
                quantity: symbol.quantity || symbol.lotSize || symbol.lot_size || 15,
                disclosedQuantity: symbol.disclosedQuantity || symbol.disclosed_quantity || 0,
                price: symbol.price || 0,
                triggerPrice: symbol.triggerPrice || symbol.trigger_price || 0,
                afterMarketOrder: Boolean(symbol.afterMarketOrder || symbol.after_market_order),
                amoTime: symbol.amoTime || symbol.amo_time || '',
                boProfitValue: symbol.boProfitValue || symbol.bo_profit_value || 0,
                boStopLossValue: symbol.boStopLossValue || symbol.bo_stop_loss_value || 0
              };
              
              const orderResult = await placeOrderViaStaticIP(
                userId,
                {
                  dhanClientId: dhanClientId,
                  dhanAccessToken: dhanAccessToken
                },
                orderParams
              );
              
              if (orderResult.orderId) {
                console.log(`✅ ORDER PLACED! ID: ${orderResult.orderId}`);
                
                const positionData = {
                  orderId: orderResult.orderId,
                  symbolName: normalizedSymbolName,
                  securityId: normalizedSecurityId,
                  optionType: normalizedOptionType || 'CE',
                  exchangeSegment: normalizedExchangeSegment,
                  index: indexName,
                  entryPrice: orderResult.averagePrice || orderResult.price || 0,
                  currentPrice: orderResult.averagePrice || orderResult.price || 0,
                  quantity: symbol.quantity || symbol.lotSize || symbol.lot_size || 15,
                  targetAmount: symbol.targetAmount || 500,
                  stopLossAmount: symbol.stopLossAmount || 300,
                  trailingEnabled: symbol.trailingEnabled || false,
                  trailingActivationAmount: symbol.trailingActivationAmount || 0,
                  targetJumpAmount: symbol.targetJumpAmount || 0,
                  stopLossJumpAmount: symbol.stopLossJumpAmount || 0,
                  pnl: 0,
                  entryTime: Date.now(),
                  status: 'ACTIVE'
                };
                
                state.activePositions.push(positionData);
                state.stats.totalOrders++;
                
                // ⚡ Save order to database
                await this.saveOrderToDB(userId, symbol, orderResult, action);
                
                // ⚡ Save position to database
                await this.savePositionToDB(userId, positionData, symbol);
                
                // ⚡ Update order stats
                await this.incrementSignalStats(userId, 'order');
                
                // Save log to user's logs
                await this.appendSharedLog(userId, {
                  type: 'ORDER_PLACED',
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
                  }
                });

                await this.saveUserNotification(userId, {
                  id: `order_${orderResult.orderId}`,
                  type: 'ORDER_PLACED',
                  title: '💰 Order Placed',
                  message: `BUY ${symbol.quantity || 15} x ${symbol.name} @ ₹${(orderResult.averagePrice || orderResult.price || 0).toFixed(2)}`,
                  timestamp: Date.now(),
                  read: false,
                  data: {
                    index: indexName,
                    symbol: symbol.name,
                    quantity: symbol.quantity || 15,
                    price: orderResult.averagePrice || orderResult.price || 0,
                    action: 'BUY',
                    orderId: orderResult.orderId,
                  }
                });
              } else {
                console.log(`❌ ORDER FAILED: ${orderResult.error}`);
                await this.saveOrderToDB(userId, symbol, orderResult, action, 'failed');
                this.recentOrderKeys.delete(orderKey);
              }
            }
          }
          
        } catch (error) {
          console.error(`❌ Error analyzing ${indexName}:`, error);
        }
      }

      if (Object.keys(latestSignalsSnapshot).length > 0) {
        await this.saveLatestSignalsSnapshot(userId, latestSignalsSnapshot);
      }
      
      // Save state to KV (legacy)
      await kv.set(`engine_state_${userId}`, state);
      
      // ⚡ Update engine state in DB
      await this.saveEngineStateToDB(userId, state);
      
      console.log(`✅ Engine loop complete | Signals: ${state.stats.totalSignals} | Orders: ${state.stats.totalOrders}`);
      
    } catch (error) {
      console.error(`❌ Engine loop error for ${userId}:`, error);
      await kv.set(`engine_error_${userId}_${Date.now()}`, {
        timestamp: Date.now(),
        error: String(error)
      });
    } finally {
      this.activeLoops.delete(userId);
    }
  }
  
  /**
   * ⚡⚡⚡ MONITOR ACTIVE POSITIONS ⚡⚡⚡
   */
  private static async monitorPositions(
    userId: string,
    dhanService: DhanService,
    state: EngineState
  ): Promise<void> {
    // Always refresh active positions from DB so edited Target/SL and trailing settings apply immediately
    const { data: dbPositions } = await supabaseAdmin
      .from('position_monitor_state')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (dbPositions && dbPositions.length > 0) {
      const dbOrderIds = new Set(dbPositions.map((p: any) => p.order_id));
      state.activePositions = state.activePositions.filter((p: any) => dbOrderIds.has(p.orderId));

      for (const dbPos of dbPositions) {
        const existing = state.activePositions.find((p: any) => p.orderId === dbPos.order_id);
        const dbState = {
            orderId: dbPos.order_id,
            symbolName: dbPos.symbol,
            securityId: dbPos.symbol_id,
            exchangeSegment: dbPos.exchange_segment,
            index: dbPos.index_name,
            entryPrice: dbPos.entry_price,
            currentPrice: dbPos.current_price,
            quantity: dbPos.quantity,
            targetAmount: dbPos.target_amount,
            stopLossAmount: dbPos.stop_loss_amount,
            pnl: dbPos.pnl,
            highestPnl: dbPos.highest_pnl,
            trailingEnabled: dbPos.trailing_enabled,
            trailingStep: dbPos.trailing_step,
            entryTime: new Date(dbPos.created_at).getTime(),
            status: 'ACTIVE'
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
      type: 'POSITION_MONITOR_TICK',
      timestamp: Date.now(),
      message: `🔍 Position monitor tick — checking ${state.activePositions.length} active position(s)`,
    });
    
    try {
      // Fetch fresh positions from Dhan
      const dhanPositions = await dhanService.getPositions();
      
      for (const position of state.activePositions) {
        if (position.status !== 'ACTIVE') continue;
        
        // Find matching Dhan position
        const dhanPos = dhanPositions.find((dp: any) => 
          dp.tradingSymbol === position.symbolName || 
          dp.securityId === position.securityId?.toString()
        );
        
        // Check if position is closed
        if (!dhanPos || dhanPos.netQty === 0) {
          // Try to read realized P&L from Dhan so we can record it
          const realizedPnl = parseFloat(
            dhanPos?.realizedProfit ||
            dhanPos?.realizedPnl ||
            dhanPos?.realizedPnL ||
            position.pnl ||
            0
          );

          console.log(`🚪 Position CLOSED externally: ${position.symbolName} | Realized P&L: ₹${realizedPnl.toFixed(2)}`);
          position.status = 'CLOSED';
          state.stats.totalPnL += realizedPnl;

          await supabaseAdmin
            .from('position_monitor_state')
            .update({ 
              is_active: false, 
              exit_reason: 'Position closed externally',
              exited_at: new Date().toISOString(),
              pnl: realizedPnl,
            })
            .eq('user_id', userId)
            .eq('order_id', position.orderId);

          // ⚡ Record into signal_stats so wallet auto-debit can read today's profit
          await this.updatePnLStats(userId, realizedPnl);

          // 💰 Trigger wallet auto-debit (server-side, no browser required)
          await this.runWalletAutoDebit(userId, state).catch((err) => {
            console.error(`❌ Wallet auto-debit failed for ${userId}:`, err);
          });

          await this.appendSharedLog(userId, {
            type: 'POSITION_CLOSED',
            timestamp: Date.now(),
            symbol: position.symbolName,
            message: `🚪 ${position.symbolName} closed externally | P&L: ${realizedPnl >= 0 ? '+' : ''}₹${realizedPnl.toFixed(2)}`,
            reason: 'Position closed externally',
            pnl: realizedPnl,
          });
          
          continue;
        }
        
        // Update P&L
        const currentPrice = parseFloat(dhanPos.lastPrice || dhanPos.ltp || position.currentPrice);
        const pnl = parseFloat(dhanPos.unrealizedProfit || dhanPos.unrealizedPnl || 0);
        
        position.currentPrice = currentPrice;
        position.pnl = pnl;
        
        // Track highest P&L for trailing
        if (!position.highestPnl || pnl > position.highestPnl) {
          position.highestPnl = pnl;
        }
        
        console.log(`📊 ${position.symbolName} | P&L: ₹${pnl.toFixed(2)} | Highest: ₹${(position.highestPnl || 0).toFixed(2)}`);

        // ⚡ Push monitor heartbeat into shared logs (visible in UI)
        await this.appendSharedLog(userId, {
          type: 'POSITION_MONITOR',
          timestamp: Date.now(),
          symbol: position.symbolName,
          message: `📊 ${position.symbolName} | LTP ₹${currentPrice.toFixed(2)} | P&L ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)} | Peak ₹${(position.highestPnl || 0).toFixed(2)} | Target ₹${position.targetAmount || 0} | SL ₹${position.stopLossAmount || 0}`,
          pnl,
          data: {
            symbol: position.symbolName,
            currentPrice,
            pnl,
            highestPnl: position.highestPnl || 0,
            targetAmount: position.targetAmount,
            stopLossAmount: position.stopLossAmount,
          }
        });
        
        // ⚡ Update position in DB (also persist entry_price the first time we see it)
        await supabaseAdmin
          .from('position_monitor_state')
          .update({
            current_price: currentPrice,
            entry_price: position.entryPrice || parseFloat(dhanPos.buyAvg || dhanPos.costPrice || 0),
            pnl: pnl,
            highest_pnl: position.highestPnl || 0,
            raw_position: dhanPos
          })
          .eq('user_id', userId)
          .eq('order_id', position.orderId);
        
        // Check exit conditions
        let shouldExit = false;
        let exitReason = '';
        
        // Stop Loss
        if (pnl <= -(position.stopLossAmount || 300)) {
          shouldExit = true;
          exitReason = `Stop Loss Hit (₹${pnl.toFixed(2)})`;
        }
        // Target
        else if (pnl >= (position.targetAmount || 500)) {
          shouldExit = true;
          exitReason = `Target Achieved (₹${pnl.toFixed(2)})`;
        }
        // Trailing Stop Loss
        else if (position.trailingEnabled && position.highestPnl > 0) {
          const trailingStep = position.trailingStep || 50;
          const trailTrigger = position.highestPnl - trailingStep;
          if (pnl <= trailTrigger && pnl > 0) {
            shouldExit = true;
            exitReason = `Trailing SL Hit (Peak: ₹${position.highestPnl.toFixed(2)}, Current: ₹${pnl.toFixed(2)})`;
          }
        }
        
        if (shouldExit) {
          console.log(`\n🚪 EXIT TRIGGERED: ${exitReason}`);
          
          const exitParams = {
            securityId: position.securityId,
            transactionType: 'SELL',
            exchangeSegment: position.exchangeSegment || (position.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO'),
            productType: 'INTRADAY',
            orderType: 'MARKET',
            validity: 'DAY',
            quantity: position.quantity,
            disclosedQuantity: 0,
            price: 0,
            triggerPrice: 0,
            afterMarketOrder: false,
            amoTime: '',
            boProfitValue: 0,
            boStopLossValue: 0
          };
          
          const exitResult = await placeOrderViaStaticIP(
            userId,
            {
              dhanClientId: state.dhanClientId || '',
              dhanAccessToken: state.dhanAccessToken || ''
            },
            exitParams
          );
          
          if (exitResult.orderId || exitResult.success) {
            console.log(`✅ EXIT ORDER PLACED! ${exitReason}`);
            position.status = 'CLOSED';
            state.stats.totalPnL += pnl;
            
            // ⚡ Update position in DB
            await supabaseAdmin
              .from('position_monitor_state')
              .update({
                is_active: false,
                exit_reason: exitReason,
                exited_at: new Date().toISOString(),
                pnl: pnl
              })
              .eq('user_id', userId)
              .eq('order_id', position.orderId);
            
            // ⚡ Update P&L in stats
            await this.updatePnLStats(userId, pnl);

            // 💰 AUTO-DEBIT WALLET on realized profit (server-side, no browser required)
            await this.runWalletAutoDebit(userId, state).catch((err) => {
              console.error(`❌ Wallet auto-debit failed for ${userId}:`, err);
            });
            
            // Save log
            await kv.set(`engine_log_${userId}_${Date.now()}`, {
              type: 'POSITION_CLOSED',
              timestamp: Date.now(),
              symbol: position.symbolName,
              reason: exitReason,
              pnl: pnl
            });

            await this.appendSharedLog(userId, {
              type: 'POSITION_CLOSED',
              timestamp: Date.now(),
              message: `🚪 POSITION CLOSED: ${position.symbolName} | ${exitReason} | P&L: ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}`,
              symbol: position.symbolName,
              pnl,
              reason: exitReason,
              data: {
                symbol: position.symbolName,
                pnl,
                exitReason,
                orderId: position.orderId,
              }
            });

            await this.saveUserNotification(userId, {
              id: `exit_${position.orderId}_${Date.now()}`,
              type: 'POSITION_CLOSED',
              title: pnl >= 0 ? '🎉 Position Closed' : '📉 Position Closed',
              message: `${position.symbolName} | ${exitReason} | P&L: ${pnl >= 0 ? '+' : ''}₹${pnl.toFixed(2)}`,
              timestamp: Date.now(),
              read: false,
              data: {
                symbol: position.symbolName,
                pnl,
                exitReason,
              }
            });
          } else {
            console.log(`❌ EXIT ORDER FAILED: ${exitResult.error}`);
          }
        }
      }
      
      // Remove closed positions from memory
      state.activePositions = state.activePositions.filter(p => p.status === 'ACTIVE');
      
    } catch (error) {
      console.error('❌ Position monitoring error:', error);
    }
  }

  // ==================== DATABASE HELPERS ====================

  /**
   * Save engine state to trading_engine_state table
   */
  private static async saveEngineStateToDB(userId: string, state: EngineState): Promise<void> {
    try {
      await supabaseAdmin
        .from('trading_engine_state')
        .upsert({
          user_id: userId,
          is_running: state.isRunning,
          selected_symbols: state.symbols,
          strategy_settings: {
            candleInterval: state.candleInterval,
            lastProcessedCandle: state.lastProcessedCandle,
            totalSignals: state.stats.totalSignals,
            totalOrders: state.stats.totalOrders,
            totalPnL: state.stats.totalPnL
          },
          started_at: state.isRunning ? new Date(state.startTime).toISOString() : null,
          last_heartbeat: new Date().toISOString()
        }, { onConflict: 'user_id' });
    } catch (err) {
      console.error('❌ Failed to save engine state to DB:', err);
    }
  }

  /**
   * Mark engine as stopped in DB
   */
  private static async markEngineStoppedInDB(userId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('trading_engine_state')
        .update({
          is_running: false,
          stopped_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString()
        })
        .eq('user_id', userId);
    } catch (err) {
      console.error('❌ Failed to mark engine stopped in DB:', err);
    }
  }

  private static async saveUserNotification(userId: string, notification: any): Promise<void> {
    try {
      const existingNotifications = await kv.get(`user_notifications:${userId}`) || [];
      const duplicateExists = existingNotifications.some((existing: any) =>
        (existing?.id && notification?.id && existing.id === notification.id) ||
        (
          existing?.type === notification?.type &&
          existing?.title === notification?.title &&
          existing?.message === notification?.message &&
          Math.abs((existing?.timestamp || 0) - (notification?.timestamp || 0)) <= 60000
        )
      );

      if (duplicateExists) return;

      existingNotifications.unshift(notification);
      if (existingNotifications.length > 100) {
        existingNotifications.length = 100;
      }

      await kv.set(`user_notifications:${userId}`, existingNotifications);
    } catch (err) {
      console.error('❌ Failed to save user notification:', err);
    }
  }

  private static async appendSharedLog(userId: string, logEntry: any): Promise<void> {
    try {
      const existingLogs = await kv.get(`logs:${userId}`) || [];
      existingLogs.unshift(logEntry);
      if (existingLogs.length > 500) {
        existingLogs.length = 500;
      }
      await kv.set(`logs:${userId}`, existingLogs);
    } catch (err) {
      console.error('❌ Failed to append shared log:', err);
    }
  }

  private static async saveLatestSignalsSnapshot(userId: string, latestSignals: Record<string, any>): Promise<void> {
    try {
      const existingSnapshot = await kv.get(`latest_signals:${userId}`) || {};
      await kv.set(`latest_signals:${userId}`, {
        ...existingSnapshot,
        ...latestSignals,
        __timestamp: Date.now(),
      });
    } catch (err) {
      console.error('❌ Failed to save latest signals snapshot:', err);
    }
  }

  /**
   * Save signal to trading_signals table
   */
  private static async saveSignalToDB(userId: string, symbol: any, aiSignal: any): Promise<void> {
    try {
      const normalizedIndex = normalizeIndexName(symbol);
      const normalizedSymbolName = getSymbolDisplayName(symbol);
      const normalizedOptionType = normalizeOptionType(symbol.optionType || symbol.option_type);

      await supabaseAdmin
        .from('trading_signals')
        .insert({
          user_id: userId,
          symbol: normalizedSymbolName,
          signal_type: aiSignal?.signal?.action || 'WAIT',
          index_name: normalizedIndex,
          price: aiSignal?.signal?.price || null,
          strike_price: symbol.strikePrice || symbol.strike_price || null,
          option_type: normalizedOptionType || null,
          expiry: symbol.expiry || null,
          confidence: aiSignal?.signal?.confidence || 0,
          raw_data: aiSignal || {},
          status: 'detected'
        });
    } catch (err) {
      console.error('❌ Failed to save signal to DB:', err);
    }
  }

  /**
   * Save order to trading_orders table
   */
  private static async saveOrderToDB(userId: string, symbol: any, orderResult: any, action: string, status: string = 'completed'): Promise<void> {
    try {
      const normalizedIndex = normalizeIndexName(symbol);
      const normalizedSymbolName = getSymbolDisplayName(symbol);
      const normalizedExchangeSegment = resolveSymbolExchangeSegment(symbol);

      await supabaseAdmin
        .from('trading_orders')
        .insert({
          user_id: userId,
          symbol: normalizedSymbolName,
          index_name: normalizedIndex,
          order_type: symbol.orderType || symbol.order_type || 'MARKET',
          transaction_type: 'BUY',
          quantity: symbol.quantity || symbol.lotSize || symbol.lot_size || 15,
          price: orderResult.averagePrice || orderResult.price || 0,
          dhan_order_id: orderResult.orderId || null,
          exchange_segment: normalizedExchangeSegment,
          symbol_id: String(symbol.securityId || symbol.symbolId || symbol.symbol_id || '') || null,
          status: status,
          error_message: orderResult.error || null,
          raw_response: orderResult || {}
        });
    } catch (err) {
      console.error('❌ Failed to save order to DB:', err);
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

      await supabaseAdmin
        .from('position_monitor_state')
        .upsert({
          user_id: userId,
          order_id: position.orderId,
          symbol: normalizedSymbolName,
          index_name: normalizedIndex,
          symbol_id: position.securityId?.toString() || String(symbol.securityId || symbol.symbolId || symbol.symbol_id || '') || null,
          exchange_segment: normalizedExchangeSegment,
          entry_price: position.entryPrice || 0,
          current_price: position.currentPrice || 0,
          quantity: position.quantity || 15,
          pnl: 0,
          target_amount: position.targetAmount || 500,
          stop_loss_amount: position.stopLossAmount || 300,
          trailing_enabled: position.trailingEnabled || false,
          trailing_step: position.trailingStep || 50,
          highest_pnl: 0,
          is_active: true
        }, { onConflict: 'user_id,order_id' });
    } catch (err) {
      console.error('❌ Failed to save position to DB:', err);
    }
  }

  /**
   * Increment signal stats for today
   */
  private static async incrementSignalStats(userId: string, type: 'signal' | 'order' | 'speed'): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Try to get existing row
      const { data: existing } = await supabaseAdmin
        .from('signal_stats')
        .select('*')
        .eq('user_id', userId)
        .eq('stat_date', today)
        .maybeSingle();
      
      if (existing) {
        const updates: any = {};
        if (type === 'signal') updates.signal_count = (existing.signal_count || 0) + 1;
        if (type === 'order') updates.order_count = (existing.order_count || 0) + 1;
        if (type === 'speed') updates.speed_count = (existing.speed_count || 0) + 1;
        
        await supabaseAdmin
          .from('signal_stats')
          .update(updates)
          .eq('id', existing.id);
      } else {
        await supabaseAdmin
          .from('signal_stats')
          .insert({
            user_id: userId,
            stat_date: today,
            signal_count: type === 'signal' ? 1 : 0,
            order_count: type === 'order' ? 1 : 0,
            speed_count: type === 'speed' ? 1 : 0
          });
      }
    } catch (err) {
      console.error('❌ Failed to update signal stats:', err);
    }
  }

  /**
   * Update P&L in signal stats
   */
  private static async updatePnLStats(userId: string, pnl: number): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: existing } = await supabaseAdmin
        .from('signal_stats')
        .select('*')
        .eq('user_id', userId)
        .eq('stat_date', today)
        .maybeSingle();
      
      if (existing) {
        await supabaseAdmin
          .from('signal_stats')
          .update({
            total_pnl: (existing.total_pnl || 0) + pnl,
            successful_orders: pnl > 0 ? (existing.successful_orders || 0) + 1 : existing.successful_orders,
            failed_orders: pnl <= 0 ? (existing.failed_orders || 0) + 1 : existing.failed_orders
          })
          .eq('id', existing.id);
      }
    } catch (err) {
      console.error('❌ Failed to update P&L stats:', err);
    }
  }

  /**
   * 💰 Server-side wallet auto-debit. Computes today's realized profit from
   * signal_stats and triggers tiered debit. Runs on every position close so
   * commission is deducted automatically without needing the browser open.
   */
  private static async runWalletAutoDebit(userId: string, _state: EngineState): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: stats } = await supabaseAdmin
        .from('signal_stats')
        .select('total_pnl')
        .eq('user_id', userId)
        .eq('stat_date', today)
        .maybeSingle();

      const todayProfit = Number(stats?.total_pnl || 0);
      if (todayProfit <= 100) {
        return; // FREE tier
      }

      let email = '';
      try {
        const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
        email = userRes?.user?.email || '';
      } catch (_e) {
        console.warn(`⚠️ Could not resolve email for ${userId}`);
      }

      const platformOwnerEmail = Deno.env.get('PLATFORM_OWNER_EMAIL') || '';
      const result = await checkAndDebitTiered(userId, email, todayProfit, platformOwnerEmail);

      if (result.deducted) {
        console.log(`💳 [AUTO-DEBIT] ₹${result.amount} debited from ${userId} (${result.currentTier})`);
        await this.appendSharedLog(userId, {
          type: 'WALLET_DEBIT',
          timestamp: Date.now(),
          message: `💳 ₹${result.amount} auto-debited (${result.currentTier}) | Profit: ₹${todayProfit.toFixed(2)} | Balance: ₹${result.newBalance}`,
          data: { amount: result.amount, tier: result.currentTier, newBalance: result.newBalance, profit: todayProfit }
        });
      } else if (result.error === 'Insufficient wallet balance') {
        await this.appendSharedLog(userId, {
          type: 'WALLET_ERROR',
          timestamp: Date.now(),
          message: `⚠️ Wallet auto-debit failed: insufficient balance (need ₹${result.required}, have ₹${result.available})`,
          data: result
        });
      }
    } catch (err: any) {
      console.error(`❌ runWalletAutoDebit error for ${userId}:`, err?.message || err);
    }
  }


  private static async cleanupOldSignals(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabaseAdmin
        .from('trading_signals')
        .delete()
        .lt('created_at', cutoff);
      
      if (!error) {
        console.log(`🧹 Cleaned up signals older than 24 hours`);
      }
    } catch (err) {
      console.error('❌ Failed to cleanup old signals:', err);
    }
  }
  
  /**
   * Get interval in milliseconds
   */
  private static getIntervalMilliseconds(interval: '5' | '15'): number {
    return 1000; // Run every 1 second
  }

  private static async getLiveEngineState(userId: string): Promise<{ is_running: boolean; strategy_settings?: any } | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('trading_engine_state')
        .select('is_running, strategy_settings')
        .eq('user_id', userId)
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
        .from('trading_orders')
        .select('id, created_at, status, dhan_order_id')
        .eq('user_id', userId)
        .eq('symbol_id', symbolId)
        .gt('created_at', since)
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
    return `${hours.toString().padStart(2, '0')}:${candleMinute.toString().padStart(2, '0')}`;
  }
}

export { PersistentTradingEngine };
