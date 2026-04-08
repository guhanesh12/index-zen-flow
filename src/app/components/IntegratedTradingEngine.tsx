// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Play, Pause, Zap, Clock, TrendingUp, AlertCircle, Target, Shield, Settings } from "lucide-react";
import { supabase } from "@/utils-ext/supabase/client";

interface TradingSymbol {
  id: string;
  name: string;
  index: 'NIFTY' | 'BANKNIFTY'; // Main index for data analysis
  optionType: 'CE' | 'PE';
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: string;
  validity: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  amoTime: string;
  boProfitValue: number;
  boStopLossValue: number;
  targetAmount: number;
  stopLossAmount: number;
  active: boolean;
  waitingForSignal: boolean;
}

interface ActivePosition {
  symbolId: string;
  orderId: string;
  securityId: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  targetAmount: number;
  stopLossAmount: number;
  entryTime: number;
  optionType: 'CE' | 'PE';
}

interface IntegratedTradingEngineProps {
  serverUrl: string;
  accessToken: string;
  onLog: (log: any) => void;
}

export function IntegratedTradingEngine({ serverUrl, accessToken, onLog }: IntegratedTradingEngineProps) {
  // Engine State
  const [isRunning, setIsRunning] = useState(false);
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('CLOSED');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Trading State
  const [symbols, setSymbols] = useState<TradingSymbol[]>([]);
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]);
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [dhanClientId, setDhanClientId] = useState('');
  
  // Performance Metrics
  const [stats, setStats] = useState({
    totalSignals: 0,
    totalOrders: 0,
    avgExecutionTime: 0,
    totalPnL: 0
  });
  
  // Refs for intervals
  const engineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const monitorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clockTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false); // ⚡ NEW: Prevent duplicate requests

  // Configuration state
  const [config, setConfig] = useState({
    signalCheckInterval: 300000, // Default: 5 minutes in milliseconds
    positionCheckInterval: 120000, // 2 minutes
    candleInterval: '5', // 5-minute candles for AI analysis
    positionMonitorInterval: 30000, // 30 seconds for position monitoring,
  });

  // ============ MARKET HOURS CHECK (9:00 AM - 3:30 PM IST) ============
  const checkMarketStatus = () => {
    const now = new Date();
    
    // Check weekend
    const day = now.getDay();
    if (day === 0 || day === 6) {
      setMarketStatus('WEEKEND');
      return false;
    }

    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utc + (istOffset * 60000));
    
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    // ⚡ CHANGED: 9:00 AM to 3:30 PM (was 9:15 AM)
    const marketOpen = 9 * 60; // 9:00 AM
    const marketClose = 15 * 60 + 30; // 3:30 PM
    
    if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
      setMarketStatus('OPEN');
      return true;
    } else {
      setMarketStatus('CLOSED');
      return false;
    }
  };

  // ============ LOAD SYMBOLS FROM LOCALSTORAGE ============
  const loadSymbols = () => {
    try {
      const stored = localStorage.getItem('trading_symbols');
      if (stored) {
        const loadedSymbols = JSON.parse(stored);
        setSymbols(loadedSymbols.filter((s: TradingSymbol) => s.active && s.waitingForSignal));
      }
    } catch (error) {
      console.error('Failed to load symbols:', error);
    }
  };

  // ============ LOAD DHAN CLIENT ID ============
  const loadDhanClientId = async () => {
    try {
      const response = await fetch(`${serverUrl}/api-credentials`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.credentials?.dhanClientId) {
        setDhanClientId(data.credentials.dhanClientId);
      }
    } catch (error) {
      console.error('Failed to load Dhan Client ID:', error);
    }
  };

  // ============ AI SIGNAL GENERATION (ADVANCED AI WITH SAFETY) ============
  const getAISignal = async () => {
    // ⚡ CHECK: Skip if already processing
    if (isProcessingRef.current) {
      console.log('⏳ AI request already in progress, skipping...');
      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: '⏳ AI request already in progress, skipping duplicate request'
      });
      return;
    }

    isProcessingRef.current = true; // Set lock
    const startTime = performance.now();
    
    // ⚡ SAFETY: Force-reset processing flag after 30s (in case of crash)
    const safetyTimeout = setTimeout(() => {
      if (isProcessingRef.current) {
        console.error('🚨 SAFETY TIMEOUT: AI request stuck for 30s! Force-resetting...');
        isProcessingRef.current = false;
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: '🚨 AI request stuck for 30s - force-reset processing lock'
        });
      }
    }, 30000);
    
    try {
      onLog({
        timestamp: Date.now(),
        type: 'AI_REQUEST',
        message: `🤖 Requesting AI signal from Advanced AI (15+ indicators) | ${config.candleInterval}M candles...`
      });

      // ⚡ ADD TIMEOUT (15s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${serverUrl}/advanced-ai-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          index: 'NIFTY',
          interval: config.candleInterval, // 5 or 15 minutes
          accountBalance: 100000
        }),
        signal: controller.signal // Add abort signal
      });

      clearTimeout(timeoutId); // Clear timeout if response received

      // ⚡ HANDLE 401 - SESSION EXPIRED (AUTO-REFRESH)
      if (response.status === 401) {
        console.log(`🔄 Got 401, attempting auto session refresh...`);
        
        try {
          const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
          
          if (!refreshError && session) {
            console.log(`✅ Session refreshed! Retrying AI analysis on next interval...`);
            onLog({
              timestamp: Date.now(),
              type: 'INFO',
              message: `🔄 Session refreshed automatically - will retry on next interval`
            });
            return; // Next interval will use new token
          } else {
            console.error(`❌ Failed to refresh session:`, refreshError?.message);
            onLog({
              timestamp: Date.now(),
              type: 'ERROR',
              message: `🚨 SESSION EXPIRED - Could not refresh. Please login again.`
            });
            stopEngine(); // Stop engine if refresh fails
          }
        } catch (refreshErr) {
          console.error(`❌ Error refreshing session:`, refreshErr);
          stopEngine();
        }
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Backend error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      if (data.signal) {
        setLastSignal(data.signal);
        setStats(prev => ({
          ...prev,
          totalSignals: prev.totalSignals + 1,
          avgExecutionTime: Math.round((prev.avgExecutionTime + executionTime) / 2)
        }));

        // 📝 COMPREHENSIVE ENTRY LOG
        onLog({
          timestamp: Date.now(),
          type: 'AI_SIGNAL',
          message: `✅ ADVANCED AI Signal: ${data.signal.action} | Confidence: ${data.signal.confidence}% | Confirmations: ${data.signal.confirmations?.total || 0}/10 | ${executionTime}ms`,
          data: {
            signal: data.signal,
            confirmations: data.signal.confirmations?.details || [],
            patterns: data.signal.patterns || [],
            marketRegime: data.signal.marketRegime || {},
            executionTime: `${executionTime}ms`
          }
        });

        // Execute order based on signal
        await processSignal(data.signal);
      } else {
        console.warn('⚠️ No signal in response');
        onLog({
          timestamp: Date.now(),
          type: 'WARNING',
          message: '⚠️ No signal received from AI - will retry on next interval'
        });
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('⏱️ AI request timeout (> 15s)');
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `⏱️ AI request timeout (> 15s) - Backend slow. Will retry on next interval.`
        });
      } else {
        console.error('AI signal error:', error);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ AI signal failed: ${error.message || error}`
        });
      }
    } finally {
      clearTimeout(safetyTimeout); // Clear safety timeout
      isProcessingRef.current = false; // Always release lock
      const totalTime = Math.round(performance.now() - startTime);
      console.log(`⚡ AI REQUEST COMPLETE: ${totalTime}ms`);
    }
  };

  // ============ PROCESS AI SIGNAL & AUTO-EXECUTE ORDER ============
  const processSignal = async (signal: any) => {
    // Check if signal indicates to wait
    if (signal.action === 'WAIT') {
      onLog({
        timestamp: Date.now(),
        type: 'WAIT',
        message: `⏸️ AI says WAIT - ${signal.reasoning || 'No clear signal'} | Confidence: ${signal.confidence}%`
      });
      return;
    }

    // Check for valid trading signals
    if (!['BUY_CALL', 'BUY_PUT', 'SELL_CALL', 'SELL_PUT', 'EXIT', 'HOLD'].includes(signal.action)) {
      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: `⏸️ Signal: ${signal.action} - No action taken`
      });
      return;
    }

    // HOLD signal - do nothing
    if (signal.action === 'HOLD') {
      onLog({
        timestamp: Date.now(),
        type: 'HOLD',
        message: '⏸️ AI says HOLD - Keeping current position'
      });
      return;
    }

    // EXIT signal - close all positions
    if (signal.action === 'EXIT') {
      await exitAllPositions('AI_EXIT');
      return;
    }
    
    // Check if we can place order (spam prevention)
    if (signal.can_place_order === false) {
      onLog({
        timestamp: Date.now(),
        type: 'BLOCKED',
        message: `🚫 Order blocked - Last order was ${signal.time_since_last_order}s ago (min 300s required)`
      });
      return;
    }

    // Find matching symbol
    const matchingSymbol = symbols.find(s => {
      if (signal.action === 'BUY_CALL' && s.optionType === 'CE' && s.transactionType === 'BUY') return true;
      if (signal.action === 'BUY_PUT' && s.optionType === 'PE' && s.transactionType === 'BUY') return true;
      if (signal.action === 'SELL_CALL' && s.optionType === 'CE' && s.transactionType === 'SELL') return true;
      if (signal.action === 'SELL_PUT' && s.optionType === 'PE' && s.transactionType === 'SELL') return true;
      return false;
    });

    if (!matchingSymbol) {
      onLog({
        timestamp: Date.now(),
        type: 'WARNING',
        message: `⚠️ No matching symbol found for ${signal.action}`
      });
      return;
    }

    // Execute order immediately
    await executeOrder(matchingSymbol, signal);
  };

  // ============ EXECUTE DHAN ORDER (MILLISECOND SPEED) ============
  const executeOrder = async (symbol: TradingSymbol, signal: any) => {
    const startTime = performance.now();
    
    try {
      // Generate unique correlation ID
      const correlationId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      onLog({
        timestamp: Date.now(),
        type: 'ORDER_PLACING',
        message: `⚡ Placing order: ${symbol.name} | ${signal.action} | Correlation: ${correlationId}`
      });

      // ⚡ AUTOMATIC MIGRATION: Convert legacy 'NFO' to 'NSE_FNO' for Dhan API compatibility
      let exchangeSegment = symbol.exchangeSegment;
      if (exchangeSegment === 'NFO') {
        console.log(`⚡ AUTO-MIGRATION: Converting legacy exchange segment 'NFO' → 'NSE_FNO' for ${symbol.name}`);
        exchangeSegment = 'NSE_FNO';
      }

      // Build Dhan order request
      const orderRequest = {
        dhanClientId: dhanClientId,
        correlationId: correlationId,
        transactionType: symbol.transactionType,
        exchangeSegment: exchangeSegment, // ⚡ Using migrated value
        productType: symbol.productType,
        orderType: symbol.orderType,
        validity: symbol.validity,
        securityId: symbol.securityId,
        quantity: symbol.quantity,
        disclosedQuantity: symbol.disclosedQuantity,
        price: symbol.price,
        triggerPrice: symbol.triggerPrice,
        afterMarketOrder: symbol.afterMarketOrder,
        amoTime: symbol.amoTime,
        boProfitValue: symbol.boProfitValue,
        boStopLossValue: symbol.boStopLossValue
      };

      // Execute via backend
      const response = await fetch(`${serverUrl}/execute-dhan-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(orderRequest)
      });

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      if (data.success && data.orderId) {
        // Add to active positions
        const position: ActivePosition = {
          symbolId: symbol.id,
          orderId: data.orderId,
          securityId: symbol.securityId,
          quantity: symbol.quantity,
          entryPrice: data.averagePrice || symbol.price,
          currentPrice: data.averagePrice || symbol.price,
          pnl: 0,
          targetAmount: symbol.targetAmount,
          stopLossAmount: symbol.stopLossAmount,
          entryTime: Date.now(),
          optionType: symbol.optionType
        };

        setActivePositions(prev => [...prev, position]);
        setStats(prev => ({
          ...prev,
          totalOrders: prev.totalOrders + 1
        }));

        onLog({
          timestamp: Date.now(),
          type: 'ORDER_SUCCESS',
          message: `✅ Order EXECUTED! ID: ${data.orderId} | Price: ₹${data.averagePrice} | Time: ${executionTime}ms`,
          data: data
        });

        // Update symbol status
        const updatedSymbols = symbols.map(s => 
          s.id === symbol.id ? { ...s, waitingForSignal: false } : s
        );
        setSymbols(updatedSymbols);
        localStorage.setItem('trading_symbols', JSON.stringify(updatedSymbols));
      } else {
        onLog({
          timestamp: Date.now(),
          type: 'ORDER_FAILED',
          message: `❌ Order failed: ${data.error || 'Unknown error'}`
        });
      }
    } catch (error) {
      console.error('Order execution error:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Order execution failed: ${error}`
      });
    }
  };

  // ============ MONITOR POSITIONS (TARGET/SL + HOLD/EXIT) ============
  const monitorPositions = async () => {
    if (activePositions.length === 0) return;

    try {
      // Get live positions from Dhan
      const response = await fetch(`${serverUrl}/live-positions`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const data = await response.json();

      if (data.positions && data.positions.length > 0) {
        // Update positions with live data
        for (const livePosition of data.positions) {
          const matchedPosition = activePositions.find(p => p.orderId === livePosition.dhanClientId);
          
          if (matchedPosition) {
            const currentPnL = livePosition.realizedProfit + livePosition.unrealizedProfit;
            
            // Update position
            setActivePositions(prev => prev.map(p => 
              p.orderId === matchedPosition.orderId 
                ? { ...p, currentPrice: livePosition.buyAvg, pnl: currentPnL }
                : p
            ));

            // Check TARGET hit
            if (currentPnL >= matchedPosition.targetAmount) {
              await exitPosition(matchedPosition, 'TARGET_HIT', currentPnL);
            }
            
            // Check STOP LOSS hit
            else if (currentPnL <= -matchedPosition.stopLossAmount) {
              await exitPosition(matchedPosition, 'STOP_LOSS_HIT', currentPnL);
            }
            
            // Get AI decision for HOLD/EXIT
            else {
              await checkAIExitSignal(matchedPosition);
            }
          }
        }

        // Update total P&L
        const totalPnL = activePositions.reduce((sum, p) => sum + p.pnl, 0);
        setStats(prev => ({ ...prev, totalPnL }));
      }
    } catch (error) {
      console.error('Position monitoring error:', error);
    }
  };

  // ============ CHECK AI HOLD/EXIT DECISION ============
  const checkAIExitSignal = async (position: ActivePosition) => {
    try {
      const response = await fetch(`${serverUrl}/monitor-position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          index: 'NIFTY',
          interval: '1', // 1-minute candles for quick position monitoring
          entryPrice: position.entryPrice,
          currentPrice: position.currentPrice,
          optionType: position.optionType,
          targetAmount: position.targetAmount,
          stopLossAmount: position.stopLossAmount,
          quantity: position.quantity
        })
      });

      const data = await response.json();

      if (data.analysis) {
        // 📝 MONITORING LOG (every check)
        onLog({
          timestamp: Date.now(),
          type: 'POSITION_MONITOR',
          message: `📊 Monitoring ${position.orderId} | P&L: ₹${position.pnl.toFixed(2)} | Action: ${data.analysis.action}`,
          data: {
            position: position.orderId,
            currentPnL: position.pnl,
            action: data.analysis.action,
            reason: data.analysis.reason,
            marketMoving: data.analysis.marketMovingFavorable,
            reversalDetected: data.analysis.reversalDetected
          }
        });

        if (data.analysis.action === 'EXIT_NOW') {
          onLog({
            timestamp: Date.now(),
            type: 'AI_EXIT',
            message: `⚠️ AI EXIT SIGNAL: ${data.analysis.reason}`,
            data: data.analysis
          });
          await exitPosition(position, 'AI_EXIT_REVERSAL', position.pnl);
        } else if (data.analysis.action === 'HOLD_FOR_PROFIT') {
          onLog({
            timestamp: Date.now(),
            type: 'HOLD',
            message: `✅ HOLDING: ${data.analysis.reason} | P&L: ₹${position.pnl.toFixed(2)}`,
            data: data.analysis
          });
        }
      }
    } catch (error) {
      console.error('AI exit check error:', error);
    }
  };

  // ============ EXIT SINGLE POSITION ============
  const exitPosition = async (position: ActivePosition, reason: string, pnl: number) => {
    try {
      const correlationId = `EXIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      onLog({
        timestamp: Date.now(),
        type: 'EXIT_ORDER',
        message: `🚪 Exiting position: ${reason} | P&L: ₹${pnl.toFixed(2)}`
      });

      // Place exit order
      const response = await fetch(`${serverUrl}/execute-dhan-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          dhanClientId: dhanClientId,
          correlationId: correlationId,
          transactionType: position.optionType === 'CE' ? 'SELL' : 'BUY', // Opposite transaction
          exchangeSegment: 'NSE_FNO',
          productType: 'INTRADAY',
          orderType: 'MARKET',
          validity: 'DAY',
          securityId: position.securityId,
          quantity: position.quantity,
          disclosedQuantity: 0,
          price: 0,
          triggerPrice: 0,
          afterMarketOrder: false,
          amoTime: 'OPEN',
          boProfitValue: 0,
          boStopLossValue: 0
        })
      });

      const data = await response.json();

      if (data.success) {
        // Remove from active positions
        setActivePositions(prev => prev.filter(p => p.orderId !== position.orderId));

        onLog({
          timestamp: Date.now(),
          type: 'EXIT_SUCCESS',
          message: `✅ Position EXITED! ${reason} | Final P&L: ₹${pnl.toFixed(2)} | Exit Order: ${data.orderId}`
        });
      }
    } catch (error) {
      console.error('Exit position error:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Exit failed: ${error}`
      });
    }
  };

  // ============ EXIT ALL POSITIONS ============
  const exitAllPositions = async (reason: string) => {
    for (const position of activePositions) {
      await exitPosition(position, reason, position.pnl);
    }
  };

  // ============ START ENGINE ============
  const startEngine = () => {
    if (!checkMarketStatus()) {
      alert('⚠️ Market is CLOSED! Trading hours: 9:00 AM - 3:30 PM IST');
      return;
    }

    if (symbols.length === 0) {
      alert('⚠️ No symbols configured! Please add symbols first.');
      return;
    }

    setIsRunning(true);
    
    onLog({
      timestamp: Date.now(),
      type: 'SYSTEM',
      message: `🚀 ENGINE STARTED | Check AI every ${config.signalCheckInterval/60000}min | Monitor positions every ${config.positionMonitorInterval/1000}sec | ${config.candleInterval}min candles`
    });

    // Run first signal check immediately
    getAISignal();

    // AI signal check using configured interval (5 or 15 minutes)
    engineTimerRef.current = setInterval(() => {
      if (checkMarketStatus()) {
        getAISignal();
      } else {
        stopEngine();
      }
    }, config.signalCheckInterval); // Use configured interval

    // Position monitoring using configured interval (10s, 30s, or 1min)
    monitorTimerRef.current = setInterval(() => {
      monitorPositions();
    }, config.positionMonitorInterval); // Use configured interval
  };

  // ============ STOP ENGINE ============
  const stopEngine = () => {
    setIsRunning(false);
    
    if (engineTimerRef.current) {
      clearInterval(engineTimerRef.current);
      engineTimerRef.current = null;
    }
    
    if (monitorTimerRef.current) {
      clearInterval(monitorTimerRef.current);
      monitorTimerRef.current = null;
    }

    onLog({
      timestamp: Date.now(),
      type: 'SYSTEM',
      message: '🛑 INTEGRATED TRADING ENGINE STOPPED'
    });
  };

  // ============ INITIALIZATION ============
  useEffect(() => {
    loadSymbols();
    loadDhanClientId();
    
    // Update clock every second
    clockTimerRef.current = setInterval(() => {
      setCurrentTime(new Date());
      checkMarketStatus();
    }, 1000);

    return () => {
      stopEngine();
      if (clockTimerRef.current) {
        clearInterval(clockTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload symbols when they change
  useEffect(() => {
    const interval = setInterval(loadSymbols, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-stop at market close
  useEffect(() => {
    if (isRunning && marketStatus !== 'OPEN') {
      stopEngine();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketStatus]);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              Integrated Trading Engine (9:00 AM - 3:30 PM)
            </CardTitle>
            <p className="text-sm text-zinc-400 mt-1">
              Millisecond AI-powered auto-execution with Target/SL monitoring
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={marketStatus === 'OPEN' ? 'default' : 'secondary'} 
                   className={marketStatus === 'OPEN' ? 'bg-emerald-600' : 'bg-red-600'}>
              {marketStatus === 'OPEN' ? '🟢 MARKET OPEN' : '🔴 MARKET CLOSED'}
            </Badge>
            <Button
              onClick={isRunning ? stopEngine : startEngine}
              className={isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Engine
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Engine
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Configuration Panel */}
        <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <div className="flex items-center gap-2 mb-3">
            <Settings className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-medium text-zinc-300">Engine Configuration</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Candle Interval for AI</Label>
              <Select 
                value={config.candleInterval} 
                onValueChange={(v) => setConfig({ ...config, candleInterval: v })}
                disabled={isRunning}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 Minutes</SelectItem>
                  <SelectItem value="15">15 Minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">AI Signal Check Interval</Label>
              <Select 
                value={config.signalCheckInterval.toString()} 
                onValueChange={(v) => setConfig({ ...config, signalCheckInterval: parseInt(v) })}
                disabled={isRunning}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="300000">5 Minutes</SelectItem>
                  <SelectItem value="600000">10 Minutes</SelectItem>
                  <SelectItem value="900000">15 Minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Position Monitor Interval</Label>
              <Select 
                value={config.positionMonitorInterval.toString()} 
                onValueChange={(v) => setConfig({ ...config, positionMonitorInterval: parseInt(v) })}
                disabled={isRunning}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10000">10 Seconds</SelectItem>
                  <SelectItem value="30000">30 Seconds</SelectItem>
                  <SelectItem value="60000">1 Minute</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Target/SL Check Interval</Label>
              <Select 
                value={config.positionCheckInterval.toString()} 
                onValueChange={(v) => setConfig({ ...config, positionCheckInterval: parseInt(v) })}
                disabled={isRunning}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60000">1 Minute</SelectItem>
                  <SelectItem value="120000">2 Minutes</SelectItem>
                  <SelectItem value="300000">5 Minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-amber-400 mt-2">⚠️ Configuration can only be changed when engine is stopped</p>
        </div>

        {/* Real-time Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400">Current Time (IST)</div>
            <div className="text-lg font-mono text-zinc-100">
              {currentTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </div>
          </div>

          <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400">Active Symbols</div>
            <div className="text-lg font-bold text-blue-400">{symbols.length}</div>
          </div>

          <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400">Active Positions</div>
            <div className="text-lg font-bold text-amber-400">{activePositions.length}</div>
          </div>

          <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400">Total Orders</div>
            <div className="text-lg font-bold text-emerald-400">{stats.totalOrders}</div>
          </div>

          <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400">Total P&L</div>
            <div className={`text-lg font-bold ${stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹{stats.totalPnL.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Last AI Signal */}
        {lastSignal && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-blue-300">Last AI Signal:</span>
              </div>
              <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500">
                {lastSignal.action}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-blue-200">
              Bias: {lastSignal.bias} | Confidence: {lastSignal.confidence}% | Avg Execution: {stats.avgExecutionTime}ms
            </div>
            
            {/* Enhanced: Show Candlestick Analysis Details */}
            {lastSignal.candle_analysis && (
              <div className="mt-3 p-3 bg-zinc-900/50 rounded border border-zinc-700">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-400">Candle Type:</span>
                    <div className={`font-medium ${lastSignal.candle_analysis.isBullish ? 'text-emerald-400' : lastSignal.candle_analysis.isBearish ? 'text-red-400' : 'text-amber-400'}`}>
                      {lastSignal.candle_analysis.isDoji ? '🟡 DOJI' : lastSignal.candle_analysis.isBullish ? '🟢 BULLISH' : '🔴 BEARISH'}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-400">Body %:</span>
                    <div className="text-zinc-100 font-medium">
                      {lastSignal.candle_analysis.bodyPercent?.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-400">Support:</span>
                    <div className="text-emerald-400 font-medium">
                      {lastSignal.support_level?.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-zinc-400">Resistance:</span>
                    <div className="text-red-400 font-medium">
                      {lastSignal.resistance_level?.toFixed(2)}
                    </div>
                  </div>
                </div>
                {lastSignal.reasoning && (
                  <div className="mt-2 text-xs text-zinc-300 italic">
                    💡 {lastSignal.reasoning}
                  </div>
                )}
                {lastSignal.can_place_order === false && (
                  <div className="mt-2 text-xs text-amber-400">
                    ⏱️ Order cooldown: {300 - lastSignal.time_since_last_order}s remaining
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Active Positions */}
        {activePositions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-zinc-300">Active Positions</h4>
            {activePositions.map((position) => (
              <div key={position.orderId} className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-zinc-100">
                      Order #{position.orderId}
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      Entry: ₹{position.entryPrice} | Current: ₹{position.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      ₹{position.pnl.toFixed(2)}
                    </div>
                    <div className="text-xs text-zinc-400">
                      Target: ₹{position.targetAmount} | SL: ₹{position.stopLossAmount}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Engine Status */}
        <div className={`p-4 rounded-lg border ${isRunning ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-800 border-zinc-700'}`}>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <Clock className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-emerald-300">Engine running at millisecond speed...</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-400">Engine stopped. Click "Start Engine" to begin trading.</span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}