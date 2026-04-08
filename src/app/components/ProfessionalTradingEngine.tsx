import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Play, Pause, Zap, Clock, TrendingUp, AlertCircle, Target, Shield, Settings, CheckCircle } from "lucide-react";

interface TradingSymbol {
  id: string;
  name: string;
  index: 'NIFTY' | 'BANKNIFTY';
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
}

interface ActivePosition {
  symbolId: string;
  symbolName: string;
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
  index: 'NIFTY' | 'BANKNIFTY';
}

interface ProfessionalTradingEngineProps {
  serverUrl: string;
  accessToken: string;
  onLog: (log: any) => void;
}

export function ProfessionalTradingEngine({ serverUrl, accessToken, onLog }: ProfessionalTradingEngineProps) {
  // ============ ENGINE STATE ============
  const [isRunning, setIsRunning] = useState(false);
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('CLOSED');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // ============ TRADING STATE ============
  const [tradingSymbols, setTradingSymbols] = useState<TradingSymbol[]>([]); // Waiting for signal
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]); // Currently held positions
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [dhanClientId, setDhanClientId] = useState('');
  
  // ============ CANDLE TIMING STATE ============
  const [nextCandleTime, setNextCandleTime] = useState<Date | null>(null);
  const [canSendSignal, setCanSendSignal] = useState(false);
  const [lastCandleProcessed, setLastCandleProcessed] = useState<string>('');
  
  // ============ STATS ============
  const [stats, setStats] = useState({
    totalSignals: 0,
    totalOrders: 0,
    avgExecutionTime: 0,
    totalPnL: 0,
    unrealizedPnL: 0,
    realizedPnL: 0
  });
  
  // ============ REFS ============
  const engineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const clockTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ============ CONFIGURATION ============
  const [config, setConfig] = useState({
    candleInterval: '15', // 15-minute candles
    positionCheckInterval: 60000, // Check positions every 1 minute
  });

  // ============ LOAD SYMBOLS FROM LOCALSTORAGE ============
  useEffect(() => {
    loadSymbols();
    loadDhanClientId();
    
    // Start clock
    clockTimerRef.current = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      if (clockTimerRef.current) clearInterval(clockTimerRef.current);
    };
  }, []);

  const loadSymbols = () => {
    try {
      const stored = localStorage.getItem('trading_symbols');
      if (stored) {
        const loadedSymbols = JSON.parse(stored);
        setTradingSymbols(loadedSymbols.filter((s: TradingSymbol) => s.active));
      }
    } catch (error) {
      console.error('Failed to load symbols:', error);
    }
  };

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

  // ============ MARKET HOURS & 15M CANDLE TIMING ============
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
    
    // Market: 9:00 AM to 3:30 PM
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

  // ============ CALCULATE NEXT 15M CANDLE TIME ============
  const calculateNextCandleTime = () => {
    const now = new Date();
    
    // Convert to IST
    const istOffset = 5.5 * 60;
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utc + (istOffset * 60000));
    
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    
    // 15M candles: 9:00, 9:15, 9:30, 9:45, 10:00, ...
    // First candle completes at 9:30 (9:15-9:30)
    
    // Calculate minutes since market open (9:00)
    const minutesSinceOpen = (hours - 9) * 60 + minutes;
    
    // Round up to next 15-minute boundary
    const nextInterval = Math.ceil(minutesSinceOpen / 15) * 15;
    
    // Calculate next candle close time
    const nextCandleMinutes = 9 * 60 + nextInterval;
    const nextHours = Math.floor(nextCandleMinutes / 60);
    const nextMins = nextCandleMinutes % 60;
    
    const nextCandle = new Date(istTime);
    nextCandle.setHours(nextHours, nextMins, 0, 0);
    
    // Convert back to local time for display
    const nextCandleUTC = nextCandle.getTime() - (istOffset * 60000);
    const nextCandleLocal = new Date(nextCandleUTC - (now.getTimezoneOffset() * 60000));
    
    setNextCandleTime(nextCandleLocal);
    
    // Can send signal if we're past the candle close time
    const canSend = istTime.getTime() >= nextCandle.getTime();
    setCanSendSignal(canSend);
    
    return { nextCandle, canSend };
  };

  // ============ START/STOP ENGINE ============
  const handleStartEngine = () => {
    if (!checkMarketStatus()) {
      onLog({
        timestamp: Date.now(),
        type: 'WARNING',
        message: '⚠️ Cannot start engine - Market is closed'
      });
      return;
    }

    if (tradingSymbols.length === 0) {
      onLog({
        timestamp: Date.now(),
        type: 'WARNING',
        message: '⚠️ No active trading symbols configured'
      });
      return;
    }

    setIsRunning(true);
    onLog({
      timestamp: Date.now(),
      type: 'ENGINE_START',
      message: '🚀 Professional AI Trading Engine STARTED | 15M Candle Mode'
    });

    // Start signal generation timer (check every 15 minutes)
    engineTimerRef.current = setInterval(() => {
      const { canSend } = calculateNextCandleTime();
      if (canSend && tradingSymbols.length > 0) {
        getAISignal();
      }
    }, 60000); // Check every minute

    // Start position monitoring (every 1 minute)
    positionMonitorRef.current = setInterval(() => {
      if (activePositions.length > 0) {
        monitorPositions();
      }
    }, config.positionCheckInterval);

    // Initial signal check
    setTimeout(() => {
      const { canSend } = calculateNextCandleTime();
      if (canSend) {
        getAISignal();
      }
    }, 2000);
  };

  const handleStopEngine = () => {
    setIsRunning(false);
    
    if (engineTimerRef.current) {
      clearInterval(engineTimerRef.current);
      engineTimerRef.current = null;
    }
    
    if (positionMonitorRef.current) {
      clearInterval(positionMonitorRef.current);
      positionMonitorRef.current = null;
    }

    onLog({
      timestamp: Date.now(),
      type: 'ENGINE_STOP',
      message: '⏸️ Trading Engine STOPPED'
    });
  };

  // ============ AI SIGNAL GENERATION (15M CANDLES) ============
  const getAISignal = async () => {
    const startTime = performance.now();
    
    try {
      const now = new Date();
      const candleKey = `${now.getHours()}:${Math.floor(now.getMinutes() / 15) * 15}`;
      
      // Prevent duplicate processing of same candle
      if (candleKey === lastCandleProcessed) {
        console.log('⏭️ Candle already processed:', candleKey);
        return;
      }

      onLog({
        timestamp: Date.now(),
        type: 'AI_REQUEST',
        message: `🤖 Requesting AI signal | 15M Candle | ${tradingSymbols.length} symbols waiting`
      });

      const response = await fetch(`${serverUrl}/ai-trading-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          index: tradingSymbols[0]?.index || 'NIFTY',
          candles: 50,
          interval: config.candleInterval // 15-minute candles
        })
      });

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      if (data.signal) {
        setLastSignal(data.signal);
        setLastCandleProcessed(candleKey);
        setStats(prev => ({
          ...prev,
          totalSignals: prev.totalSignals + 1,
          avgExecutionTime: Math.round((prev.avgExecutionTime + executionTime) / 2)
        }));

        onLog({
          timestamp: Date.now(),
          type: 'AI_SIGNAL',
          message: `✅ AI Signal: ${data.signal.action} | Bias: ${data.signal.bias} | Confidence: ${data.signal.confidence}% | Institutional: ${data.signal.institutional_bias} | ${executionTime}ms`,
          data: data.signal
        });

        // Process signal for entry
        await processSignal(data.signal);
      }
    } catch (error) {
      console.error('AI signal error:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ AI signal failed: ${error}`
      });
    }
  };

  // ============ PROCESS SIGNAL & EXECUTE ============
  const processSignal = async (signal: any) => {
    if (signal.action === 'WAIT') {
      onLog({
        timestamp: Date.now(),
        type: 'WAIT',
        message: `⏸️ AI says WAIT - ${signal.reasoning} | Confidence: ${signal.confidence}%`
      });
      return;
    }

    if (!['BUY_CALL', 'BUY_PUT'].includes(signal.action)) {
      return;
    }

    if (signal.can_place_order === false) {
      onLog({
        timestamp: Date.now(),
        type: 'BLOCKED',
        message: `🚫 Order blocked - ${signal.time_since_last_order}s since last order`
      });
      return;
    }

    // Find matching symbol
    const matchingSymbol = tradingSymbols.find(s => {
      if (signal.action === 'BUY_CALL' && s.optionType === 'CE' && s.transactionType === 'BUY') return true;
      if (signal.action === 'BUY_PUT' && s.optionType === 'PE' && s.transactionType === 'BUY') return true;
      return false;
    });

    if (!matchingSymbol) {
      onLog({
        timestamp: Date.now(),
        type: 'WARNING',
        message: `⚠️ No matching symbol for ${signal.action}`
      });
      return;
    }

    await executeOrder(matchingSymbol, signal);
  };

  // ============ EXECUTE ORDER ============
  const executeOrder = async (symbol: TradingSymbol, signal: any) => {
    const startTime = performance.now();
    
    try {
      const correlationId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      onLog({
        timestamp: Date.now(),
        type: 'ORDER_PLACING',
        message: `⚡ PLACING ORDER: ${symbol.name} | ${signal.action} | Confidence: ${signal.confidence}%`
      });

      // ⚡ AUTOMATIC MIGRATION: Convert legacy 'NFO' to 'NSE_FNO' for Dhan API compatibility
      let exchangeSegment = symbol.exchangeSegment;
      if (exchangeSegment === 'NFO') {
        console.log(`⚡ AUTO-MIGRATION: Converting legacy exchange segment 'NFO' → 'NSE_FNO' for ${symbol.name}`);
        exchangeSegment = 'NSE_FNO';
      }

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
        const position: ActivePosition = {
          symbolId: symbol.id,
          symbolName: symbol.name,
          orderId: data.orderId,
          securityId: symbol.securityId,
          quantity: symbol.quantity,
          entryPrice: data.averagePrice || symbol.price,
          currentPrice: data.averagePrice || symbol.price,
          pnl: 0,
          targetAmount: symbol.targetAmount,
          stopLossAmount: symbol.stopLossAmount,
          entryTime: Date.now(),
          optionType: symbol.optionType,
          index: symbol.index
        };

        // Move symbol from trading to position
        setActivePositions(prev => [...prev, position]);
        setTradingSymbols(prev => prev.filter(s => s.id !== symbol.id));
        
        setStats(prev => ({
          ...prev,
          totalOrders: prev.totalOrders + 1
        }));

        onLog({
          timestamp: Date.now(),
          type: 'ORDER_SUCCESS',
          message: `✅ ORDER EXECUTED! ${symbol.name} | ID: ${data.orderId} | Price: ₹${data.averagePrice} | ${executionTime}ms`,
          data: { ...data, signal }
        });
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

  // ============ MONITOR POSITIONS (EVERY 1 MINUTE) ============
  const monitorPositions = async () => {
    if (activePositions.length === 0) {
      // Reset P&L if no positions
      setStats(prev => ({ ...prev, unrealizedPnL: 0 }));
      return;
    }

    try {
      // ⚡ FETCH REAL POSITIONS FROM DHAN API
      const positionsResponse = await fetch(`${serverUrl}/positions`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const positionsData = await positionsResponse.json();
      
      if (!positionsData.success || !positionsData.positions) {
        console.error('❌ Failed to fetch positions from Dhan');
        return;
      }

      const dhanPositions = positionsData.positions;
      console.log(`📊 Fetched ${dhanPositions.length} positions from Dhan API`);

      // Calculate total unrealized and realized P&L from all positions
      let totalUnrealizedPnL = 0;
      let totalRealizedPnL = 0;

      for (const dhanPos of dhanPositions) {
        const unrealized = parseFloat(dhanPos.unrealizedProfit || dhanPos.unrealizedPnl || 0);
        const realized = parseFloat(dhanPos.realizedProfit || dhanPos.realizedPnl || 0);
        
        totalUnrealizedPnL += unrealized;
        totalRealizedPnL += realized;

        console.log(`  - ${dhanPos.tradingSymbol}: Unrealized: ₹${unrealized.toFixed(2)}, Realized: ₹${realized.toFixed(2)}`);
      }

      // Update stats with real P&L
      setStats(prev => ({
        ...prev,
        unrealizedPnL: totalUnrealizedPnL,
        realizedPnL: totalRealizedPnL,
        totalPnL: totalUnrealizedPnL + totalRealizedPnL
      }));

      console.log(`💰 TOTAL P&L: Unrealized: ₹${totalUnrealizedPnL.toFixed(2)}, Realized: ₹${totalRealizedPnL.toFixed(2)}, Total: ₹${(totalUnrealizedPnL + totalRealizedPnL).toFixed(2)}`);

      // Now check AI exit signals for each position
      for (const position of activePositions) {
        await checkAIExitSignal(position);
      }
    } catch (error) {
      console.error('Position monitoring error:', error);
    }
  };

  const checkAIExitSignal = async (position: ActivePosition) => {
    try {
      const response = await fetch(`${serverUrl}/ai-trading-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          index: position.index,
          candles: 10, // Less candles for quick exit decisions
          interval: '1', // 1-minute candles for position monitoring
          checkExistingPosition: true
        })
      });

      const data = await response.json();

      if (data.signal && data.signal.action === 'EXIT') {
        onLog({
          timestamp: Date.now(),
          type: 'EXIT_SIGNAL',
          message: `🚪 AI Exit Signal for ${position.symbolName}: ${data.signal.reasoning}`
        });

        await exitPosition(position, 'AI_EXIT');
      } else if (data.signal && data.signal.action === 'HOLD') {
        onLog({
          timestamp: Date.now(),
          type: 'HOLD',
          message: `✅ Holding ${position.symbolName} | PnL: ₹${position.pnl.toFixed(2)}`
        });
      }
    } catch (error) {
      console.error('AI exit signal error:', error);
    }
  };

  const exitPosition = async (position: ActivePosition, reason: string) => {
    try {
      // Close position logic here
      onLog({
        timestamp: Date.now(),
        type: 'POSITION_EXIT',
        message: `🚪 Exiting ${position.symbolName} | Reason: ${reason} | PnL: ₹${position.pnl.toFixed(2)}`
      });

      // Remove from active positions
      setActivePositions(prev => prev.filter(p => p.orderId !== position.orderId));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        totalPnL: prev.totalPnL + position.pnl
      }));
    } catch (error) {
      console.error('Exit position error:', error);
    }
  };

  // Update candle timing display
  useEffect(() => {
    const interval = setInterval(() => {
      calculateNextCandleTime();
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      {/* ENGINE CONTROLS */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="size-5 text-amber-500" />
              Professional AI Trading Engine
            </span>
            <Badge variant={marketStatus === 'OPEN' ? 'default' : 'secondary'}>
              {marketStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Row */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-zinc-400">Engine Status</Label>
              <div className="flex items-center gap-2 mt-1">
                {isRunning ? (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                    <div className="size-2 rounded-full bg-green-500 animate-pulse mr-2" />
                    RUNNING
                  </Badge>
                ) : (
                  <Badge variant="secondary">STOPPED</Badge>
                )}
              </div>
            </div>

            <div>
              <Label className="text-zinc-400">Next Candle Close</Label>
              <div className="text-sm font-mono text-zinc-100 mt-1">
                {nextCandleTime ? nextCandleTime.toLocaleTimeString() : '--:--:--'}
              </div>
            </div>

            <div>
              <Label className="text-zinc-400">Trading Symbols</Label>
              <div className="text-sm text-zinc-100 mt-1">
                {tradingSymbols.length} waiting
              </div>
            </div>

            <div>
              <Label className="text-zinc-400">Active Positions</Label>
              <div className="text-sm text-zinc-100 mt-1">
                {activePositions.length} open
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2">
            {!isRunning ? (
              <Button onClick={handleStartEngine} className="bg-green-600 hover:bg-green-700">
                <Play className="size-4 mr-2" />
                Start Engine
              </Button>
            ) : (
              <Button onClick={handleStopEngine} variant="destructive">
                <Pause className="size-4 mr-2" />
                Stop Engine
              </Button>
            )}
          </div>

          {/* Last Signal */}
          {lastSignal && (
            <div className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
              <div className="text-sm text-zinc-400 mb-2">Last AI Signal:</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-zinc-500">Action:</span>{' '}
                  <span className="font-semibold text-amber-500">{lastSignal.action}</span>
                </div>
                <div>
                  <span className="text-zinc-500">Confidence:</span>{' '}
                  <span className="font-semibold">{lastSignal.confidence}%</span>
                </div>
                <div>
                  <span className="text-zinc-500">Bias:</span>{' '}
                  <span className={lastSignal.bias === 'Bullish' ? 'text-green-500' : 'text-red-500'}>
                    {lastSignal.bias}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">Institutional:</span>{' '}
                  <span className="text-blue-400">{lastSignal.institutional_bias}</span>
                </div>
              </div>
              {lastSignal.reasoning && (
                <div className="mt-2 text-xs text-zinc-400 italic">
                  {lastSignal.reasoning}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ACTIVE POSITIONS */}
      {activePositions.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-5 text-green-500" />
              Active Positions ({activePositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activePositions.map((position) => (
                <div key={position.orderId} className="p-3 bg-zinc-800 rounded-lg border border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{position.symbolName}</div>
                      <div className="text-xs text-zinc-400">
                        Entry: ₹{position.entryPrice.toFixed(2)} | Qty: {position.quantity}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${position.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
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
          </CardContent>
        </Card>
      )}

      {/* STATISTICS */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-blue-500" />
            Performance Stats
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-zinc-400">Total Signals</Label>
              <div className="text-2xl font-bold">{stats.totalSignals}</div>
            </div>
            <div>
              <Label className="text-zinc-400">Total Orders</Label>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
            </div>
            <div>
              <Label className="text-zinc-400">Avg Execution</Label>
              <div className="text-2xl font-bold">{stats.avgExecutionTime}ms</div>
            </div>
            <div>
              <Label className="text-zinc-400">Total P&L</Label>
              <div className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ₹{stats.totalPnL.toFixed(2)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}