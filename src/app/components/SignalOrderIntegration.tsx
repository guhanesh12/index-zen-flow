import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle,
  AlertCircle,
  Zap,
  Target
} from 'lucide-react';
import { motion } from 'motion/react';

interface Signal {
  symbol: string;
  displayName: string;
  type: 'BUY' | 'SELL';
  timestamp: string;
  price?: number;
  confidence?: number;
}

interface SignalOrderIntegrationProps {
  symbols: any[];
  onSignalDetected?: (symbol: any, signal: 'BUY' | 'SELL') => void;
}

export function SignalOrderIntegration({ symbols, onSignalDetected }: SignalOrderIntegrationProps) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [lastSignal, setLastSignal] = useState<Signal | null>(null);

  // Simulate signal detection (replace with your actual signal logic)
  useEffect(() => {
    const checkSignals = () => {
      symbols.forEach(symbol => {
        if (!symbol.active) return;

        // Example: Random signal generation (replace with real signal logic)
        const shouldGenerate = Math.random() < 0.001; // Very low probability for demo
        
        if (shouldGenerate) {
          const signal: Signal = {
            symbol: symbol.name,
            displayName: symbol.displayName || symbol.name,
            type: Math.random() > 0.5 ? 'BUY' : 'SELL',
            timestamp: new Date().toISOString(),
            price: Math.random() * 100,
            confidence: Math.random() * 100,
          };

          console.log('🎯 SIGNAL DETECTED:', signal);

          // Add to signals list
          setSignals(prev => [signal, ...prev.slice(0, 9)]);
          setLastSignal(signal);

          // Trigger order placement
          if (onSignalDetected) {
            onSignalDetected(symbol, signal.type);
          }

          // Also call global handler if available
          if ((window as any).placeOrderOnSignal) {
            (window as any).placeOrderOnSignal(symbol, signal.type);
          }
        }
      });
    };

    // Check every second (adjust based on your needs)
    const interval = setInterval(checkSignals, 1000);
    return () => clearInterval(interval);
  }, [symbols, onSignalDetected]);

  // Real signal detection based on your trading engine
  const detectSignalFromEngine = (symbol: any, engineOutput: any) => {
    // This function should be called by your trading engine
    // Example usage:
    // - Triple confirmation strategy output
    // - EMA + VWAP analysis
    // - AI decision from EnhancedTradingEngine

    const signal: Signal = {
      symbol: symbol.name,
      displayName: symbol.displayName || symbol.name,
      type: engineOutput.action, // 'BUY' or 'SELL' from your engine
      timestamp: new Date().toISOString(),
      price: engineOutput.price,
      confidence: engineOutput.confidence,
    };

    setSignals(prev => [signal, ...prev.slice(0, 9)]);
    setLastSignal(signal);

    // Trigger order placement
    if (onSignalDetected) {
      onSignalDetected(symbol, signal.type);
    }

    // Also call global handler
    if ((window as any).placeOrderOnSignal) {
      (window as any).placeOrderOnSignal(symbol, signal.type);
    }
  };

  // Expose function globally for your trading engine to call
  useEffect(() => {
    (window as any).triggerSignal = detectSignalFromEngine;
  }, [symbols, onSignalDetected]);

  return (
    <div className="space-y-4">
      {/* Active Signal Indicator */}
      {lastSignal && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fixed top-20 right-4 z-50"
        >
          <Card className={`border-2 ${
            lastSignal.type === 'BUY' 
              ? 'border-green-500 bg-green-500/10' 
              : 'border-red-500 bg-red-500/10'
          } backdrop-blur-xl shadow-2xl`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${
                  lastSignal.type === 'BUY' ? 'bg-green-500' : 'bg-red-500'
                } animate-pulse`}>
                  {lastSignal.type === 'BUY' ? (
                    <TrendingUp className="size-5 text-white" />
                  ) : (
                    <TrendingDown className="size-5 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-white font-bold">
                    {lastSignal.type} SIGNAL
                  </p>
                  <p className="text-sm text-slate-300">
                    {lastSignal.displayName}
                  </p>
                </div>
                <CheckCircle className="size-5 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Signal History */}
      <Card className="border-blue-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-blue-400" />
            Recent Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {signals.map((signal, index) => (
              <motion.div
                key={`${signal.symbol}-${signal.timestamp}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`p-3 rounded-lg border ${
                  signal.type === 'BUY'
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {signal.type === 'BUY' ? (
                      <TrendingUp className="size-5 text-green-400" />
                    ) : (
                      <TrendingDown className="size-5 text-red-400" />
                    )}
                    <div>
                      <p className="font-semibold text-white">
                        {signal.displayName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {new Date(signal.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={signal.type === 'BUY' ? 'default' : 'secondary'}>
                      {signal.type}
                    </Badge>
                    {signal.confidence && (
                      <p className="text-xs text-slate-400 mt-1">
                        {signal.confidence.toFixed(1)}% confidence
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {signals.length === 0 && (
              <div className="text-center py-8">
                <Target className="size-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No signals detected yet</p>
                <p className="text-sm text-slate-500 mt-1">
                  Monitoring {symbols.filter(s => s.active).length} active symbols
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Integration Instructions */}
      <Card className="border-purple-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="size-4 text-purple-400" />
            Integration Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="p-3 rounded bg-slate-800/50 border border-slate-700">
            <p className="text-slate-300 mb-2">
              <strong className="text-white">From Trading Engine:</strong>
            </p>
            <pre className="text-xs text-green-400 font-mono overflow-x-auto">
{`// Call this when your engine detects a signal
window.triggerSignal(symbol, {
  action: 'BUY' or 'SELL',
  price: currentPrice,
  confidence: 95.5
});`}
            </pre>
          </div>

          <div className="p-3 rounded bg-slate-800/50 border border-slate-700">
            <p className="text-slate-300 mb-2">
              <strong className="text-white">Direct Order Placement:</strong>
            </p>
            <pre className="text-xs text-blue-400 font-mono overflow-x-auto">
{`// Place order directly
window.placeOrderOnSignal(symbol, 'BUY');
window.placeOrderOnSignal(symbol, 'SELL');`}
            </pre>
          </div>

          <div className="flex items-start gap-2 p-3 rounded bg-blue-500/10 border border-blue-500/20">
            <AlertCircle className="size-4 text-blue-400 mt-0.5" />
            <div className="text-xs text-blue-300">
              <strong>Auto Order Placement:</strong> When a signal is detected,
              an order is automatically placed via Dhan API. Check the Order Management
              panel below for status updates.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
