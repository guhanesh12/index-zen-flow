/**
 * Manual Strategy Tester
 * Runs the SAME AdvancedAI strategy used by the live engine on raw candles.
 * This guarantees backtest results match live signals 1:1.
 */
import { AdvancedAI, OHLCCandle } from "./advanced_ai.tsx";

interface Signal {
  timestamp: number;
  date: string;
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT';
  price: number;
  confidence: number;
  ema9: number;
  ema21: number;
  vwap: number;
  rsi: number;
  adx: number;
  trend: string;
  bias: string;
  reasoning: string;
}

export function runManualStrategy(
  open: number[],
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  timestamp: number[]
) {
  console.log(`🧪 MANUAL BACKTEST (AdvancedAI) — ${close.length} candles`);
  
  const candles: OHLCCandle[] = [];
  for (let i = 0; i < close.length; i++) {
    candles.push({
      open: open[i], high: high[i], low: low[i], close: close[i],
      volume: volume[i] || 0, timestamp: timestamp[i],
    });
  }
  
  const signals: Signal[] = [];
  let buyCallCount = 0, buyPutCount = 0, waitCount = 0, totalConfidence = 0;
  
  // Need at least 50 candles for ADX/EMA50 to be meaningful
  const MIN_WARMUP = 50;
  for (let i = MIN_WARMUP; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const sig = AdvancedAI.generateAdvancedSignal(window);
    
    if (sig.action === 'BUY_CALL') buyCallCount++;
    else if (sig.action === 'BUY_PUT') buyPutCount++;
    else waitCount++;
    
    totalConfidence += sig.confidence;
    
    signals.push({
      timestamp: candles[i].timestamp,
      date: new Date(candles[i].timestamp * 1000).toLocaleString('en-IN'),
      action: sig.action as any,
      price: candles[i].close,
      confidence: sig.confidence,
      ema9: sig.indicators.ema9,
      ema21: sig.indicators.ema21,
      vwap: sig.indicators.vwap,
      rsi: sig.indicators.rsi,
      adx: sig.indicators.adx,
      trend: sig.marketRegime.type,
      bias: sig.bias,
      reasoning: sig.reasoning,
    });
  }
  
  return {
    signals,
    summary: {
      totalSignals: signals.length,
      buyCallSignals: buyCallCount,
      buyPutSignals: buyPutCount,
      waitSignals: waitCount,
      avgConfidence: signals.length ? totalConfidence / signals.length : 0,
    },
  };
}

/** Simulate option-style trades from generated signals */
export function simulateTrades(signals: Signal[], quantity: number = 75) {
  const trades: any[] = [];
  let position: 'LONG' | 'SHORT' | null = null;
  let entryPrice = 0, entryTime = 0, entryAction = '';
  
  const closeTrade = (exitPrice: number, exitDate: string, exitTs: number) => {
    const pnl = position === 'LONG'
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;
    trades.push({
      entry: entryAction,
      entryPrice, exitPrice,
      entryTime: new Date(entryTime * 1000).toLocaleString('en-IN'),
      exitTime: exitDate,
      pnl,
      holdingMinutes: Math.floor((exitTs - entryTime) / 60),
      result: pnl >= 0 ? 'WIN' : 'LOSS',
    });
  };
  
  for (const s of signals) {
    if (position === 'LONG' && s.action === 'BUY_PUT') {
      closeTrade(s.price, s.date, s.timestamp);
      position = 'SHORT'; entryPrice = s.price; entryTime = s.timestamp; entryAction = 'BUY_PUT';
    } else if (position === 'SHORT' && s.action === 'BUY_CALL') {
      closeTrade(s.price, s.date, s.timestamp);
      position = 'LONG'; entryPrice = s.price; entryTime = s.timestamp; entryAction = 'BUY_CALL';
    } else if (position === null && s.action !== 'WAIT') {
      position = s.action === 'BUY_CALL' ? 'LONG' : 'SHORT';
      entryPrice = s.price; entryTime = s.timestamp; entryAction = s.action;
    }
  }
  
  const wins = trades.filter(t => t.pnl >= 0);
  const losses = trades.filter(t => t.pnl < 0);
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  
  return {
    trades,
    stats: {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      totalPnL,
      avgWin: wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0,
    },
  };
}
