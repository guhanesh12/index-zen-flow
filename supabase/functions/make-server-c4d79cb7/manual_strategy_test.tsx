/**
 * Manual Strategy Tester
 * Takes raw candle data and runs the Advanced AI Strategy
 */

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

interface Signal {
  timestamp: number;
  date: string;
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT';
  price: number;
  confidence: number;
  ema9: number;
  ema21: number;
  vwap: number;
  trend: string;
  bias: string;
}

/**
 * Calculate EMA
 */
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
  }
  ema[period - 1] = sum / period;
  
  // Calculate rest of EMAs
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }
  
  return ema;
}

/**
 * Calculate VWAP
 */
function calculateVWAP(candles: Candle[]): number[] {
  const vwap: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    let sumPV = 0;
    let sumV = 0;
    
    // Use last 20 candles for VWAP
    const lookback = Math.min(20, i + 1);
    for (let j = i - lookback + 1; j <= i; j++) {
      const typical = (candles[j].high + candles[j].low + candles[j].close) / 3;
      sumPV += typical * candles[j].volume;
      sumV += candles[j].volume;
    }
    
    vwap[i] = sumV > 0 ? sumPV / sumV : candles[i].close;
  }
  
  return vwap;
}

/**
 * Generate trading signals using Advanced AI Strategy
 */
export function runManualStrategy(
  open: number[],
  high: number[],
  low: number[],
  close: number[],
  volume: number[],
  timestamp: number[]
): {
  signals: Signal[];
  summary: {
    totalSignals: number;
    buyCallSignals: number;
    buyPutSignals: number;
    waitSignals: number;
    avgConfidence: number;
  };
} {
  console.log('🧪 MANUAL STRATEGY TEST STARTING...');
  console.log(`📊 Candles: ${close.length}`);
  
  // Convert to candle objects
  const candles: Candle[] = [];
  for (let i = 0; i < close.length; i++) {
    candles.push({
      open: open[i],
      high: high[i],
      low: low[i],
      close: close[i],
      volume: volume[i],
      timestamp: timestamp[i]
    });
  }
  
  // Calculate indicators
  console.log('📈 Calculating EMA 9...');
  const ema9 = calculateEMA(close, 9);
  
  console.log('📈 Calculating EMA 21...');
  const ema21 = calculateEMA(close, 21);
  
  console.log('📈 Calculating VWAP...');
  const vwap = calculateVWAP(candles);
  
  console.log('✅ Indicators calculated');
  
  // Generate signals
  const signals: Signal[] = [];
  let buyCallCount = 0;
  let buyPutCount = 0;
  let waitCount = 0;
  let totalConfidence = 0;
  
  // Start from index 21 (need 21 candles for EMA21)
  for (let i = 21; i < candles.length; i++) {
    const price = candles[i].close;
    const currentEMA9 = ema9[i];
    const currentEMA21 = ema21[i];
    const currentVWAP = vwap[i];
    
    const prevEMA9 = ema9[i - 1];
    const prevEMA21 = ema21[i - 1];
    
    // BULLISH conditions (BUY CALL)
    const bullishEMA = currentEMA9 > currentEMA21 && prevEMA9 <= prevEMA21; // EMA crossover
    const bullishPrice = price > currentEMA9 && price > currentVWAP; // Price above both
    const bullishTrend = currentEMA9 > currentEMA21; // Uptrend
    
    // BEARISH conditions (BUY PUT)
    const bearishEMA = currentEMA9 < currentEMA21 && prevEMA9 >= prevEMA21; // EMA crossover down
    const bearishPrice = price < currentEMA9 && price < currentVWAP; // Price below both
    const bearishTrend = currentEMA9 < currentEMA21; // Downtrend
    
    let action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT' = 'WAIT';
    let confidence = 50;
    let bias = 'NEUTRAL';
    let trend = 'SIDEWAYS';
    
    // BULLISH SIGNAL
    if (bullishEMA && bullishPrice && bullishTrend) {
      action = 'BUY_CALL';
      confidence = 85;
      bias = 'BULLISH';
      trend = 'UPTREND';
      buyCallCount++;
    }
    // BEARISH SIGNAL
    else if (bearishEMA && bearishPrice && bearishTrend) {
      action = 'BUY_PUT';
      confidence = 85;
      bias = 'BEARISH';
      trend = 'DOWNTREND';
      buyPutCount++;
    }
    // Partial signals (lower confidence)
    else if (bullishTrend && price > currentVWAP) {
      action = 'BUY_CALL';
      confidence = 65;
      bias = 'BULLISH';
      trend = 'UPTREND';
      buyCallCount++;
    }
    else if (bearishTrend && price < currentVWAP) {
      action = 'BUY_PUT';
      confidence = 65;
      bias = 'BEARISH';
      trend = 'DOWNTREND';
      buyPutCount++;
    }
    else {
      waitCount++;
    }
    
    totalConfidence += confidence;
    
    const date = new Date(candles[i].timestamp * 1000).toLocaleString('en-IN');
    
    signals.push({
      timestamp: candles[i].timestamp,
      date,
      action,
      price,
      confidence,
      ema9: currentEMA9,
      ema21: currentEMA21,
      vwap: currentVWAP,
      trend,
      bias
    });
  }
  
  const avgConfidence = signals.length > 0 ? totalConfidence / signals.length : 0;
  
  console.log(`✅ Signals generated: ${signals.length}`);
  console.log(`📊 BUY CALL: ${buyCallCount}`);
  console.log(`📊 BUY PUT: ${buyPutCount}`);
  console.log(`📊 WAIT: ${waitCount}`);
  console.log(`📊 Avg Confidence: ${avgConfidence.toFixed(1)}%`);
  
  return {
    signals,
    summary: {
      totalSignals: signals.length,
      buyCallSignals: buyCallCount,
      buyPutSignals: buyPutCount,
      waitSignals: waitCount,
      avgConfidence
    }
  };
}

/**
 * Simulate trades from signals
 */
export function simulateTrades(signals: Signal[], quantity: number = 75) {
  console.log('🎯 SIMULATING TRADES...');
  
  const trades: any[] = [];
  let position: 'LONG' | 'SHORT' | null = null;
  let entryPrice = 0;
  let entryTime = 0;
  let entryAction = '';
  
  for (let i = 0; i < signals.length; i++) {
    const signal = signals[i];
    
    // Close existing position on opposite signal
    if (position === 'LONG' && signal.action === 'BUY_PUT') {
      // Close long, open short
      const exitPrice = signal.price;
      const pnl = (exitPrice - entryPrice) * quantity;
      const holdingMinutes = Math.floor((signal.timestamp - entryTime) / 60);
      
      trades.push({
        entry: entryAction,
        entryPrice,
        entryTime: new Date(entryTime * 1000).toLocaleString('en-IN'),
        exit: 'SELL',
        exitPrice,
        exitTime: signal.date,
        pnl,
        holdingMinutes,
        result: pnl >= 0 ? 'WIN' : 'LOSS'
      });
      
      // Open new short
      position = 'SHORT';
      entryPrice = signal.price;
      entryTime = signal.timestamp;
      entryAction = 'BUY_PUT';
    }
    else if (position === 'SHORT' && signal.action === 'BUY_CALL') {
      // Close short, open long
      const exitPrice = signal.price;
      const pnl = (entryPrice - exitPrice) * quantity; // Inverse for short
      const holdingMinutes = Math.floor((signal.timestamp - entryTime) / 60);
      
      trades.push({
        entry: entryAction,
        entryPrice,
        entryTime: new Date(entryTime * 1000).toLocaleString('en-IN'),
        exit: 'SELL',
        exitPrice,
        exitTime: signal.date,
        pnl,
        holdingMinutes,
        result: pnl >= 0 ? 'WIN' : 'LOSS'
      });
      
      // Open new long
      position = 'LONG';
      entryPrice = signal.price;
      entryTime = signal.timestamp;
      entryAction = 'BUY_CALL';
    }
    else if (position === null && signal.action !== 'WAIT') {
      // Open new position
      position = signal.action === 'BUY_CALL' ? 'LONG' : 'SHORT';
      entryPrice = signal.price;
      entryTime = signal.timestamp;
      entryAction = signal.action;
    }
  }
  
  // Calculate statistics
  const winningTrades = trades.filter(t => t.pnl >= 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  
  console.log(`✅ Trades simulated: ${trades.length}`);
  console.log(`📊 Winning: ${winningTrades.length}`);
  console.log(`📊 Losing: ${losingTrades.length}`);
  console.log(`💰 Total P&L: ₹${totalPnL.toFixed(2)}`);
  
  return {
    trades,
    stats: {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0,
      totalPnL,
      avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0
    }
  };
}
