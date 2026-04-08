// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Play, Pause, Zap, Clock, Target, TrendingUp, TrendingDown, Upload, Search, X, Check, Trash2 } from "lucide-react";

interface HighSpeedTradingEngineProps {
  serverUrl: string;
  accessToken: string;
  onLog: (log: any) => void;
}

interface TradingSymbol {
  id: string;
  name: string;
  securityId: string;
  expiry: string;
  strike: number;
  optionType: 'CE' | 'PE';
  lotSize: number;
  spread: number;          // NEW: Spread amount
  targetAmount: number;    // NEW: Target profit
  stopLossAmount: number;  // NEW: Stop loss
}

interface ActivePosition {
  symbolId: string;
  symbolName: string;
  entryPrice: number;
  quantity: number;
  targetAmount: number;
  stopLossAmount: number;
  currentPnL: number;
  entryTime: number;
  side: 'BUY' | 'SELL';
  optionType: 'CE' | 'PE';
}

interface CSVPreviewData {
  name: string;
  securityId: string;
  expiry: string;
  strike: number;
  optionType: string;
  lotSize: number;
  spread: number;
  targetAmount: number;
  stopLossAmount: number;
}

export function HighSpeedTradingEngine({ serverUrl, accessToken, onLog }: HighSpeedTradingEngineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState<'NORMAL' | 'FAST' | 'ULTRA'>('NORMAL');
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('CLOSED');
  const [symbols, setSymbols] = useState<TradingSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]);
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [executionCount, setExecutionCount] = useState(0);
  const [avgExecutionTime, setAvgExecutionTime] = useState(0);
  
  // CSV Preview
  const [csvPreview, setCsvPreview] = useState<CSVPreviewData[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  
  // Manual Entry Form
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    name: '',
    securityId: '',
    expiry: '',
    strike: 0,
    optionType: 'CE' as 'CE' | 'PE',
    lotSize: 50,
    spread: 0,
    targetAmount: 0,
    stopLossAmount: 0
  });
  
  // Search for NIFTY options
  const [searchStrike, setSearchStrike] = useState<number>(0);
  const [searchExpiry, setSearchExpiry] = useState<string>('');
  const [optionType, setOptionType] = useState<'CE' | 'PE'>('CE');
  
  const engineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionMonitorRef = useRef<NodeJS.Timeout | null>(null);

  // Load symbols from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('trading_symbols');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSymbols(parsed);
        console.log('✅ Loaded symbols from localStorage:', parsed.length);
      } catch (e) {
        console.error('Error loading symbols from localStorage:', e);
      }
    }
  }, []);

  // Save symbols to localStorage whenever they change
  useEffect(() => {
    if (symbols.length > 0) {
      localStorage.setItem('trading_symbols', JSON.stringify(symbols));
      console.log('💾 Saved symbols to localStorage:', symbols.length);
    }
  }, [symbols]);

  // Check if market is open (9:00 AM - 3:30 PM IST)
  const checkMarketStatus = () => {
    const now = new Date();
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

  // Get interval based on speed (MILLISECONDS!)
  const getIntervals = () => {
    switch (speed) {
      case 'ULTRA':
        return { signal: 100, monitor: 50 }; // 100ms signal, 50ms monitor - MILLISECOND SPEED!
      case 'FAST':
        return { signal: 500, monitor: 200 }; // 500ms signal, 200ms monitor
      case 'NORMAL':
      default:
        return { signal: 1000, monitor: 500 }; // 1 sec signal, 0.5 sec monitor
    }
  };

  // Upload CSV symbols
  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const newSymbols: TradingSymbol[] = [];
      const previewData: CSVPreviewData[] = [];

      // Skip header, parse CSV
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        if (parts.length >= 6) {
          const symbol: TradingSymbol = {
            id: `SYM_${Date.now()}_${i}`,
            name: parts[0].trim(),
            securityId: parts[1].trim(),
            expiry: parts[2].trim(),
            strike: parseFloat(parts[3].trim()),
            optionType: parts[4].trim() as 'CE' | 'PE',
            lotSize: parseInt(parts[5].trim()),
            spread: parseFloat(parts[6]?.trim() || '0'),
            targetAmount: parseFloat(parts[7]?.trim() || '0'),
            stopLossAmount: parseFloat(parts[8]?.trim() || '0')
          };

          newSymbols.push(symbol);

          // Add to preview data
          previewData.push({
            name: symbol.name,
            securityId: symbol.securityId,
            expiry: symbol.expiry,
            strike: symbol.strike,
            optionType: symbol.optionType,
            lotSize: symbol.lotSize,
            spread: symbol.spread,
            targetAmount: symbol.targetAmount,
            stopLossAmount: symbol.stopLossAmount
          });
        }
      }

      setCsvPreview(previewData);
      setShowPreview(true);
      
      onLog({
        timestamp: Date.now(),
        type: 'CSV_PREVIEW',
        message: `📋 CSV Preview ready - ${previewData.length} symbols found`
      });
    };
    reader.readAsText(file);
  };

  // Save CSV Preview to localStorage
  const saveCsvToStorage = () => {
    const newSymbols = csvPreview.map((preview, index) => ({
      id: `SYM_${Date.now()}_${index}`,
      name: preview.name,
      securityId: preview.securityId,
      expiry: preview.expiry,
      strike: preview.strike,
      optionType: preview.optionType as 'CE' | 'PE',
      lotSize: preview.lotSize,
      spread: preview.spread,
      targetAmount: preview.targetAmount,
      stopLossAmount: preview.stopLossAmount
    }));

    setSymbols(prev => [...prev, ...newSymbols]);
    setShowPreview(false);
    setCsvPreview([]);
    
    onLog({
      timestamp: Date.now(),
      type: 'SYMBOL_UPLOAD',
      message: `✅ Saved ${newSymbols.length} symbols to localStorage`
    });
  };

  // Delete symbol
  const deleteSymbol = (id: string) => {
    setSymbols(prev => prev.filter(s => s.id !== id));
    onLog({
      timestamp: Date.now(),
      type: 'SYMBOL_DELETE',
      message: `🗑️ Symbol deleted`
    });
  };

  // Add manual entry
  const addManualEntry = () => {
    if (!manualEntry.name || !manualEntry.securityId || !manualEntry.expiry) {
      alert('Please fill all required fields');
      return;
    }

    const newSymbol: TradingSymbol = {
      id: `SYM_${Date.now()}`,
      name: manualEntry.name,
      securityId: manualEntry.securityId,
      expiry: manualEntry.expiry,
      strike: manualEntry.strike,
      optionType: manualEntry.optionType,
      lotSize: manualEntry.lotSize,
      spread: manualEntry.spread,
      targetAmount: manualEntry.targetAmount,
      stopLossAmount: manualEntry.stopLossAmount
    };

    setSymbols(prev => [...prev, newSymbol]);
    setShowManualEntry(false);
    
    // Reset form
    setManualEntry({
      name: '',
      securityId: '',
      expiry: '',
      strike: 0,
      optionType: 'CE',
      lotSize: 50,
      spread: 0,
      targetAmount: 0,
      stopLossAmount: 0
    });

    onLog({
      timestamp: Date.now(),
      type: 'MANUAL_ADD',
      message: `✅ Manually added ${newSymbol.name} to localStorage`
    });
  };

  // Search and add NIFTY option
  const searchAndAddOption = async () => {
    if (!searchStrike || !searchExpiry) {
      alert('Please enter strike price and expiry date');
      return;
    }

    try {
      // Search in options chain
      const response = await fetch(`${serverUrl}/search-option`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          index: 'NIFTY',
          strike: searchStrike,
          expiry: searchExpiry,
          optionType
        })
      });

      const data = await response.json();
      
      if (data.option) {
        const newSymbol: TradingSymbol = {
          id: `SYM_${Date.now()}`,
          name: `NIFTY ${searchStrike} ${optionType}`,
          securityId: data.option.securityId,
          expiry: searchExpiry,
          strike: searchStrike,
          optionType,
          lotSize: 50, // NIFTY lot size
          spread: 0,
          targetAmount: 0,
          stopLossAmount: 0
        };

        setSymbols(prev => [...prev, newSymbol]);
        onLog({
          timestamp: Date.now(),
          type: 'SYMBOL_ADD',
          message: `Added ${newSymbol.name} - Expiry: ${searchExpiry}`
        });
      }
    } catch (error) {
      console.error('Error searching option:', error);
    }
  };

  // Get AI signal
  const getAISignal = async () => {
    if (!selectedSymbol) return null;

    const startTime = performance.now();

    try {
      const response = await fetch(`${serverUrl}/get-ai-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          symbolId: selectedSymbol,
          index: 'NIFTY'
        })
      });

      const data = await response.json();
      const executionTime = performance.now() - startTime;
      
      setAvgExecutionTime(prev => (prev + executionTime) / 2);
      
      return data.signal;
    } catch (error) {
      console.error('Error getting AI signal:', error);
      return null;
    }
  };

  // Execute order
  const executeOrder = async (signal: any) => {
    const symbol = symbols.find(s => s.id === selectedSymbol);
    if (!symbol) return;

    const startTime = performance.now();

    try {
      // Determine action from AI signal
      const action = signal.action; // BUY_CALL, BUY_PUT, SELL_CALL, SELL_PUT, HOLD, EXIT
      
      if (action === 'HOLD') {
        onLog({
          timestamp: Date.now(),
          type: 'SIGNAL',
          message: `AI Signal: HOLD - ${signal.reason || 'No action needed'}`
        });
        return;
      }

      if (action === 'EXIT') {
        // Exit all positions for this symbol
        await exitPosition(selectedSymbol);
        return;
      }

      // Parse action (e.g., BUY_CALL -> side: BUY, type: CE)
      const [side, optionTypeStr] = action.split('_');
      const optType = optionTypeStr === 'CALL' ? 'CE' : 'PE';

      // Place order via Dhan API
      const response = await fetch(`${serverUrl}/place-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          securityId: symbol.securityId,
          transactionType: side, // BUY or SELL
          quantity: symbol.lotSize,
          orderType: 'MARKET',
          productType: 'INTRADAY',
          exchangeSegment: 'NSE_FNO'
        })
      });

      const orderData = await response.json();
      const executionTime = performance.now() - startTime;

      if (orderData.success) {
        // Add to active positions
        const newPosition: ActivePosition = {
          symbolId: symbol.id,
          symbolName: symbol.name,
          entryPrice: orderData.executedPrice || signal.entryPrice || 0,
          quantity: symbol.lotSize,
          targetAmount: symbol.targetAmount,
          stopLossAmount: symbol.stopLossAmount,
          currentPnL: 0,
          entryTime: Date.now(),
          side: side as 'BUY' | 'SELL',
          optionType: optType
        };

        setActivePositions(prev => [...prev, newPosition]);
        setExecutionCount(prev => prev + 1);

        onLog({
          timestamp: Date.now(),
          type: 'ORDER_EXECUTED',
          message: `✅ ${action} executed in ${executionTime.toFixed(0)}ms - Entry: ₹${newPosition.entryPrice}`,
          data: orderData
        });
      } else {
        onLog({
          timestamp: Date.now(),
          type: 'ORDER_FAILED',
          message: `❌ Order failed: ${orderData.message || 'Unknown error'}`
        });
      }
    } catch (error) {
      console.error('Error executing order:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `Error executing order: ${error}`
      });
    }
  };

  // Monitor positions for target/stop loss
  const monitorPositions = async () => {
    if (activePositions.length === 0) return;

    try {
      // Get current positions from Dhan
      const response = await fetch(`${serverUrl}/positions`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const data = await response.json();
      
      if (data.success && data.positions) {
        // Update P&L for each position
        const updatedPositions: ActivePosition[] = [];

        for (const pos of activePositions) {
          const symbol = symbols.find(s => s.id === pos.symbolId);
          if (!symbol) continue;

          // Find matching position in Dhan data
          const dhanPos = data.positions.find((p: any) => 
            p.securityId === symbol.securityId || 
            p.tradingSymbol?.includes(symbol.name)
          );

          if (dhanPos) {
            // Calculate P&L from Dhan position
            const realizedPnL = parseFloat(dhanPos.realizedProfit || 0);
            const unrealizedPnL = parseFloat(dhanPos.unrealizedProfit || 0);
            const currentPnL = realizedPnL + unrealizedPnL;

            console.log(`📊 Position P&L: ${pos.symbolName} = ₹${currentPnL.toFixed(2)} (Target: ₹${pos.targetAmount}, SL: ₹${pos.stopLossAmount})`);

            // Check TARGET HIT
            if (currentPnL >= pos.targetAmount) {
              onLog({
                timestamp: Date.now(),
                type: 'TARGET_HIT',
                message: `🎯 TARGET HIT! ${pos.symbolName} P&L: ₹${currentPnL.toFixed(2)} >= ₹${pos.targetAmount} - Auto-exiting...`
              });
              
              await exitPosition(pos.symbolId, 'TARGET_HIT');
              continue; // Skip adding to updated positions
            }

            // Check STOP LOSS HIT
            if (currentPnL <= -pos.stopLossAmount) {
              onLog({
                timestamp: Date.now(),
                type: 'STOP_LOSS_HIT',
                message: `🛑 STOP LOSS HIT! ${pos.symbolName} P&L: ₹${currentPnL.toFixed(2)} <= -₹${pos.stopLossAmount} - Auto-exiting...`
              });
              
              await exitPosition(pos.symbolId, 'STOP_LOSS_HIT');
              continue; // Skip adding to updated positions
            }

            // Position still active, update P&L
            updatedPositions.push({ ...pos, currentPnL });
          } else {
            // Position not found in Dhan, keep with existing P&L
            updatedPositions.push(pos);
          }
        }

        setActivePositions(updatedPositions);
      }
    } catch (error) {
      console.error('Error monitoring positions:', error);
    }
  };

  // Exit position
  const exitPosition = async (symbolId: string, reason: string = 'MANUAL') => {
    const position = activePositions.find(p => p.symbolId === symbolId);
    if (!position) return;

    const symbol = symbols.find(s => s.id === symbolId);
    if (!symbol) return;

    try {
      // Place exit order (opposite side)
      const exitSide = position.side === 'BUY' ? 'SELL' : 'BUY';

      const response = await fetch(`${serverUrl}/place-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          securityId: symbol.securityId,
          transactionType: exitSide,
          quantity: position.quantity,
          orderType: 'MARKET',
          productType: 'INTRADAY',
          exchangeSegment: 'NSE_FNO'
        })
      });

      const orderData = await response.json();

      if (orderData.success) {
        setActivePositions(prev => prev.filter(p => p.symbolId !== symbolId));
        
        onLog({
          timestamp: Date.now(),
          type: 'POSITION_EXITED',
          message: `🚪 Position exited - ${reason} - P&L: ₹${position.currentPnL.toFixed(2)}`,
          data: { position, reason }
        });
      }
    } catch (error) {
      console.error('Error exiting position:', error);
    }
  };

  // Main engine loop
  const runEngine = async () => {
    if (!checkMarketStatus()) {
      onLog({
        timestamp: Date.now(),
        type: 'MARKET_CLOSED',
        message: '⚠️ Market is closed. Engine stopped.'
      });
      setIsRunning(false);
      return;
    }

    // Get AI signal
    const signal = await getAISignal();
    
    if (signal) {
      setLastSignal(signal);
      
      // Execute order based on signal
      await executeOrder(signal);
    }
  };

  // Start/Stop engine
  useEffect(() => {
    if (isRunning) {
      const intervals = getIntervals();
      
      // Run immediately
      runEngine();
      
      // Set up intervals
      engineTimerRef.current = setInterval(runEngine, intervals.signal);
      positionMonitorRef.current = setInterval(monitorPositions, intervals.monitor);

      onLog({
        timestamp: Date.now(),
        type: 'ENGINE_START',
        message: `🚀 High-speed engine started - ${speed} mode - Signal: ${intervals.signal}ms, Monitor: ${intervals.monitor}ms`
      });
    } else {
      if (engineTimerRef.current) clearInterval(engineTimerRef.current);
      if (positionMonitorRef.current) clearInterval(positionMonitorRef.current);
      
      onLog({
        timestamp: Date.now(),
        type: 'ENGINE_STOP',
        message: '⏹️ Engine stopped'
      });
    }

    return () => {
      if (engineTimerRef.current) clearInterval(engineTimerRef.current);
      if (positionMonitorRef.current) clearInterval(positionMonitorRef.current);
    };
  }, [isRunning, speed, selectedSymbol]);

  // Check market status every minute
  useEffect(() => {
    checkMarketStatus();
    const interval = setInterval(checkMarketStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      {/* Engine Controls */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            High-Speed AI Trading Engine
            <Badge className={`ml-auto ${marketStatus === 'OPEN' ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {marketStatus}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Speed Mode</Label>
              <Select value={speed} onValueChange={(v) => setSpeed(v as any)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="NORMAL">Normal (1 min)</SelectItem>
                  <SelectItem value="FAST">Fast (5 sec)</SelectItem>
                  <SelectItem value="ULTRA">Ultra (1 sec)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => setIsRunning(!isRunning)}
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

              <div className="flex items-center gap-4 text-sm text-zinc-400">
                <div>Executions: {executionCount}</div>
                <div>Avg Speed: {avgExecutionTime.toFixed(0)}ms</div>
                <div>Active: {activePositions.length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Symbol Search & Add */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Add NIFTY Options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Label>Strike Price</Label>
              <Input
                type="number"
                placeholder="24000"
                value={searchStrike || ''}
                onChange={(e) => setSearchStrike(parseFloat(e.target.value))}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <div>
              <Label>Expiry Date</Label>
              <Input
                type="date"
                value={searchExpiry}
                onChange={(e) => setSearchExpiry(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <div>
              <Label>Option Type</Label>
              <Select value={optionType} onValueChange={(v) => setOptionType(v as any)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="CE">Call (CE)</SelectItem>
                  <SelectItem value="PE">Put (PE)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={searchAndAddOption} className="w-full">
                <Search className="w-4 h-4 mr-2" />
                Add Symbol
              </Button>
            </div>

            <div className="flex items-end">
              <Label
                htmlFor="csv-upload"
                className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center justify-center w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload CSV
              </Label>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowManualEntry(!showManualEntry)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {showManualEntry ? '✕ Close Manual Entry' : '+ Manual Entry (Dhan Format)'}
            </Button>
            <div className="text-xs text-zinc-500">
              CSV Format: Name,SecurityId,Expiry,Strike,Type(CE/PE),LotSize,Spread,TargetAmount,StopLossAmount
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manual Entry Form */}
      {showManualEntry && (
        <Card className="bg-zinc-900 border-zinc-800 border-purple-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-400">
              📝 Manual Symbol Entry - Dhan Execution Format
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Symbol Name *</Label>
                <Input
                  placeholder="NIFTY 24000 CE"
                  value={manualEntry.name}
                  onChange={(e) => setManualEntry({...manualEntry, name: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Security ID * (Dhan)</Label>
                <Input
                  placeholder="12345"
                  value={manualEntry.securityId}
                  onChange={(e) => setManualEntry({...manualEntry, securityId: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Expiry Date *</Label>
                <Input
                  type="date"
                  value={manualEntry.expiry}
                  onChange={(e) => setManualEntry({...manualEntry, expiry: e.target.value})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Strike Price</Label>
                <Input
                  type="number"
                  placeholder="24000"
                  value={manualEntry.strike || ''}
                  onChange={(e) => setManualEntry({...manualEntry, strike: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Option Type</Label>
                <Select 
                  value={manualEntry.optionType} 
                  onValueChange={(v) => setManualEntry({...manualEntry, optionType: v as 'CE' | 'PE'})}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="CE">Call (CE)</SelectItem>
                    <SelectItem value="PE">Put (PE)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Lot Size</Label>
                <Input
                  type="number"
                  placeholder="50"
                  value={manualEntry.lotSize || ''}
                  onChange={(e) => setManualEntry({...manualEntry, lotSize: parseInt(e.target.value) || 50})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Spread (₹)</Label>
                <Input
                  type="number"
                  placeholder="10"
                  value={manualEntry.spread || ''}
                  onChange={(e) => setManualEntry({...manualEntry, spread: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Target Amount (₹)</Label>
                <Input
                  type="number"
                  placeholder="500"
                  value={manualEntry.targetAmount || ''}
                  onChange={(e) => setManualEntry({...manualEntry, targetAmount: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>Stop Loss (₹)</Label>
                <Input
                  type="number"
                  placeholder="300"
                  value={manualEntry.stopLossAmount || ''}
                  onChange={(e) => setManualEntry({...manualEntry, stopLossAmount: parseFloat(e.target.value) || 0})}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                onClick={addManualEntry}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Check className="w-4 h-4 mr-2" />
                Add to Storage
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowManualEntry(false)}
              >
                Cancel
              </Button>
            </div>

            <div className="text-xs text-zinc-500 mt-4">
              * Required fields for Dhan API execution
            </div>
          </CardContent>
        </Card>
      )}

      {/* CSV Preview */}
      {showPreview && csvPreview.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              CSV Preview ({csvPreview.length} symbols)
            </CardTitle>
            <div className="flex gap-2">
              <Button
                onClick={saveCsvToStorage}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Check className="w-4 h-4 mr-2" />
                Save All to Storage
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPreview(false);
                  setCsvPreview([]);
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-700">
                  <tr className="text-left text-zinc-400">
                    <th className="pb-2 px-2">Name</th>
                    <th className="pb-2 px-2">Security ID</th>
                    <th className="pb-2 px-2">Expiry</th>
                    <th className="pb-2 px-2">Strike</th>
                    <th className="pb-2 px-2">Type</th>
                    <th className="pb-2 px-2">Lot Size</th>
                    <th className="pb-2 px-2">Spread</th>
                    <th className="pb-2 px-2">Target</th>
                    <th className="pb-2 px-2">Stop Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((preview, index) => (
                    <tr key={index} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="py-3 px-2 font-semibold">{preview.name}</td>
                      <td className="py-3 px-2 text-zinc-400">{preview.securityId}</td>
                      <td className="py-3 px-2 text-zinc-400">{preview.expiry}</td>
                      <td className="py-3 px-2">{preview.strike}</td>
                      <td className="py-3 px-2">
                        <Badge className={preview.optionType === 'CE' ? 'bg-emerald-600' : 'bg-red-600'}>
                          {preview.optionType}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">{preview.lotSize}</td>
                      <td className="py-3 px-2 text-blue-400">₹{preview.spread}</td>
                      <td className="py-3 px-2 text-emerald-400">₹{preview.targetAmount}</td>
                      <td className="py-3 px-2 text-red-400">₹{preview.stopLossAmount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Symbol Selection */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>Trading Symbols ({symbols.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700">
              <SelectValue placeholder="Select symbol to trade" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700 max-h-60">
              {symbols.map(symbol => (
                <SelectItem key={symbol.id} value={symbol.id}>
                  {symbol.name} - {symbol.expiry} - Strike: {symbol.strike}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Symbol Table */}
          {symbols.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead className="border-b border-zinc-700">
                  <tr className="text-left text-zinc-400">
                    <th className="pb-2 px-2">Name</th>
                    <th className="pb-2 px-2">Expiry</th>
                    <th className="pb-2 px-2">Strike</th>
                    <th className="pb-2 px-2">Type</th>
                    <th className="pb-2 px-2">Lot</th>
                    <th className="pb-2 px-2">Spread</th>
                    <th className="pb-2 px-2">Target</th>
                    <th className="pb-2 px-2">Stop Loss</th>
                    <th className="pb-2 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {symbols.map((symbol) => (
                    <tr 
                      key={symbol.id} 
                      className={`border-b border-zinc-800 hover:bg-zinc-800/50 ${
                        selectedSymbol === symbol.id ? 'bg-blue-900/20' : ''
                      }`}
                    >
                      <td className="py-3 px-2 font-semibold">{symbol.name}</td>
                      <td className="py-3 px-2 text-zinc-400">{symbol.expiry}</td>
                      <td className="py-3 px-2">{symbol.strike}</td>
                      <td className="py-3 px-2">
                        <Badge className={symbol.optionType === 'CE' ? 'bg-emerald-600' : 'bg-red-600'}>
                          {symbol.optionType}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">{symbol.lotSize}</td>
                      <td className="py-3 px-2 text-blue-400">₹{symbol.spread}</td>
                      <td className="py-3 px-2 text-emerald-400">₹{symbol.targetAmount}</td>
                      <td className="py-3 px-2 text-red-400">₹{symbol.stopLossAmount}</td>
                      <td className="py-3 px-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteSymbol(symbol.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Positions */}
      {activePositions.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              Active Positions ({activePositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activePositions.map(pos => (
                <div key={pos.symbolId} className="bg-zinc-800 p-4 rounded-lg flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-semibold">{pos.symbolName}</div>
                    <div className="text-sm text-zinc-400">
                      {pos.side} {pos.optionType} • Entry: ₹{pos.entryPrice} • Qty: {pos.quantity}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-mono ${pos.currentPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {pos.currentPnL >= 0 ? '+' : ''}₹{pos.currentPnL.toFixed(2)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      Target: ₹{pos.targetAmount} • SL: ₹{pos.stopLossAmount}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => exitPosition(pos.symbolId, 'MANUAL')}
                    className="ml-4"
                  >
                    Exit
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Signal */}
      {lastSignal && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              Last AI Signal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-zinc-400">Action</div>
                <div className="text-lg font-semibold">{lastSignal.action}</div>
              </div>
              <div>
                <div className="text-zinc-400">Confidence</div>
                <div className="text-lg">{lastSignal.confidence}%</div>
              </div>
              <div>
                <div className="text-zinc-400">Market State</div>
                <div>{lastSignal.market_state}</div>
              </div>
              <div>
                <div className="text-zinc-400">Bias</div>
                <div className={lastSignal.bias === 'Bullish' ? 'text-emerald-400' : 'text-red-400'}>
                  {lastSignal.bias}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}