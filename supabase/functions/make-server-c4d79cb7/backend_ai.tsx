/**
 * BACKEND AI ENGINE - NO CHATGPT!
 * 
 * This is a PURE BACKEND AI that runs your trading strategy
 * WITHOUT external API calls. It's FASTER, CHEAPER, and MORE RELIABLE!
 * 
 * FEATURES:
 * - Triple Confirmation (VWAP + EMA + Candle)
 * - Millisecond signal generation (< 200ms)
 * - Real-time P&L tracking
 * - Auto position management
 * - Reversal detection
 * - No external dependencies!
 */

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TradingSignal {
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT' | 'EXIT' | 'HOLD';
  confidence: number;
  reasoning: string;
  market_state: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  
  // Triple confirmation details
  vwap: number;
  priceAboveVWAP: boolean;
  vwapDistance: number;
  
  ema9: number;
  ema21: number;
  ema50: number;
  emaUptrend: boolean;
  emaDowntrend: boolean;
  priceAboveEMA9: boolean;
  
  // Candle analysis
  candleType: 'BULLISH' | 'BEARISH' | 'DOJI';
  bodySize: number;
  bodyPercent: number;
  
  // Volume
  volumeRatio: number;
  isHighVolume: boolean;
  isVolumeSpike: boolean;
  smartMoneyDetected: boolean;
  
  // S/R Levels
  resistance_levels: { r1: number; r2: number; r3: number };
  support_levels: { s1: number; s2: number; s3: number };
  
  // Triple confirmation
  tripleConfirmation: number; // 0-3 (how many indicators aligned)
  confirmationDetails: string[];
  
  // Momentum
  momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  institutional_bias: 'BUYING' | 'SELLING' | 'NEUTRAL';
  
  // Execution metrics
  executionTime: number;
}

export interface PositionAnalysis {
  shouldExit: boolean;
  shouldHold: boolean;
  reason: string;
  confidence: number;
  
  currentPnL: number;
  targetHit: boolean;
  stopLossHit: boolean;
  reversalDetected: boolean;
  
  // Market conditions
  marketMovingFavorable: boolean;
  strongReversal: boolean;
  
  // Recommendation
  action: 'EXIT_NOW' | 'HOLD_FOR_PROFIT' | 'TRAIL_STOP' | 'CONTINUE';
}

export class BackendAI {
  /**
   * ⚡ CALCULATE EMA (FAST!)
   */
  private static calculateEMA(data: OHLCCandle[], period: number): number {
    if (data.length < period) return data[data.length - 1].close;
    
    const k = 2 / (period + 1);
    let ema = data[0].close;
    
    for (let i = 1; i < data.length; i++) {
      ema = (data[i].close * k) + (ema * (1 - k));
    }
    
    return ema;
  }

  /**
   * ⚡ CALCULATE VWAP (FAST!)
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
   * 🎯 MAIN AI SIGNAL GENERATOR
   * 
   * This is the CORE of your trading system!
   * Runs in < 200ms, no external API calls!
   */
  public static generateSignal(ohlcData: OHLCCandle[]): TradingSignal {
    const startTime = performance.now();
    
    // Get last candle
    const lastCandle = ohlcData[ohlcData.length - 1];
    const prevCandle = ohlcData[ohlcData.length - 2];
    
    // ========== CANDLESTICK ANALYSIS ==========
    const range = lastCandle.high - lastCandle.low;
    const bodySize = Math.abs(lastCandle.close - lastCandle.open);
    const bodyPercent = range > 0 ? (bodySize / range) * 100 : 0;
    
    const isBullish = lastCandle.close > lastCandle.open;
    const isBearish = lastCandle.close < lastCandle.open;
    const isDoji = bodyPercent < 10;
    
    const candleType: 'BULLISH' | 'BEARISH' | 'DOJI' = isDoji ? 'DOJI' : isBullish ? 'BULLISH' : 'BEARISH';
    
    // ========== EMA CALCULATION ==========
    const ema9 = this.calculateEMA(ohlcData.slice(-9), 9);
    const ema21 = this.calculateEMA(ohlcData.slice(-21), 21);
    const ema50 = this.calculateEMA(ohlcData, 50);
    
    const emaUptrend = ema9 > ema21 && ema21 > ema50;
    const emaDowntrend = ema9 < ema21 && ema21 < ema50;
    const priceAboveEMA9 = lastCandle.close > ema9;
    const priceAboveEMA21 = lastCandle.close > ema21;
    
    // ========== VWAP CALCULATION ==========
    const vwap = this.calculateVWAP(ohlcData);
    const priceAboveVWAP = lastCandle.close > vwap;
    const vwapDistance = ((lastCandle.close - vwap) / vwap) * 100;
    
    // ========== VOLUME ANALYSIS ==========
    const last10Candles = ohlcData.slice(-10);
    const avgVolume = last10Candles.reduce((sum, c) => sum + c.volume, 0) / 10;
    const volumeRatio = lastCandle.volume / avgVolume;
    
    const isHighVolume = volumeRatio > 1.5;
    const isVolumeSpike = volumeRatio > 2.0;
    const smartMoneyDetected = bodyPercent > 60 && isVolumeSpike;
    
    // ========== SUPPORT & RESISTANCE ==========
    const recentCandles = ohlcData.slice(-50);
    const highs = recentCandles.map(c => c.high).sort((a, b) => b - a);
    const lows = recentCandles.map(c => c.low).sort((a, b) => a - b);
    
    const resistance1 = highs[0];
    const resistance2 = highs[Math.floor(highs.length * 0.2)];
    const resistance3 = highs[Math.floor(highs.length * 0.4)];
    
    const support1 = lows[0];
    const support2 = lows[Math.floor(lows.length * 0.2)];
    const support3 = lows[Math.floor(lows.length * 0.4)];
    
    // ========== MOMENTUM ==========
    const last5Candles = ohlcData.slice(-5);
    const bullishCandles = last5Candles.filter(c => c.close > c.open).length;
    const bearishCandles = last5Candles.filter(c => c.close < c.open).length;
    
    const momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 
      bullishCandles > bearishCandles ? 'BULLISH' : 
      bearishCandles > bullishCandles ? 'BEARISH' : 'NEUTRAL';
    
    // ========== INSTITUTIONAL BIAS ==========
    const priceUp = lastCandle.close > prevCandle.close;
    const volumeUp = lastCandle.volume > prevCandle.volume;
    const institutionalBuying = priceUp && volumeUp && isHighVolume;
    const institutionalSelling = !priceUp && volumeUp && isHighVolume;
    
    const institutional_bias: 'BUYING' | 'SELLING' | 'NEUTRAL' =
      institutionalBuying ? 'BUYING' :
      institutionalSelling ? 'SELLING' : 'NEUTRAL';
    
    // ========== TRIPLE CONFIRMATION ==========
    const confirmationDetails: string[] = [];
    let tripleConfirmation = 0;
    
    // CONFIRMATION 1: VWAP
    if (isBullish && priceAboveVWAP && vwapDistance > 0.3) {
      tripleConfirmation++;
      confirmationDetails.push('✅ Price ABOVE VWAP (bullish zone)');
    } else if (isBearish && !priceAboveVWAP && vwapDistance < -0.3) {
      tripleConfirmation++;
      confirmationDetails.push('✅ Price BELOW VWAP (bearish zone)');
    } else {
      confirmationDetails.push('❌ VWAP neutral (price near fair value)');
    }
    
    // CONFIRMATION 2: EMA
    if (isBullish && emaUptrend && priceAboveEMA9) {
      tripleConfirmation++;
      confirmationDetails.push('✅ EMA Trend BULLISH (9>21>50)');
    } else if (isBearish && emaDowntrend && !priceAboveEMA9) {
      tripleConfirmation++;
      confirmationDetails.push('✅ EMA Trend BEARISH (9<21<50)');
    } else {
      confirmationDetails.push('❌ EMA neutral (no clear trend)');
    }
    
    // CONFIRMATION 3: CANDLESTICK + VOLUME
    if (isBullish && bodySize > 15 && bodyPercent > 40 && isHighVolume) {
      tripleConfirmation++;
      confirmationDetails.push('✅ Strong bullish candle + volume');
    } else if (isBearish && bodySize > 15 && bodyPercent > 40 && isHighVolume) {
      tripleConfirmation++;
      confirmationDetails.push('✅ Strong bearish candle + volume');
    } else {
      confirmationDetails.push('❌ Weak candle or low volume');
    }
    
    // ========== DECISION LOGIC ==========
    let action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT' | 'EXIT' | 'HOLD' = 'WAIT';
    let confidence = 0;
    let reasoning = '';
    let market_state = '';
    let bias: 'Bullish' | 'Bearish' | 'Neutral' = 'Neutral';
    
    // PRIMARY CONDITIONS
    const primaryBullish = isBullish && bodySize > 15 && bodyPercent > 40 && volumeRatio > 1.3 && momentum === 'BULLISH';
    const primaryBearish = isBearish && bodySize > 15 && bodyPercent > 40 && volumeRatio > 1.3 && momentum === 'BEARISH';
    
    // DECISION TREE
    if (primaryBullish && tripleConfirmation >= 2) {
      action = 'BUY_CALL';
      confidence = 70 + (tripleConfirmation * 10) + (smartMoneyDetected ? 10 : 0);
      bias = 'Bullish';
      market_state = emaUptrend ? 'Strong Uptrend' : 'Trending Up';
      reasoning = `STRONG BUY: ${tripleConfirmation}/3 confirmations. ${confirmationDetails.join('. ')}. ${smartMoneyDetected ? 'Smart money detected!' : ''}`;
      
    } else if (primaryBearish && tripleConfirmation >= 2) {
      action = 'BUY_PUT';
      confidence = 70 + (tripleConfirmation * 10) + (smartMoneyDetected ? 10 : 0);
      bias = 'Bearish';
      market_state = emaDowntrend ? 'Strong Downtrend' : 'Trending Down';
      reasoning = `STRONG SELL: ${tripleConfirmation}/3 confirmations. ${confirmationDetails.join('. ')}. ${smartMoneyDetected ? 'Smart money detected!' : ''}`;
      
    } else if (isDoji || bodySize < 10) {
      action = 'WAIT';
      confidence = 20;
      bias = 'Neutral';
      market_state = 'Consolidation';
      reasoning = `WAIT: Weak candle (DOJI or body < 10pts). No clear direction. ${confirmationDetails.join('. ')}`;
      
    } else if (Math.abs(vwapDistance) < 0.3) {
      action = 'WAIT';
      confidence = 30;
      bias = 'Neutral';
      market_state = 'Range-Bound';
      reasoning = `WAIT: Price near VWAP (${vwapDistance.toFixed(2)}%) = fair value zone. Wait for breakout.`;
      
    } else if (tripleConfirmation < 2) {
      action = 'WAIT';
      confidence = 40;
      bias = isBullish ? 'Bullish' : 'Bearish';
      market_state = 'Mixed Signals';
      reasoning = `WAIT: Only ${tripleConfirmation}/3 confirmations. Need at least 2. ${confirmationDetails.join('. ')}`;
      
    } else {
      action = 'WAIT';
      confidence = 45;
      bias = 'Neutral';
      market_state = 'Unclear';
      reasoning = `WAIT: Conditions not met. ${confirmationDetails.join('. ')}`;
    }
    
    const executionTime = performance.now() - startTime;
    
    return {
      action,
      confidence,
      reasoning,
      market_state,
      bias,
      
      vwap,
      priceAboveVWAP,
      vwapDistance,
      
      ema9,
      ema21,
      ema50,
      emaUptrend,
      emaDowntrend,
      priceAboveEMA9,
      
      candleType,
      bodySize,
      bodyPercent,
      
      volumeRatio,
      isHighVolume,
      isVolumeSpike,
      smartMoneyDetected,
      
      resistance_levels: { r1: resistance1, r2: resistance2, r3: resistance3 },
      support_levels: { s1: support1, s2: support2, s3: support3 },
      
      tripleConfirmation,
      confirmationDetails,
      
      momentum,
      institutional_bias,
      
      executionTime
    };
  }

  /**
   * 📊 REAL-TIME POSITION ANALYSIS
   * 
   * Called EVERY SECOND to monitor active positions!
   * Detects reversals and manages profit/loss.
   */
  public static analyzePosition(
    ohlcData: OHLCCandle[],
    entryPrice: number,
    currentPrice: number,
    optionType: 'CE' | 'PE',
    targetAmount: number,
    stopLossAmount: number,
    quantity: number
  ): PositionAnalysis {
    
    const signal = this.generateSignal(ohlcData);
    
    // Calculate P&L
    const priceChange = currentPrice - entryPrice;
    const currentPnL = priceChange * quantity;
    
    // Check targets
    const targetHit = Math.abs(currentPnL) >= targetAmount && currentPnL > 0;
    const stopLossHit = Math.abs(currentPnL) >= stopLossAmount && currentPnL < 0;
    
    // Detect reversal
    const reversalDetected = 
      (optionType === 'CE' && signal.action === 'BUY_PUT' && signal.confidence >= 75) ||
      (optionType === 'PE' && signal.action === 'BUY_CALL' && signal.confidence >= 75);
    
    const strongReversal = reversalDetected && signal.tripleConfirmation >= 3;
    
    // Market moving in our favor?
    const marketMovingFavorable = 
      (optionType === 'CE' && signal.bias === 'Bullish' && currentPnL > 0) ||
      (optionType === 'PE' && signal.bias === 'Bearish' && currentPnL > 0);
    
    // Decision logic
    let shouldExit = false;
    let shouldHold = false;
    let reason = '';
    let confidence = 0;
    let action: 'EXIT_NOW' | 'HOLD_FOR_PROFIT' | 'TRAIL_STOP' | 'CONTINUE' = 'CONTINUE';
    
    if (targetHit) {
      shouldExit = true;
      reason = `✅ TARGET HIT! Profit: ₹${currentPnL.toFixed(2)}`;
      confidence = 100;
      action = 'EXIT_NOW';
      
    } else if (stopLossHit) {
      shouldExit = true;
      reason = `❌ STOP LOSS HIT! Loss: ₹${currentPnL.toFixed(2)}`;
      confidence = 100;
      action = 'EXIT_NOW';
      
    } else if (strongReversal) {
      shouldExit = true;
      reason = `🔄 STRONG REVERSAL detected! Triple confirmation against position. Exit before losses grow!`;
      confidence = 90;
      action = 'EXIT_NOW';
      
    } else if (reversalDetected) {
      shouldExit = true;
      reason = `⚠️ Reversal signal detected. Market turning against position. Exit now.`;
      confidence = 80;
      action = 'EXIT_NOW';
      
    } else if (marketMovingFavorable && currentPnL > targetAmount * 0.7) {
      shouldHold = true;
      reason = `🚀 Market moving in our favor! P&L: ₹${currentPnL.toFixed(2)} (70%+ of target). Hold for more profit!`;
      confidence = 85;
      action = 'HOLD_FOR_PROFIT';
      
    } else if (marketMovingFavorable && currentPnL > 0) {
      shouldHold = true;
      reason = `✅ Position in profit. Market favorable. Continue holding.`;
      confidence = 70;
      action = 'CONTINUE';
      
    } else if (currentPnL < 0 && Math.abs(currentPnL) > stopLossAmount * 0.8) {
      shouldExit = true;
      reason = `⚠️ Loss approaching stop loss (80%+). Exit before full SL hit.`;
      confidence = 75;
      action = 'EXIT_NOW';
      
    } else {
      shouldHold = true;
      reason = `⏳ Position active. P&L: ₹${currentPnL.toFixed(2)}. Monitoring...`;
      confidence = 60;
      action = 'CONTINUE';
    }
    
    return {
      shouldExit,
      shouldHold,
      reason,
      confidence,
      currentPnL,
      targetHit,
      stopLossHit,
      reversalDetected,
      marketMovingFavorable,
      strongReversal,
      action
    };
  }
}
