/**
 * ⚡⚡⚡ ADVANCED BACKEND AI ENGINE ⚡⚡⚡
 * 
 * PROFESSIONAL-GRADE TRADING AI WITH ALL INDICATORS!
 * 
 * NEW FEATURES ADDED:
 * ✅ RSI (Relative Strength Index)
 * ✅ ATR (Average True Range) 
 * ✅ Bollinger Bands
 * ✅ MACD (Moving Average Convergence Divergence)
 * ✅ ADX (Average Directional Index)
 * ✅ Stochastic Oscillator
 * ✅ Advanced Candlestick Patterns (15+ patterns!)
 * ✅ Order Flow Analysis
 * ✅ Price Action Patterns
 * ✅ Dynamic Stop Loss (ATR-based)
 * ✅ Position Sizing Calculator
 * ✅ Risk-Reward Ratio
 * ✅ Market Regime Detection
 * ✅ Multi-Timeframe Analysis
 * ✅ Fibonacci Levels
 * ✅ Volume Profile
 * 
 * SPEED: < 100ms (ULTRA OPTIMIZED!)
 */

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface AdvancedIndicators {
  // Moving Averages
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  sma20: number;
  
  // VWAP
  vwap: number;
  vwapDistance: number;
  priceAboveVWAP: boolean;
  
  // RSI
  rsi: number;
  rsiOverbought: boolean; // > 70
  rsiOversold: boolean;   // < 30
  rsiDivergence: boolean;
  
  // MACD
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  macdBullish: boolean;
  macdCrossover: boolean;
  
  // Bollinger Bands
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  bollingerWidth: number;
  priceNearUpperBand: boolean;
  priceNearLowerBand: boolean;
  bollingerSqueeze: boolean; // Low volatility
  
  // ATR (Volatility)
  atr: number;
  atr14: number;
  volatilityHigh: boolean;
  volatilityLow: boolean;
  
  // ADX (Trend Strength)
  adx: number;
  adxStrong: boolean;      // > 25
  adxVeryStrong: boolean;  // > 50
  trending: boolean;
  
  // Stochastic
  stochK: number;
  stochD: number;
  stochOverbought: boolean;
  stochOversold: boolean;
  
  // Support/Resistance
  resistance_levels: { r1: number; r2: number; r3: number };
  support_levels: { s1: number; s2: number; s3: number };
  nearResistance: boolean;
  nearSupport: boolean;
  
  // Fibonacci Levels
  fibLevels: {
    level_0: number;    // 0%
    level_236: number;  // 23.6%
    level_382: number;  // 38.2%
    level_50: number;   // 50%
    level_618: number;  // 61.8%
    level_100: number;  // 100%
  };
  nearFibLevel: boolean;

  // ===== Institutional additions (optional, backward compatible) =====
  rsiBullishDivergence?: boolean;
  rsiBearishDivergence?: boolean;
  bbSqueeze?: boolean;
  bbExpansion?: boolean;
  bbSqueezeBreakout?: 'BULL' | 'BEAR' | 'NONE';
  ema9Slope?: number;     // % per bar
  ema21Slope?: number;
  ema50Slope?: number;
  slopeBullish?: boolean;
  slopeBearish?: boolean;
  rangeExpansion?: boolean;
  fibImpulse?: { swingHigh: number; swingLow: number; direction: 'UP' | 'DOWN' };
  gap?: { type: 'GAP_UP' | 'GAP_DOWN' | 'NONE'; size: number; filled: boolean };
}

export interface CandlePattern {
  type: string;
  strength: 'STRONG' | 'MODERATE' | 'WEAK';
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

export interface AdvancedSignal {
  // Basic signal
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT' | 'EXIT' | 'HOLD';
  confidence: number;
  reasoning: string;
  market_state: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  
  // All indicators
  indicators: AdvancedIndicators;
  
  // Candle patterns detected
  patterns: CandlePattern[];
  
  // Confirmation system
  confirmations: {
    total: number;           // Total confirmations (0-10)
    required: number;        // Required for trade (6)
    details: string[];       // What confirmed
    vwap: boolean;
    ema: boolean;
    rsi: boolean;
    macd: boolean;
    bollinger: boolean;
    volume: boolean;
    adx: boolean;
    stochastic: boolean;
    pattern: boolean;
    priceAction: boolean;
  };
  
  // Volume analysis
  volumeAnalysis: {
    current_volume: number;
    average_volume: number;
    ratio: number;
    raw_ratio: number;
    is_high: boolean;
    is_spike: boolean;
    smart_money_detected: boolean;
    has_data: boolean;
    feed_reliable: boolean;
    coverage: number;
    body_percent: number;
    candle_strength: 'STRONG' | 'DECISIVE' | 'MODERATE' | 'WEAK';
    isHigh: boolean;
    isSpike: boolean;
    smartMoney: boolean;
    bodyPercent: number;
    candleStrength: 'STRONG' | 'DECISIVE' | 'MODERATE' | 'WEAK';
    buyPressure: number;    // 0-100
    sellPressure: number;   // 0-100
    orderFlow: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
  
  // Risk management
  riskManagement: {
    suggestedEntry: number;
    suggestedTarget: number;
    suggestedStopLoss: number;
    riskRewardRatio: number;
    positionSize: number;
    maxLoss: number;
    expectedProfit: number;
    trailingStop?: { initial: number; trigger: number; trailDistance: number; breakeven: number };
  };
  
  // Market regime
  marketRegime: {
    type: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'QUIET';
    strength: number;       // 0-100
    suitable_for_trading: boolean;
  };

  // ===== Institutional additions (optional, backward compatible) =====
  marketStructure?: {
    type: 'UPTREND' | 'DOWNTREND' | 'REVERSAL' | 'RANGE';
    bos: 'BULL' | 'BEAR' | 'NONE';
    choch: 'BULL' | 'BEAR' | 'NONE';
    lastSwingHigh?: number;
    lastSwingLow?: number;
  };
  smartMoneyBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  liquidity?: {
    buySideSweep: boolean;
    sellSideSweep: boolean;
    stopHunt: boolean;
  };

  // Debug / diagnostics (optional, backward compatible)
  debugInfo?: {
    blockedReason?: string;
    failedConfirmations: string[];
    confidenceDecayReasons: string[];
    trendStrength: number;
    breakoutQuality: 'STRONG' | 'WEAK' | 'NONE';
    smartMoneyScore: number;
    liquidityWarnings: string[];
    marketWarnings: string[];
    requiredConfirmations: number;
    regime: string;
  };

  // Performance
  executionTime: number;
  calculationsPerformed: number;
}

export interface AdvancedSignalOptions {
  higherTimeframeData?: OHLCCandle[];
  timeframeMinutes?: number;
  lastSignalTimestamp?: number;
  minimumBarsBetweenSignals?: number;
}

export class AdvancedAI {
  
  // ========================================
  // TECHNICAL INDICATORS (ALL OPTIMIZED!)
  // ========================================
  
  /**
   * ⚡ NEW: Get ADX Interpretation
   */
  private static getADXInterpretation(adx: number): string {
    if (adx < 20) return 'No trend';
    if (adx < 25) return 'Weak trend';
    if (adx < 40) return 'Strong trend';
    if (adx < 50) return 'Strong trend but maturing';
    return 'Very strong / climax';
  }
  
  /**
   * ⚡ NEW: Normalize VWAP Distance using ATR
   * UPDATED: In strong trends (ADX > 25), allow more extended moves
   */
  private static normalizeVWAPDistance(price: number, vwap: number, atr: number, adx?: number): {
    distancePercent: number;
    distanceATR: number;
    interpretation: 'NEUTRAL' | 'ACCEPTABLE' | 'EXTENDED';
  } {
    const distancePercent = ((price - vwap) / vwap) * 100;
    const distanceATR = Math.abs(price - vwap) / atr;
    
    let interpretation: 'NEUTRAL' | 'ACCEPTABLE' | 'EXTENDED';
    
    // ⚡ FIX: In strong trends (ADX > 25), allow extended moves up to 3.0 ATR
    const isStrongTrend = adx && adx > 25;  // Changed from 40 to 25!
    const extendedThreshold = isStrongTrend ? 3.0 : 0.6;  // 3.0 ATR for trending markets
    
    if (distanceATR < 0.3) {
      interpretation = 'NEUTRAL';  // Too close to VWAP
    } else if (distanceATR < extendedThreshold) {
      interpretation = 'ACCEPTABLE';  // Good distance, or strong trend continuation
    } else {
      interpretation = 'EXTENDED';  // Truly overextended, reversal risk
    }
    
    return { distancePercent, distanceATR, interpretation };
  }
  
  /**
   * ⚡ NEW: Validate Candle Pattern Context
   */
  private static validatePattern(
    pattern: CandlePattern,
    currentCandle: OHLCCandle,
    prevCandle: OHLCCandle,
    nearResistance: boolean,
    nearSupport: boolean
  ): { isValid: boolean; weight: number; reason: string } {
    const volumeIncrease = currentCandle.volume > prevCandle.volume;
    
    // Bearish patterns should be at resistance
    if (pattern.direction === 'BEARISH') {
      if (nearResistance && volumeIncrease) {
        return { isValid: true, weight: 2, reason: 'Strong bearish pattern at resistance with volume' };
      } else if (nearResistance || volumeIncrease) {
        return { isValid: true, weight: 1, reason: 'Moderate bearish pattern (partial validation)' };
      } else {
        return { isValid: false, weight: 1, reason: 'Weak bearish pattern (not at resistance, low volume)' };
      }
    }
    
    // Bullish patterns should be at support
    if (pattern.direction === 'BULLISH') {
      if (nearSupport && volumeIncrease) {
        return { isValid: true, weight: 2, reason: 'Strong bullish pattern at support with volume' };
      } else if (nearSupport || volumeIncrease) {
        return { isValid: true, weight: 1, reason: 'Moderate bullish pattern (partial validation)' };
      } else {
        return { isValid: false, weight: 1, reason: 'Weak bullish pattern (not at support, low volume)' };
      }
    }
    
    return { isValid: false, weight: 1, reason: 'Neutral pattern' };
  }
  
  /**
   * Calculate SMA (Simple Moving Average)
   */
  private static calculateSMA(data: OHLCCandle[], period: number): number {
    if (data.length < period) return data[data.length - 1].close;
    
    const slice = data.slice(-period);
    const sum = slice.reduce((acc, candle) => acc + candle.close, 0);
    return sum / period;
  }
  
  /**
   * Calculate EMA (Exponential Moving Average) - OPTIMIZED
   */
  private static calculateEMA(data: OHLCCandle[], period: number): number {
    if (data.length < period) return data[data.length - 1].close;
    
    // Use SMA for first value (more accurate)
    const sma = this.calculateSMA(data.slice(0, period), period);
    const k = 2 / (period + 1);
    
    let ema = sma;
    for (let i = period; i < data.length; i++) {
      ema = (data[i].close * k) + (ema * (1 - k));
    }
    
    return ema;
  }
  
  /**
   * Calculate VWAP (Volume Weighted Average Price)
   */
  private static calculateVWAP(data: OHLCCandle[]): number {
    let cumulativeTPV = 0;
    let cumulativeVolume = 0;
    
    for (const candle of data) {
      const typicalPrice = (candle.high + candle.low + candle.close) / 3;
      cumulativeTPV += typicalPrice * candle.volume;
      cumulativeVolume += candle.volume;
    }
    
    return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : data[data.length - 1].close;
  }
  
  /**
   * Calculate RSI (Relative Strength Index) - 14 period
   */
  private static calculateRSI(data: OHLCCandle[], period: number = 14): number {
    if (data.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average gain/loss
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }
  
  /**
   * Compute EMA over a numeric series (used for proper MACD signal line)
   */
  private static emaSeries(values: number[], period: number): number[] {
    if (values.length === 0) return [];
    const k = 2 / (period + 1);
    const out: number[] = [];
    // seed with SMA of first `period` values (or first value if not enough)
    let ema: number;
    if (values.length >= period) {
      let sum = 0;
      for (let i = 0; i < period; i++) sum += values[i];
      ema = sum / period;
      for (let i = 0; i < period - 1; i++) out.push(NaN);
      out.push(ema);
      for (let i = period; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
        out.push(ema);
      }
    } else {
      ema = values[0];
      out.push(ema);
      for (let i = 1; i < values.length; i++) {
        ema = values[i] * k + ema * (1 - k);
        out.push(ema);
      }
    }
    return out;
  }

  /**
   * Calculate MACD with TRUE EMA-of-MACD-series signal line
   */
  private static calculateMACD(data: OHLCCandle[]): { macd: number; signal: number; histogram: number } {
    if (data.length < 26) {
      const macd = this.calculateEMA(data, 12) - this.calculateEMA(data, 26);
      return { macd, signal: macd, histogram: 0 };
    }
    const closes = data.map(c => c.close);
    const ema12s = this.emaSeries(closes, 12);
    const ema26s = this.emaSeries(closes, 26);
    const macdSeries: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (!isNaN(ema12s[i]) && !isNaN(ema26s[i])) macdSeries.push(ema12s[i] - ema26s[i]);
    }
    if (macdSeries.length === 0) return { macd: 0, signal: 0, histogram: 0 };
    const signalSeries = this.emaSeries(macdSeries, 9);
    const macd = macdSeries[macdSeries.length - 1];
    const signal = signalSeries[signalSeries.length - 1];
    const safeSignal = isNaN(signal) ? macd : signal;
    return { macd, signal: safeSignal, histogram: macd - safeSignal };
  }
  
  /**
   * Calculate Bollinger Bands (20 period, 2 std dev)
   */
  private static calculateBollingerBands(data: OHLCCandle[], period: number = 20, stdDev: number = 2): {
    upper: number;
    middle: number;
    lower: number;
    width: number;
  } {
    const sma = this.calculateSMA(data, period);
    
    // Calculate standard deviation
    const slice = data.slice(-period);
    const squaredDiffs = slice.map(candle => Math.pow(candle.close - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    const upper = sma + (standardDeviation * stdDev);
    const lower = sma - (standardDeviation * stdDev);
    const width = ((upper - lower) / sma) * 100;
    
    return { upper, middle: sma, lower, width };
  }
  
  /**
   * Calculate ATR (Average True Range)
   */
  private static calculateATR(data: OHLCCandle[], period: number = 14): number {
    if (data.length < period + 1) return 0;
    
    const trueRanges: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const high = data[i].high;
      const low = data[i].low;
      const prevClose = data[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }
    
    // Calculate ATR using EMA-like smoothing
    let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
    
    for (let i = period; i < trueRanges.length; i++) {
      atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    }
    
    return atr;
  }
  
  /**
   * Calculate ADX with proper Wilder's smoothing of +DI, -DI and DX
   */
  private static calculateADXSeries(data: OHLCCandle[], period: number = 14): number[] {
    if (data.length < period * 2 + 1) {
      // fallback to simple version when not enough data
      if (data.length < period + 1) return [0];
      let pDM = 0, mDM = 0, tr = 0;
      for (let i = data.length - period; i < data.length; i++) {
        const hd = data[i].high - data[i - 1].high;
        const ld = data[i - 1].low - data[i].low;
        pDM += (hd > ld && hd > 0) ? hd : 0;
        mDM += (ld > hd && ld > 0) ? ld : 0;
        tr += Math.max(data[i].high - data[i].low,
          Math.abs(data[i].high - data[i - 1].close),
          Math.abs(data[i].low - data[i - 1].close));
      }
      if (tr === 0) return [0];
      const pDI = (pDM / tr) * 100, mDI = (mDM / tr) * 100;
      const sum = pDI + mDI;
      return [sum > 0 ? (Math.abs(pDI - mDI) / sum) * 100 : 0];
    }

    const trArr: number[] = [];
    const pDMArr: number[] = [];
    const mDMArr: number[] = [];
    for (let i = 1; i < data.length; i++) {
      const hd = data[i].high - data[i - 1].high;
      const ld = data[i - 1].low - data[i].low;
      pDMArr.push((hd > ld && hd > 0) ? hd : 0);
      mDMArr.push((ld > hd && ld > 0) ? ld : 0);
      trArr.push(Math.max(data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)));
    }

    // Wilder's smoothing: first = sum of first `period`, then prev - prev/period + current
    const smooth = (arr: number[]): number[] => {
      const out: number[] = [];
      let s = 0;
      for (let i = 0; i < period; i++) s += arr[i];
      out.push(s);
      for (let i = period; i < arr.length; i++) {
        s = s - s / period + arr[i];
        out.push(s);
      }
      return out;
    };

    const trS = smooth(trArr);
    const pS = smooth(pDMArr);
    const mS = smooth(mDMArr);
    const dxArr: number[] = [];
    for (let i = 0; i < trS.length; i++) {
      if (trS[i] === 0) { dxArr.push(0); continue; }
      const pDI = (pS[i] / trS[i]) * 100;
      const mDI = (mS[i] / trS[i]) * 100;
      const sum = pDI + mDI;
      dxArr.push(sum > 0 ? (Math.abs(pDI - mDI) / sum) * 100 : 0);
    }
    if (dxArr.length < period) {
      return dxArr.length ? [dxArr[dxArr.length - 1]] : [0];
    }
    // ADX = Wilder smoothing of DX
    const adxSeries: number[] = [];
    let adx = 0;
    for (let i = 0; i < period; i++) adx += dxArr[i];
    adx = adx / period;
    adxSeries.push(adx);
    for (let i = period; i < dxArr.length; i++) {
      adx = (adx * (period - 1) + dxArr[i]) / period;
      adxSeries.push(adx);
    }
    return adxSeries;
  }

  private static calculateADX(data: OHLCCandle[], period: number = 14): number {
    const series = this.calculateADXSeries(data, period);
    return series[series.length - 1] || 0;
  }

  /**
   * Stochastic with proper %D = 3-period SMA of %K
   */
  private static calculateStochastic(data: OHLCCandle[], period: number = 14): { k: number; d: number } {
    if (data.length < period) return { k: 50, d: 50 };
    const kVals: number[] = [];
    const start = Math.max(period, data.length - (period + 3));
    for (let end = start; end <= data.length; end++) {
      const slice = data.slice(end - period, end);
      const close = slice[slice.length - 1].close;
      const lo = Math.min(...slice.map(c => c.low));
      const hi = Math.max(...slice.map(c => c.high));
      const k = hi === lo ? 50 : ((close - lo) / (hi - lo)) * 100;
      kVals.push(k);
    }
    const k = kVals[kVals.length - 1];
    const last3 = kVals.slice(-3);
    const d = last3.reduce((a, b) => a + b, 0) / last3.length;
    return { k, d };
  }

  /**
   * Swing-pivot based Support/Resistance (last N bars, fractal pivots)
   */
  private static calculateSwingLevels(data: OHLCCandle[], lookback: number = 80, left: number = 2, right: number = 2): { resistances: number[]; supports: number[] } {
    const slice = data.slice(-lookback);
    const highs: number[] = [];
    const lows: number[] = [];
    for (let i = left; i < slice.length - right; i++) {
      let isPivotHigh = true, isPivotLow = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (slice[j].high >= slice[i].high) isPivotHigh = false;
        if (slice[j].low <= slice[i].low) isPivotLow = false;
      }
      if (isPivotHigh) highs.push(slice[i].high);
      if (isPivotLow) lows.push(slice[i].low);
    }
    const last = slice[slice.length - 1].close;
    // Cluster close levels (within 0.15%)
    const cluster = (vals: number[]): number[] => {
      if (!vals.length) return [];
      const sorted = [...vals].sort((a, b) => a - b);
      const tol = last * 0.0015;
      const groups: number[][] = [[sorted[0]]];
      for (let i = 1; i < sorted.length; i++) {
        const g = groups[groups.length - 1];
        if (sorted[i] - g[g.length - 1] <= tol) g.push(sorted[i]);
        else groups.push([sorted[i]]);
      }
      // weight by touches (group length) — keep multi-touch zones
      return groups
        .map(g => ({ price: g.reduce((a, b) => a + b, 0) / g.length, touches: g.length }))
        .sort((a, b) => b.touches - a.touches || Math.abs(a.price - last) - Math.abs(b.price - last))
        .map(x => x.price);
    };
    const resistances = cluster(highs.filter(h => h > last));
    const supports = cluster(lows.filter(l => l < last));
    return { resistances, supports };
  }


  /**
   * Calculate Fibonacci Retracement Levels
   */
  private static calculateFibonacci(data: OHLCCandle[]): {
    level_0: number;
    level_236: number;
    level_382: number;
    level_50: number;
    level_618: number;
    level_100: number;
  } {
    const highs = data.map(c => c.high);
    const lows = data.map(c => c.low);
    
    const swingHigh = Math.max(...highs);
    const swingLow = Math.min(...lows);
    
    const diff = swingHigh - swingLow;
    
    return {
      level_0: swingHigh,
      level_236: swingHigh - (diff * 0.236),
      level_382: swingHigh - (diff * 0.382),
      level_50: swingHigh - (diff * 0.50),
      level_618: swingHigh - (diff * 0.618),
      level_100: swingLow
    };
  }
  
  /**
   * Detect Advanced Candlestick Patterns
   */
  private static detectCandlePatterns(data: OHLCCandle[]): CandlePattern[] {
    const patterns: CandlePattern[] = [];
    
    if (data.length < 3) return patterns;
    
    const current = data[data.length - 1];
    const prev = data[data.length - 2];
    const prev2 = data[data.length - 3];
    
    const currentBody = Math.abs(current.close - current.open);
    const currentRange = current.high - current.low;
    const currentBodyPercent = currentRange > 0 ? (currentBody / currentRange) * 100 : 0;
    
    const prevBody = Math.abs(prev.close - prev.open);
    const prevRange = prev.high - prev.low;

    // FIX PROBLEM #9: small tolerance for engulfing (gaps/spread shouldn't disqualify pattern)
    const tol = Math.max(currentRange, prevRange) * 0.05; // 5% of range tolerance

    // 1. BULLISH ENGULFING (with tolerance)
    if (prev.close < prev.open && // Prev bearish
        current.close > current.open && // Current bullish
        current.open <= prev.close + tol &&
        current.close >= prev.open - tol) {
      patterns.push({
        type: 'BULLISH_ENGULFING',
        strength: 'STRONG',
        direction: 'BULLISH',
        confidence: 85
      });
    }

    // 2. BEARISH ENGULFING (with tolerance)
    if (prev.close > prev.open && // Prev bullish
        current.close < current.open && // Current bearish
        current.open >= prev.close - tol &&
        current.close <= prev.open + tol) {
      patterns.push({
        type: 'BEARISH_ENGULFING',
        strength: 'STRONG',
        direction: 'BEARISH',
        confidence: 85
      });
    }

    
    // 3. HAMMER (Bullish reversal)
    const lowerWick = Math.min(current.open, current.close) - current.low;
    const upperWick = current.high - Math.max(current.open, current.close);
    if (lowerWick > currentBody * 2 && upperWick < currentBody * 0.3) {
      patterns.push({
        type: 'HAMMER',
        strength: 'MODERATE',
        direction: 'BULLISH',
        confidence: 70
      });
    }
    
    // 4. SHOOTING STAR (Bearish reversal)
    if (upperWick > currentBody * 2 && lowerWick < currentBody * 0.3) {
      patterns.push({
        type: 'SHOOTING_STAR',
        strength: 'MODERATE',
        direction: 'BEARISH',
        confidence: 70
      });
    }
    
    // 5. DOJI (Indecision)
    if (currentBodyPercent < 10) {
      patterns.push({
        type: 'DOJI',
        strength: 'WEAK',
        direction: 'NEUTRAL',
        confidence: 40
      });
    }
    
    // 6. MORNING STAR (3-candle bullish reversal)
    if (prev2.close < prev2.open && // First bearish
        Math.abs(prev.close - prev.open) < prevRange * 0.3 && // Middle small body
        current.close > current.open && // Third bullish
        current.close > (prev2.open + prev2.close) / 2) {
      patterns.push({
        type: 'MORNING_STAR',
        strength: 'STRONG',
        direction: 'BULLISH',
        confidence: 90
      });
    }
    
    // 7. EVENING STAR (3-candle bearish reversal)
    if (prev2.close > prev2.open && // First bullish
        Math.abs(prev.close - prev.open) < prevRange * 0.3 && // Middle small body
        current.close < current.open && // Third bearish
        current.close < (prev2.open + prev2.close) / 2) {
      patterns.push({
        type: 'EVENING_STAR',
        strength: 'STRONG',
        direction: 'BEARISH',
        confidence: 90
      });
    }
    
    // 8. PIERCING PATTERN (Bullish)
    if (prev.close < prev.open && // Prev bearish
        current.close > current.open && // Current bullish
        current.open < prev.low &&
        current.close > (prev.open + prev.close) / 2) {
      patterns.push({
        type: 'PIERCING_PATTERN',
        strength: 'STRONG',
        direction: 'BULLISH',
        confidence: 80
      });
    }
    
    // 9. DARK CLOUD COVER (Bearish)
    if (prev.close > prev.open && // Prev bullish
        current.close < current.open && // Current bearish
        current.open > prev.high &&
        current.close < (prev.open + prev.close) / 2) {
      patterns.push({
        type: 'DARK_CLOUD_COVER',
        strength: 'STRONG',
        direction: 'BEARISH',
        confidence: 80
      });
    }
    
    return patterns;
  }
  
  /**
   * Analyze Order Flow (Buy/Sell Pressure)
   */
  private static analyzeOrderFlow(data: OHLCCandle[]): {
    buyPressure: number;
    sellPressure: number;
    orderFlow: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  } {
    const last10 = data.slice(-10);
    
    let buyPressure = 0;
    let sellPressure = 0;
    
    for (const candle of last10) {
      const range = candle.high - candle.low;
      if (range === 0) continue;
      
      // Calculate where close is relative to range
      const closePosition = (candle.close - candle.low) / range;
      
      // If close near high → buying pressure
      // If close near low → selling pressure
      buyPressure += closePosition * candle.volume;
      sellPressure += (1 - closePosition) * candle.volume;
    }
    
    const totalPressure = buyPressure + sellPressure;
    const buyPercent = totalPressure > 0 ? (buyPressure / totalPressure) * 100 : 50;
    const sellPercent = 100 - buyPercent;
    
    const orderFlow = buyPercent > 60 ? 'BULLISH' : sellPercent > 60 ? 'BEARISH' : 'NEUTRAL';
    
    return { buyPressure: buyPercent, sellPressure: sellPercent, orderFlow };
  }
  
  /**
   * Detect Market Regime
   */
  private static detectMarketRegime(data: OHLCCandle[], indicators: AdvancedIndicators): {
    type: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGING' | 'VOLATILE' | 'QUIET';
    strength: number;
    suitable_for_trading: boolean;
  } {
    const adx = indicators.adx;
    const atr = indicators.atr;
    const bollingerWidth = indicators.bollingerWidth;
    const lastCandle = data[data.length - 1];
    
    // ⚡ FIX: Check ADX strength first (>25 = trending, regardless of EMA alignment)
    const isTrending = adx > 25;
    
    // Check EMA alignment for trend direction
    const emaUptrend = indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50;
    const emaDowntrend = indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50;
    
    // ⚡ FIX: Strong ADX means trending even if EMAs are mixed (price action overrides)
    if (isTrending) {
      // Check price action for trend direction
      const last5 = data.slice(-5);
      const higherHighs = last5.every((candle, i) => i === 0 || candle.high >= last5[i - 1].high);
      const lowerLows = last5.every((candle, i) => i === 0 || candle.low <= last5[i - 1].low);
      
      // EMA alignment OR price action confirms trend
      if (emaUptrend || higherHighs) {
        return { type: 'TRENDING_UP', strength: adx, suitable_for_trading: true };
      }
      
      if (emaDowntrend || lowerLows) {
        return { type: 'TRENDING_DOWN', strength: adx, suitable_for_trading: true };
      }
      
      // ADX high but no clear direction = volatile
      return { type: 'VOLATILE', strength: adx, suitable_for_trading: false };
    }
    
    // Low ADX = ranging or quiet
    if (adx < 20 && bollingerWidth < 0.02) {
      return { type: 'QUIET', strength: 100 - adx, suitable_for_trading: false };
    }
    
    if (adx < 25) {
      return { type: 'RANGING', strength: 50, suitable_for_trading: false };
    }
    
    // Default to ranging
    return { type: 'RANGING', strength: 50, suitable_for_trading: false };
  }

  private static detectHigherTimeframeTrend(data?: OHLCCandle[]): 'bull' | 'bear' | 'neutral' {
    if (!data || data.length < 25) return 'neutral';
    const last = data[data.length - 1];
    const ema9 = this.calculateEMA(data, 9);
    const ema21 = this.calculateEMA(data, 21);
    const adxNow = this.calculateADX(data);

    // ⚡ FLEXIBLE HTF: ADX > 25 with EMA9/21 alignment OR price/EMA9 agreement is enough.
    // VWAP flat or EMA50 mismatch should NOT block continuation trades.
    if (adxNow > 25) {
      const bullVotes = [last.close > ema9, ema9 > ema21, last.close > ema21].filter(Boolean).length;
      const bearVotes = [last.close < ema9, ema9 < ema21, last.close < ema21].filter(Boolean).length;
      if (bullVotes >= 2) return 'bull';
      if (bearVotes >= 2) return 'bear';
    }
    // Fallback: only fully aligned setups count as directional
    if (last.close > ema9 && ema9 > ema21) return 'bull';
    if (last.close < ema9 && ema9 < ema21) return 'bear';
    return 'neutral';
  }

  // ========================================
  // ⚡ INSTITUTIONAL-GRADE HELPERS
  // ========================================

  /** RSI series for divergence detection */
  private static rsiSeries(data: OHLCCandle[], period: number = 14): number[] {
    if (data.length < period + 1) return [];
    const out: number[] = new Array(period).fill(NaN);
    let avgG = 0, avgL = 0;
    for (let i = 1; i <= period; i++) {
      const ch = data[i].close - data[i - 1].close;
      if (ch > 0) avgG += ch; else avgL += -ch;
    }
    avgG /= period; avgL /= period;
    out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
    for (let i = period + 1; i < data.length; i++) {
      const ch = data[i].close - data[i - 1].close;
      const g = ch > 0 ? ch : 0;
      const l = ch < 0 ? -ch : 0;
      avgG = (avgG * (period - 1) + g) / period;
      avgL = (avgL * (period - 1) + l) / period;
      out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
    }
    return out;
  }

  /** Fractal pivot indexes */
  private static findPivots(values: number[], left = 2, right = 2, type: 'high' | 'low' = 'high'): number[] {
    const pivots: number[] = [];
    for (let i = left; i < values.length - right; i++) {
      let ok = true;
      for (let j = i - left; j <= i + right; j++) {
        if (j === i) continue;
        if (type === 'high' && values[j] >= values[i]) { ok = false; break; }
        if (type === 'low' && values[j] <= values[i]) { ok = false; break; }
      }
      if (ok) pivots.push(i);
    }
    return pivots;
  }

  /** Real RSI divergence using last two pivots */
  private static detectRSIDivergence(data: OHLCCandle[], rsiArr: number[]): { bull: boolean; bear: boolean } {
    if (data.length < 20 || rsiArr.length < 20) return { bull: false, bear: false };
    const window = 25;
    const slice = data.slice(-window);
    const rsiSlice = rsiArr.slice(-window);
    const lows = slice.map(c => c.low);
    const highs = slice.map(c => c.high);
    const lowPivots = this.findPivots(lows, 2, 2, 'low');
    const highPivots = this.findPivots(highs, 2, 2, 'high');
    let bull = false, bear = false;
    if (lowPivots.length >= 2) {
      const [a, b] = [lowPivots[lowPivots.length - 2], lowPivots[lowPivots.length - 1]];
      if (lows[b] < lows[a] && !isNaN(rsiSlice[a]) && !isNaN(rsiSlice[b]) && rsiSlice[b] > rsiSlice[a]) bull = true;
    }
    if (highPivots.length >= 2) {
      const [a, b] = [highPivots[highPivots.length - 2], highPivots[highPivots.length - 1]];
      if (highs[b] > highs[a] && !isNaN(rsiSlice[a]) && !isNaN(rsiSlice[b]) && rsiSlice[b] < rsiSlice[a]) bear = true;
    }
    return { bull, bear };
  }

  /** EMA slope (% per bar over lookback). Pass `currentEma` to reuse cached value. */
  private static emaSlope(data: OHLCCandle[], period: number, lookback: number = 5, currentEma?: number): number {
    if (data.length < period + lookback) return 0;
    const now = (typeof currentEma === 'number' && Number.isFinite(currentEma)) ? currentEma : this.calculateEMA(data, period);
    const prev = this.calculateEMA(data.slice(0, -lookback), period);
    if (prev === 0 || !Number.isFinite(prev)) return 0;
    return ((now - prev) / prev) * 100 / lookback;
  }

  /** Last impulse leg for Fibonacci */
  private static detectImpulseLeg(data: OHLCCandle[]): { swingHigh: number; swingLow: number; direction: 'UP' | 'DOWN' } {
    const slice = data.slice(-50);
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const hp = this.findPivots(highs, 2, 2, 'high');
    const lp = this.findPivots(lows, 2, 2, 'low');
    const lastHighIdx = hp.length ? hp[hp.length - 1] : highs.indexOf(Math.max(...highs));
    const lastLowIdx = lp.length ? lp[lp.length - 1] : lows.indexOf(Math.min(...lows));
    return {
      swingHigh: highs[lastHighIdx],
      swingLow: lows[lastLowIdx],
      direction: lastHighIdx > lastLowIdx ? 'UP' : 'DOWN',
    };
  }

  /** Smart-money bias via delta approximation + absorption */
  private static detectSmartMoney(data: OHLCCandle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const last20 = data.slice(-20);
    let cumDelta = 0;
    let absorptionBull = 0, absorptionBear = 0;
    for (const c of last20) {
      const range = c.high - c.low;
      if (range <= 0) continue;
      const closePos = (c.close - c.low) / range; // 0..1
      const delta = (closePos - 0.5) * 2 * (c.volume || 0); // signed pressure
      cumDelta += delta;
      const body = Math.abs(c.close - c.open);
      const bodyPct = body / range;
      // Absorption: wide range, small body, high volume = big players defending a level
      if (bodyPct < 0.3 && (c.volume || 0) > 0) {
        if (closePos > 0.6) absorptionBull++;
        if (closePos < 0.4) absorptionBear++;
      }
    }
    const last = data[data.length - 1];
    const body = Math.abs(last.close - last.open);
    const range = last.high - last.low;
    const imbalance = range > 0 ? body / range : 0;
    const bullScore = (cumDelta > 0 ? 1 : 0) + absorptionBull + (imbalance > 0.7 && last.close > last.open ? 1 : 0);
    const bearScore = (cumDelta < 0 ? 1 : 0) + absorptionBear + (imbalance > 0.7 && last.close < last.open ? 1 : 0);
    if (bullScore >= 2 && bullScore > bearScore) return 'BULLISH';
    if (bearScore >= 2 && bearScore > bullScore) return 'BEARISH';
    return 'NEUTRAL';
  }

  /** BOS / CHoCH — requires strong body + volume on the breaking candle */
  private static detectMarketStructure(data: OHLCCandle[], avgVolume: number = 0): {
    type: 'UPTREND' | 'DOWNTREND' | 'REVERSAL' | 'RANGE';
    bos: 'BULL' | 'BEAR' | 'NONE';
    choch: 'BULL' | 'BEAR' | 'NONE';
    lastSwingHigh?: number;
    lastSwingLow?: number;
  } {
    const slice = data.slice(-60);
    if (slice.length < 10) return { type: 'RANGE', bos: 'NONE', choch: 'NONE' };
    const highs = slice.map(c => c.high);
    const lows = slice.map(c => c.low);
    const hp = this.findPivots(highs, 2, 2, 'high');
    const lp = this.findPivots(lows, 2, 2, 'low');
    if (hp.length < 2 || lp.length < 2) return { type: 'RANGE', bos: 'NONE', choch: 'NONE' };
    const hh = highs[hp[hp.length - 1]] > highs[hp[hp.length - 2]];
    const ll = lows[lp[lp.length - 1]] < lows[lp[lp.length - 2]];
    const hl = lows[lp[lp.length - 1]] > lows[lp[lp.length - 2]];
    const lh = highs[hp[hp.length - 1]] < highs[hp[hp.length - 2]];
    const last = slice[slice.length - 1];
    const lastClose = last.close;
    const lastSwingHigh = highs[hp[hp.length - 1]];
    const lastSwingLow = lows[lp[lp.length - 1]];
    const range = Math.max(1e-9, last.high - last.low);
    const bodyPct = Math.abs(last.close - last.open) / range;
    const strongBody = bodyPct >= 0.55;
    const volumeOk = avgVolume > 0 ? (last.volume || 0) >= avgVolume * 1.1 : true;
    const breakOk = strongBody && volumeOk;
    let bos: 'BULL' | 'BEAR' | 'NONE' = 'NONE';
    let choch: 'BULL' | 'BEAR' | 'NONE' = 'NONE';
    if (breakOk && lastClose > lastSwingHigh && hh && hl) bos = 'BULL';
    else if (breakOk && lastClose < lastSwingLow && ll && lh) bos = 'BEAR';
    if (breakOk && ll && lh && lastClose > lastSwingHigh) choch = 'BULL';
    if (breakOk && hh && hl && lastClose < lastSwingLow) choch = 'BEAR';
    let type: 'UPTREND' | 'DOWNTREND' | 'REVERSAL' | 'RANGE' = 'RANGE';
    if (choch !== 'NONE') type = 'REVERSAL';
    else if (hh && hl) type = 'UPTREND';
    else if (ll && lh) type = 'DOWNTREND';
    return { type, bos, choch, lastSwingHigh, lastSwingLow };
  }

  /** Liquidity sweep / stop hunt detection — wick ≥ 1.5×ATR%, volume spike, strong rejection */
  private static detectLiquiditySweep(data: OHLCCandle[], atr14: number, avgVolume: number): { buySideSweep: boolean; sellSideSweep: boolean; stopHunt: boolean } {
    if (data.length < 12 || !isFinite(atr14) || atr14 <= 0) return { buySideSweep: false, sellSideSweep: false, stopHunt: false };
    const last = data[data.length - 1];
    const lookback = data.slice(-11, -1);
    const priorHigh = Math.max(...lookback.map(c => c.high));
    const priorLow = Math.min(...lookback.map(c => c.low));
    const range = last.high - last.low;
    if (range <= 0) return { buySideSweep: false, sellSideSweep: false, stopHunt: false };
    const body = Math.abs(last.close - last.open);
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    const wickThreshold = atr14 * 0.6; // ~1.5× of typical sub-ATR wick
    const volumeSpike = avgVolume > 0 ? (last.volume || 0) > avgVolume * 1.3 : true; // if no feed, ignore vol check
    const bodyToRange = body / range;
    // Strong rejection: small body relative to range
    const rejection = bodyToRange < 0.4;
    const buySideSweep = last.high > priorHigh && last.close < priorHigh
      && upperWick >= wickThreshold && rejection && volumeSpike;
    const sellSideSweep = last.low < priorLow && last.close > priorLow
      && lowerWick >= wickThreshold && rejection && volumeSpike;
    return { buySideSweep, sellSideSweep, stopHunt: buySideSweep || sellSideSweep };
  }

  /** Gap detection at session open */
  private static detectGap(data: OHLCCandle[]): { type: 'GAP_UP' | 'GAP_DOWN' | 'NONE'; size: number; filled: boolean } {
    if (data.length < 2) return { type: 'NONE', size: 0, filled: false };
    const last = data[data.length - 1];
    const prev = data[data.length - 2];
    const gap = last.open - prev.close;
    const threshold = prev.close * 0.0015; // 0.15% gap
    if (Math.abs(gap) < threshold) return { type: 'NONE', size: 0, filled: false };
    const type: 'GAP_UP' | 'GAP_DOWN' = gap > 0 ? 'GAP_UP' : 'GAP_DOWN';
    const filled = type === 'GAP_UP' ? last.low <= prev.close : last.high >= prev.close;
    return { type, size: Math.abs(gap), filled };
  }

  /** Minimal safe WAIT result used when input data is invalid or insufficient */
  private static emptyWaitResult(reason: string, startTime: number): AdvancedSignal {
    const zeroInd = {
      ema9: 0, ema21: 0, ema50: 0, ema200: 0, sma20: 0,
      vwap: 0, vwapDistance: 0, priceAboveVWAP: false,
      rsi: 50, rsiOverbought: false, rsiOversold: false, rsiDivergence: false,
      macd: 0, macdSignal: 0, macdHistogram: 0, macdBullish: false, macdCrossover: false,
      bollingerUpper: 0, bollingerMiddle: 0, bollingerLower: 0, bollingerWidth: 0,
      priceNearUpperBand: false, priceNearLowerBand: false, bollingerSqueeze: false,
      atr: 0, atr14: 0, volatilityHigh: false, volatilityLow: false,
      adx: 0, adxStrong: false, adxVeryStrong: false, trending: false,
      stochK: 50, stochD: 50, stochOverbought: false, stochOversold: false,
      resistance_levels: { r1: 0, r2: 0, r3: 0 },
      support_levels: { s1: 0, s2: 0, s3: 0 },
      nearResistance: false, nearSupport: false,
      fibLevels: { level_0: 0, level_236: 0, level_382: 0, level_50: 0, level_618: 0, level_100: 0 },
      nearFibLevel: false,
    } as AdvancedIndicators;
    return {
      action: 'WAIT', confidence: 25, reasoning: reason, market_state: 'QUIET', bias: 'Neutral',
      indicators: zeroInd, patterns: [],
      confirmations: { total: 0, required: 3, details: [reason], vwap: false, ema: false, rsi: false, macd: false, bollinger: false, volume: false, adx: false, stochastic: false, pattern: false, priceAction: false },
      volumeAnalysis: {
        current_volume: 0, average_volume: 0, ratio: 0, raw_ratio: 0,
        is_high: false, is_spike: false, smart_money_detected: false,
        has_data: false, feed_reliable: false, coverage: 0,
        body_percent: 0, candle_strength: 'WEAK',
        isHigh: false, isSpike: false, smartMoney: false, bodyPercent: 0, candleStrength: 'WEAK',
        buyPressure: 50, sellPressure: 50, orderFlow: 'NEUTRAL',
      },
      riskManagement: { suggestedEntry: 0, suggestedTarget: 0, suggestedStopLoss: 0, riskRewardRatio: 0, positionSize: 0, maxLoss: 0, expectedProfit: 0 },
      marketRegime: { type: 'QUIET', strength: 0, suitable_for_trading: false },
      executionTime: performance.now() - startTime,
      calculationsPerformed: 0,
    };
  }

  /**
   * ⚡⚡⚡ MAIN ADVANCED SIGNAL GENERATOR ⚡⚡⚡
   */
  public static generateAdvancedSignal(ohlcData: OHLCCandle[], accountBalance: number = 100000, options: AdvancedSignalOptions = {}): AdvancedSignal {
    const startTime = performance.now();
    let calculationsPerformed = 0;

    // ===== SAFETY: validate input data =====
    if (!Array.isArray(ohlcData) || ohlcData.length < 30) {
      return this.emptyWaitResult(`WAIT: Insufficient candle data (${ohlcData?.length ?? 0}/30 minimum).`, startTime);
    }
    // Drop any malformed candles defensively
    const cleanData = ohlcData.filter(c =>
      c && isFinite(c.open) && isFinite(c.high) && isFinite(c.low) && isFinite(c.close)
      && c.high >= c.low && c.high > 0 && c.low > 0
    );
    if (cleanData.length < 30) {
      return this.emptyWaitResult(`WAIT: Too many invalid candles (clean ${cleanData.length}/30).`, startTime);
    }
    ohlcData = cleanData;

    const lastCandle = ohlcData[ohlcData.length - 1];
    const prevCandle = ohlcData[ohlcData.length - 2];
    const safeClose = Math.max(lastCandle.close, 1e-9);

    // ========== CALCULATE ALL INDICATORS ==========
    calculationsPerformed++;

    // Moving Averages
    const ema9 = this.calculateEMA(ohlcData, 9);
    const ema21 = this.calculateEMA(ohlcData, 21);
    const ema50 = this.calculateEMA(ohlcData, 50);
    const ema200 = this.calculateEMA(ohlcData, 200);
    const sma20 = this.calculateSMA(ohlcData, 20);
    calculationsPerformed += 5;

    // VWAP
    const vwap = this.calculateVWAP(ohlcData);
    const safeVwap = Math.max(vwap, 1e-9);
    const vwapDistance = ((lastCandle.close - safeVwap) / safeVwap) * 100;
    const priceAboveVWAP = lastCandle.close > vwap;
    calculationsPerformed += 1;

    // RSI + real divergence
    const rsi = this.calculateRSI(ohlcData);
    const rsiArr = this.rsiSeries(ohlcData);
    const rsiDivergenceObj = this.detectRSIDivergence(ohlcData, rsiArr);
    const rsiOverbought = rsi > 70;
    const rsiOversold = rsi < 30;
    const rsiDivergence = rsiDivergenceObj.bull || rsiDivergenceObj.bear;
    calculationsPerformed += 1;

    // MACD
    const macdData = this.calculateMACD(ohlcData);
    const prevMacdData = ohlcData.length > 30 ? this.calculateMACD(ohlcData.slice(0, -1)) : macdData;
    const macdBullish = macdData.macd > macdData.signal;
    const macdCrossover = macdData.histogram > 0;
    const macdHistogramExpandingBull = macdData.histogram > prevMacdData.histogram;
    const macdHistogramExpandingBear = macdData.histogram < prevMacdData.histogram;
    calculationsPerformed += 1;

    // ATR — compute ONCE, reuse everywhere (perf)
    const atr14 = this.calculateATR(ohlcData, 14);
    const atr = atr14;
    const safeAtr = Math.max(atr14, safeClose * 0.0005);
    const volatilityHigh = atr > safeClose * 0.02;
    const volatilityLow = atr < safeClose * 0.01;
    calculationsPerformed += 1;

    // Bollinger Bands — adaptive squeeze (ATR-normalized, uses cached ATR)
    const bollinger = this.calculateBollingerBands(ohlcData);
    const prevBollinger = ohlcData.length > 25 ? this.calculateBollingerBands(ohlcData.slice(0, -1)) : bollinger;
    const priceNearUpperBand = lastCandle.close > bollinger.upper * 0.98;
    const priceNearLowerBand = lastCandle.close < bollinger.lower * 1.02;
    const atrPct = (safeAtr / safeClose) * 100;
    const squeezeThreshold = atrPct * 1.5;
    const bollingerSqueeze = bollinger.width < squeezeThreshold;
    const bbExpansion = bollinger.width > prevBollinger.width * 1.15;
    const bbSqueezeBreakout: 'BULL' | 'BEAR' | 'NONE' =
      bbExpansion && lastCandle.close > bollinger.upper ? 'BULL'
      : bbExpansion && lastCandle.close < bollinger.lower ? 'BEAR'
      : 'NONE';
    calculationsPerformed += 1;
    
    // ADX
    const adx = this.calculateADX(ohlcData);
    const prevAdx = ohlcData.length > 30 ? this.calculateADX(ohlcData.slice(0, -1)) : adx;
    const adxRising = adx > prevAdx;
    const adxStrong = adx > 25;
    const adxVeryStrong = adx > 50;
    const trending = adxStrong || (adx >= 18 && adxRising);
    calculationsPerformed += 1;
    
    // Stochastic
    const stoch = this.calculateStochastic(ohlcData);
    const stochOverbought = stoch.k > 80;
    const stochOversold = stoch.k < 20;
    calculationsPerformed += 1;
    
    // Support/Resistance — proper swing-pivot detection (fractal pivots + clustering by touches)
    const swing = this.calculateSwingLevels(ohlcData, 80, 2, 2);
    // Fallback to extremes if no pivots found yet (early warm-up)
    const sortedHighs = ohlcData.slice(-50).map(c => c.high).sort((a, b) => b - a);
    const sortedLows = ohlcData.slice(-50).map(c => c.low).sort((a, b) => a - b);
    const resistance1 = swing.resistances[0] ?? sortedHighs[0];
    const resistance2 = swing.resistances[1] ?? sortedHighs[Math.floor(sortedHighs.length * 0.2)];
    const resistance3 = swing.resistances[2] ?? sortedHighs[Math.floor(sortedHighs.length * 0.4)];
    const support1 = swing.supports[0] ?? sortedLows[0];
    const support2 = swing.supports[1] ?? sortedLows[Math.floor(sortedLows.length * 0.2)];
    const support3 = swing.supports[2] ?? sortedLows[Math.floor(sortedLows.length * 0.4)];
    // "Near" tolerance scaled by ATR (~0.5 ATR) so it adapts to volatility instead of fixed 2%
    const nearTol = Math.max(lastCandle.close * 0.003, safeAtr * 0.5);
    const nearResistance = resistance1 ? (resistance1 - lastCandle.close) <= nearTol && lastCandle.close <= resistance1 + nearTol : false;
    const nearSupport = support1 ? (lastCandle.close - support1) <= nearTol && lastCandle.close >= support1 - nearTol : false;
    calculationsPerformed += 1;

    // Fibonacci
    const fibLevels = this.calculateFibonacci(ohlcData);
    const nearFibLevel = Math.abs(lastCandle.close - fibLevels.level_618) < lastCandle.close * 0.005;
    calculationsPerformed += 1;
    
    // Candle Patterns
    const patterns = this.detectCandlePatterns(ohlcData);
    calculationsPerformed += 1;
    
    // Volume + Candle Body Analysis
    // Dhan can return the running candle with flat O/H/L/C or zero body while
    // it is forming. For body strength, use the newest recent candle with a
    // real body/range; keep volume on the latest available volume candle.
    const recentCandles = ohlcData.slice(-10);
    // Search a wider window (20 candles) for a candle with a real body/range so we never
    // end up scoring against a flat / forming candle (which gave us "body 0.0pts" issue).
    const searchWindow = ohlcData.slice(-20);
    const hasRealBody = (c: OHLCCandle) =>
      Number.isFinite(c?.open) && Number.isFinite(c?.close) && Number.isFinite(c?.high) && Number.isFinite(c?.low) &&
      Math.abs((c.close || 0) - (c.open || 0)) > 0 && ((c.high || 0) - (c.low || 0)) > 0;
    const fallbackCandle = [...searchWindow].reverse().find(hasRealBody) || lastCandle;
    const lastCandleBody = Math.abs((lastCandle.close || 0) - (lastCandle.open || 0));
    const lastCandleRange = (lastCandle.high || 0) - (lastCandle.low || 0);
    const bodyRefCandle = (lastCandleBody > 0 && lastCandleRange > 0) ? lastCandle : fallbackCandle;
    const volumeRefCandle = [...recentCandles].reverse().find(c => (c.volume || 0) > 0) || bodyRefCandle;
    const avgVolume = recentCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / Math.max(recentCandles.length, 1);
    const refVolume = volumeRefCandle.volume || 0;
    const volumeRatio = avgVolume > 0 && Number.isFinite(refVolume / avgVolume) ? refVolume / avgVolume : 0;
    const isHighVolume = volumeRatio > 1.5;
    const isVolumeSpike = volumeRatio > 2.0;
    let bodySize = Math.abs((bodyRefCandle.close || 0) - (bodyRefCandle.open || 0));
    let refRange = Math.max(0, (bodyRefCandle.high || 0) - (bodyRefCandle.low || 0));
    // Final safety net: if body is still 0 (all recent candles flat / bad feed), approximate
    // body strength from ATR so the engine doesn't permanently lock on "body 0.0pts".
    if (bodySize === 0 && safeAtr > 0) {
      bodySize = safeAtr * 0.5;
      refRange = Math.max(refRange, safeAtr);
    }
    const bodyPercent = refRange > 0 ? Math.min(100, (bodySize / refRange) * 100) : 0;
    const smartMoney = bodyPercent > 60 && isVolumeSpike;

    
    
    // Order Flow
    const orderFlow = this.analyzeOrderFlow(ohlcData);
    calculationsPerformed += 1;

    // ===== Institutional analytics =====
    // ⚡ Reuse already-computed ema9/ema21/ema50 from indicator pipeline (no recompute)
    const ema9Slope = this.emaSlope(ohlcData, 9, 5, ema9);
    const ema21Slope = this.emaSlope(ohlcData, 21, 5, ema21);
    const ema50Slope = this.emaSlope(ohlcData, 50, 10, ema50);
    const slopeMin = 0.02; // 0.02% per bar minimum to consider "directional"
    const slopeBullish = ema9Slope > slopeMin && ema21Slope > slopeMin * 0.5;
    const slopeBearish = ema9Slope < -slopeMin && ema21Slope < -slopeMin * 0.5;

    const fibImpulse = this.detectImpulseLeg(ohlcData);
    const smartMoneyBias = this.detectSmartMoney(ohlcData);
    const marketStructure = this.detectMarketStructure(ohlcData, avgVolume);
    const liquidity = this.detectLiquiditySweep(ohlcData, safeAtr, avgVolume);
    const gap = this.detectGap(ohlcData);

    // Range expansion: current candle range vs avg of last 5 (excluding current)
    const prev5Ranges = ohlcData.slice(-6, -1).map(c => Math.max(0, c.high - c.low));
    const avgPrev5Range = prev5Ranges.length ? prev5Ranges.reduce((a, b) => a + b, 0) / prev5Ranges.length : 0;
    const currentRange = Math.max(0, lastCandle.high - lastCandle.low);
    const rangeExpansion = avgPrev5Range > 0 && currentRange > avgPrev5Range * 1.3;

    // Volume normalization (session-time aware: morning vs afternoon)
    const istNowForVol = new Date(Date.now() + 5.5 * 3600 * 1000);
    const istMinForVol = istNowForVol.getUTCHours() * 60 + istNowForVol.getUTCMinutes();
    const isMorningSession = istMinForVol >= 9 * 60 + 15 && istMinForVol < 11 * 60;
    const volumeAdjustment = isMorningSession ? 0.85 : 1.0; // morning naturally has higher volume
    const adjustedVolumeRatio = volumeRatio * volumeAdjustment;

    // Combine all indicators
    const indicators: AdvancedIndicators = {
      ema9, ema21, ema50, ema200, sma20,
      vwap, vwapDistance, priceAboveVWAP,
      rsi, rsiOverbought, rsiOversold, rsiDivergence,
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      macdBullish, macdCrossover,
      bollingerUpper: bollinger.upper,
      bollingerMiddle: bollinger.middle,
      bollingerLower: bollinger.lower,
      bollingerWidth: bollinger.width,
      priceNearUpperBand, priceNearLowerBand, bollingerSqueeze,
      atr, atr14, volatilityHigh, volatilityLow,
      adx, adxStrong, adxVeryStrong, trending,
      stochK: stoch.k, stochD: stoch.d, stochOverbought, stochOversold,
      resistance_levels: { r1: resistance1, r2: resistance2, r3: resistance3 },
      support_levels: { s1: support1, s2: support2, s3: support3 },
      nearResistance, nearSupport,
      fibLevels, nearFibLevel,
      // institutional
      rsiBullishDivergence: rsiDivergenceObj.bull,
      rsiBearishDivergence: rsiDivergenceObj.bear,
      bbSqueeze: bollingerSqueeze,
      bbExpansion,
      bbSqueezeBreakout,
      ema9Slope, ema21Slope, ema50Slope,
      slopeBullish, slopeBearish,
      rangeExpansion,
      fibImpulse,
      gap,
    };
    
    // Market Regime
    const marketRegime = this.detectMarketRegime(ohlcData, indicators);
    calculationsPerformed += 1;
    
    // ========== ADVANCED CONFIRMATION SYSTEM (WEIGHTED!) ==========
    const confirmationDetails: string[] = [];
    let totalWeightedScore = 0; // NEW: Weighted scoring system
    const confirmations = {
      total: 0,  // This will now be the weighted score
      required: 6,
      details: [] as string[],
      vwap: false,
      ema: false,
      rsi: false,
      macd: false,
      bollinger: false,
      volume: false,
      adx: false,
      stochastic: false,
      pattern: false,
      priceAction: false
    };
    
    const isBullish = lastCandle.close > lastCandle.open;
    const isBearish = lastCandle.close < lastCandle.open;
    
    // ⚡ FIX BUG #8: Use Market Regime for trend bias (not just current candle!)
    // In strong trends (ADX > 25), small counter-trend candles don't change the bias
    const trendBias = marketRegime.type === 'TRENDING_UP' ? 'bullish' : 
                      marketRegime.type === 'TRENDING_DOWN' ? 'bearish' : 
                      isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral';
    
    // ⚡ FIX: Use trend bias if ADX > 25 (strong trend), not 40!
    const useTrendBias = adx > 25;  // Changed from 40 to 25!
    const confirmationBullish = useTrendBias ? (trendBias === 'bullish') : isBullish;
    const confirmationBearish = useTrendBias ? (trendBias === 'bearish') : isBearish;
    
    // ⚡ PHASE 2: VWAP Confirmation with ATR Normalization (Weight: 2)
    const vwapNormalized = this.normalizeVWAPDistance(lastCandle.close, vwap, atr14, adx);  // Pass ADX!
    
    if (confirmationBullish && priceAboveVWAP && vwapNormalized.interpretation === 'ACCEPTABLE') {
      confirmations.vwap = true;
      totalWeightedScore += 2; // Weight: 2
      confirmationDetails.push(`✅ VWAP: Price above VWAP (${vwapNormalized.distanceATR.toFixed(2)} ATR, ${vwapNormalized.distancePercent.toFixed(2)}%)`);
    } else if (confirmationBearish && !priceAboveVWAP && vwapNormalized.interpretation === 'ACCEPTABLE') {
      confirmations.vwap = true;
      totalWeightedScore += 2; // Weight: 2
      confirmationDetails.push(`✅ VWAP: Price below VWAP (${vwapNormalized.distanceATR.toFixed(2)} ATR, ${vwapNormalized.distancePercent.toFixed(2)}%)`);
    } else if (vwapNormalized.interpretation === 'EXTENDED') {
      confirmationDetails.push(`⚠️ VWAP: Extended (${vwapNormalized.distanceATR.toFixed(2)} ATR - reversal risk)`);
    } else {
      confirmationDetails.push('❌ VWAP: Neutral (too close)');
    }
    
    // 2. EMA Confirmation (Weight: 1) — RELAXED in strong trends
    const emaUptrend = ema9 > ema21 && ema21 > ema50;
    const emaDowntrend = ema9 < ema21 && ema21 < ema50;
    // ⚡ FIX 1: When ADX > 30, require only ema9/ema21 alignment + price within 0.75 ATR of EMA21
    // (allows pullback / retest entries without losing full ema50 alignment requirement)
    const emaStrongTrend = adx > 30;
    const emaBullRelaxed = emaStrongTrend && ema9 > ema21 && lastCandle.close >= ema21 - atr14 * 0.75;
    const emaBearRelaxed = emaStrongTrend && ema9 < ema21 && lastCandle.close <= ema21 + atr14 * 0.75;
    const priceNearEma9Bullish = lastCandle.close > ema9 || (lastCandle.close > ema9 - atr14 * 0.5);
    const priceNearEma9Bearish = lastCandle.close < ema9 || (lastCandle.close < ema9 + atr14 * 0.5);

    if (confirmationBullish && (emaUptrend && priceNearEma9Bullish || emaBullRelaxed)) {
      confirmations.ema = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ EMA: Bullish trend (${emaBullRelaxed && !emaUptrend ? '9>21 relaxed, ADX strong' : '9>21>50'})`);
    } else if (confirmationBearish && (emaDowntrend && priceNearEma9Bearish || emaBearRelaxed)) {
      confirmations.ema = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ EMA: Bearish trend (${emaBearRelaxed && !emaDowntrend ? '9<21 relaxed, ADX strong' : '9<21<50'})`);
    } else {
      confirmationDetails.push('❌ EMA: Neutral or mixed');
    }
    
    // 3. RSI Confirmation (Weight: 1)
    // ⚡ FIX BUG #3: In ranging markets (ADX < 20), RSI is unreliable!
    const isRangingMarket = adx < 20;
    
    if (!isRangingMarket && confirmationBullish && rsi > 45 && rsi < 75) {
      confirmations.rsi = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push('✅ RSI: Bullish momentum (>45, flexible trend start)');
    } else if (!isRangingMarket && confirmationBearish && rsi < 55 && rsi > 25) {
      confirmations.rsi = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push('✅ RSI: Bearish momentum (<55, flexible trend start)');
    } else if (rsiOversold && confirmationBearish && (emaDowntrend || marketRegime.type === 'TRENDING_DOWN')) {
      // ⚡ FIX: RSI oversold in strong downtrend = continuation, not reversal!
      confirmations.rsi = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ RSI: Oversold (${rsi.toFixed(1)}) + downtrend continuation`);
    } else if (rsiOverbought && confirmationBullish && (emaUptrend || marketRegime.type === 'TRENDING_UP')) {
      // ⚡ FIX: RSI overbought in strong uptrend = continuation, not reversal!
      confirmations.rsi = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ RSI: Overbought (${rsi.toFixed(1)}) + uptrend continuation`);
    } else if (rsiOverbought) {
      confirmationDetails.push('⚠️ RSI: Overbought (>70)');
    } else if (rsiOversold) {
      confirmationDetails.push('⚠️ RSI: Oversold (<30)');
    } else if (isRangingMarket) {
      // ⚡ FIX BUG #3: In ranging markets, RSI doesn't count!
      confirmationDetails.push(`❌ RSI: Unreliable in ranging market (ADX ${adx.toFixed(1)} < 20)`);
    } else {
      confirmationDetails.push('❌ RSI: Neutral');
    }
    
    // 4. MACD Confirmation (Weight: 1)
    // ⚡ FIX BUG #10: Use confirmationBullish/Bearish instead of candle color
    // ⚡ FIX BUG #3: In ranging markets (ADX < 20), MACD gives false signals!
    if (!isRangingMarket && confirmationBullish && macdHistogramExpandingBull) {
      confirmations.macd = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push(`✅ MACD: Histogram expanding bullish (${prevMacdData.histogram.toFixed(2)} → ${macdData.histogram.toFixed(2)})`);
    } else if (!isRangingMarket && confirmationBearish && macdHistogramExpandingBear) {
      confirmations.macd = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push(`✅ MACD: Histogram expanding bearish (${prevMacdData.histogram.toFixed(2)} → ${macdData.histogram.toFixed(2)})`);
    } else if (isRangingMarket) {
      // ⚡ FIX BUG #3: In ranging markets, MACD doesn't count!
      confirmationDetails.push(`❌ MACD: Unreliable in ranging market (ADX ${adx.toFixed(1)} < 20)`);
    } else {
      confirmationDetails.push('❌ MACD: No clear signal');
    }
    
    // 5. Bollinger Bands Confirmation (Weight: 1)
    if (isBullish && lastCandle.close > bollinger.middle && !priceNearUpperBand) {
      confirmations.bollinger = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push('✅ BB: Price above middle, room to upper band');
    } else if (isBearish && lastCandle.close < bollinger.middle && !priceNearLowerBand) {
      confirmations.bollinger = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push('✅ BB: Price below middle, room to lower band');
    } else if (priceNearUpperBand) {
      confirmationDetails.push('⚠️ BB: Near upper band (overbought)');
    } else if (priceNearLowerBand) {
      confirmationDetails.push('⚠️ BB: Near lower band (oversold)');
    } else {
      confirmationDetails.push('❌ BB: Neutral');
    }
    
    // 6. Volume Confirmation (Weight: 1)
    if ((isBullish || isBearish) && isHighVolume && bodyPercent > 40) {
      confirmations.volume = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push(`✅ Volume: High (${volumeRatio.toFixed(2)}x) + strong candle`);
    } else {
      confirmationDetails.push('❌ Volume: Low or weak candle');
    }
    
    // 7. ADX Confirmation (Trend Strength) (Weight: 1)
    // ⚡ FIX: Use confirmationBullish/Bearish (trend bias) instead of candle color!
    if (trending && ((confirmationBullish && emaUptrend) || (confirmationBearish && emaDowntrend))) {
      confirmations.adx = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push(`✅ ADX: ${adxStrong ? 'Strong' : 'Rising'} trend (${prevAdx.toFixed(1)} → ${adx.toFixed(1)})`);
    } else {
      // ⚡ FIX: Show correct ADX interpretation
      const adxInterpretation = this.getADXInterpretation(adx);
      confirmationDetails.push(`❌ ADX: ${adxInterpretation} (${adx.toFixed(1)}) - ${trending ? 'Strong but' : 'Weak,'} EMAs not aligned`);
    }
    
    // 8. Stochastic Confirmation (Weight: 1) — FIX PROBLEM #4
    // Removed dangerous "oversold + downtrend continuation" and "overbought + uptrend continuation" branches.
    // Extreme readings reverse fast in expiry trading; chasing them creates trap entries.
    const stochRising = stoch.k > stoch.d;
    const stochFalling = stoch.k < stoch.d;
    if (adx > 30) {
      confirmationDetails.push(`➖ Stochastic: Ignored in strong trend (ADX ${adx.toFixed(1)})`);
    } else if (isBullish && stochOversold) {
      confirmations.stochastic = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ Stochastic: Oversold (${stoch.k.toFixed(1)}) + bullish reversal`);
    } else if (isBearish && stochOverbought) {
      confirmations.stochastic = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ Stochastic: Overbought (${stoch.k.toFixed(1)}) + bearish reversal`);
    } else if (confirmationBullish && stochRising && stoch.k > 20 && stoch.k < 80) {
      confirmations.stochastic = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ Stochastic: %K(${stoch.k.toFixed(1)}) > %D(${stoch.d.toFixed(1)}) rising in trend`);
    } else if (confirmationBearish && stochFalling && stoch.k > 20 && stoch.k < 80) {
      confirmations.stochastic = true;
      totalWeightedScore += 1;
      confirmationDetails.push(`✅ Stochastic: %K(${stoch.k.toFixed(1)}) < %D(${stoch.d.toFixed(1)}) falling in trend`);
    } else if (stochOverbought) {
      confirmationDetails.push(`⚠️ Stochastic: Overbought (${stoch.k.toFixed(1)}/${stoch.d.toFixed(1)}) — no chase`);
    } else if (stochOversold) {
      confirmationDetails.push(`⚠️ Stochastic: Oversold (${stoch.k.toFixed(1)}/${stoch.d.toFixed(1)}) — no chase`);
    } else {
      confirmationDetails.push(`❌ Stochastic: Neutral (${stoch.k.toFixed(1)}/${stoch.d.toFixed(1)})`);
    }

    
    // 9. Pattern Confirmation with Validation (Weight: 1-2 based on context)
    const bullishPatterns = patterns.filter(p => p.direction === 'BULLISH');
    const bearishPatterns = patterns.filter(p => p.direction === 'BEARISH');
    
    // ⚡ FIX: Only validate patterns that match the trend bias!
    if (confirmationBullish && bullishPatterns.length > 0) {
      // Validate bullish pattern
      const patternValidation = this.validatePattern(bullishPatterns[0], lastCandle, prevCandle, nearResistance, nearSupport);
      confirmations.pattern = patternValidation.isValid;
      totalWeightedScore += patternValidation.weight; // Weight: 1-2 based on validation
      confirmationDetails.push(`${patternValidation.isValid ? '✅' : '⚠️'} Pattern: ${bullishPatterns[0].type} (${patternValidation.reason})`);
    } else if (confirmationBearish && bearishPatterns.length > 0) {
      // Validate bearish pattern
      const patternValidation = this.validatePattern(bearishPatterns[0], lastCandle, prevCandle, nearResistance, nearSupport);
      confirmations.pattern = patternValidation.isValid;
      totalWeightedScore += patternValidation.weight; // Weight: 1-2 based on validation
      confirmationDetails.push(`${patternValidation.isValid ? '✅' : '⚠️'} Pattern: ${bearishPatterns[0].type} (${patternValidation.reason})`);
    } else {
      confirmationDetails.push('❌ Pattern: No strong pattern');
    }
    
    // 10. Price Action Confirmation (Higher Highs/Lower Lows) (Weight: 1)
    const last5 = ohlcData.slice(-5);
    const higherHighs = last5[4].high > last5[3].high && last5[3].high > last5[2].high;
    const lowerLows = last5[4].low < last5[3].low && last5[3].low < last5[2].low;
    
    // ⚡ FIX BUG #12: If ADX > 25 (trending), use trend bias instead of strict higher highs/lower lows
    // In strong trends, minor pullbacks don't invalidate the trend!
    const trendingMarket = adx > 25;
    
    if (trendingMarket && confirmationBullish) {
      confirmations.priceAction = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push(`✅ Price Action: Strong uptrend (ADX ${adx.toFixed(1)})`);
    } else if (trendingMarket && confirmationBearish) {
      confirmations.priceAction = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push(`✅ Price Action: Strong downtrend (ADX ${adx.toFixed(1)})`);
    } else if (confirmationBullish && higherHighs) {
      confirmations.priceAction = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push('✅ Price Action: Higher highs (uptrend)');
    } else if (confirmationBearish && lowerLows) {
      confirmations.priceAction = true;
      totalWeightedScore += 1; // Weight: 1
      confirmationDetails.push('✅ Price Action: Lower lows (downtrend)');
    } else {
      confirmationDetails.push('❌ Price Action: No clear trend');
    }
    
    confirmations.details = confirmationDetails;
    confirmations.total = totalWeightedScore; // Set the total to the weighted score
    
    // ========== RISK MANAGEMENT ========== (FIX PROBLEM #10: dynamic RR)
    const currentPrice = lastCandle.close;

    // ATR-based stop loss combined with swing structure (FIX 9: smarter stoploss)
    const atrStop = atr14 * 2;
    const swingLookback = ohlcData.slice(-15);
    const swingLow = swingLookback.length ? Math.min(...swingLookback.map(c => c.low)) : currentPrice - atrStop;
    const swingHigh = swingLookback.length ? Math.max(...swingLookback.map(c => c.high)) : currentPrice + atrStop;
    const swingStopBull = currentPrice - swingLow + atr14 * 0.2;        // give 0.2 ATR buffer below swing low
    const swingStopBear = swingHigh - currentPrice + atr14 * 0.2;
    // Use the WIDER of ATR-stop vs swing-stop (more protective) — but cap at 3.5x ATR to keep RR sane.
    const stopLossDistance = Math.min(atr14 * 3.5, Math.max(atrStop, isBullish ? swingStopBull : swingStopBear));
    const suggestedStopLoss = isBullish ? currentPrice - stopLossDistance : currentPrice + stopLossDistance;

    // Dynamic RR based on regime and trend strength:
    //   - Strong trend (ADX>40) + suitable regime → 3.0  (let winners run)
    //   - Normal trending market                  → 2.0
    //   - Ranging / volatile / unsuitable         → 1.5  (book quicker)
    let riskRewardRatio = 2.0;
    if (adx > 40 && marketRegime.suitable_for_trading) riskRewardRatio = 3.0;
    else if (!marketRegime.suitable_for_trading || marketRegime.type === 'RANGING' || marketRegime.type === 'VOLATILE' || marketRegime.type === 'QUIET') riskRewardRatio = 1.5;

    const targetDistance = stopLossDistance * riskRewardRatio;
    const suggestedTarget = isBullish ? currentPrice + targetDistance : currentPrice - targetDistance;

    const riskAmount = accountBalance * 0.02;
    const positionSize = Math.floor(riskAmount / Math.max(stopLossDistance, 1));
    const maxLoss = riskAmount;
    const expectedProfit = riskAmount * riskRewardRatio;

    // ATR trailing stop: move SL to BE after 1 ATR profit, trail by 1.5 ATR after that
    const trailingStop = {
      initial: suggestedStopLoss,
      trigger: isBullish ? currentPrice + atr14 : currentPrice - atr14, // when price hits this, activate trail
      trailDistance: atr14 * 1.5,
      breakeven: currentPrice,
    };

    const riskManagement = {
      suggestedEntry: currentPrice,
      suggestedTarget,
      suggestedStopLoss,
      riskRewardRatio,
      positionSize,
      maxLoss,
      expectedProfit,
      trailingStop,
    };

    // ========== FINAL DECISION ==========
    let action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT' = 'WAIT';
    let confidence = 0;
    let reasoning = '';
    let bias: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';

    // FIX PROBLEM #7: ATR-relative body strength (relative to current volatility)
    // Body must be ≥ max(10 pts, 0.4 × ATR14). In low-volatility sessions ATR is small so 10pts dominates,
    // in high-volatility ATR-derived floor scales up so a relatively weak 12pt candle isn't enough.
    const minimumBodySize = Math.max(10, atr14 * 0.4);
    const isVeryStrongTrend = adx > 50;
    const minimumVolumeRatio = isVeryStrongTrend ? 0.5 : 0.8;
    const volumeFeedReliable = avgVolume > 0 && refVolume > 0 && isFinite(volumeRatio) && volumeRatio > 0;
    const hasAcceptableVolume = !volumeFeedReliable ? (bodyPercent >= 35) : (volumeRatio >= minimumVolumeRatio);

    const hasStrongPattern = patterns.some(p => p.confidence >= 80 &&
      ((confirmationBullish && p.direction === 'BULLISH') || (confirmationBearish && p.direction === 'BEARISH')));

    // Professional MTF: use REAL 15m candles passed by caller. Never resample 5m candles into fake 15m.
    const htfDataProvided = Boolean(options.higherTimeframeData && options.higherTimeframeData.length >= 25);
    const htfAlign = htfDataProvided ? this.detectHigherTimeframeTrend(options.higherTimeframeData) : 'neutral';
    const htfAgreesBull = htfDataProvided ? htfAlign === 'bull' : true;
    const htfAgreesBear = htfDataProvided ? htfAlign === 'bear' : true;

    // Breakout confirmation: close beyond level, or previous breakout + current candle holds the level.
    const breakoutLookback = Math.min(12, Math.max(5, ohlcData.length - 2));
    const breakoutBase = ohlcData.slice(-(breakoutLookback + 2), -2);
    const fallbackBase = ohlcData.slice(-Math.min(12, ohlcData.length - 1), -1);
    const levelCandles = breakoutBase.length >= 5 ? breakoutBase : fallbackBase;
    const breakoutHigh = Math.max(...levelCandles.map(c => c.high));
    const breakoutLow = Math.min(...levelCandles.map(c => c.low));
    const breakoutHoldTol = atr14 * 0.15;
    const bullishBreakoutClose = lastCandle.close > breakoutHigh && lastCandle.close > lastCandle.open;
    const bearishBreakdownClose = lastCandle.close < breakoutLow && lastCandle.close < lastCandle.open;
    const bullishBreakoutHold = prevCandle.close > breakoutHigh && lastCandle.close > breakoutHigh && lastCandle.low >= breakoutHigh - breakoutHoldTol;
    const bearishBreakdownHold = prevCandle.close < breakoutLow && lastCandle.close < breakoutLow && lastCandle.high <= breakoutLow + breakoutHoldTol;
    const breakoutConfirmedBull = bullishBreakoutClose || bullishBreakoutHold;
    const breakoutConfirmedBear = bearishBreakdownClose || bearishBreakdownHold;

    const earlyBullChecks = [
      breakoutConfirmedBull,
      ema9 > ema21 && lastCandle.close >= ema9 - atr14 * 0.2,
      lastCandle.close > vwap,
      hasAcceptableVolume && (bodySize >= minimumBodySize * 0.6 || bodyPercent >= 35),
    ];
    const earlyBearChecks = [
      breakoutConfirmedBear,
      ema9 < ema21 && lastCandle.close <= ema9 + atr14 * 0.2,
      lastCandle.close < vwap,
      hasAcceptableVolume && (bodySize >= minimumBodySize * 0.6 || bodyPercent >= 35),
    ];
    const earlyBullScore = earlyBullChecks.filter(Boolean).length;
    const earlyBearScore = earlyBearChecks.filter(Boolean).length;
    const earlyRequiredConfirmations = 3;
    const momentumBull = macdHistogramExpandingBull || adxRising;
    const momentumBear = macdHistogramExpandingBear || adxRising;

    const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
    const istMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
    const inMidSessionTrapWindow = istMinutes >= 11 * 60 && istMinutes <= 13 * 60 + 30;
    const prevVwap = ohlcData.length > 5 ? this.calculateVWAP(ohlcData.slice(0, -1)) : vwap;
    const vwapFlat = Math.abs(vwap - prevVwap) <= Math.max(1, atr14 * 0.05);
    const weakMidSessionTrap = inMidSessionTrapWindow && (adx < 22 && !adxRising) && !hasAcceptableVolume && vwapFlat;

    const timeframeMinutes = options.timeframeMinutes || 5;
    const currentTsMs = lastCandle.timestamp < 1e12 ? lastCandle.timestamp * 1000 : lastCandle.timestamp;
    const lastSignalTsMs = options.lastSignalTimestamp ? (options.lastSignalTimestamp < 1e12 ? options.lastSignalTimestamp * 1000 : options.lastSignalTimestamp) : 0;
    const minimumBarsBetweenSignals = options.minimumBarsBetweenSignals ?? 3;
    const barsSinceLastSignal = lastSignalTsMs > 0 ? (currentTsMs - lastSignalTsMs) / (timeframeMinutes * 60 * 1000) : Infinity;
    const cooldownActive = isFinite(barsSinceLastSignal) && Math.abs(barsSinceLastSignal) < minimumBarsBetweenSignals;

    // ===== FIX 5: ADX-BASED REQUIRED CONFIRMATIONS =====
    // ADX > 35 → 4 (strong trend, few confirmations needed)
    // ADX 25-35 → 5
    // ADX < 25 → 7 (weak/ranging — need overwhelming proof)
    const requiredConfirmations = adx > 35 ? 4 : adx >= 25 ? 5 : 7;
    confirmations.required = requiredConfirmations;
    const strongConfirmationScore = [confirmations.macd, confirmations.adx, confirmations.rsi, confirmations.stochastic].filter(Boolean).length;

    // ===== DYNAMIC CONFIRMATION TIERS =====
    // FAST_ENTRY  = 3 confirmations  (early entry, lower confidence ceiling)
    // STRONG      = 5 confirmations  (early + momentum, normal confidence)
    // HIGH_CONF   = 6+ confirmations (everything aligned, boosted confidence)
    const totalBullScore = earlyBullScore + strongConfirmationScore;
    const totalBearScore = earlyBearScore + strongConfirmationScore;
    const bullTier: 'NONE' | 'FAST' | 'STRONG' | 'HIGH' =
      totalBullScore >= 6 ? 'HIGH' : totalBullScore >= 5 ? 'STRONG' : totalBullScore >= 3 ? 'FAST' : 'NONE';
    const bearTier: 'NONE' | 'FAST' | 'STRONG' | 'HIGH' =
      totalBearScore >= 6 ? 'HIGH' : totalBearScore >= 5 ? 'STRONG' : totalBearScore >= 3 ? 'FAST' : 'NONE';

    // ===== REVERSAL FOLLOW-THROUGH GATE =====
    // CHoCH + RSI divergence may only boost confidence if follow-through candle
    // closes in the reversal direction AND volume confirms.
    const reversalBullFollowThrough =
      lastCandle.close > lastCandle.open &&
      prevCandle.close > prevCandle.open &&
      lastCandle.close > prevCandle.close &&
      hasAcceptableVolume;
    const reversalBearFollowThrough =
      lastCandle.close < lastCandle.open &&
      prevCandle.close < prevCandle.open &&
      lastCandle.close < prevCandle.close &&
      hasAcceptableVolume;
    const reversalBullValid = reversalBullFollowThrough && (marketStructure.choch === 'BULL' || rsiDivergenceObj.bull);
    const reversalBearValid = reversalBearFollowThrough && (marketStructure.choch === 'BEAR' || rsiDivergenceObj.bear);

    // ===== INSTITUTIONAL FILTERS =====
    // 1) Liquidity sweep BLOCKS counter-direction entries (stop hunts → reversal incoming)
    const liquidityBlocksBull = liquidity.buySideSweep; // upside sweep ⇒ avoid longs
    const liquidityBlocksBear = liquidity.sellSideSweep; // downside sweep ⇒ avoid shorts
    // 2) Range expansion required for breakout entries (rejects weak breakouts)
    const breakoutQualityBull = breakoutConfirmedBull && (rangeExpansion || bbSqueezeBreakout === 'BULL');
    const breakoutQualityBear = breakoutConfirmedBear && (rangeExpansion || bbSqueezeBreakout === 'BEAR');
    // 3) Slope filter: trend must actually be moving
    const slopeOkBull = slopeBullish || ema9Slope > 0;
    const slopeOkBear = slopeBearish || ema9Slope < 0;
    // 4) Market structure must not contradict
    const structureOkBull = marketStructure.type !== 'DOWNTREND' || marketStructure.choch === 'BULL';
    const structureOkBear = marketStructure.type !== 'UPTREND' || marketStructure.choch === 'BEAR';
    // 5) Smart money agreement boost (not a hard block)
    const smartMoneyAgreesBull = smartMoneyBias !== 'BEARISH';
    const smartMoneyAgreesBear = smartMoneyBias !== 'BULLISH';

    // ⚡ HTF is SOFT FILTER ONLY — never a hard block.
    // Disagreement only deducts score; agreement boosts. Strong intra-trend ADX bypasses HTF entirely.
    const htfDisagreeBull = htfDataProvided && htfAlign === 'bear';
    const htfDisagreeBear = htfDataProvided && htfAlign === 'bull';
    const htfAdxStrong = adx > 30;

    // ===== FIX 4: TREND-CONTINUATION PULLBACK ENTRY MODEL =====
    // BULL: ADX>25, ema9>ema21, price pulled back to ema9/ema21, bullish rejection wick
    //       OR strong bullish close, MACD histogram improving (less negative or rising)
    // BEAR: mirror
    const _body = Math.abs(lastCandle.close - lastCandle.open);
    const _range = Math.max(lastCandle.high - lastCandle.low, 1e-6);
    const _lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
    const _upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
    const bullishRejectionCandle = _lowerWick > _body * 1.2 && lastCandle.close > lastCandle.open;
    const bearishRejectionCandle = _upperWick > _body * 1.2 && lastCandle.close < lastCandle.open;
    const strongBullishClose = lastCandle.close > lastCandle.open && (lastCandle.close - lastCandle.low) / _range > 0.65;
    const strongBearishClose = lastCandle.close < lastCandle.open && (lastCandle.high - lastCandle.close) / _range > 0.65;
    const macdHistImprovingBull = macdData.histogram > prevMacdData.histogram;
    const macdHistWeakeningBear = macdData.histogram < prevMacdData.histogram;
    const priceTouchedEmaZoneBull = lastCandle.low <= ema9 + atr14 * 0.3 || lastCandle.low <= ema21 + atr14 * 0.4;
    const priceTouchedEmaZoneBear = lastCandle.high >= ema9 - atr14 * 0.3 || lastCandle.high >= ema21 - atr14 * 0.4;
    const continuationBull = adx > 25 && ema9 > ema21 && priceTouchedEmaZoneBull
      && (bullishRejectionCandle || strongBullishClose) && macdHistImprovingBull;
    const continuationBear = adx > 25 && ema9 < ema21 && priceTouchedEmaZoneBear
      && (bearishRejectionCandle || strongBearishClose) && macdHistWeakeningBear;

    // Gate uses totalBullScore (0-8) so the new 4/5/7 thresholds map across early+momentum.
    // Continuation setup bypasses the score requirement when ADX strong.
    const strongBullish = confirmationBullish
      && (totalBullScore >= requiredConfirmations || (continuationBull && adx > 30))
      && (breakoutQualityBull || adxStrong || continuationBull)
      && (momentumBull || adxStrong || continuationBull)
      && (slopeOkBull || adxStrong || continuationBull)
      && structureOkBull
      && !liquidityBlocksBull
      && !weakMidSessionTrap
      && !cooldownActive
      && !(htfDisagreeBull && !htfAdxStrong);
    const strongBearish = confirmationBearish
      && (totalBearScore >= requiredConfirmations || (continuationBear && adx > 30))
      && (breakoutQualityBear || adxStrong || continuationBear)
      && (momentumBear || adxStrong || continuationBear)
      && (slopeOkBear || adxStrong || continuationBear)
      && structureOkBear
      && !liquidityBlocksBear
      && !weakMidSessionTrap
      && !cooldownActive
      && !(htfDisagreeBear && !htfAdxStrong);

    // ===== FIX 7: BREAKOUT QUALITY CLASSIFICATION =====
    const breakoutClose = lastCandle.close;
    const breakoutBodyRange = (Math.max(breakoutClose, lastCandle.open) - Math.min(breakoutClose, lastCandle.open)) / Math.max(_range, 1e-6);
    const prevRanges = ohlcData.slice(-6, -1).map(c => c.high - c.low);
    const avgPrevRange = prevRanges.length > 0 ? prevRanges.reduce((a, b) => a + b, 0) / prevRanges.length : _range;
    const rangeExpansionStrong = _range > avgPrevRange * 1.3;
    const closeNearHigh = (breakoutClose - lastCandle.low) / _range > 0.7;
    const closeNearLow = (lastCandle.high - breakoutClose) / _range > 0.7;
    const breakoutQuality: 'STRONG' | 'WEAK' | 'NONE' =
      ((breakoutConfirmedBull && closeNearHigh) || (breakoutConfirmedBear && closeNearLow))
        && rangeExpansionStrong && bbExpansion ? 'STRONG'
      : (breakoutConfirmedBull || breakoutConfirmedBear) ? 'WEAK'
      : 'NONE';

    // ===== FIX 8: ENTRY QUALITY SCORE (0-100) =====
    let entryQualityScore = 0;
    entryQualityScore += Math.min(25, adx * 0.6);                              // trend strength up to 25
    entryQualityScore += (confirmations.ema ? 12 : 0);                         // EMA alignment
    entryQualityScore += (confirmations.adx ? 8 : 0);                          // ADX confirm
    entryQualityScore += (breakoutQuality === 'STRONG' ? 15 : breakoutQuality === 'WEAK' ? 7 : 0);
    entryQualityScore += ((strongBullishClose || strongBearishClose) ? 10 : (bullishRejectionCandle || bearishRejectionCandle) ? 6 : 0);
    entryQualityScore += (smartMoneyBias !== 'NEUTRAL' ? 10 : 0);
    entryQualityScore += (confirmations.macd ? 8 : 0);
    entryQualityScore += (liquidity.stopHunt ? -10 : 0);
    entryQualityScore += ((continuationBull || continuationBear) ? 12 : 0);
    entryQualityScore = Math.max(0, Math.min(100, Math.round(entryQualityScore)));
    const entryQualityTier = entryQualityScore >= 90 ? 'SNIPER' : entryQualityScore >= 75 ? 'STRONG' : entryQualityScore >= 60 ? 'ACCEPTABLE' : 'AVOID';

    

    
    // ⚡ SIDEWAYS / NO-TRADE ZONE (STRICT): only block when market clearly has no direction.
    // Require ALL key conditions: weak ADX + flat slopes + low ATR + (VWAP flat OR squeeze).
    // NEVER block when ADX confirms a trending regime.
    const emaMixed = !((ema9 > ema21 && ema21 > ema50) || (ema9 < ema21 && ema21 < ema50));
    const atrLow = atr14 < safeClose * 0.0035; // < 0.35% of price
    const slopesFlat = Math.abs(ema9Slope) < 0.015 && Math.abs(ema21Slope) < 0.01;
    const squeezeWithoutExpansion = bollingerSqueeze && !bbExpansion;
    const inTrendingRegime = marketRegime.type === 'TRENDING_UP' || marketRegime.type === 'TRENDING_DOWN';
    // Strict: ADX must be weak, slopes flat, ATR low, AND (VWAP flat OR squeeze). Override if trending.
    const noTradeZone = !inTrendingRegime
      && adx < 22
      && slopesFlat
      && atrLow
      && (vwapFlat || squeezeWithoutExpansion)
      && emaMixed;
    const sidewaysSignals = [adx < 22, atrLow, vwapFlat, slopesFlat, squeezeWithoutExpansion, emaMixed].filter(Boolean).length;

    if (noTradeZone) {
      const executionTimeNT = performance.now() - startTime;
      return {
        action: 'WAIT',
        confidence: 30,
        reasoning: `⛔ SIDEWAYS MARKET: ${sidewaysSignals}/5 stagnation signals (ADX ${adx.toFixed(1)}, ATR ${(atrPct).toFixed(2)}%, VWAP flat=${vwapFlat}, slopes flat=${slopesFlat}, squeeze-no-expansion=${squeezeWithoutExpansion}). No trade.`,
        market_state: marketRegime.type,
        bias: 'Neutral',
        indicators,
        patterns,
        confirmations,
        volumeAnalysis: (() => {
          const candleStrength = bodyPercent >= 60 ? 'STRONG' : bodyPercent >= 35 ? 'DECISIVE' : bodyPercent >= 25 ? 'MODERATE' : 'WEAK';
          const candlesWithVolume = ohlcData.slice(-10).filter(c => (c.volume || 0) > 0).length;
          const volumeCoverage = candlesWithVolume / 10;
          const hasVolumeData = avgVolume > 0 && volumeCoverage >= 0.5;
          const safeRatio = isFinite(volumeRatio) && volumeRatio > 0 ? volumeRatio : 0;
          return {
            current_volume: refVolume, average_volume: avgVolume || 0, ratio: safeRatio, raw_ratio: safeRatio,
            is_high: hasVolumeData && isHighVolume, is_spike: hasVolumeData && isVolumeSpike,
            smart_money_detected: hasVolumeData ? smartMoney : (bodyPercent > 60),
            has_data: hasVolumeData, feed_reliable: hasVolumeData, coverage: volumeCoverage,
            body_percent: bodyPercent, candle_strength: candleStrength,
            buyPressure: orderFlow.buyPressure, sellPressure: orderFlow.sellPressure, orderFlow: orderFlow.orderFlow,
            isHigh: hasVolumeData && isHighVolume, isSpike: hasVolumeData && isVolumeSpike,
            smartMoney: hasVolumeData ? smartMoney : (bodyPercent > 60), bodyPercent, candleStrength,
          };
        })(),
        riskManagement,
        marketRegime,
        marketStructure,
        smartMoneyBias,
        liquidity,
        executionTime: executionTimeNT,
        calculationsPerformed,
      };
    }

    // ===== NEWS / EXPIRY VOLATILITY BLOCKER =====
    // Block trades when last bar's true-range explodes (RBI/Fed/CPI/expiry spikes).
    const lastTR = Math.max(
      lastCandle.high - lastCandle.low,
      Math.abs(lastCandle.high - prevCandle.close),
      Math.abs(lastCandle.low - prevCandle.close)
    );
    const volatilitySpike = safeAtr > 0 && lastTR > safeAtr * 2.5;

    // ===== TREND-CONTINUATION FILTER =====
    // In strong trends (ADX > 35), block counter-trend reversal signals
    // unless market structure has already flipped (CHoCH confirmed).
    const blockBearByTrend = adx > 35 && marketStructure.type === 'UPTREND' && marketStructure.choch !== 'BEAR';
    const blockBullByTrend = adx > 35 && marketStructure.type === 'DOWNTREND' && marketStructure.choch !== 'BULL';
    const allowBullish = strongBullish && !volatilitySpike && !blockBullByTrend;
    const allowBearish = strongBearish && !volatilitySpike && !blockBearByTrend;

    if (volatilitySpike) {
      action = 'WAIT';
      confidence = 28;
      bias = 'Neutral';
      reasoning = `⚠️ WAIT: News/expiry volatility spike (last bar TR ${lastTR.toFixed(1)} > 2.5× ATR ${safeAtr.toFixed(1)}). Avoid whipsaws.`;
    } else if (allowBullish) {
      action = 'BUY_CALL';
      // Tier-based base + ceiling: FAST stays conservative, HIGH can run hot.
      const tierBase = bullTier === 'HIGH' ? 70 : bullTier === 'STRONG' ? 64 : 58;
      const tierCeiling = bullTier === 'HIGH' ? 95 : bullTier === 'STRONG' ? 88 : 78;
      confidence = tierBase + (earlyBullScore * 5) + (strongConfirmationScore * 3);
      // Institutional boosts
      if (smartMoneyBias === 'BULLISH') confidence += 5;
      if (marketStructure.bos === 'BULL') confidence += 4;
      // CHoCH / RSI divergence only boosts AFTER follow-through + volume confirms
      if (reversalBullValid && marketStructure.choch === 'BULL') confidence += 4;
      if (reversalBullValid && rsiDivergenceObj.bull) confidence += 3;
      if (bbSqueezeBreakout === 'BULL') confidence += 3;
      // Confidence decay
      if (!rangeExpansion) confidence -= 5;
      if (!adxRising) confidence -= 3;
      if (gap.type === 'GAP_UP' && !gap.filled && currentRange < avgPrev5Range) confidence -= 4;
      confidence = Math.max(50, Math.min(confidence, tierCeiling));
      bias = 'Bullish';
      reasoning = `BUY_CALL [${bullTier}]: ${earlyBullScore}/4 entry + ${strongConfirmationScore}/4 momentum (total ${totalBullScore}/8). 15m=${htfAlign}, structure=${marketStructure.type}, smartMoney=${smartMoneyBias}, rangeExp=${rangeExpansion}.${reversalBullValid && rsiDivergenceObj.bull ? ' Bullish RSI divergence confirmed!' : ''}${bbSqueezeBreakout === 'BULL' ? ' BB squeeze breakout!' : ''}`;

    } else if (allowBearish) {
      action = 'BUY_PUT';
      const tierBase = bearTier === 'HIGH' ? 70 : bearTier === 'STRONG' ? 64 : 58;
      const tierCeiling = bearTier === 'HIGH' ? 95 : bearTier === 'STRONG' ? 88 : 78;
      confidence = tierBase + (earlyBearScore * 5) + (strongConfirmationScore * 3);
      // Institutional boosts
      if (smartMoneyBias === 'BEARISH') confidence += 5;
      if (marketStructure.bos === 'BEAR') confidence += 4;
      if (reversalBearValid && marketStructure.choch === 'BEAR') confidence += 4;
      if (reversalBearValid && rsiDivergenceObj.bear) confidence += 3;
      if (bbSqueezeBreakout === 'BEAR') confidence += 3;
      // Confidence decay
      if (!rangeExpansion) confidence -= 5;
      if (!adxRising) confidence -= 3;
      if (gap.type === 'GAP_DOWN' && !gap.filled && currentRange < avgPrev5Range) confidence -= 4;
      confidence = Math.max(50, Math.min(confidence, tierCeiling));
      bias = 'Bearish';
      reasoning = `BUY_PUT [${bearTier}]: ${earlyBearScore}/4 entry + ${strongConfirmationScore}/4 momentum (total ${totalBearScore}/8). 15m=${htfAlign}, structure=${marketStructure.type}, smartMoney=${smartMoneyBias}, rangeExp=${rangeExpansion}.${reversalBearValid && rsiDivergenceObj.bear ? ' Bearish RSI divergence confirmed!' : ''}${bbSqueezeBreakout === 'BEAR' ? ' BB breakdown!' : ''}`;

    } else if (liquidity.stopHunt) {
      action = 'WAIT';
      confidence = 32;
      bias = 'Neutral';
      reasoning = `⚠️ WAIT: Liquidity ${liquidity.buySideSweep ? 'buy-side' : 'sell-side'} sweep detected (stop hunt). Wait for reversal confirmation.`;

    } else if (cooldownActive) {
      action = 'WAIT';
      confidence = 35;
      bias = 'Neutral';
      reasoning = `WAIT: Signal cooldown active (${barsSinceLastSignal.toFixed(1)}/${minimumBarsBetweenSignals} bars since last trade).`;
      
    } else if (false /* HTF disagreement is now soft-scored, never a hard WAIT */) {
      action = 'WAIT';
      confidence = 38;
      bias = 'Neutral';
      reasoning = `WAIT: (deprecated HTF block — kept for cascade structure).`;

    } else if (weakMidSessionTrap) {
      action = 'WAIT';
      confidence = 35;
      bias = 'Neutral';
      reasoning = `WAIT: Mid-session trap only because ADX is weak/not rising, volume is weak, and VWAP is flat.`;

    } else if (!breakoutConfirmedBull && !breakoutConfirmedBear) {
      action = 'WAIT';
      confidence = 40;
      bias = useTrendBias && trendBias !== 'neutral' ? (trendBias === 'bullish' ? 'Bullish' : 'Bearish') : (isBullish ? 'Bullish' : isBearish ? 'Bearish' : 'Neutral');
      reasoning = `WAIT: Breakout close/hold not confirmed yet (high ${breakoutHigh.toFixed(2)}, low ${breakoutLow.toFixed(2)}).`;

    } else if ((confirmationBullish && earlyBullScore < requiredConfirmations) || (confirmationBearish && earlyBearScore < requiredConfirmations)) {
      action = 'WAIT';
      confidence = 40;
      bias = useTrendBias && trendBias !== 'neutral' ? (trendBias === 'bullish' ? 'Bullish' : 'Bearish') : (isBullish ? 'Bullish' : isBearish ? 'Bearish' : 'Neutral');
      reasoning = `WAIT: Early entry confirmations incomplete (bull ${earlyBullScore}/4, bear ${earlyBearScore}/4; need ${requiredConfirmations}).`;

    } else if ((bodySize < minimumBodySize || !hasAcceptableVolume) && adx < 25) {
      // FIX 3 + 10: Volume / body only hard-blocks when ADX < 25 (no trend energy).
      // In trending markets (ADX >= 25), low volume / weak body should NOT block continuation entries.
      if (!hasStrongPattern) {
        action = 'WAIT';
        confidence = 35;
        bias = 'Neutral';
        const weakBody = bodySize < minimumBodySize;
        const lowVolume = !hasAcceptableVolume;
        const bodyText = `body ${bodySize.toFixed(1)}pts, min ${minimumBodySize.toFixed(1)} (ATR-relative)`;
        const volumeText = volumeFeedReliable
          ? `volume ${volumeRatio.toFixed(2)}x, min ${minimumVolumeRatio}x`
          : `candle strength ${bodyPercent.toFixed(1)}%, min 35%`;
        reasoning = weakBody && lowVolume
          ? `WAIT: Weak candle (${bodyText}) and low ${volumeText}, ADX ${adx.toFixed(1)} < 25.`
          : weakBody
            ? `WAIT: Weak candle (${bodyText}), ADX ${adx.toFixed(1)} < 25.`
            : `WAIT: Low ${volumeText}, ADX ${adx.toFixed(1)} < 25.`;
      }
    } else {
      action = 'WAIT';
      confidence = 45;
      bias = 'Neutral';
      reasoning = `WAIT: Conditions not met for high-confidence entry.`;
    }

    // ⚡ PHASE 1: REGIME ALIGNMENT CHECK (CRITICAL!) ⚡
    // Block counter-trend trades unless at key S/R levels or squeeze
    if (action !== 'WAIT') {
      if (marketRegime.type === 'TRENDING_UP' && bias === 'Bearish') {
        // Bearish signal in uptrend - only allow if at resistance or squeeze
        if (!nearResistance && !bollingerSqueeze) {
          action = 'WAIT';
          bias = 'Neutral';
          confidence = 35;
          reasoning = `⚠️ WAIT: Bearish signal in TRENDING_UP market requires resistance or squeeze. Current: mid-range.`;
        } else {
          reasoning += ` ✅ Counter-trend allowed: ${nearResistance ? 'At resistance' : 'Bollinger squeeze'}.`;
        }
      }
      
      if (marketRegime.type === 'TRENDING_DOWN' && bias === 'Bullish') {
        // Bullish signal in downtrend - only allow if at support or squeeze
        if (!nearSupport && !bollingerSqueeze) {
          action = 'WAIT';
          bias = 'Neutral';
          confidence = 35;
          reasoning = `⚠️ WAIT: Bullish signal in TRENDING_DOWN market requires support or squeeze. Current: mid-range.`;
        } else {
          reasoning += ` ✅ Counter-trend allowed: ${nearSupport ? 'At support' : 'Bollinger squeeze'}.`;
        }
      }
    }
    
    const executionTime = performance.now() - startTime;
    
    return {
      action,
      confidence,
      reasoning,
      market_state: marketRegime.type,
      bias,
      
      indicators,
      patterns,
      
      confirmations,
      
      volumeAnalysis: (() => {
        // Always-available candle metrics (independent of volume feed)
        const candleStrength = bodyPercent >= 60 ? 'STRONG'
          : bodyPercent >= 35 ? 'DECISIVE'
          : bodyPercent >= 25 ? 'MODERATE'
          : 'WEAK';

        // Volume feed reliability: index feeds (NIFTY/BANKNIFTY/SENSEX) often
        // ship 0 volume. Detect that and surface candle-based confirmation
        // instead of blocking/erasing the panel.
        const candlesWithVolume = ohlcData.slice(-10).filter(c => (c.volume || 0) > 0).length;
        const volumeCoverage = candlesWithVolume / 10;
        // Feed is reliable when historical coverage is good, even if the
        // current bar is still forming (volume=0 mid-candle).
        const hasVolumeData = avgVolume > 0 && volumeCoverage >= 0.5;
        const safeRatio = isFinite(volumeRatio) && volumeRatio > 0 ? volumeRatio : 0;

        return {
          // Display-friendly snake_case (preferred by UI normalizer)
          current_volume: refVolume,
          average_volume: avgVolume || 0,
          ratio: safeRatio,
          raw_ratio: safeRatio,
          is_high: hasVolumeData && isHighVolume,
          is_spike: hasVolumeData && isVolumeSpike,
          smart_money_detected: hasVolumeData ? smartMoney : (bodyPercent > 60),
          has_data: hasVolumeData,
          feed_reliable: hasVolumeData,
          coverage: volumeCoverage,
          body_percent: bodyPercent,
          candle_strength: candleStrength,
          buyPressure: orderFlow.buyPressure,
          sellPressure: orderFlow.sellPressure,
          orderFlow: orderFlow.orderFlow,
          // Back-compat camelCase
          isHigh: hasVolumeData && isHighVolume,
          isSpike: hasVolumeData && isVolumeSpike,
          smartMoney: hasVolumeData ? smartMoney : (bodyPercent > 60),
          bodyPercent,
          candleStrength,
        };
      })(),
      
      riskManagement,
      marketRegime,
      marketStructure,
      smartMoneyBias,
      liquidity,

      debugInfo: {
        blockedReason: action === 'WAIT' ? reasoning : undefined,
        failedConfirmations: [
          !breakoutConfirmedBull && !breakoutConfirmedBear ? 'breakout' : '',
          !rangeExpansion ? 'rangeExpansion' : '',
          !hasAcceptableVolume ? 'volume' : '',
          !slopeBullish && !slopeBearish ? 'emaSlope' : '',
          !htfAgreesBull && !htfAgreesBear ? 'htfAlignment' : '',
        ].filter(Boolean),
        confidenceDecayReasons: [
          !rangeExpansion ? 'no-range-expansion' : '',
          !adxRising ? 'adx-not-rising' : '',
          liquidity.stopHunt ? 'liquidity-sweep' : '',
          nearResistance ? 'near-resistance' : '',
          nearSupport ? 'near-support' : '',
        ].filter(Boolean),
        trendStrength: Math.round(adx),
        breakoutQuality: (breakoutConfirmedBull || breakoutConfirmedBear)
          ? (rangeExpansion ? 'STRONG' : 'WEAK')
          : 'NONE',
        smartMoneyScore: smartMoneyBias === 'BULLISH' ? 75 : smartMoneyBias === 'BEARISH' ? -75 : 0,
        liquidityWarnings: [
          liquidity.buySideSweep ? 'buy-side-sweep' : '',
          liquidity.sellSideSweep ? 'sell-side-sweep' : '',
          liquidity.stopHunt ? 'stop-hunt' : '',
        ].filter(Boolean),
        marketWarnings: [
          weakMidSessionTrap ? 'mid-session-trap' : '',
          cooldownActive ? 'cooldown-active' : '',
          marketRegime.type === 'RANGING' ? 'ranging-market' : '',
          marketRegime.type === 'QUIET' ? 'quiet-market' : '',
        ].filter(Boolean),
        requiredConfirmations,
        regime: marketRegime.type,
      },

      executionTime,
      calculationsPerformed
    };
  }
}