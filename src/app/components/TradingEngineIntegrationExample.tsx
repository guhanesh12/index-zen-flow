import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Zap, Activity, TrendingUp, CheckCircle } from 'lucide-react';

/**
 * EXAMPLE: How to integrate order placement with your existing trading engine
 * 
 * This shows how to connect your EnhancedTradingEngine with automatic order placement
 */

interface TradingEngineIntegrationExampleProps {
  symbols: any[];
}

export function TradingEngineIntegrationExample({ symbols }: TradingEngineIntegrationExampleProps) {
  const [engineStatus, setEngineStatus] = useState<'RUNNING' | 'STOPPED'>('STOPPED');
  const [lastAnalysis, setLastAnalysis] = useState<any>(null);

  useEffect(() => {
    if (engineStatus === 'RUNNING') {
      // Run analysis every second (adjust based on your needs)
      const interval = setInterval(() => {
        analyzeAndPlaceOrders();
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [engineStatus, symbols]);

  const analyzeAndPlaceOrders = () => {
    // Loop through all active symbols
    symbols.filter(s => s.active).forEach(symbol => {
      
      // 🎯 STEP 1: Your Trading Engine Analysis
      // Replace this with your actual EnhancedTradingEngine logic
      const analysis = analyzeSymbol(symbol);
      
      setLastAnalysis({
        symbol: symbol.displayName,
        ...analysis,
        timestamp: new Date().toISOString()
      });

      // 🎯 STEP 2: Check if action is needed
      if (analysis.action !== 'HOLD') {
        
        // 🎯 STEP 3: Trigger Signal (which automatically places order)
        console.log('🚀 Triggering Order:', {
          symbol: symbol.displayName,
          action: analysis.action,
          confidence: analysis.confidence,
          reason: analysis.reason
        });

        // Call the global signal handler (from SignalOrderIntegration)
        if ((window as any).triggerSignal) {
          (window as any).triggerSignal(symbol, {
            action: analysis.action,
            price: analysis.price,
            confidence: analysis.confidence
          });
        }

        // OR directly place order (from DhanOrderManager)
        if ((window as any).placeOrderOnSignal) {
          (window as any).placeOrderOnSignal(symbol, analysis.action);
        }
      }
    });
  };

  /**
   * YOUR TRADING ENGINE LOGIC HERE
   * 
   * This is a simplified example. Replace with your actual:
   * - EMA + VWAP Triple Confirmation Strategy
   * - AI Decision Making
   * - Market State Analysis
   * - Risk Management
   */
  const analyzeSymbol = (symbol: any) => {
    // Example: Random analysis (REPLACE WITH YOUR REAL LOGIC)
    
    // Simulate market data
    const currentPrice = 245.50 + (Math.random() - 0.5) * 10;
    const ema20 = 244.00;
    const ema50 = 242.50;
    const vwap = 243.75;
    
    // Your Triple Confirmation Logic:
    // 1. EMA Crossover
    const emaBullish = ema20 > ema50;
    const emaBearish = ema20 < ema50;
    
    // 2. VWAP Position
    const aboveVWAP = currentPrice > vwap;
    const belowVWAP = currentPrice < vwap;
    
    // 3. Price Action
    const priceStrength = (currentPrice - vwap) / vwap * 100;
    
    // Decision Making
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0;
    let reason = '';
    
    // BUY Conditions (Triple Confirmation)
    if (emaBullish && aboveVWAP && priceStrength > 0.5) {
      action = 'BUY';
      confidence = 85 + Math.random() * 10;
      reason = 'Triple Confirmation: EMA Bullish + Above VWAP + Strong Price Action';
    }
    
    // SELL Conditions (Triple Confirmation)
    else if (emaBearish && belowVWAP && priceStrength < -0.5) {
      action = 'SELL';
      confidence = 85 + Math.random() * 10;
      reason = 'Triple Confirmation: EMA Bearish + Below VWAP + Weak Price Action';
    }
    
    return {
      action,
      price: currentPrice,
      confidence,
      reason,
      indicators: {
        ema20,
        ema50,
        vwap,
        priceStrength
      }
    };
  };

  return (
    <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="size-5 text-purple-400" />
            Trading Engine Integration
          </span>
          <Badge variant={engineStatus === 'RUNNING' ? 'default' : 'secondary'}>
            {engineStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Engine Control */}
        <div className="flex gap-2">
          <Button
            onClick={() => setEngineStatus('RUNNING')}
            disabled={engineStatus === 'RUNNING'}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <Activity className="size-4 mr-2" />
            Start Engine
          </Button>
          <Button
            onClick={() => setEngineStatus('STOPPED')}
            disabled={engineStatus === 'STOPPED'}
            variant="outline"
            className="flex-1"
          >
            Stop Engine
          </Button>
        </div>

        {/* Last Analysis */}
        {lastAnalysis && (
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-white">{lastAnalysis.symbol}</p>
              <Badge variant={
                lastAnalysis.action === 'BUY' ? 'default' :
                lastAnalysis.action === 'SELL' ? 'secondary' : 'outline'
              }>
                {lastAnalysis.action}
              </Badge>
            </div>

            {lastAnalysis.action !== 'HOLD' && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle className="size-4" />
                  <span>Confidence: {lastAnalysis.confidence?.toFixed(1)}%</span>
                </div>
                <p className="text-slate-400">{lastAnalysis.reason}</p>
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-700">
                  <div>
                    <span className="text-slate-500 text-xs">Price:</span>
                    <p className="text-white">₹{lastAnalysis.price?.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">EMA 20:</span>
                    <p className="text-white">₹{lastAnalysis.indicators?.ema20?.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">EMA 50:</span>
                    <p className="text-white">₹{lastAnalysis.indicators?.ema50?.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">VWAP:</span>
                    <p className="text-white">₹{lastAnalysis.indicators?.vwap?.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Integration Guide */}
        <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
          <p className="font-semibold mb-2">📝 How This Works:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Engine analyzes market every second</li>
            <li>Uses EMA + VWAP Triple Confirmation</li>
            <li>When signal detected → calls window.triggerSignal()</li>
            <li>Order automatically placed via Dhan API</li>
            <li>Notification shown + Order logged</li>
          </ol>
        </div>

        {/* Code Example */}
        <details className="p-3 rounded bg-slate-800/50 border border-slate-700">
          <summary className="text-sm text-purple-400 cursor-pointer font-semibold mb-2">
            View Integration Code
          </summary>
          <pre className="text-xs text-green-400 font-mono overflow-x-auto mt-2">
{`// In your EnhancedTradingEngine:

const analyzeAndTrade = (symbol) => {
  // Your analysis logic
  const analysis = {
    action: 'BUY',          // or 'SELL' or 'HOLD'
    confidence: 95.5,       // confidence score
    price: 245.50,          // entry price
    reason: 'Triple confirmation'
  };
  
  // If signal detected
  if (analysis.action !== 'HOLD') {
    // Trigger automatic order placement
    window.triggerSignal(symbol, {
      action: analysis.action,
      price: analysis.price,
      confidence: analysis.confidence
    });
    
    // Order placed automatically! ✅
  }
};`}
          </pre>
        </details>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-700">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">
              {symbols.filter(s => s.active).length}
            </p>
            <p className="text-xs text-slate-400">Active</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">
              {engineStatus === 'RUNNING' ? '1/s' : '0'}
            </p>
            <p className="text-xs text-slate-400">Scan Rate</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-400">
              {lastAnalysis?.confidence?.toFixed(0) || '0'}%
            </p>
            <p className="text-xs text-slate-400">Confidence</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
