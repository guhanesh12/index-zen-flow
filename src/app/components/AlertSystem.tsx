import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Volume2, 
  Activity,
  Target,
  Shield,
  Zap,
  XCircle
} from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

export interface TradingAlert {
  id: string;
  type: 'adx' | 'confirmation' | 'signal' | 'trap' | 'volume' | 'smartmoney' | 'divergence' | 'support_resistance' | 'ema_cross' | 'rsi' | 'bollinger' | 'vwap' | 'pattern' | 'momentum' | 'risk' | 'timing';
  severity: 'info' | 'warning' | 'success' | 'danger';
  title: string;
  message: string;
  timestamp: number;
  data?: any;
}

interface AlertSystemProps {
  signal: any | null;
  previousSignal?: any | null;
  timeframe?: string;
}

export function AlertSystem({ signal, previousSignal, timeframe = '5M' }: AlertSystemProps) {
  const [alerts, setAlerts] = useState<TradingAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!signal) return;

    const newAlerts: TradingAlert[] = [];

    // 1. ADX THRESHOLD ALERTS
    const adx = signal.indicators?.adx || 0;
    const prevAdx = previousSignal?.indicators?.adx || 0;

    if (prevAdx < 20 && adx >= 20) {
      newAlerts.push({
        id: `adx-20-${Date.now()}`,
        type: 'adx',
        severity: 'success',
        title: '🔥 TREND FORMING!',
        message: `ADX crossed above 20 (now ${adx.toFixed(1)}) - Market transitioning from ranging to trending!`,
        timestamp: Date.now(),
        data: { adx, prevAdx }
      });
    }

    if (prevAdx < 25 && adx >= 25) {
      newAlerts.push({
        id: `adx-25-${Date.now()}`,
        type: 'adx',
        severity: 'success',
        title: '🚀 STRONG TREND!',
        message: `ADX crossed above 25 (now ${adx.toFixed(1)}) - Strong trend established!`,
        timestamp: Date.now(),
        data: { adx, prevAdx }
      });
    }

    if (prevAdx < 30 && adx >= 30) {
      newAlerts.push({
        id: `adx-30-${Date.now()}`,
        type: 'adx',
        severity: 'success',
        title: '💥 VERY STRONG TREND!',
        message: `ADX crossed above 30 (now ${adx.toFixed(1)}) - Extremely strong trend! High probability setups ahead!`,
        timestamp: Date.now(),
        data: { adx, prevAdx }
      });
    }

    if (prevAdx >= 20 && adx < 20) {
      newAlerts.push({
        id: `adx-below-20-${Date.now()}`,
        type: 'adx',
        severity: 'warning',
        title: '⚠️ TREND WEAKENING',
        message: `ADX dropped below 20 (now ${adx.toFixed(1)}) - Trend losing strength, switching to ranging mode`,
        timestamp: Date.now(),
        data: { adx, prevAdx }
      });
    }

    // 2. HIGH-PROBABILITY SIGNAL ALERTS
    const confidence = signal.confidence || 0;
    const action = signal.action;
    const confirmations = signal.confirmations?.total || 0;
    const required = signal.confirmations?.required || 6;

    if (confidence >= 70 && action !== 'WAIT') {
      newAlerts.push({
        id: `signal-${action}-${Date.now()}`,
        type: 'signal',
        severity: 'success',
        title: `🎯 HIGH PROBABILITY ${action} SIGNAL!`,
        message: `${action} signal with ${confidence}% confidence | ${confirmations}/${required} confirmations | ${signal.market_state}`,
        timestamp: Date.now(),
        data: { action, confidence, confirmations }
      });
    }

    if (confidence >= 80 && action !== 'WAIT') {
      newAlerts.push({
        id: `signal-ultra-${action}-${Date.now()}`,
        type: 'signal',
        severity: 'success',
        title: `💎 ULTRA HIGH PROBABILITY ${action}!`,
        message: `${action} signal with ${confidence}% confidence! Multiple confirmations aligned. Consider execution!`,
        timestamp: Date.now(),
        data: { action, confidence, confirmations }
      });
    }

    // 3. CONFIRMATION THRESHOLD ALERTS
    const prevConfirmations = previousSignal?.confirmations?.total || 0;

    if (prevConfirmations < required && confirmations >= required) {
      newAlerts.push({
        id: `confirmations-${Date.now()}`,
        type: 'confirmation',
        severity: 'success',
        title: '✅ CONFIRMATIONS THRESHOLD MET!',
        message: `${confirmations}/${required} confirmations achieved! Setup forming...`,
        timestamp: Date.now(),
        data: { confirmations, required }
      });
    }

    // 4. BULL/BEAR TRAP WARNINGS
    const volumeRatio = signal.volumeAnalysis?.ratio || 0;
    const macdHistogram = signal.indicators?.macdHistogram || 0;
    const marketState = signal.market_state || '';
    const orderFlow = signal.volumeAnalysis?.orderFlow || '';

    // Detect Bull Trap (Downtrend with bullish divergence + low volume)
    if (
      marketState.includes('DOWN') &&
      macdHistogram > 0 &&
      volumeRatio < 0.8 &&
      orderFlow === 'NEUTRAL' &&
      action === 'WAIT'
    ) {
      newAlerts.push({
        id: `bull-trap-${Date.now()}`,
        type: 'trap',
        severity: 'warning',
        title: '🎣 POTENTIAL BULL TRAP DETECTED!',
        message: `Downtrend with MACD bullish divergence but LOW volume (${volumeRatio.toFixed(2)}x). AI correctly waiting. Likely reversal incoming!`,
        timestamp: Date.now(),
        data: { volumeRatio, macdHistogram, orderFlow }
      });
    }

    // Detect Bear Trap (Uptrend with bearish divergence + low volume)
    if (
      marketState.includes('UP') &&
      macdHistogram < 0 &&
      volumeRatio < 0.8 &&
      orderFlow === 'NEUTRAL' &&
      action === 'WAIT'
    ) {
      newAlerts.push({
        id: `bear-trap-${Date.now()}`,
        type: 'trap',
        severity: 'warning',
        title: '🎣 POTENTIAL BEAR TRAP DETECTED!',
        message: `Uptrend with MACD bearish divergence but LOW volume (${volumeRatio.toFixed(2)}x). AI correctly waiting. Likely reversal incoming!`,
        timestamp: Date.now(),
        data: { volumeRatio, macdHistogram, orderFlow }
      });
    }

    // 5. VOLUME SPIKE ALERTS
    if (volumeRatio >= 1.5 && volumeRatio < 2.0) {
      newAlerts.push({
        id: `volume-spike-${Date.now()}`,
        type: 'volume',
        severity: 'info',
        title: '📊 VOLUME SPIKE DETECTED!',
        message: `Volume at ${volumeRatio.toFixed(2)}x average - Increased activity detected!`,
        timestamp: Date.now(),
        data: { volumeRatio }
      });
    }

    if (volumeRatio >= 2.0) {
      newAlerts.push({
        id: `volume-massive-${Date.now()}`,
        type: 'volume',
        severity: 'success',
        title: '🔥 MASSIVE VOLUME SPIKE!',
        message: `Volume at ${volumeRatio.toFixed(2)}x average - Strong institutional activity!`,
        timestamp: Date.now(),
        data: { volumeRatio }
      });
    }

    // 6. SMART MONEY ALERTS
    const smartMoney = signal.volumeAnalysis?.smartMoney || false;
    const prevSmartMoney = previousSignal?.volumeAnalysis?.smartMoney || false;

    if (!prevSmartMoney && smartMoney) {
      const buyPressure = signal.volumeAnalysis?.buyPressure || 0;
      const sellPressure = signal.volumeAnalysis?.sellPressure || 0;
      const direction = buyPressure > sellPressure ? 'BUYING' : 'SELLING';

      newAlerts.push({
        id: `smart-money-${Date.now()}`,
        type: 'smartmoney',
        severity: 'success',
        title: '💰 SMART MONEY DETECTED!',
        message: `Institutional ${direction} detected! ${direction === 'BUYING' ? 'Buy' : 'Sell'} pressure: ${(direction === 'BUYING' ? buyPressure : sellPressure).toFixed(1)}%`,
        timestamp: Date.now(),
        data: { smartMoney, buyPressure, sellPressure, orderFlow }
      });
    }

    // 7. MACD DIVERGENCE ALERTS
    const rsi = signal.indicators?.rsi || 0;
    const prevRsi = previousSignal?.indicators?.rsi || 0;
    const prevMacdHist = previousSignal?.indicators?.macdHistogram || 0;

    // Bullish divergence: Price making lower lows, but MACD making higher lows
    if (
      rsi < prevRsi &&
      macdHistogram > prevMacdHist &&
      macdHistogram < 0 &&
      prevMacdHist < 0
    ) {
      newAlerts.push({
        id: `divergence-bullish-${Date.now()}`,
        type: 'divergence',
        severity: 'warning',
        title: '📈 BULLISH DIVERGENCE!',
        message: `RSI declining but MACD rising - Potential reversal to upside!`,
        timestamp: Date.now(),
        data: { rsi, macdHistogram, type: 'bullish' }
      });
    }

    // Bearish divergence: Price making higher highs, but MACD making lower highs
    if (
      rsi > prevRsi &&
      macdHistogram < prevMacdHist &&
      macdHistogram > 0 &&
      prevMacdHist > 0
    ) {
      newAlerts.push({
        id: `divergence-bearish-${Date.now()}`,
        type: 'divergence',
        severity: 'warning',
        title: '📉 BEARISH DIVERGENCE!',
        message: `RSI rising but MACD falling - Potential reversal to downside!`,
        timestamp: Date.now(),
        data: { rsi, macdHistogram, type: 'bearish' }
      });
    }

    // 8. TRENDING SETUP FORMATION ALERT
    if (
      confirmations >= 6 &&
      adx >= 20 &&
      signal.marketRegime?.suitable_for_trading &&
      action !== 'WAIT'
    ) {
      newAlerts.push({
        id: `trending-setup-${Date.now()}`,
        type: 'confirmation',
        severity: 'success',
        title: '🎯 TRENDING SETUP FORMED!',
        message: `${action} setup with ${confirmations}/${required} confirmations, ADX ${adx.toFixed(1)}, ${confidence}% confidence!`,
        timestamp: Date.now(),
        data: { action, confirmations, adx, confidence }
      });
    }

    // 9. LOW VOLUME WARNING (when ADX shows trend but volume disagrees)
    if (
      adx >= 25 &&
      volumeRatio < 0.8 &&
      !smartMoney &&
      action === 'WAIT'
    ) {
      newAlerts.push({
        id: `low-volume-warning-${Date.now()}`,
        type: 'volume',
        severity: 'warning',
        title: '⚠️ LOW VOLUME IN TREND',
        message: `ADX shows trend (${adx.toFixed(1)}) but volume is low (${volumeRatio.toFixed(2)}x). AI correctly waiting for conviction!`,
        timestamp: Date.now(),
        data: { adx, volumeRatio }
      });
    }

    // 10. SUPPORT/RESISTANCE LEVEL ALERTS
    const currentPrice = signal.indicators?.ema9 || 0;
    const resistanceLevels = signal.indicators?.resistance_levels || {};
    const supportLevels = signal.indicators?.support_levels || {};
    const atr = signal.indicators?.atr || 0;
    
    if (resistanceLevels.r1 && currentPrice > 0) {
      const distanceToR1 = Math.abs(currentPrice - resistanceLevels.r1);
      const distanceInATR = atr > 0 ? distanceToR1 / atr : 0;
      
      if (distanceInATR <= 0.5) {
        newAlerts.push({
          id: `resistance-near-${Date.now()}`,
          type: 'support_resistance',
          severity: 'warning',
          title: '🎯 APPROACHING RESISTANCE!',
          message: `Price near R1 (${resistanceLevels.r1.toFixed(2)}) - Distance: ${distanceToR1.toFixed(2)} (${distanceInATR.toFixed(2)} ATR). Watch for reversal!`,
          timestamp: Date.now(),
          data: { level: resistanceLevels.r1, distance: distanceInATR }
        });
      }
    }
    
    if (supportLevels.s1 && currentPrice > 0) {
      const distanceToS1 = Math.abs(currentPrice - supportLevels.s1);
      const distanceInATR = atr > 0 ? distanceToS1 / atr : 0;
      
      if (distanceInATR <= 0.5) {
        newAlerts.push({
          id: `support-near-${Date.now()}`,
          type: 'support_resistance',
          severity: 'info',
          title: '🛡️ APPROACHING SUPPORT!',
          message: `Price near S1 (${supportLevels.s1.toFixed(2)}) - Distance: ${distanceToS1.toFixed(2)} (${distanceInATR.toFixed(2)} ATR). Potential bounce zone!`,
          timestamp: Date.now(),
          data: { level: supportLevels.s1, distance: distanceInATR }
        });
      }
    }

    // 11. EMA CROSSOVER ALERTS
    const ema9 = signal.indicators?.ema9 || 0;
    const ema21 = signal.indicators?.ema21 || 0;
    const ema50 = signal.indicators?.ema50 || 0;
    const prevEma9 = previousSignal?.indicators?.ema9 || 0;
    const prevEma21 = previousSignal?.indicators?.ema21 || 0;
    const prevEma50 = previousSignal?.indicators?.ema50 || 0;
    
    if (prevEma9 < prevEma21 && ema9 > ema21) {
      newAlerts.push({
        id: `ema-golden-cross-${Date.now()}`,
        type: 'ema_cross',
        severity: 'success',
        title: '⭐ GOLDEN CROSS!',
        message: `EMA9 crossed above EMA21 - Bullish signal! Short-term momentum shifting up.`,
        timestamp: Date.now(),
        data: { ema9, ema21, type: 'golden' }
      });
    }
    
    if (prevEma9 > prevEma21 && ema9 < ema21) {
      newAlerts.push({
        id: `ema-death-cross-${Date.now()}`,
        type: 'ema_cross',
        severity: 'danger',
        title: '💀 DEATH CROSS!',
        message: `EMA9 crossed below EMA21 - Bearish signal! Short-term momentum shifting down.`,
        timestamp: Date.now(),
        data: { ema9, ema21, type: 'death' }
      });
    }
    
    if (prevEma21 < prevEma50 && ema21 > ema50) {
      newAlerts.push({
        id: `ema-major-golden-cross-${Date.now()}`,
        type: 'ema_cross',
        severity: 'success',
        title: '🌟 MAJOR GOLDEN CROSS!',
        message: `EMA21 crossed above EMA50 - STRONG bullish signal! Medium-term trend reversing up!`,
        timestamp: Date.now(),
        data: { ema21, ema50, type: 'major_golden' }
      });
    }
    
    if (prevEma21 > prevEma50 && ema21 < ema50) {
      newAlerts.push({
        id: `ema-major-death-cross-${Date.now()}`,
        type: 'ema_cross',
        severity: 'danger',
        title: '☠️ MAJOR DEATH CROSS!',
        message: `EMA21 crossed below EMA50 - STRONG bearish signal! Medium-term trend reversing down!`,
        timestamp: Date.now(),
        data: { ema21, ema50, type: 'major_death' }
      });
    }

    // 12. RSI OVERBOUGHT/OVERSOLD ALERTS
    const prevRsiOverbought = previousSignal?.indicators?.rsiOverbought || false;
    const prevRsiOversold = previousSignal?.indicators?.rsiOversold || false;
    const rsiOverbought = signal.indicators?.rsiOverbought || false;
    const rsiOversold = signal.indicators?.rsiOversold || false;
    
    if (!prevRsiOverbought && rsiOverbought) {
      newAlerts.push({
        id: `rsi-overbought-${Date.now()}`,
        type: 'rsi',
        severity: 'warning',
        title: '📈 RSI OVERBOUGHT!',
        message: `RSI entered overbought zone (${rsi.toFixed(1)}) - Potential reversal or pullback incoming!`,
        timestamp: Date.now(),
        data: { rsi, zone: 'overbought' }
      });
    }
    
    if (!prevRsiOversold && rsiOversold) {
      newAlerts.push({
        id: `rsi-oversold-${Date.now()}`,
        type: 'rsi',
        severity: 'info',
        title: '📉 RSI OVERSOLD!',
        message: `RSI entered oversold zone (${rsi.toFixed(1)}) - Potential bounce or reversal incoming!`,
        timestamp: Date.now(),
        data: { rsi, zone: 'oversold' }
      });
    }

    // 13. BOLLINGER BAND ALERTS
    const bollingerSqueeze = signal.indicators?.bollingerSqueeze || false;
    const prevBollingerSqueeze = previousSignal?.indicators?.bollingerSqueeze || false;
    const bollingerWidth = signal.indicators?.bollingerWidth || 0;
    const priceNearUpperBand = signal.indicators?.priceNearUpperBand || false;
    const priceNearLowerBand = signal.indicators?.priceNearLowerBand || false;
    const prevPriceNearUpperBand = previousSignal?.indicators?.priceNearUpperBand || false;
    const prevPriceNearLowerBand = previousSignal?.indicators?.priceNearLowerBand || false;
    
    if (!prevBollingerSqueeze && bollingerSqueeze) {
      newAlerts.push({
        id: `bb-squeeze-${Date.now()}`,
        type: 'bollinger',
        severity: 'warning',
        title: '🎯 BOLLINGER SQUEEZE!',
        message: `Bands squeezing (width ${(bollingerWidth * 100).toFixed(2)}%) - Big move coming! Prepare for breakout!`,
        timestamp: Date.now(),
        data: { width: bollingerWidth, squeeze: true }
      });
    }
    
    if (!prevPriceNearUpperBand && priceNearUpperBand && !priceNearLowerBand) {
      newAlerts.push({
        id: `bb-upper-${Date.now()}`,
        type: 'bollinger',
        severity: 'warning',
        title: '🔝 PRICE AT UPPER BB!',
        message: `Price touching upper Bollinger Band - Potential overbought condition!`,
        timestamp: Date.now(),
        data: { band: 'upper' }
      });
    }
    
    if (!prevPriceNearLowerBand && priceNearLowerBand && !priceNearUpperBand) {
      newAlerts.push({
        id: `bb-lower-${Date.now()}`,
        type: 'bollinger',
        severity: 'info',
        title: '🔻 PRICE AT LOWER BB!',
        message: `Price touching lower Bollinger Band - Potential oversold condition!`,
        timestamp: Date.now(),
        data: { band: 'lower' }
      });
    }

    // 14. VWAP CROSS ALERTS
    const vwap = signal.indicators?.vwap || 0;
    const priceAboveVWAP = signal.indicators?.priceAboveVWAP || false;
    const prevPriceAboveVWAP = previousSignal?.indicators?.priceAboveVWAP || false;
    const vwapDistance = signal.indicators?.vwapDistance || 0;
    
    if (!prevPriceAboveVWAP && priceAboveVWAP) {
      newAlerts.push({
        id: `vwap-cross-up-${Date.now()}`,
        type: 'vwap',
        severity: 'success',
        title: '📈 PRICE CROSSED ABOVE VWAP!',
        message: `Price broke above VWAP (${vwap.toFixed(2)}) - Bullish institutional bias!`,
        timestamp: Date.now(),
        data: { vwap, direction: 'up', distance: vwapDistance }
      });
    }
    
    if (prevPriceAboveVWAP && !priceAboveVWAP) {
      newAlerts.push({
        id: `vwap-cross-down-${Date.now()}`,
        type: 'vwap',
        severity: 'danger',
        title: '📉 PRICE CROSSED BELOW VWAP!',
        message: `Price broke below VWAP (${vwap.toFixed(2)}) - Bearish institutional bias!`,
        timestamp: Date.now(),
        data: { vwap, direction: 'down', distance: vwapDistance }
      });
    }
    
    if (Math.abs(vwapDistance) >= 2.0 && atr > 0) {
      newAlerts.push({
        id: `vwap-extreme-distance-${Date.now()}`,
        type: 'vwap',
        severity: 'warning',
        title: '⚠️ EXTREME VWAP DISTANCE!',
        message: `Price ${vwapDistance > 0 ? 'above' : 'below'} VWAP by ${Math.abs(vwapDistance).toFixed(2)}% - Mean reversion likely!`,
        timestamp: Date.now(),
        data: { distance: vwapDistance }
      });
    }

    // 15. ULTRA-HIGH CONFIRMATION ALERTS
    if (confirmations >= 8 && confirmations < 10) {
      newAlerts.push({
        id: `ultra-high-confirmations-${Date.now()}`,
        type: 'confirmation',
        severity: 'success',
        title: '🔥 ULTRA-HIGH CONFIRMATIONS!',
        message: `${confirmations}/${required} confirmations! VERY HIGH probability setup! ${action} signal strength: ${confidence}%`,
        timestamp: Date.now(),
        data: { confirmations, action, confidence }
      });
    }
    
    if (confirmations === 10) {
      newAlerts.push({
        id: `perfect-confirmations-${Date.now()}`,
        type: 'confirmation',
        severity: 'success',
        title: '💎 PERFECT 10/10 CONFIRMATIONS!',
        message: `ALL confirmations aligned! RARE ultra-high probability ${action} setup! Confidence: ${confidence}%`,
        timestamp: Date.now(),
        data: { confirmations, action, confidence }
      });
    }

    // 16. VOLATILITY ALERTS
    const prevATR = previousSignal?.indicators?.atr || 0;
    const atrChange = prevATR > 0 ? ((atr - prevATR) / prevATR) * 100 : 0;
    
    if (atrChange >= 20) {
      newAlerts.push({
        id: `volatility-spike-${Date.now()}`,
        type: 'momentum',
        severity: 'warning',
        title: '⚡ VOLATILITY SPIKE!',
        message: `ATR increased ${atrChange.toFixed(1)}% (now ${atr.toFixed(2)}) - Market volatility surging! Adjust stops!`,
        timestamp: Date.now(),
        data: { atr, atrChange }
      });
    }
    
    if (atrChange <= -20) {
      newAlerts.push({
        id: `volatility-drop-${Date.now()}`,
        type: 'momentum',
        severity: 'info',
        title: '😴 VOLATILITY DECLINING',
        message: `ATR decreased ${Math.abs(atrChange).toFixed(1)}% (now ${atr.toFixed(2)}) - Market calming down.`,
        timestamp: Date.now(),
        data: { atr, atrChange }
      });
    }

    // 17. MOMENTUM SHIFT ALERTS
    const momentum = signal.momentum || '';
    const prevMomentum = previousSignal?.momentum || '';
    
    if (prevMomentum !== momentum && momentum && prevMomentum) {
      if (momentum === 'STRONG_BULLISH' || momentum === 'BULLISH') {
        newAlerts.push({
          id: `momentum-shift-bullish-${Date.now()}`,
          type: 'momentum',
          severity: 'success',
          title: '🚀 MOMENTUM SHIFT: BULLISH!',
          message: `Momentum changed from ${prevMomentum} to ${momentum} - Upward acceleration detected!`,
          timestamp: Date.now(),
          data: { from: prevMomentum, to: momentum }
        });
      } else if (momentum === 'STRONG_BEARISH' || momentum === 'BEARISH') {
        newAlerts.push({
          id: `momentum-shift-bearish-${Date.now()}`,
          type: 'momentum',
          severity: 'danger',
          title: '📉 MOMENTUM SHIFT: BEARISH!',
          message: `Momentum changed from ${prevMomentum} to ${momentum} - Downward acceleration detected!`,
          timestamp: Date.now(),
          data: { from: prevMomentum, to: momentum }
        });
      }
    }

    // 18. PATTERN DETECTION ALERTS
    const patterns = signal.patterns || [];
    if (patterns.length > 0) {
      const bullishPatterns = patterns.filter((p: any) => {
        if (typeof p !== 'string') return false;
        const pattern = p.toLowerCase();
        return pattern.includes('bullish') || 
               pattern.includes('hammer') ||
               pattern.includes('morning star');
      });
      const bearishPatterns = patterns.filter((p: any) => {
        if (typeof p !== 'string') return false;
        const pattern = p.toLowerCase();
        return pattern.includes('bearish') || 
               pattern.includes('shooting star') ||
               pattern.includes('evening star');
      });
      
      if (bullishPatterns.length > 0) {
        newAlerts.push({
          id: `pattern-bullish-${Date.now()}`,
          type: 'pattern',
          severity: 'success',
          title: '📊 BULLISH PATTERN DETECTED!',
          message: `Pattern: ${bullishPatterns[0]} - Potential upside reversal!`,
          timestamp: Date.now(),
          data: { patterns: bullishPatterns }
        });
      }
      
      if (bearishPatterns.length > 0) {
        newAlerts.push({
          id: `pattern-bearish-${Date.now()}`,
          type: 'pattern',
          severity: 'warning',
          title: '📊 BEARISH PATTERN DETECTED!',
          message: `Pattern: ${bearishPatterns[0]} - Potential downside reversal!`,
          timestamp: Date.now(),
          data: { patterns: bearishPatterns }
        });
      }
    }

    // 19. STOCHASTIC ALERTS
    const stochK = signal.indicators?.stochK || 0;
    const stochD = signal.indicators?.stochD || 0;
    const prevStochK = previousSignal?.indicators?.stochK || 0;
    const prevStochD = previousSignal?.indicators?.stochD || 0;
    
    if (prevStochK < prevStochD && stochK > stochD && stochK < 30) {
      newAlerts.push({
        id: `stoch-bullish-cross-${Date.now()}`,
        type: 'momentum',
        severity: 'success',
        title: '📈 STOCHASTIC BULLISH CROSS!',
        message: `Stochastic K crossed above D in oversold zone (${stochK.toFixed(1)}) - Potential bounce!`,
        timestamp: Date.now(),
        data: { stochK, stochD }
      });
    }
    
    if (prevStochK > prevStochD && stochK < stochD && stochK > 70) {
      newAlerts.push({
        id: `stoch-bearish-cross-${Date.now()}`,
        type: 'momentum',
        severity: 'danger',
        title: '📉 STOCHASTIC BEARISH CROSS!',
        message: `Stochastic K crossed below D in overbought zone (${stochK.toFixed(1)}) - Potential reversal!`,
        timestamp: Date.now(),
        data: { stochK, stochD }
      });
    }

    // Add all new alerts that haven't been dismissed
    const filteredAlerts = newAlerts.filter(alert => !dismissedAlerts.has(alert.id));
    
    if (filteredAlerts.length > 0) {
      setAlerts(prev => {
        // Keep only last 10 alerts
        const updated = [...filteredAlerts, ...prev].slice(0, 10);
        return updated;
      });
    }

  }, [signal, previousSignal]);

  const dismissAlert = (id: string) => {
    setDismissedAlerts(prev => new Set([...prev, id]));
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  };

  const clearAllAlerts = () => {
    setAlerts([]);
    setDismissedAlerts(new Set());
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'adx': return <Activity className="w-5 h-5" />;
      case 'confirmation': return <CheckCircle className="w-5 h-5" />;
      case 'signal': return <Target className="w-5 h-5" />;
      case 'trap': return <AlertTriangle className="w-5 h-5" />;
      case 'volume': return <Volume2 className="w-5 h-5" />;
      case 'smartmoney': return <TrendingUp className="w-5 h-5" />;
      case 'divergence': return <Zap className="w-5 h-5" />;
      case 'support_resistance': return <Target className="w-5 h-5" />;
      case 'ema_cross': return <Activity className="w-5 h-5" />;
      case 'rsi': return <TrendingUp className="w-5 h-5" />;
      case 'bollinger': return <Activity className="w-5 h-5" />;
      case 'vwap': return <Target className="w-5 h-5" />;
      case 'pattern': return <CheckCircle className="w-5 h-5" />;
      case 'momentum': return <Zap className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'info': return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'warning': return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
      case 'success': return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'danger': return 'bg-red-500/10 border-red-500/30 text-red-400';
      default: return 'bg-gray-500/10 border-gray-500/30 text-gray-400';
    }
  };

  const getAlertBadgeColor = (severity: string) => {
    switch (severity) {
      case 'info': return 'bg-blue-500';
      case 'warning': return 'bg-yellow-500';
      case 'success': return 'bg-green-500';
      case 'danger': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h3 className="font-semibold text-white">Real-Time Alerts</h3>
          {alerts.length > 0 && (
            <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30">
              {alerts.length} Active
            </Badge>
          )}
        </div>
        {alerts.length > 0 && (
          <button
            onClick={clearAllAlerts}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Alerts List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {alerts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8 text-gray-500"
            >
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No active alerts</p>
              <p className="text-xs mt-1">Monitoring market conditions...</p>
            </motion.div>
          ) : (
            alerts.map((alert, index) => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`border ${getAlertColor(alert.severity)} relative overflow-hidden`}>
                  {/* Animated pulse border for high-severity alerts */}
                  {alert.severity === 'success' && (
                    <motion.div
                      className="absolute inset-0 border-2 border-green-500/50 rounded-lg"
                      animate={{
                        opacity: [0.5, 1, 0.5],
                        scale: [1, 1.02, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  )}

                  <div className="p-3 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1">
                        {/* Icon */}
                        <div className={`p-2 rounded-lg ${getAlertBadgeColor(alert.severity)}/20 flex-shrink-0`}>
                          {getAlertIcon(alert.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm text-white truncate">
                              {alert.title}
                            </h4>
                            <Badge 
                              variant="outline" 
                              className={`text-[10px] px-1.5 py-0 ${getAlertBadgeColor(alert.severity)} border-0 flex-shrink-0`}
                            >
                              {alert.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            {alert.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-gray-500">
                              {new Date(alert.timestamp).toLocaleTimeString()}
                            </span>
                            <span className="text-[10px] text-gray-600">•</span>
                            <span className="text-[10px] text-gray-500">
                              {timeframe}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Dismiss Button */}
                      <button
                        onClick={() => dismissAlert(alert.id)}
                        className="text-gray-500 hover:text-white transition-colors flex-shrink-0 p-1"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  );
}