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
 */

import { DhanService } from './dhan_service.tsx';
import { AdvancedAI } from './advanced_ai.tsx';
import * as kv from './kv_store.tsx';
import { placeOrderViaStaticIP } from './static_ip_helper.tsx';

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
    
    this.engineStates.set(userId, engineState);
    
    // Save state to database (persistent storage)
    await kv.set(`engine_state_${userId}`, engineState);
    
    // Create DhanService instance
    const dhanService = new DhanService({
      clientId: dhanClientId,
      accessToken: dhanAccessToken
    });
    
    console.log(`🚀 STARTING PERSISTENT ENGINE for user ${userId}`);
    console.log(`   Interval: ${candleInterval}M`);
    console.log(`   Symbols: ${symbols.length}`);
    
    // Start engine loop
    const intervalMs = this.getIntervalMilliseconds(candleInterval);
    const timerId = setInterval(async () => {
      await this.engineLoop(userId, dhanService, dhanClientId, dhanAccessToken);
    }, intervalMs);
    
    this.instances.set(userId, timerId);
    
    return {
      success: true,
      message: `✅ Engine started successfully! Running every ${intervalMs/1000}s`
    };
  }
  
  /**
   * STOP ENGINE FOR USER
   */
  static async stopEngine(userId: string): Promise<{ success: boolean; message: string }> {
    const timerId = this.instances.get(userId);
    
    if (!timerId) {
      return {
        success: false,
        message: '⚠️ No engine running for this user'
      };
    }
    
    // Stop interval
    clearInterval(timerId);
    this.instances.delete(userId);
    
    // Update state
    const state = this.engineStates.get(userId);
    if (state) {
      state.isRunning = false;
      state.lastHeartbeat = Date.now();
      await kv.set(`engine_state_${userId}`, state);
    }
    
    this.engineStates.delete(userId);
    
    console.log(`🛑 STOPPED PERSISTENT ENGINE for user ${userId}`);
    
    return {
      success: true,
      message: '✅ Engine stopped successfully'
    };
  }

  /**
   * ⚡⚡⚡ CRON JOB TICK - PROCESSES ALL ACTIVE ENGINES ⚡⚡⚡
   * This should be called every 1 minute by a cron scheduler
   */
  static async runCronTick(): Promise<any> {
    console.log(`⏱️ [CRON] Starting 24/7 Engine Tick...`);
    
    try {
      // Find all active engines in the KV store
      const allEngines = await kv.getByPrefix('engine_state_');
      
      if (!allEngines || allEngines.length === 0) {
        console.log(`⏱️ [CRON] No active engines found.`);
        return { success: true, processed: 0, message: "No active engines" };
      }
      
      let processedCount = 0;
      
      // Process each engine sequentially
      for (const item of allEngines) {
        const state = item.value as EngineState;
        
        // Ensure state exists and is marked as running
        if (state && state.isRunning && state.userId && state.dhanClientId && state.dhanAccessToken) {
          console.log(`⏱️ [CRON] Processing engine for user ${state.userId}`);
          
          // Hydrate memory state if needed
          if (!this.engineStates.has(state.userId)) {
             this.engineStates.set(state.userId, state);
          }
          
          // Re-instantiate service
          const dhanService = new DhanService({
            clientId: state.dhanClientId,
            accessToken: state.dhanAccessToken
          });
          
          // Execute main logic loop for this user
          await this.engineLoop(state.userId, dhanService, state.dhanClientId, state.dhanAccessToken);
          
          processedCount++;
        }
      }
      
      console.log(`⏱️ [CRON] Tick complete. Processed ${processedCount} engines.`);
      return { success: true, processed: processedCount };
      
    } catch (error) {
      console.error(`❌ [CRON] Tick error:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * GET ENGINE STATUS FOR USER
   */
  static async getEngineStatus(userId: string): Promise<EngineState | null> {
    // Try memory first
    let state = this.engineStates.get(userId);
    
    // If not in memory, load from database
    if (!state) {
      const stored = await kv.get(`engine_state_${userId}`);
      if (stored) {
        state = stored as EngineState;
      }
    }
    
    return state || null;
  }
  
  /**
   * ⚡⚡⚡ MAIN ENGINE LOOP - EXECUTES EVERY SECOND ⚡⚡⚡
   */
  private static async engineLoop(
    userId: string, 
    dhanService: DhanService,
    dhanClientId: string,
    dhanAccessToken: string
  ): Promise<void> {
    const state = this.engineStates.get(userId);
    if (!state || !state.isRunning) {
      console.log(`⚠️ Engine loop called but state not found or not running for ${userId}`);
      return;
    }
    
    try {
      // Update heartbeat
      state.lastHeartbeat = Date.now();
      
      const now = new Date();
      const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      
      // Check market hours (9:15 AM - 3:30 PM IST)
      const hours = istTime.getHours();
      const minutes = istTime.getMinutes();
      const currentTimeMinutes = hours * 60 + minutes;
      const marketOpen = 9 * 60 + 15;  // 9:15 AM
      const marketClose = 15 * 60 + 30; // 3:30 PM
      
      if (currentTimeMinutes < marketOpen || currentTimeMinutes > marketClose) {
        console.log(`💤 Market closed - Engine idle`);
        return;
      }
      
      // ⚡⚡⚡ ALWAYS MONITOR ACTIVE POSITIONS (EVERY TICK) ⚡⚡⚡
      await this.monitorPositions(userId, dhanService, state);
      
      // Check if new candle is ready for AI analysis
      const candleMinutes = parseInt(state.candleInterval);
      const currentCandleTimestamp = this.getCurrentCandleTimestamp(istTime, candleMinutes);
      
      if (currentCandleTimestamp === state.lastProcessedCandle) {
        // Already processed this candle, no new AI signal needed yet
        // Save state to database (in case positions updated)
        await kv.set(`engine_state_${userId}`, state);
        return;
      }
      
      console.log(`\n🔥 NEW CANDLE DETECTED! Processing ${state.candleInterval}M candle at ${currentCandleTimestamp}`);
      
      // Mark as processed
      state.lastProcessedCandle = currentCandleTimestamp;
      
      // ⚡⚡⚡ ANALYZE ALL SYMBOLS ⚡⚡⚡
      for (const symbol of state.symbols) {
        if (!symbol.active) continue;
        
        try {
          console.log(`\n📊 Analyzing: ${symbol.name}`);
          
          // Get AI signal (now passing dhanService as first parameter)
          const aiSignal = await AdvancedAI.analyzeMarket(
            dhanService,
            symbol.index || 'NIFTY',
            state.candleInterval,
            100000
          );
          
          state.stats.totalSignals++;
          
          if (!aiSignal || !aiSignal.signal) {
            console.log(`⚠️ No signal generated for ${symbol.name}`);
            continue;
          }
          
          const action = aiSignal.signal.action;
          const confidence = aiSignal.signal.confidence;
          
          console.log(`🎯 AI Decision: ${action} | Confidence: ${confidence}%`);
          
          // Check if we should trade
          if (action === 'WAIT' || confidence < 85) {
            console.log(`⏸️ SKIPPING - Low confidence or WAIT signal`);
            continue;
          }
          
          // Check if already have position for this symbol
          const hasPosition = state.activePositions.some(p => 
            p.symbolName === symbol.symbolName && p.status === 'ACTIVE'
          );
          
          if (hasPosition) {
            console.log(`⏸️ SKIPPING - Already have position for ${symbol.name}`);
            continue;
          }
          
          // ⚡ EXECUTE ORDER!
          if (action === 'BUY_CALL' || action === 'BUY_PUT') {
            console.log(`\n💰 PLACING ORDER: ${symbol.name}`);
            
            const orderParams = {
              securityId: symbol.securityId,
              transactionType: 'BUY',
              exchangeSegment: 'NSE_FNO', // ⚡ FIXED: Changed from 'NFO' to 'NSE_FNO' for Dhan API
              productType: 'INTRADAY',
              orderType: 'MARKET',
              validity: 'DAY',
              quantity: symbol.quantity || 15,
              disclosedQuantity: 0,
              price: 0,
              triggerPrice: 0,
              afterMarketOrder: false,
              amoTime: '',
              boProfitValue: 0,
              boStopLossValue: 0
            };
            
            // ✅ Use Static IP server for order placement (SEBI compliance)
            const orderResult = await placeOrderViaStaticIP(
              userId,
              {
                dhanClientId: dhanClientId,
                dhanAccessToken: dhanAccessToken
              },
              orderParams
            );
            
            if (orderResult.success && orderResult.orderId) {
              console.log(`✅ ORDER PLACED! ID: ${orderResult.orderId}`);
              
              // Add to active positions
              state.activePositions.push({
                orderId: orderResult.orderId,
                symbolName: symbol.symbolName,
                securityId: symbol.securityId,
                optionType: symbol.optionType,
                entryPrice: orderResult.averagePrice || 0,
                currentPrice: orderResult.averagePrice || 0,
                quantity: symbol.quantity || 15,
                targetAmount: symbol.targetAmount || 500,
                stopLossAmount: symbol.stopLossAmount || 300,
                pnl: 0,
                entryTime: Date.now(),
                status: 'ACTIVE'
              });
              
              state.stats.totalOrders++;
              
              // Save log
              await kv.set(`engine_log_${userId}_${Date.now()}`, {
                type: 'ORDER_PLACED',
                timestamp: Date.now(),
                symbol: symbol.name,
                action,
                confidence,
                orderId: orderResult.orderId
              });
            } else {
              console.log(`❌ ORDER FAILED: ${orderResult.error}`);
            }
          }
          
        } catch (error) {
          console.error(`❌ Error analyzing ${symbol.name}:`, error);
        }
      }
      
      // Save state to database (Position monitoring already done above)
      await kv.set(`engine_state_${userId}`, state);
      
      console.log(`✅ Engine loop complete | Signals: ${state.stats.totalSignals} | Orders: ${state.stats.totalOrders}`);
      
    } catch (error) {
      console.error(`❌ Engine loop error for ${userId}:`, error);
      
      // Save error log
      await kv.set(`engine_error_${userId}_${Date.now()}`, {
        timestamp: Date.now(),
        error: String(error)
      });
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
    if (state.activePositions.length === 0) {
      return;
    }
    
    console.log(`\n🔍 MONITORING ${state.activePositions.length} POSITIONS`);
    
    try {
      // Fetch fresh positions from Dhan
      const dhanPositions = await dhanService.getPositions();
      
      for (const position of state.activePositions) {
        if (position.status !== 'ACTIVE') continue;
        
        // Find matching Dhan position
        const dhanPos = dhanPositions.find((dp: any) => 
          dp.tradingSymbol === position.symbolName || 
          dp.securityId === position.securityId.toString()
        );
        
        // Check if position is closed
        if (!dhanPos || dhanPos.netQty === 0) {
          console.log(`🚪 Position CLOSED: ${position.symbolName}`);
          position.status = 'CLOSED';
          continue;
        }
        
        // Update P&L
        const currentPrice = parseFloat(dhanPos.lastPrice || dhanPos.ltp || position.currentPrice);
        const pnl = parseFloat(dhanPos.unrealizedProfit || dhanPos.unrealizedPnl || 0);
        
        position.currentPrice = currentPrice;
        position.pnl = pnl;
        
        console.log(`📊 ${position.symbolName} | P&L: ₹${pnl.toFixed(2)}`);
        
        // Check exit conditions
        let shouldExit = false;
        let exitReason = '';
        
        // Stop Loss
        if (pnl <= -position.stopLossAmount) {
          shouldExit = true;
          exitReason = `Stop Loss Hit (₹${pnl.toFixed(2)})`;
        }
        // Target
        else if (pnl >= position.targetAmount) {
          shouldExit = true;
          exitReason = `Target Achieved (₹${pnl.toFixed(2)})`;
        }
        
        if (shouldExit) {
          console.log(`\n🚪 EXIT TRIGGERED: ${exitReason}`);
          
          // ✅ Use Static IP server for exit order (SEBI compliance)
          const exitParams = {
            securityId: position.securityId,
            transactionType: 'SELL',
            exchangeSegment: 'NSE_FNO', // ⚡ FIXED: Changed from 'NFO' to 'NSE_FNO' for Dhan API
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
            state.userId,
            {
              dhanClientId: state.userId, // Using userId as clientId (should be actual clientId)
              dhanAccessToken: state.dhanAccessToken || ''
            },
            exitParams
          );
          
          if (exitResult.success) {
            console.log(`✅ EXIT ORDER PLACED! ${exitReason}`);
            position.status = 'CLOSED';
            state.stats.totalPnL += pnl;
            
            // Save log
            await kv.set(`engine_log_${userId}_${Date.now()}`, {
              type: 'POSITION_CLOSED',
              timestamp: Date.now(),
              symbol: position.symbolName,
              reason: exitReason,
              pnl: pnl
            });
          } else {
            console.log(`❌ EXIT ORDER FAILED: ${exitResult.error}`);
          }
        }
      }
      
      // Remove closed positions
      state.activePositions = state.activePositions.filter(p => p.status === 'ACTIVE');
      
    } catch (error) {
      console.error('❌ Position monitoring error:', error);
    }
  }
  
  /**
   * Get interval in milliseconds
   */
  private static getIntervalMilliseconds(interval: '5' | '15'): number {
    // Run every 1 second to check for new candles
    return 1000;
  }
  
  /**
   * Get current candle timestamp (e.g., "09:15", "09:20")
   */
  private static getCurrentCandleTimestamp(date: Date, interval: number): string {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Round down to nearest interval
    const candleMinute = Math.floor(minutes / interval) * interval;
    
    return `${hours.toString().padStart(2, '0')}:${candleMinute.toString().padStart(2, '0')}`;
  }
}

export { PersistentTradingEngine };
