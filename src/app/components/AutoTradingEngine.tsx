import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Play, Pause, Zap, Clock, TrendingUp } from "lucide-react";

interface AutoTradingEngineProps {
  serverUrl: string;
  accessToken: string;
  testMode: boolean;
  onTestModeChange: (enabled: boolean) => void;
  onLog: (log: any) => void;
  onAnalysisUpdate: (analysis: any) => void;
  onPositionUpdate: (position: any) => void;
  symbols: any[];
}

export function AutoTradingEngine({
  serverUrl,
  accessToken,
  testMode,
  onTestModeChange,
  onLog,
  onAnalysisUpdate,
  onPositionUpdate,
  symbols
}: AutoTradingEngineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [analysisInterval, setAnalysisInterval] = useState(5); // minutes
  const [positionCheckInterval, setPositionCheckInterval] = useState(2); // minutes
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('CLOSED');
  const [stats, setStats] = useState({
    totalAnalyses: 0,
    totalTrades: 0,
    responseTime: 0
  });

  const analysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const priceUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if market is open (weekdays only, 9:15 AM - 3:30 PM IST)
  const checkMarketStatus = () => {
    const now = new Date();
    
    // Check if weekend (Saturday = 6, Sunday = 0)
    const day = now.getDay();
    if (day === 0 || day === 6) {
      setMarketStatus('WEEKEND');
      return false;
    }

    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60; // minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utc + (istOffset * 60000));
    
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    const marketOpen = 9 * 60 + 15; // 9:15 AM
    const marketClose = 15 * 60 + 30; // 3:30 PM
    
    if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
      setMarketStatus('OPEN');
      return true;
    } else {
      setMarketStatus('CLOSED');
      return false;
    }
  };

  // Run AI Analysis
  const runAnalysis = async () => {
    const startTime = performance.now();
    
    try {
      const log = {
        timestamp: Date.now(),
        type: 'AI_ANALYSIS',
        message: `[${testMode ? 'TEST' : 'LIVE'}] Starting AI analysis...`
      };
      onLog(log);

      const response = await fetch(`${serverUrl}/analyze-symbol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          symbolId: 'default',
          index: 'NIFTY',
          daysToExpiry: 3,
          testMode
        })
      });

      const data = await response.json();
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      if (data.analysis) {
        onAnalysisUpdate(data.analysis);
        setStats(prev => ({
          ...prev,
          totalAnalyses: prev.totalAnalyses + 1,
          responseTime
        }));

        onLog({
          timestamp: Date.now(),
          type: 'AI_ANALYSIS',
          message: `AI Analysis: ${data.analysis.bias} | ${data.analysis.action} | Confidence: ${data.analysis.confidence}%`,
          data: data.analysis
        });

        // Execute trade based on analysis
        if (data.analysis.action === 'ENTRY_ALLOWED' && data.analysis.confidence > 70) {
          await executeTrade(data.analysis);
        }
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Analysis error:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `Analysis failed: ${error}`
      });
    }
  };

  // Execute Trade
  const executeTrade = async (analysis: any) => {
    try {
      // ⚠️ CRITICAL: Must use actual option security ID from symbols, not index ID!
      const activeSymbol = symbols?.find(s => s.active);
      
      if (!activeSymbol) {
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: '❌ No active symbol found! Please activate a symbol in Symbol Manager first.'
        });
        return;
      }

      // Validate security ID
      if (!activeSymbol.securityId || activeSymbol.securityId.trim() === '') {
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ Symbol "${activeSymbol.name}" has no security ID! Please edit symbol and add option contract security ID.`
        });
        return;
      }

      // Check if trying to trade index ID (common mistake)
      const secId = activeSymbol.securityId.trim();
      if (secId === '13' || secId === '25' || secId === 'NIFTY' || secId === 'BANKNIFTY') {
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ INVALID SECURITY ID: "${secId}" is an INDEX ID, not an option contract!\n\n` +
                   `➡️ SOLUTION:\n` +
                   `1. Go to https://web.dhan.co/options-chain\n` +
                   `2. Select ${activeSymbol.index} and choose your strike/expiry\n` +
                   `3. Click ${activeSymbol.optionType} option\n` +
                   `4. Copy the ACTUAL OPTION SECURITY ID (e.g., 53412)\n` +
                   `5. Update symbol in Symbol Manager with this ID`
        });
        return;
      }

      // ⚡ CRITICAL DEBUG: Log what we're sending
      console.log('🔍 TRADE REQUEST DEBUG:', {
        symbolName: activeSymbol.name,
        securityId: activeSymbol.securityId,
        transactionType: analysis.bias === 'Bullish' ? 'BUY' : 'SELL',
        quantity: activeSymbol.quantity || 1,
        testMode
      });

      onLog({
        timestamp: Date.now(),
        type: 'DEBUG',
        message: `🔍 Placing order with Security ID: ${activeSymbol.securityId} for ${activeSymbol.name}`
      });

      const response = await fetch(`${serverUrl}/execute-trade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          symbolId: activeSymbol.id,
          securityId: activeSymbol.securityId, // ✅ Use actual option contract ID from symbol
          transactionType: analysis.bias === 'Bullish' ? 'BUY' : 'SELL',
          quantity: activeSymbol.quantity || 1,
          testMode
        })
      });

      const data = await response.json();

      if (data.success) {
        setStats(prev => ({ ...prev, totalTrades: prev.totalTrades + 1 }));
        
        onLog({
          timestamp: Date.now(),
          type: testMode ? 'TEST_TRADE' : 'TRADE_EXECUTED',
          message: `${testMode ? '[TEST] ' : ''}${data.order.transactionType} order executed for ${activeSymbol.name} - ID: ${data.order.orderId}`,
          data: data.order
        });
      } else {
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ Trade failed: ${data.error || 'Unknown error'}`
        });
      }
    } catch (error) {
      console.error('Trade execution error:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Trade execution failed: ${error}`
      });
    }
  };

  // Update positions
  const updatePositions = async () => {
    try {
      const response = await fetch(`${serverUrl}/live-positions`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const data = await response.json();

      if (data.positions && data.positions.length > 0) {
        onPositionUpdate(data.positions[0]);
      }
    } catch (error) {
      console.error('Position update error:', error);
    }
  };

  // Start/Stop Engine
  const toggleEngine = () => {
    if (!isRunning) {
      startEngine();
    } else {
      stopEngine();
    }
  };

  const startEngine = () => {
    if (!checkMarketStatus()) {
      alert('Market is closed! Trading hours: 9:15 AM - 3:30 PM IST');
      return;
    }

    setIsRunning(true);
    
    onLog({
      timestamp: Date.now(),
      type: 'SYSTEM',
      message: `🚀 Auto-Trading Engine STARTED [${testMode ? 'TEST MODE' : 'LIVE MODE'}]`
    });

    // Run first analysis immediately
    runAnalysis();

    // Set up analysis interval (5-15 minutes)
    analysisTimerRef.current = setInterval(() => {
      if (checkMarketStatus()) {
        runAnalysis();
      } else {
        stopEngine();
      }
    }, analysisInterval * 60 * 1000);

    // Set up position check interval (2 minutes)
    positionTimerRef.current = setInterval(() => {
      updatePositions();
    }, positionCheckInterval * 60 * 1000);

    // Set up real-time price updates (every 100ms for millisecond precision)
    priceUpdateTimerRef.current = setInterval(() => {
      updatePositions();
    }, 100);
  };

  const stopEngine = () => {
    setIsRunning(false);
    
    if (analysisTimerRef.current) {
      clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    
    if (positionTimerRef.current) {
      clearInterval(positionTimerRef.current);
      positionTimerRef.current = null;
    }
    
    if (priceUpdateTimerRef.current) {
      clearInterval(priceUpdateTimerRef.current);
      priceUpdateTimerRef.current = null;
    }

    onLog({
      timestamp: Date.now(),
      type: 'SYSTEM',
      message: '⏸️ Auto-Trading Engine STOPPED'
    });
  };

  useEffect(() => {
    // Auto-start during market hours
    const intervalId = setInterval(() => {
      checkMarketStatus();
    }, 60000); // Check every minute

    checkMarketStatus();

    return () => {
      clearInterval(intervalId);
      stopEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`w-5 h-5 ${isRunning ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
            Auto-Trading Engine
          </div>
          <Badge variant={marketStatus === 'OPEN' ? 'default' : 'secondary'}>
            {marketStatus === 'OPEN' ? 'Market Open' : 'Market Closed'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Test Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <div className="space-y-1">
            <Label className="text-zinc-200">Test Mode</Label>
            <p className="text-xs text-zinc-400">
              Test orders will be marked and won't affect real positions
            </p>
          </div>
          <Switch
            checked={testMode}
            onCheckedChange={onTestModeChange}
            disabled={isRunning}
          />
        </div>

        {/* Engine Controls */}
        <div className="space-y-4">
          <Button
            onClick={toggleEngine}
            className={`w-full ${isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            size="lg"
          >
            {isRunning ? (
              <>
                <Pause className="w-5 h-5 mr-2" />
                Stop Engine
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Start Engine
              </>
            )}
          </Button>

          {/* Interval Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs">AI Analysis Interval</Label>
              <select
                value={analysisInterval}
                onChange={(e) => setAnalysisInterval(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 text-sm"
              >
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300 text-xs">Position Check</Label>
              <select
                value={positionCheckInterval}
                onChange={(e) => setPositionCheckInterval(Number(e.target.value))}
                disabled={isRunning}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-zinc-100 text-sm"
              >
                <option value={1}>1 minute</option>
                <option value={2}>2 minutes</option>
                <option value={5}>5 minutes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400 mb-1">Analyses</div>
            <div className="text-xl font-bold text-zinc-100">{stats.totalAnalyses}</div>
          </div>
          <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400 mb-1">Trades</div>
            <div className="text-xl font-bold text-emerald-400">{stats.totalTrades}</div>
          </div>
          <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
            <div className="text-xs text-zinc-400 mb-1">Speed</div>
            <div className="text-xl font-bold text-blue-400">{stats.responseTime}ms</div>
          </div>
        </div>

        {/* Last Update */}
        {lastUpdate && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Clock className="w-3 h-3" />
            Last update: {lastUpdate.toLocaleTimeString()}
          </div>
        )}

        {/* Status Indicator */}
        {isRunning && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/50 rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <TrendingUp className="w-4 h-4 animate-pulse" />
              Engine running - Monitoring every {analysisInterval} minutes
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}