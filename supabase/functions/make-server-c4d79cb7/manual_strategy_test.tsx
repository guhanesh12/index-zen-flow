/**
 * Manual Strategy Tester — runs the SAME AdvancedAI strategy on raw candles
 * with proper SL/TP exit simulation (intra-candle hit detection).
 */
import { AdvancedAI, OHLCCandle } from "./advanced_ai.tsx";

interface Signal {
  timestamp: number;
  date: string;
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT';
  price: number;
  confidence: number;
  ema9: number; ema21: number; vwap: number; rsi: number; adx: number;
  trend: string; bias: string; reasoning: string;
  // ⚡ NEW: SL/TP from strategy's risk management
  stopLoss: number; target: number; atr: number;
  candleIndex: number; // index in original candles array
}

export function runManualStrategy(
  open: number[], high: number[], low: number[], close: number[],
  volume: number[], timestamp: number[]
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
      ema9: sig.indicators.ema9, ema21: sig.indicators.ema21,
      vwap: sig.indicators.vwap, rsi: sig.indicators.rsi, adx: sig.indicators.adx,
      trend: sig.marketRegime.type, bias: sig.bias, reasoning: sig.reasoning,
      stopLoss: sig.riskManagement?.suggestedStopLoss ?? 0,
      target: sig.riskManagement?.suggestedTarget ?? 0,
      atr: sig.indicators.atr ?? 0,
      candleIndex: i,
    });
  }

  return {
    signals,
    candles,
    summary: {
      totalSignals: signals.length,
      buyCallSignals: buyCallCount, buyPutSignals: buyPutCount,
      waitSignals: waitCount,
      avgConfidence: signals.length ? totalConfidence / signals.length : 0,
    },
  };
}

/**
 * Simulate option-style trades with PROPER SL/TP exit detection.
 * Walks subsequent candles after entry; closes on:
 *   1. Stop-loss hit (intra-candle low/high crosses SL)
 *   2. Target hit (intra-candle high/low crosses TP)
 *   3. Opposite signal
 *   4. End of data
 */
export function simulateTrades(
  signals: Signal[],
  quantity: number = 75,
  candles: OHLCCandle[] = []
) {
  const trades: any[] = [];
  let i = 0;
  while (i < signals.length) {
    const entry = signals[i];
    if (entry.action === 'WAIT') { i++; continue; }

    const isLong = entry.action === 'BUY_CALL';
    const sl = entry.stopLoss;
    const tp = entry.target;
    let exitPrice = entry.price;
    let exitTs = entry.timestamp;
    let exitReason = 'END_OF_DATA';
    let exitDate = entry.date;
    let holdingBars = 0;

    // Walk forward through candles after entry
    for (let k = entry.candleIndex + 1; k < candles.length; k++) {
      const c = candles[k];
      holdingBars++;
      // Check SL/TP intra-candle
      if (isLong) {
        if (c.low <= sl) { exitPrice = sl; exitReason = 'SL'; exitTs = c.timestamp; exitDate = new Date(c.timestamp * 1000).toLocaleString('en-IN'); break; }
        if (c.high >= tp) { exitPrice = tp; exitReason = 'TP'; exitTs = c.timestamp; exitDate = new Date(c.timestamp * 1000).toLocaleString('en-IN'); break; }
      } else {
        if (c.high >= sl) { exitPrice = sl; exitReason = 'SL'; exitTs = c.timestamp; exitDate = new Date(c.timestamp * 1000).toLocaleString('en-IN'); break; }
        if (c.low <= tp) { exitPrice = tp; exitReason = 'TP'; exitTs = c.timestamp; exitDate = new Date(c.timestamp * 1000).toLocaleString('en-IN'); break; }
      }
      // Check opposite signal at this candle
      const sigAtK = signals.find(s => s.candleIndex === k);
      if (sigAtK && ((isLong && sigAtK.action === 'BUY_PUT') || (!isLong && sigAtK.action === 'BUY_CALL'))) {
        exitPrice = c.close; exitReason = 'REVERSE_SIGNAL'; exitTs = c.timestamp; exitDate = sigAtK.date; break;
      }
    }

    const pnl = isLong ? (exitPrice - entry.price) * quantity : (entry.price - exitPrice) * quantity;
    const pointsMoved = isLong ? exitPrice - entry.price : entry.price - exitPrice;
    trades.push({
      entry: entry.action,
      entryPrice: entry.price, exitPrice,
      stopLoss: sl, target: tp,
      entryTime: entry.date, exitTime: exitDate,
      pnl, pointsMoved: Number(pointsMoved.toFixed(2)),
      holdingBars, exitReason,
      result: pnl >= 0 ? 'WIN' : 'LOSS',
      confidence: entry.confidence,
    });

    // Skip past the exit point so we don't re-enter on every WAIT
    while (i < signals.length && signals[i].timestamp <= exitTs) i++;
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
      tpExits: trades.filter(t => t.exitReason === 'TP').length,
      slExits: trades.filter(t => t.exitReason === 'SL').length,
      reverseExits: trades.filter(t => t.exitReason === 'REVERSE_SIGNAL').length,
    },
  };
}
