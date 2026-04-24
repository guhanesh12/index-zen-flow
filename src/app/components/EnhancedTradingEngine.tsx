// @ts-nocheck
// ⚡ Enhanced Trading Engine - v2.1: Fixed console spam & signal persistence
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Input } from "./ui/input";
import { Play, Pause, Zap, Clock, TrendingUp, Target, Shield, Activity, BarChart3, DollarSign, AlertTriangle, Search, Pencil, Check, X, LogOut, RefreshCw } from "lucide-react";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";
import { supabase } from "@/utils-ext/supabase/client";
import { projectId, publicAnonKey } from "@/utils-ext/supabase/info";
import { AlertSystem } from "./AlertSystem";
import { createInstrumentService, saveTradingSymbolsToLocalStorage } from "../utils/instrumentService";
import { notificationService } from "@/utils/firebase/notificationService";
import { 
  notifySignalGenerated, 
  notifyPreSignalWarning, 
  notifyOrderPlaced, 
  notifyAutoExit,
  notifyManualExit,
  notifyEngineStart,
  notifyEngineStop,
  areSoundsEnabled,
  toggleSounds
} from "../utils/soundNotifications";

interface TradingSymbol {
  id: string;
  name: string;
  index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  optionType: 'CE' | 'PE';
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: string;
  validity: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  amoTime: string;
  boProfitValue: number;
  boStopLossValue: number;
  targetAmount: number;
  stopLossAmount: number;
  
  // ⚡ Trailing Stop Loss Feature
  trailingEnabled?: boolean;
  trailingActivationAmount?: number;
  targetJumpAmount?: number;
  stopLossJumpAmount?: number;
  currentTarget?: number;
  currentStopLoss?: number;
  trailingActivated?: boolean;
  
  active: boolean;
}

interface ActivePosition {
  symbolId: string;
  symbolName: string;
  orderId: string;
  securityId: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  targetAmount: number;
  stopLossAmount: number;
  
  // ⚡ Dynamic trailing values
  currentTarget?: number; // Dynamic target (updates with trailing)
  currentStopLoss?: number; // Dynamic stop loss (updates with trailing)
  trailingEnabled?: boolean;
  trailingActivationAmount?: number;
  targetJumpAmount?: number;
  stopLossJumpAmount?: number;
  trailingActivated?: boolean;
  highestPnL?: number; // Track highest PnL for trailing calculations
  
  entryTime: number;
  optionType: 'CE' | 'PE';
  index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  productType?: string; // ⚡ Store productType to use same type for exit orders
  exchangeSegment?: string; // ⚡ Store exchangeSegment for exit orders
  isExiting?: boolean; // ⚡ CRITICAL: Prevent duplicate exit orders
}

interface EnhancedTradingEngineProps {
  serverUrl: string;
  accessToken: string;
  onLog: (log: any) => void;
}

export function EnhancedTradingEngine({ serverUrl, accessToken, onLog }: EnhancedTradingEngineProps) {
  // ⚡ Version: 2.1.0 - Fixed console spam & signal persistence (2026-03-06)
  
  // ⚡⚡⚡ UNIQUE INSTANCE ID - Prevents race conditions in global lock ⚡⚡⚡
  const instanceIdRef = useRef(`instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
  // ⚡ CRITICAL: Store current access token in ref to get fresh token
  const currentAccessTokenRef = useRef(accessToken);
  
  // ⚡ Store userId for session-less API calls
  const userIdRef = useRef<string>('');

  // Update refs when accessToken prop changes
  useEffect(() => {
    currentAccessTokenRef.current = accessToken;
    // ⚡ Decode userId from JWT
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      if (payload.sub) userIdRef.current = payload.sub;
    } catch {}
  }, [accessToken]);

  // ⚡ HELPER: Check if a JWT token is expired or expires within 30 seconds
  const isJwtExpired = (token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // True if token has already expired OR will expire within the next 30 seconds
      return payload.exp * 1000 < Date.now() + 30000;
    } catch {
      return true; // Treat undecodeable tokens as expired
    }
  };
  
  // ⚡ HELPER: Get fresh access token (with auto-refresh if needed)
  const getFreshAccessToken = async (): Promise<string> => {
    try {
      // ⚡ PRIORITY 1: Use the cached ref if it is still valid
      // The 401 handler updates this ref immediately after a successful refresh,
      // so retries always pick up the new token without going through getSession()
      const cached = currentAccessTokenRef.current;
      if (cached && cached !== publicAnonKey && !isJwtExpired(cached)) {
        return cached;
      }
      
      // ⚡ PRIORITY 2: Try getSession — but only if the returned token is not expired
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!error && session?.access_token && !isJwtExpired(session.access_token)) {
        currentAccessTokenRef.current = session.access_token;
        if (session.user?.id) userIdRef.current = session.user.id;
        return session.access_token;
      }
      
      // ⚡ PRIORITY 3: Force a session refresh
      console.log('⚡ Token expired — forcing session refresh...');
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (!refreshError && refreshedSession?.access_token) {
        console.log('✅ Session refreshed successfully');
        currentAccessTokenRef.current = refreshedSession.access_token;
        if (refreshedSession.user?.id) userIdRef.current = refreshedSession.user.id;
        return refreshedSession.access_token;
      }
      
      // ⚡ LAST RESORT: use anon key — engine keeps running, server uses userId from body
      console.warn('⚠️ Session unavailable — falling back to anon key + userId');
      return publicAnonKey;
    } catch (err) {
      console.error('❌ Error in getFreshAccessToken:', err);
      return publicAnonKey;
    }
  };
  
  // ============ ENGINE STATE ============
  const [isRunning, setIsRunning] = useState(false);
  const [isPositionMonitorActive, setIsPositionMonitorActive] = useState(true); // ⚡ NEW: Control position monitoring separately
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('CLOSED');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // ⚡ POSITION EDIT STATE
  const [editingPosition, setEditingPosition] = useState<string | null>(null); // orderId being edited
  const [editValues, setEditValues] = useState<{ target: string; stopLoss: string }>({ target: '', stopLoss: '' });
  
  // ============ TRADING STATE ============
  const [tradingSymbols, setTradingSymbols] = useState<TradingSymbol[]>([]);
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]);
  // ⚡ Keep activePositionsRef in sync with state
  useEffect(() => {
    activePositionsRef.current = activePositions;
  }, [activePositions]);
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [previousSignal, setPreviousSignal] = useState<any>(null); // ⚡ FOR ALERT SYSTEM
  const lastSignalRef = useRef<any>(null);
  
  // ⚡⚡⚡ MULTI-SYMBOL SIGNALS: Store signals for each index separately ⚡⚡⚡
  // ⚡ Initialize empty — signals will be loaded from backend via syncEngineState
  const [multiSymbolSignals, setMultiSymbolSignals] = useState<{
    NIFTY: any | null;
    BANKNIFTY: any | null;
    SENSEX: any | null;
  }>({
    NIFTY: null,
    BANKNIFTY: null,
    SENSEX: null
  });
  const [selectedAnalysisIndex, setSelectedAnalysisIndex] = useState<'NIFTY' | 'BANKNIFTY' | 'SENSEX'>('NIFTY');
  
  // ⚡ Force render counter to ensure UI updates
  const [renderKey, setRenderKey] = useState(0);

  useEffect(() => {
    lastSignalRef.current = lastSignal;
  }, [lastSignal]);
  
  // ⚡ Save signals to localStorage + Log changes (ONLY when signals exist)
  useEffect(() => {
    console.log(`\n🔥🔥🔥 useEffect [multiSymbolSignals] TRIGGERED - State:`, multiSymbolSignals);
    console.log(`🔍 UI Render Debug:`, {
      nifty: multiSymbolSignals.NIFTY?.action,
      banknifty: multiSymbolSignals.BANKNIFTY?.action,
      sensex: multiSymbolSignals.SENSEX?.action,
      timestamp: multiSymbolSignals.__timestamp
    });
    
    // Save to localStorage with timestamp
    try {
      localStorage.setItem('engine_signals', JSON.stringify(multiSymbolSignals));
      localStorage.setItem('engine_signals_time', Date.now().toString());
    } catch (e) {
      console.error('Failed to save signals to localStorage:', e);
    }
    
    // Only log when at least one signal exists (not all null)
    const hasSignal = multiSymbolSignals.NIFTY || multiSymbolSignals.BANKNIFTY || multiSymbolSignals.SENSEX;
    if (hasSignal) {
      console.log(`\n🔔 ============ SIGNALS UPDATED ============`);
      console.log(`   NIFTY:`, multiSymbolSignals.NIFTY ? `${multiSymbolSignals.NIFTY.action} (${multiSymbolSignals.NIFTY.confidence}%)` : 'NULL');
      console.log(`   BANKNIFTY:`, multiSymbolSignals.BANKNIFTY ? `${multiSymbolSignals.BANKNIFTY.action} (${multiSymbolSignals.BANKNIFTY.confidence}%)` : 'NULL');
      console.log(`   SENSEX:`, multiSymbolSignals.SENSEX ? `${multiSymbolSignals.SENSEX.action} (${multiSymbolSignals.SENSEX.confidence}%)` : 'NULL');
      console.log(`==========================================\n`);
      
      // Force UI re-render
      setRenderKey(prev => prev + 1);
      console.log(`🔄 FORCED UI RE-RENDER - renderKey updated to:`, renderKey + 1);
    }
  }, [multiSymbolSignals]);
  
  const [dhanClientId, setDhanClientId] = useState('');
  
  // ============ CANDLE TIMING ============
  const [nextCandleClose, setNextCandleClose] = useState<string>('--:--');
  const [lastProcessedCandle, setLastProcessedCandle] = useState<string>('');
  const [secondsToCandle, setSecondsToCandle] = useState<number>(0);
  const [preSignalSoundPlayed, setPreSignalSoundPlayed] = useState<boolean>(false); // ⚡ Track 20s warning sound
  
  // ============ CONFIGURATION ============
  const [candleInterval, setCandleInterval] = useState<'5' | '15'>(() => {
    // ⚡ RESTORE SAVED TIMEFRAME ON MOUNT
    const saved = localStorage.getItem('engine_interval');
    const validSaved = (saved === '5' || saved === '15') ? saved : '15';
    console.log(`🔧 Initial timeframe load: ${validSaved}M (from localStorage: ${saved})`);
    return validSaved as '5' | '15';
  });
  
  // ⚡ EXIT ORDER TYPE CONFIGURATION (MARKET or LIMIT)
  const [exitOrderType, setExitOrderType] = useState<'MARKET' | 'LIMIT'>(() => {
    const saved = localStorage.getItem('exit_order_type');
    const validSaved = (saved === 'MARKET' || saved === 'LIMIT') ? saved : 'MARKET'; // ⚡ DEFAULT: MARKET for instant exits
    console.log(`🔧 Exit Order Type: ${validSaved} (from localStorage: ${saved})`);
    return validSaved as 'MARKET' | 'LIMIT';
  });
  
  // ⚡ FORCE START OVERRIDE (For special sessions on weekends/holidays)
  const [forceStartEnabled, setForceStartEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('force_start_enabled');
    return saved === 'true';
  });
  
  // ============ STATS ============
  const [stats, setStats] = useState({
    totalSignals: 0,
    totalOrders: 0,
    avgExecutionTime: 0,
    totalPnL: 0,
    unrealizedPnL: 0,
    realizedPnL: 0
  });
  
  // ⚡⚡⚡ POSITION MONITORING STATUS (HEARTBEAT OF SYSTEM!) ⚡⚡⚡
  const [positionMonitoringStatus, setPositionMonitoringStatus] = useState<{
    [orderId: string]: {
      decision: 'HOLD' | 'EXIT';
      reasoning: string;
      marketAnalysis: {
        trend: string;
        momentum: string;
        strength: string;
        nextMoment: string;
      };
      aiSignal: string;
      confidence: number;
      currentPnL: number;
      pnlPercentage: number;
      timestamp: number;
    };
  }>({});
  
  // ============ REFS ============
  const engineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const isRunningRef = useRef(false); // ⚡ USE REF TO AVOID CLOSURE ISSUES
  const isPositionMonitorActiveRef = useRef(true); // ⚡ USE REF TO AVOID CLOSURE ISSUES
  const processedCandlesRef = useRef<Set<string>>(new Set()); // 🔒 PREVENT DUPLICATES
  const hasAutoRestartedRef = useRef(false); // 🔒 PREVENT MULTIPLE AUTO-RESTARTS
  const symbolsLoadedRef = useRef(false); // 🔒 TRACK IF SYMBOLS LOADED
  const isInitialMountRef = useRef(true); // 🔒 TRACK INITIAL MOUNT
  const lastActiveTimeRef = useRef(Date.now()); // ⚡ TRACK LAST ACTIVITY TIME
  const lastHeartbeatRef = useRef(Date.now()); // ⚡ TRACK ENGINE HEARTBEAT
  const heartbeatCheckRef = useRef<NodeJS.Timeout | null>(null); // ⚡ HEARTBEAT CHECKER
  const exitingPositionsRef = useRef<Set<string>>(new Set()); // ⚡⚡⚡ CRITICAL: Track positions being exited (by orderId)
  const lastExitOrderTimeRef = useRef<number>(0); // ⚡⚡⚡ CRITICAL: Rate limit exit orders (prevent Dhan API throttle)
  const candleIntervalRef = useRef<'5' | '15'>('15'); // ⚡⚡⚡ CRITICAL: Store current timeframe to avoid closure issues
  const lastAIRequestTimeRef = useRef<number>(0); // ⚡⚡⚡ CRITICAL: Prevent rate limit - track last AI request time
  const lastProcessedCandleRef = useRef<string>(''); // ⚡⚡⚡ CRITICAL: Use REF not state - immediate sync update to prevent duplicates!
  const exitFailureCountRef = useRef<Map<string, { count: number; lastAttempt: number }>>(new Map()); // ⚡⚡⚡ NEW: Track exit failures per position (PREVENT INFINITE RETRY LOOP)
  const autoPositionCheckRef = useRef<NodeJS.Timeout | null>(null); // ⚡ AUTO-CHECK positions every 60s
  const activePositionsRef = useRef<ActivePosition[]>([]); // ⚡ REF to avoid stale closures in intervals

  const getDetectedPositionOrderId = (position: any) => {
    return String(
      position.exchangeOrderNo ||
      position.exchangeOrderId ||
      position.orderId ||
      position.orderNo ||
      position.omsOrderId ||
      position.dhanOrderId ||
      position.clientOrderId ||
      position.correlationId ||
      `dhan_${position.securityId || 'unknown'}_${position.tradingSymbol || 'unknown'}`
    );
  };

  const detectPositionIndex = (position: any): 'NIFTY' | 'BANKNIFTY' | 'SENSEX' => {
    const rawSymbol = String(
      position.underlyingSymbol ||
      position.underlying ||
      position.index ||
      position.tradingSymbol ||
      position.symbol ||
      ''
    ).toUpperCase();

    if (rawSymbol.includes('BANKNIFTY')) return 'BANKNIFTY';
    if (rawSymbol.includes('SENSEX')) return 'SENSEX';
    return 'NIFTY';
  };

  const createInitialMonitoringStatus = (pos: ActivePosition) => {
    const positionDirection = pos.optionType === 'CE' ? 'BULLISH' : 'BEARISH';

    return {
      decision: 'HOLD' as const,
      reasoning: `Existing ${positionDirection} position loaded from Dhan. Starting real-time monitoring...`,
      marketAnalysis: {
        trend: 'Loading...',
        momentum: 'Loading...',
        strength: 'Loading...',
        nextMoment: 'Fetching market data...'
      },
      aiSignal: pos.optionType === 'CE' ? 'BUY_CALL' : 'BUY_PUT',
      confidence: 0,
      currentPnL: pos.pnl || 0,
      pnlPercentage: pos.entryPrice > 0 ? ((pos.pnl || 0) / (pos.entryPrice * pos.quantity)) * 100 : 0,
      indicators: {
        ema9: 0,
        ema21: 0,
        rsi: 50,
        macd: 0,
        adx: 0,
        vwap: 0
      },
      timestamp: Date.now()
    };
  };

  const ensureMonitoringStatusInitialized = (positions: ActivePosition[]) => {
    if (!positions.length) return;

    setPositionMonitoringStatus(prev => {
      let changed = false;
      const next = { ...prev };

      positions.forEach(pos => {
        if (!next[pos.orderId]) {
          next[pos.orderId] = createInitialMonitoringStatus(pos);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  };

  const normalizeSignalPayload = (signalRecord: any, fallbackIndex?: 'NIFTY' | 'BANKNIFTY' | 'SENSEX') => {
    const rawSignal = signalRecord?.raw_data?.signal || signalRecord?.raw_data || signalRecord?.signal || signalRecord;
    if (!rawSignal) return null;

    const rawVolumeAnalysis = rawSignal.volume_analysis || rawSignal.volumeAnalysis || null;
    const normalizedVolumeAnalysis = rawVolumeAnalysis ? {
      ...rawVolumeAnalysis,
      ratio: Number(rawVolumeAnalysis.ratio ?? 0),
      is_high: rawVolumeAnalysis.is_high ?? rawVolumeAnalysis.isHigh ?? false,
      is_spike: rawVolumeAnalysis.is_spike ?? rawVolumeAnalysis.isSpike ?? false,
      smart_money_detected: rawVolumeAnalysis.smart_money_detected ?? rawVolumeAnalysis.smartMoney ?? false,
      current_volume: Number(rawVolumeAnalysis.current_volume ?? rawVolumeAnalysis.currentVolume ?? rawVolumeAnalysis.current ?? 0),
      average_volume: Number(rawVolumeAnalysis.average_volume ?? rawVolumeAnalysis.averageVolume ?? rawVolumeAnalysis.average ?? 0),
      buyPressure: Number(rawVolumeAnalysis.buyPressure ?? rawVolumeAnalysis.buy_pressure ?? 0),
      sellPressure: Number(rawVolumeAnalysis.sellPressure ?? rawVolumeAnalysis.sell_pressure ?? 0),
      has_data: rawVolumeAnalysis.has_data ?? rawVolumeAnalysis.hasData ?? false,
      orderFlow: rawVolumeAnalysis.orderFlow || rawVolumeAnalysis.order_flow || 'N/A',
    } : null;

    if (normalizedVolumeAnalysis) {
      const currentVolume = normalizedVolumeAnalysis.current_volume;
      const averageVolume = normalizedVolumeAnalysis.average_volume;
      const computedRatio = currentVolume > 0 && averageVolume > 0 ? currentVolume / averageVolume : 0;

      if ((!normalizedVolumeAnalysis.ratio || normalizedVolumeAnalysis.ratio < 0.01) && computedRatio > 0) {
        normalizedVolumeAnalysis.ratio = computedRatio;
      } else if (computedRatio > 0 && Math.abs(normalizedVolumeAnalysis.ratio - computedRatio) > 0.05) {
        normalizedVolumeAnalysis.ratio = computedRatio;
      }

       if (!normalizedVolumeAnalysis.has_data && (currentVolume > 0 || averageVolume > 0 || normalizedVolumeAnalysis.ratio > 0)) {
         normalizedVolumeAnalysis.has_data = true;
       }
    }

    const timestamp = signalRecord?.created_at
      ? new Date(signalRecord.created_at).getTime()
      : (typeof signalRecord?.timestamp === 'number' ? signalRecord.timestamp : Date.now());

    return {
      ...rawSignal,
      index: rawSignal.index || signalRecord?.index_name || fallbackIndex || 'NIFTY',
      action: rawSignal.action || signalRecord?.signal_type || 'WAIT',
      confidence: rawSignal.confidence ?? signalRecord?.confidence ?? 0,
      price: rawSignal.price ?? signalRecord?.price ?? null,
      reasoning: rawSignal.reasoning || rawSignal.reason || rawSignal.analysis || '',
      bias: rawSignal.bias || 'Neutral',
      market_state: rawSignal.market_state || rawSignal.marketState || rawSignal.marketRegime?.type || 'Unknown',
      timeframe: rawSignal.timeframe || signalRecord?.timeframe || `${candleIntervalRef.current}M`,
      candlesAnalyzed: rawSignal.candlesAnalyzed || signalRecord?.candlesProcessed || null,
      confirmations: rawSignal.confirmations || (rawSignal.confirmationDetails ? {
        total: rawSignal.tripleConfirmation || 0,
        required: 3,
        details: rawSignal.confirmationDetails,
      } : undefined),
      volumeAnalysis: normalizedVolumeAnalysis,
      volume_analysis: normalizedVolumeAnalysis,
      riskManagement: rawSignal.riskManagement || null,
      marketRegime: rawSignal.marketRegime || null,
      indicators: rawSignal.indicators || null,
      patterns: rawSignal.patterns || [],
      resistance_levels: rawSignal.resistance_levels || rawSignal.indicators?.resistance_levels,
      support_levels: rawSignal.support_levels || rawSignal.indicators?.support_levels,
      institutional_bias: rawSignal.institutional_bias || rawSignal.institutionalBias || normalizedVolumeAnalysis?.orderFlow || 'N/A',
      momentum: rawSignal.momentum || rawSignal.marketMomentum || normalizedVolumeAnalysis?.orderFlow || 'NEUTRAL',
      smart_money_detected: rawSignal.smart_money_detected ?? normalizedVolumeAnalysis?.smart_money_detected ?? false,
      timestamp,
      source: signalRecord?.created_at ? 'backend' : (rawSignal.source || 'local'),
    };
  };

  const getLatestSignalFromMap = (signalsMap: any) => {
    return ['NIFTY', 'BANKNIFTY', 'SENSEX']
      .map((index) => signalsMap?.[index])
      .filter(Boolean)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;
  };

  const analysisSignals = {
    NIFTY: multiSymbolSignals.NIFTY || ((lastSignal?.index === 'NIFTY' || !lastSignal?.index) ? lastSignal : null),
    BANKNIFTY: multiSymbolSignals.BANKNIFTY || (lastSignal?.index === 'BANKNIFTY' ? lastSignal : null),
    SENSEX: multiSymbolSignals.SENSEX || (lastSignal?.index === 'SENSEX' ? lastSignal : null),
  };

  const selectedAnalysisSignal = analysisSignals[selectedAnalysisIndex];
  const hasAnyAnalysisSignal = Boolean(analysisSignals.NIFTY || analysisSignals.BANKNIFTY || analysisSignals.SENSEX);

  const formatSignalLevel = (value: any) => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) return '--';
    if (numericValue === 0) return '0.00';
    if (Math.abs(numericValue) < 0.01) return numericValue.toFixed(4);
    return numericValue.toFixed(2);
  };

  const formatVolumeCount = (value: any) => {
    const numericValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numericValue) ? Math.round(numericValue).toLocaleString('en-IN') : '--';
  };

  const getSignalMomentumLabel = (signal: any) => {
    const directMomentum = signal?.momentum;
    if (directMomentum && directMomentum !== 'N/A') return directMomentum;

    const orderFlow = signal?.volume_analysis?.orderFlow || signal?.volumeAnalysis?.orderFlow || signal?.institutional_bias;
    if (orderFlow && orderFlow !== 'N/A') return orderFlow;

    const buyPressure = Number(signal?.volume_analysis?.buyPressure ?? signal?.volumeAnalysis?.buyPressure ?? 0);
    const sellPressure = Number(signal?.volume_analysis?.sellPressure ?? signal?.volumeAnalysis?.sellPressure ?? 0);

    if (buyPressure > sellPressure) return 'BULLISH';
    if (sellPressure > buyPressure) return 'BEARISH';
    return 'NEUTRAL';
  };

  const ensurePositionMonitorLoop = () => {
    if (positionMonitorRef.current) return;
    console.log('⚡ Starting 1-second position monitor sync loop.');

    positionMonitorRef.current = setInterval(async () => {
      if (!isPositionMonitorActiveRef.current) return;
      try {
        const freshToken = await getFreshAccessToken();
        await fetch(`${serverUrl}/position-monitor/tick`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${freshToken}` }
        });
        await syncEngineState();
      } catch (error) {
        console.warn('⚠️ Position monitor tick failed:', error);
      }
    }, 1000);
  };

  const clearPositionMonitorLoop = () => {
    if (positionMonitorRef.current) {
      clearInterval(positionMonitorRef.current);
      positionMonitorRef.current = null;
      console.log('🧹 Position monitor loop cleared');
    }
  };

  useEffect(() => {
    ensurePositionMonitorLoop();

    return () => {
      clearPositionMonitorLoop();
    };
  }, []);

  // ⚡⚡⚡ CRITICAL FIX: Engine Heartbeat Monitor ⚡⚡⚡
  // Detects if engine stops working even though it says it's "running"
  useEffect(() => {
    // Check every 30 seconds if engine is actually running
    const heartbeatChecker = setInterval(() => {
      const wasRunning = localStorage.getItem('engine_running') === 'true';
      const timeSinceLastBeat = Date.now() - lastHeartbeatRef.current;
      
      // ⚡ FIX: For 15M candles, allow up to 20 minutes (1200s) of no activity
      // For 5M candles, allow up to 7 minutes (420s)
      // The checkCandleStatus function updates heartbeat every second, so this is just a safety net
      const interval = parseInt(candleIntervalRef.current) || 5; // ⚡ Use ref to get latest value
      const maxInactivityTime = interval === 15 ? 1200000 : 420000; // 20min for 15M, 7min for 5M
      
      if (wasRunning && isRunningRef.current && timeSinceLastBeat > maxInactivityTime) {
        console.warn('⚠️ Local heartbeat delayed - keeping backend engine running and re-syncing UI only');
        console.warn(`  - Interval: ${interval}M`);
        console.warn(`  - Last local activity: ${Math.round(timeSinceLastBeat / 1000)}s ago`);
        console.warn(`  - Max allowed: ${Math.round(maxInactivityTime / 1000)}s`);

        // Never stop the engine automatically from the browser.
        // The backend engine is the source of truth and must stop only on manual user action.
        lastHeartbeatRef.current = Date.now();
        syncEngineState();
      }
    }, 30000); // Check every 30 seconds
    
    return () => {
      if (heartbeatChecker) clearInterval(heartbeatChecker);
    };
  }, [candleInterval]); // ⚡ FIX: Add candleInterval dependency so it updates when changed

  // ⚡⚡⚡ CRITICAL FIX: Page Visibility Detection ⚡⚡⚡
  // This prevents browser from killing the tab when it goes inactive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab became inactive
        console.log('⚠️ TAB INACTIVE - Browser may throttle timers');
        console.log('  - Engine will continue running but may be slower');
        console.log('  - LocalStorage state is preserved');
        lastActiveTimeRef.current = Date.now();
      } else {
        // Tab became active again
        const inactiveTime = Math.round((Date.now() - lastActiveTimeRef.current) / 1000);
        console.log(`✅ TAB ACTIVE AGAIN - Was inactive for ${inactiveTime}s`);
        
        // ⚡ ALWAYS reload symbols when tab becomes active (in case user changed them)
        console.log('🔄 Reloading symbols in case they were updated...');
        loadSymbols();
        
        // If engine was running and tab was inactive for >10s, check health
        const wasRunning = localStorage.getItem('engine_running') === 'true';
        if (wasRunning && inactiveTime > 10) {
          console.log('🔄 Tab was inactive for a while, checking engine health...');
          
          // Verify timers are still running
          if (isRunningRef.current && !engineTimerRef.current) {
            console.log('⚠️ Local timers were throttled while tab was inactive.');
            console.log('☁️ Backend engine remains active - re-syncing UI state instead of stopping.');
            syncEngineState();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Run once on mount

  // ============ LOAD DATA ============
  useEffect(() => {
    loadSymbols();
    loadDhanClientId();
    loadExistingPositions(); // ⚡ NEW: Load existing positions from Dhan
    syncEngineState(); // ⚡ NEW: Load engine state from backend
    
    // Clock updates every second
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
      updateMarketStatus();
      updateNextCandleTime();
    }, 1000);

    // ⚡ NEW: Poll backend every 5 seconds for engine state changes from other devices
    const syncInterval = setInterval(() => {
      syncEngineState();
    }, 5000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(syncInterval);
      // ⚡ DON'T STOP ENGINE ON UNMOUNT - Keep it running in background
      // Engine only stops when user clicks "Stop Engine" button
    };
  }, [candleInterval, forceStartEnabled]); // ⚡ Add forceStartEnabled to trigger market status update

  // ⚡ SAVE TIMEFRAME TO LOCALSTORAGE WHENEVER IT CHANGES
  useEffect(() => {
    localStorage.setItem('engine_interval', candleInterval);
    candleIntervalRef.current = candleInterval; // ⚡⚡⚡ CRITICAL: Update ref to avoid closure issues
    console.log(`💾 Saved timeframe to localStorage: ${candleInterval}M`);
    console.log(`✅ Updated candleIntervalRef.current = ${candleIntervalRef.current}`);
  }, [candleInterval]);

  // ⚡ SAVE EXIT ORDER TYPE TO LOCALSTORAGE WHENEVER IT CHANGES
  useEffect(() => {
    localStorage.setItem('exit_order_type', exitOrderType);
    console.log(`💾 Saved exit order type to localStorage: ${exitOrderType}`);
  }, [exitOrderType]);

  // ⚡ ONE-TIME MIGRATION: Switch from LIMIT to MARKET default (remove after a few days)
  useEffect(() => {
    const migrationKey = 'exit_order_migration_v1';
    const migrated = localStorage.getItem(migrationKey);
    
    if (!migrated) {
      console.log('🔄 MIGRATION: Updating default exit order type to MARKET for faster exits');
      localStorage.setItem('exit_order_type', 'MARKET');
      localStorage.setItem(migrationKey, 'done');
      setExitOrderType('MARKET');
      console.log('✅ Migration complete: Exit orders will now use MARKET type by default');
    }
  }, []);

  // ⚡ LISTEN FOR CREDENTIALS UPDATE EVENT (from Settings panel)
  useEffect(() => {
    const handleCredentialsUpdate = () => {
      console.log('🔄 Credentials updated event received! Reloading dhanClientId...');
      loadDhanClientId();
    };
    
    window.addEventListener('credentials-updated', handleCredentialsUpdate);
    
    return () => {
      window.removeEventListener('credentials-updated', handleCredentialsUpdate);
    };
  }, []);

  // ⚡ SAVE FORCE START ENABLED TO LOCALSTORAGE WHENEVER IT CHANGES
  useEffect(() => {
    localStorage.setItem('force_start_enabled', forceStartEnabled.toString());
    console.log(`💾 Saved force start enabled to localStorage: ${forceStartEnabled}`);
  }, [forceStartEnabled]);

  // ⚡⚡⚡ ENABLED: SMART AUTO-RESTART ON PAGE REFRESH/TAB SWITCH ⚡⚡⚡
  // Keeps engine running across page refreshes, tab switches, and navigation
  useEffect(() => {
    // Check if engine was running before
    const wasRunning = localStorage.getItem('engine_running') === 'true';
    const savedInterval = localStorage.getItem('engine_interval') || '15';
    const manualStop = localStorage.getItem('engine_manual_stop') === 'true'; // NEW: Track intentional stops
    
    console.log('\n🔍 ============ ENGINE STATE CHECK ============');
    console.log('  - Was Running:', wasRunning);
    console.log('  - Saved Interval:', savedInterval);
    console.log('  - Current Interval:', candleInterval);
    console.log('  - Symbols Loaded:', tradingSymbols.length);
    console.log('  - Manual Stop:', manualStop);
    console.log('============================================\n');
    
    // ❌ DISABLED: Auto-restart on page refresh (prevents unwanted background signal detection)
    // Engine should ONLY start when user manually clicks "Start Engine" button
    // This ensures signal detection does NOT run when engine is stopped
    
    if (wasRunning && !manualStop) {
      console.log('ℹ️ Engine was running before page refresh - But NOT auto-restarting');
      console.log('   To start: Click "Start Engine" button manually');
      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: 'ℹ️ Engine is stopped. Click "Start Engine" to resume trading.'
      });
    } else if (wasRunning && manualStop) {
      console.log('ℹ️ Engine was manually stopped by user - NOT auto-restarting');
      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: 'ℹ️ Engine is stopped. Click "Start Engine" to resume trading.'
      });
    }
  }, [tradingSymbols]); // Runs when symbols are loaded

  // ⚡⚡⚡ BACKEND SYNC (MULTI-DEVICE SUPPORT) ⚡⚡⚡
  // Polls /engine/db-status every 5 seconds — same user on ANY device sees same data
  const syncEngineState = async () => {
    try {
      const freshToken = await getFreshAccessToken();
      const response = await fetch(`${serverUrl}/engine/db-status`, {
        headers: { Authorization: `Bearer ${freshToken}` }
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      if (!data.success) return;

      const backendInterval = data.engine?.strategySettings?.candleInterval;
      if ((backendInterval === '5' || backendInterval === '15') && backendInterval !== candleIntervalRef.current) {
        console.log(`☁️ Syncing timeframe from backend: ${candleIntervalRef.current}M → ${backendInterval}M`);
        candleIntervalRef.current = backendInterval;
        localStorage.setItem('engine_interval', backendInterval);
        setCandleInterval(backendInterval);
      }

      if (data.engine?.lastHeartbeat) {
        const backendHeartbeat = new Date(data.engine.lastHeartbeat).getTime();
        if (!Number.isNaN(backendHeartbeat)) {
          lastHeartbeatRef.current = Math.max(lastHeartbeatRef.current, backendHeartbeat);
        }
      }
      
      // ⚡ SYNC ENGINE RUNNING STATE FROM BACKEND
      const backendRunning = data.engine?.isRunning || false;
      
      // If backend says engine is running on another device, show it running here too
      if (backendRunning && !isRunning && !isRunningRef.current) {
        console.log('☁️ Backend engine is RUNNING (started from another device)');
        setIsRunning(true);
        isRunningRef.current = true;
        localStorage.setItem('engine_running', 'true');
        localStorage.removeItem('engine_manual_stop');
      }
      
      // If backend says engine stopped but frontend shows running, auto-stop
      if (!backendRunning && isRunning && isRunningRef.current) {
        console.log('🛑 Backend engine STOPPED (from another device)');
        stopEngine(false);
      }
      
      // ⚡ SYNC POSITIONS FROM BACKEND (replace local with backend source of truth)
      if (data.positions) {
        const backendPositions: ActivePosition[] = data.positions.map((p: any) => ({
          symbolId: p.symbol_id || p.order_id,
          orderId: p.order_id,
          symbolName: p.symbol,
          securityId: p.symbol_id || '',
          optionType: (p.symbol?.includes('CE') ? 'CE' : 'PE') as 'CE' | 'PE',
          entryPrice: p.entry_price || 0,
          currentPrice: p.current_price || 0,
          quantity: p.quantity || 1,
          targetAmount: p.target_amount || 3000,
          stopLossAmount: p.stop_loss_amount || 2000,
          currentTarget: p.target_amount,
          currentStopLoss: p.stop_loss_amount,
          trailingEnabled: p.trailing_enabled || false,
          trailingActivationAmount: 0,
          targetJumpAmount: 0,
          stopLossJumpAmount: 0,
          trailingActivated: false,
          highestPnL: p.highest_pnl || 0,
          pnl: p.pnl || 0,
          entryTime: new Date(p.created_at).getTime(),
          index: (p.index_name || 'NIFTY') as 'NIFTY' | 'BANKNIFTY' | 'SENSEX',
          productType: 'INTRADAY',
          exchangeSegment: p.exchange_segment || 'NSE_FNO'
        }));
        
        const backendOrderIds = new Set(backendPositions.map(p => p.orderId));
        const currentOrderIds = new Set(activePositionsRef.current.map(p => p.orderId));
        const hasChanged = backendPositions.length !== activePositionsRef.current.length || backendPositions.some(p => {
          const current = activePositionsRef.current.find(existing => existing.orderId === p.orderId);
          return !current || current.pnl !== p.pnl || current.currentPrice !== p.currentPrice || current.currentTarget !== p.currentTarget || current.currentStopLoss !== p.currentStopLoss;
        });

        if (hasChanged) {
          setActivePositions(backendPositions);
          activePositionsRef.current = backendPositions;
          ensureMonitoringStatusInitialized(backendPositions.filter(p => !currentOrderIds.has(p.orderId)));
          ensurePositionMonitorLoop();
        }

        if (backendOrderIds.size === 0) clearPositionMonitorLoop();
      }
      
      // ⚡ SYNC STATS FROM BACKEND (for performance section)
      if (data.stats) {
        setStats(prev => ({
          ...prev,
          totalSignals: data.stats.signal_count || prev.totalSignals,
          totalOrders: data.stats.order_count || prev.totalOrders,
          totalPnL: data.stats.total_pnl || prev.totalPnL
        }));
      }
      
      // ⚡ SYNC SIGNALS FROM BACKEND
      const latestSignals: any = { NIFTY: null, BANKNIFTY: null, SENSEX: null };

      if (data.latestSignals && typeof data.latestSignals === 'object') {
        for (const idx of ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const) {
          const normalizedSignal = normalizeSignalPayload(data.latestSignals[idx], idx);
          if (normalizedSignal) {
            latestSignals[idx] = normalizedSignal;
          }
        }
      }

      if ((!latestSignals.NIFTY && !latestSignals.BANKNIFTY && !latestSignals.SENSEX) && data.signals && data.signals.length > 0) {
        for (const sig of data.signals) {
          const idx = sig.index_name as 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
          const normalizedSignal = normalizeSignalPayload(sig, idx);
          if (idx && normalizedSignal && (!latestSignals[idx] || latestSignals[idx].timestamp < normalizedSignal.timestamp)) {
            latestSignals[idx] = normalizedSignal;
          }
        }
      }

      const hasBackendSignals = latestSignals.NIFTY || latestSignals.BANKNIFTY || latestSignals.SENSEX;
      if (hasBackendSignals) {
        const backendTimestamp = data.latestSignals?.__timestamp || getLatestSignalFromMap(latestSignals)?.timestamp || Date.now();

        setMultiSymbolSignals(prev => {
          const updated = {
            ...prev,
            __timestamp: backendTimestamp,
          };

          for (const idx of ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const) {
            if (latestSignals[idx] && (!prev[idx] || latestSignals[idx].timestamp > (prev[idx]?.timestamp || 0))) {
              updated[idx] = latestSignals[idx];
            }
          }

          return updated;
        });

        const latestBackendSignal = getLatestSignalFromMap(latestSignals);
        if (latestBackendSignal && latestBackendSignal.timestamp > (lastSignalRef.current?.timestamp || 0)) {
          setPreviousSignal(lastSignalRef.current);
          setLastSignal(latestBackendSignal);
          lastSignalRef.current = latestBackendSignal;
        }
      }
      
    } catch (error) {
      // Silent - sync is best-effort
    }
  };

  const persistEngineStateSnapshot = async (running: boolean, interval: string) => {
    const freshToken = await getFreshAccessToken();

    await fetch(`${serverUrl}/engine/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${freshToken}`
      },
      body: JSON.stringify({
        isRunning: running,
        candleInterval: interval,
        timestamp: Date.now()
      })
    });

    return freshToken;
  };

  // ⚡⚡⚡ NEW: SAVE ENGINE STATE TO BACKEND ⚡⚡⚡
  const saveEngineState = async (
    running: boolean,
    interval: string,
    options: { syncServerEngine?: boolean } = {}
  ) => {
    try {
      const { syncServerEngine = true } = options;
      const freshToken = await persistEngineStateSnapshot(running, interval);

      if (!syncServerEngine) {
        console.log(`💾 Saved engine snapshot only: Running=${running}, Interval=${interval}M`);
        return;
      }
      
    // ⚡⚡⚡ START/STOP 24/7 BACKGROUND SERVER ENGINE ⚡⚡⚡
      if (running) {
        // Start 24/7 Engine
        await fetch(`${serverUrl}/engine/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`
          },
          body: JSON.stringify({
            candleInterval: interval,
            symbols: tradingSymbols.filter(s => s.active) // Send only active symbols
          })
        });
        console.log(`🚀 24/7 Server Engine STARTED in background`);
        
        onLog({
          timestamp: Date.now(),
          type: 'SUCCESS',
          message: `☁️ 24/7 Cloud Engine STARTED - Trading will continue even if you close the site!`
        });
      } else {
        // Stop 24/7 Engine
        await fetch(`${serverUrl}/engine/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`
          }
        });
        console.log(`🛑 24/7 Server Engine STOPPED`);
        
        onLog({
          timestamp: Date.now(),
          type: 'INFO',
          message: `☁️ 24/7 Cloud Engine STOPPED.`
        });
      }
      
      console.log(`💾 Saved engine state to backend: Running=${running}, Interval=${interval}M`);
    } catch (error) {
      console.log('Failed to save engine state:', error);
      // Don't block user action if backend save fails
    }
  };

  // ⚡ SAVE SYMBOLS TO SERVER DATABASE (multi-device sync)
  const saveSymbolsToDB = async (symbols: any[]) => {
    try {
      if (!symbols || symbols.length === 0) return;
      const freshToken = await getFreshAccessToken();
      const response = await fetch(`${serverUrl}/symbols/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({ symbols })
      });
      if (response.ok) {
        const data = await response.json();
        console.log(`☁️ Saved ${data.saved || symbols.length} symbols to server database`);
      }
    } catch (err) {
      console.log('Symbol DB save skipped:', err);
    }
  };

  const normalizeTradingSymbol = (symbol: any): TradingSymbol => {
    const raw = symbol?.raw_data || symbol;
    const index = raw.index || raw.indexName || raw.index_name || 'NIFTY';
    const afterMarketOrder = !!raw.afterMarketOrder;

    return {
      ...raw,
      id: raw.id || `SYM_${raw.symbol_id || raw.securityId || raw.symbolId || Date.now()}`,
      name: raw.name || raw.symbol_name || raw.symbolName || 'UNKNOWN',
      index,
      optionType: raw.optionType || raw.option_type || 'CE',
      transactionType: raw.transactionType || raw.transaction_type || 'BUY',
      exchangeSegment: raw.exchangeSegment || raw.exchange_segment || (index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO'),
      productType: raw.productType || raw.product_type || 'INTRADAY',
      orderType: raw.orderType || raw.order_type || 'MARKET',
      validity: raw.validity || 'DAY',
      securityId: String(raw.securityId || raw.symbol_id || raw.symbolId || ''),
      quantity: raw.quantity || raw.lotSize || raw.lot_size || 1,
      disclosedQuantity: raw.disclosedQuantity ?? 0,
      price: raw.price ?? 0,
      triggerPrice: raw.triggerPrice ?? 0,
      afterMarketOrder,
      amoTime: afterMarketOrder ? (raw.amoTime || 'OPEN') : undefined,
      boProfitValue: raw.boProfitValue ?? 0,
      boStopLossValue: raw.boStopLossValue ?? 0,
      targetAmount: raw.targetAmount ?? 3000,
      stopLossAmount: raw.stopLossAmount ?? 2000,
      trailingEnabled: raw.trailingEnabled ?? false,
      trailingActivationAmount: raw.trailingActivationAmount ?? 0,
      targetJumpAmount: raw.targetJumpAmount ?? 0,
      stopLossJumpAmount: raw.stopLossJumpAmount ?? 0,
      currentTarget: raw.currentTarget ?? raw.targetAmount ?? 3000,
      currentStopLoss: raw.currentStopLoss ?? raw.stopLossAmount ?? 2000,
      trailingActivated: raw.trailingActivated ?? false,
      active: raw.active ?? true
    } as TradingSymbol;
  };

  const applyTradingSymbols = (symbolsInput: TradingSymbol[]) => {
    let corrected = false;
    const symbols = symbolsInput.map((symbol: TradingSymbol) => {
      const fixed = { ...symbol };
      if (symbol.exchangeSegment === 'NSE') {
        fixed.exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        corrected = true;
      } else if (symbol.exchangeSegment === 'BSE') {
        fixed.exchangeSegment = 'BSE_FNO';
        corrected = true;
      } else if (!symbol.exchangeSegment || symbol.exchangeSegment.trim() === '') {
        fixed.exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        corrected = true;
      }
      if ((fixed.exchangeSegment === 'NSE_FNO' || fixed.exchangeSegment === 'BSE_FNO') && (symbol.productType === 'CNC' || symbol.productType === 'MTF')) {
        fixed.productType = 'INTRADAY';
        corrected = true;
      }
      return fixed;
    });

    localStorage.setItem('trading_symbols', JSON.stringify(symbols));
    const activeSymbols = symbols.filter((s: TradingSymbol) => s.active).map((s: TradingSymbol) => ({
      ...s,
      orderType: s.orderType || 'MARKET',
      productType: s.productType || 'INTRADAY',
      validity: s.validity || 'DAY',
      price: s.price || 0,
      triggerPrice: s.triggerPrice || 0,
      disclosedQuantity: s.disclosedQuantity || 0,
      afterMarketOrder: s.afterMarketOrder || false,
      amoTime: (s.afterMarketOrder && s.amoTime) ? s.amoTime : undefined
    }));

    if (corrected) {
      console.log(`💾 Auto-saving ${symbols.length} corrected symbols to localStorage...`);
    }

    setTradingSymbols(activeSymbols);
    symbolsLoadedRef.current = true;
  };

  const loadSymbols = async () => {
    try {
      console.log('🔄 Loading symbols from backend API...');
      const freshToken = await getFreshAccessToken();

      const userSymbolsResponse = await fetchWithAuth(`${serverUrl}/symbols/get`, {
        headers: { Authorization: `Bearer ${freshToken}` }
      });

      if (userSymbolsResponse.ok) {
        const userSymbolsData = await userSymbolsResponse.json();
        const dbSymbols = (userSymbolsData.symbols || []).map((entry: any) => normalizeTradingSymbol(entry));
        if (dbSymbols.length > 0) {
          console.log(`✅ Loaded ${dbSymbols.length} user symbols from database`);
          applyTradingSymbols(dbSymbols);
          return;
        }
      }

      const instrumentService = createInstrumentService(serverUrl, freshToken);
      try {
        const allInstruments = await instrumentService.fetchAllInstruments();
        if (allInstruments.length > 0) {
          const symbols = instrumentService.convertToTradingSymbols(allInstruments);
          saveTradingSymbolsToLocalStorage(symbols);
          applyTradingSymbols(symbols);
          console.log(`✅ Loaded ${symbols.length} symbols from backend API`);
          return;
        }
      } catch (apiError) {
        console.warn('⚠️ Backend API unavailable, falling back to localStorage');
      }

      const stored = localStorage.getItem('trading_symbols');
      if (stored) {
        applyTradingSymbols(JSON.parse(stored).map((entry: any) => normalizeTradingSymbol(entry)));
      } else {
        console.log(`📭 No symbols found in localStorage`);
      }
    } catch (error) {
      console.error('Failed to load symbols:', error);
    }
  };

  const loadDhanClientId = async () => {
    try {
      // ⚡ FIRST: Try to load from localStorage as a fallback
      const storedClientId = localStorage.getItem('dhan_client_id');
      if (storedClientId) {
        console.log('✅ Dhan Client ID loaded from localStorage:', storedClientId);
        setDhanClientId(storedClientId);
      }
      
      // ⚡ THEN: Try to fetch fresh data from server
      const freshToken = await getFreshAccessToken();
      const response = await fetch(`${serverUrl}/api-credentials`, {
        headers: { Authorization: `Bearer ${freshToken}` }
      });
      
      if (!response.ok) {
        console.error(`❌ Failed to fetch credentials: ${response.status} ${response.statusText}`);
        if (storedClientId) {
          console.log('⚡ Using localStorage fallback:', storedClientId);
        } else {
          console.error('❌ NO FALLBACK AVAILABLE - Client ID not set!');
        }
        return;
      }
      
      const data = await response.json();
      if (data.credentials?.dhanClientId) {
        setDhanClientId(data.credentials.dhanClientId);
        // ⚡ Save to localStorage for future fallback
        localStorage.setItem('dhan_client_id', data.credentials.dhanClientId);
        console.log('✅ Dhan Client ID loaded from server:', data.credentials.dhanClientId);
      } else if (!storedClientId) {
        console.error('❌ No dhanClientId in API response and no localStorage fallback!');
      }
    } catch (error) {
      console.error('Failed to load Dhan Client ID:', error);
      // ⚡ Try localStorage one more time on error
      const storedClientId = localStorage.getItem('dhan_client_id');
      if (storedClientId && !dhanClientId) {
        console.log('⚡ Using localStorage fallback after error:', storedClientId);
        setDhanClientId(storedClientId);
      }
    }
  };

  // ⚡⚡⚡ NEW: LOAD EXISTING POSITIONS FROM DHAN ON MOUNT ⚡⚡⚡
  const loadExistingPositions = async () => {
    try {
      console.log('🔍 Loading existing positions from Dhan...');
      const freshToken = await getFreshAccessToken();
      const livePositionsUrl = userIdRef.current
        ? `${serverUrl}/live-positions?userId=${encodeURIComponent(userIdRef.current)}`
        : `${serverUrl}/live-positions`;
      const response = await fetch(livePositionsUrl, {
        headers: { Authorization: `Bearer ${freshToken}` }
      });
      
      if (!response.ok) {
        console.log(`⚠️ Failed to fetch positions: ${response.statusText}`);
        return;
      }
      
      const data = await response.json();
      console.log('📊 Positions response:', data);
      
      if (data.positions && Array.isArray(data.positions)) {
        // ⚡⚡⚡ CRITICAL FIX: Filter for OPEN positions ONLY (netQty > 0)
        // Closed positions have netQty = 0 but may have buyQty/sellQty > 0 (historical data)
        // We MUST only check netQty to avoid showing closed positions!
        const openPositions = data.positions.filter((p: any) => {
          const netQty = typeof p.netQty === 'string' ? parseInt(p.netQty, 10) : (p.netQty || 0);
          const isOpen = Math.abs(netQty) > 0;
          
          if (!isOpen && netQty === 0) {
            console.log(`⏭️ Skipping CLOSED position: ${p.tradingSymbol} (netQty=0)`);
          }
          
          return isOpen;
        });
        
        console.log(`✅ Found ${openPositions.length} OPEN positions (netQty > 0) out of ${data.positions.length} total`);
        
        if (openPositions.length > 0) {
          // ⚡ LOAD POSITION METADATA FROM LOCALSTORAGE
          let positionMetadata: any = {};
          try {
            positionMetadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
            console.log(`📂 LOADED Position Metadata from localStorage:`, positionMetadata);
          } catch (err) {
            console.error('Failed to load position metadata:', err);
          }
          
          // Convert Dhan positions to our ActivePosition format
          const convertedPositions: ActivePosition[] = openPositions.map((p: any) => {
            // Determine option type from trading symbol (CE/PE)
            const optionType = p.tradingSymbol?.includes('CE') ? 'CE' : 
                              p.tradingSymbol?.includes('PE') ? 'PE' : 'CE';
            
            // Calculate P&L
            const buyAvg = p.buyAvg || 0;
            const sellAvg = p.sellAvg || 0;
            const netQty = p.netQty || 0;
            const currentPrice = p.lastPrice || sellAvg || buyAvg;
            const entryPrice = buyAvg || sellAvg;
            
            // P&L = (Current Price - Entry Price) * Quantity
            const pnl = (currentPrice - entryPrice) * Math.abs(netQty);
            
            // ⚡ RETRIEVE SAVED METADATA OR USE DYNAMIC CALCULATION
            const orderId = getDetectedPositionOrderId(p);
            const positionIndex = detectPositionIndex(p);
            const savedMeta = positionMetadata[orderId];
            
            // 🔥 FIX: Use saved metadata if available, otherwise calculate from Symbol config or use DYNAMIC values
            let targetAmount = 3000;  // Default fallback (was 500)
            let stopLossAmount = 2000;  // Default fallback (was 300)
            let currentTarget = undefined;
            let currentStopLoss = undefined;
            let trailingEnabled = false;
            let trailingActivationAmount = 0;
            let targetJumpAmount = 0;
            let stopLossJumpAmount = 0;
            let trailingActivated = false;
            let highestPnL = 0;
            
            if (savedMeta) {
              // Use saved metadata (BEST - has exact values from when trade was executed)
              targetAmount = savedMeta.targetAmount;
              stopLossAmount = savedMeta.stopLossAmount;
              currentTarget = savedMeta.currentTarget;
              currentStopLoss = savedMeta.currentStopLoss;
              trailingEnabled = savedMeta.trailingEnabled;
              trailingActivationAmount = savedMeta.trailingActivationAmount;
              targetJumpAmount = savedMeta.targetJumpAmount;
              stopLossJumpAmount = savedMeta.stopLossJumpAmount;
              trailingActivated = savedMeta.trailingActivated;
              highestPnL = savedMeta.highestPnL;
              console.log(`✅ RESTORED Position ${orderId} from saved metadata:`, { targetAmount, stopLossAmount });
            } else {
              // Try to find matching symbol configuration
              const matchingSymbol = symbols.find(s => 
                s.name === p.tradingSymbol || 
                (s.securityId === p.securityId && s.securityId)
              );
              
              if (matchingSymbol) {
                targetAmount = matchingSymbol.targetAmount;
                stopLossAmount = matchingSymbol.stopLossAmount;
                currentTarget = matchingSymbol.targetAmount;
                currentStopLoss = matchingSymbol.stopLossAmount;
                trailingEnabled = matchingSymbol.trailingEnabled || false;
                trailingActivationAmount = matchingSymbol.trailingActivationAmount || 0;
                targetJumpAmount = matchingSymbol.targetJumpAmount || 0;
                stopLossJumpAmount = matchingSymbol.stopLossJumpAmount || 0;
                console.log(`✅ MATCHED Symbol config for ${orderId}:`, { targetAmount, stopLossAmount });
              } else {
                console.warn(`⚠️ NO METADATA found for ${orderId} (${p.tradingSymbol}) - using defaults`);
              }
            }
            
            return {
              symbolId: p.securityId || orderId,
              orderId: orderId,
              symbolName: p.tradingSymbol || 'Unknown',
              securityId: p.securityId || '',
              optionType: optionType as 'CE' | 'PE',
              entryPrice: entryPrice,
              currentPrice: currentPrice,
              quantity: Math.abs(netQty),
              targetAmount: targetAmount,
              stopLossAmount: stopLossAmount,
              currentTarget: currentTarget,
              currentStopLoss: currentStopLoss,
              trailingEnabled: trailingEnabled,
              trailingActivationAmount: trailingActivationAmount,
              targetJumpAmount: targetJumpAmount,
              stopLossJumpAmount: stopLossJumpAmount,
              trailingActivated: trailingActivated,
              highestPnL: highestPnL,
              pnl: pnl,
              entryTime: Date.now(), // We don't have actual entry time from Dhan
              index: positionIndex,
              status: 'ACTIVE',
              productType: 'INTRADAY', // ⚡ Default for F&O positions
              exchangeSegment: 'NSE_FNO' // ⚡ Default for F&O
            };
          });
          
          setActivePositions(convertedPositions);
          activePositionsRef.current = convertedPositions;
          ensureMonitoringStatusInitialized(convertedPositions);
          setIsPositionMonitorActive(true);
          isPositionMonitorActiveRef.current = true;
          ensurePositionMonitorLoop();
          
          console.log(`✅ Loaded and initialized monitoring for ${convertedPositions.length} existing positions`);
          
          // Start monitoring immediately
          setTimeout(() => {
            monitorPositions().catch(err => console.error('Error in initial monitoring:', err));
          }, 1000);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load existing positions:', error);
    }
  };

  // ============ MARKET STATUS (IST) ============
  const updateMarketStatus = () => {
    const now = new Date();
    const day = now.getDay();
    
    // ⚡ FORCE START OVERRIDE: If enabled, treat weekend as OPEN
    if (forceStartEnabled && (day === 0 || day === 6)) {
      // Convert to IST (UTC+5:30) - Create new Date object with IST offset
      const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const istHours = istTime.getUTCHours();
      const istMinutes = istTime.getUTCMinutes();
      const totalMinutes = (istHours * 60) + istMinutes;
      
      // Check if within trading hours even on weekend
      if (totalMinutes >= 540 && totalMinutes < 930) {
        setMarketStatus('OPEN');
        console.log('⚡ FORCE START ENABLED - Weekend market treated as OPEN');
        return;
      }
    }
    
    // Weekend check (normal mode)
    if (day === 0 || day === 6) {
      setMarketStatus('WEEKEND');
      return;
    }

    // Convert to IST (UTC+5:30) - Create new Date object with IST offset
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const istHours = istTime.getUTCHours();
    const istMinutes = istTime.getUTCMinutes();
    const totalMinutes = (istHours * 60) + istMinutes;
    
    // Market hours: 9:00 AM (540 min) to 3:30 PM (930 min)
    if (totalMinutes >= 540 && totalMinutes < 930) {
      setMarketStatus('OPEN');
    } else {
      setMarketStatus('CLOSED');
    }
  };

  // ============ CALCULATE NEXT CANDLE CLOSE TIME ============
  const updateNextCandleTime = () => {
    const now = new Date();
    
    // Convert to IST
    const istHours = now.getUTCHours() + 5;
    const istMinutes = now.getUTCMinutes() + 30;
    
    // Adjust for overflow
    let adjustedHours = istHours;
    let adjustedMinutes = istMinutes;
    if (adjustedMinutes >= 60) {
      adjustedHours += 1;
      adjustedMinutes -= 60;
    }
    if (adjustedHours >= 24) {
      adjustedHours -= 24;
    }
    
    // Minutes since market open (9:00 AM)
    const minutesSinceOpen = (adjustedHours - 9) * 60 + adjustedMinutes;
    
    if (minutesSinceOpen < 0 || minutesSinceOpen >= 390) {
      setNextCandleClose('Market Closed');
      setSecondsToCandle(0);
      return;
    }
    
    // Calculate next candle close
    const interval = parseInt(candleIntervalRef.current); // ⚡ Use ref to get latest value
    const currentInterval = Math.floor(minutesSinceOpen / interval);
    const nextIntervalEnd = (currentInterval + 1) * interval;
    
    // Calculate exact close time
    const closeMinutes = 540 + nextIntervalEnd; // 540 = 9:00 AM in minutes
    const closeHour = Math.floor(closeMinutes / 60);
    const closeMin = closeMinutes % 60;
    
    setNextCandleClose(`${closeHour.toString().padStart(2, '0')}:${closeMin.toString().padStart(2, '0')}`);
    
    // Calculate seconds remaining
    const currentSecond = now.getUTCSeconds();
    const secondsSinceOpen = minutesSinceOpen * 60 + currentSecond;
    const secondsToNextClose = (nextIntervalEnd * 60) - secondsSinceOpen;
    const secondsRemaining = secondsToNextClose > 0 ? secondsToNextClose : 0;
    setSecondsToCandle(secondsRemaining);
    
    // 🔊 PLAY 20-SECOND WARNING SOUND (once per candle)
    if (secondsRemaining === 20 && !preSignalSoundPlayed) {
      notifyPreSignalWarning();
      setPreSignalSoundPlayed(true);
      console.log('⚠️ 20-SECOND WARNING: Signal will be generated in 20 seconds!');
    }
    
    // Reset flag when new candle starts
    if (secondsRemaining > 20) {
      setPreSignalSoundPlayed(false);
    }
  };

  // ============ UTILITY FUNCTIONS ============

  // ============ ENGINE CONTROL ============
  const handleStartEngine = async (isAutoRestart = false) => {
    console.log('\n🔘 ============ START ENGINE CLICKED ============');
    console.log(`⚡ Type: ${isAutoRestart ? 'AUTO-RESTART' : 'MANUAL START'}`);
    console.log(`⚡ SELECTED TIMEFRAME: ${candleInterval}M`);
    console.log(`📊 Market Status: ${marketStatus}`);
    console.log(`📈 Trading Symbols: ${tradingSymbols.length}`);
    
    // ⚡⚡⚡ CHECK 1: Market Must Be OPEN (SKIP FOR AUTO-RESTART) ⚡⚡⚡
    if (marketStatus !== 'OPEN' && !isAutoRestart) {
      // ⚡ If Force Start is enabled, show warning but allow
      if (forceStartEnabled) {
        const confirmForceStart = confirm(
          `⚠️ FORCE START MODE ENABLED\n\n` +
          `Market Status: ${marketStatus}\n` +
          `Normal Market Hours: 9:00 AM to 3:30 PM IST (Mon-Fri)\n\n` +
          `You have enabled "Force Start" mode for special trading sessions.\n\n` +
          `⚠️ WARNING: This is for SPECIAL SESSIONS ONLY (weekends/holidays with market open)\n` +
          `⚠️ Make sure the market is actually OPEN before proceeding!\n\n` +
          `Do you want to FORCE START the engine?`
        );
        
        if (!confirmForceStart) {
          console.log('❌ User cancelled force start');
          return;
        }
        
        console.log('⚡ FORCE START CONFIRMED - Starting engine despite market status');
        onLog({
          timestamp: Date.now(),
          type: 'WARNING',
          message: `⚡ FORCE START: Engine started in ${marketStatus} mode (Special Session)`
        });
        // Continue to next checks...
      } else {
        // Normal mode - block start
        const errorMsg = marketStatus === 'WEEKEND' 
          ? '🚫 Cannot start engine: Market is CLOSED (Weekend)\n\n💡 TIP: Enable "Force Start" toggle for special weekend sessions'
          : '🚫 Cannot start engine: Market is CLOSED';
        
        console.error(`\n❌ ${errorMsg}`);
        console.error(`  - Market Status: ${marketStatus}`);
        console.error(`  - Market Hours: 9:00 AM to 3:30 PM IST (Mon-Fri)`);
        console.error(`  - Please wait for market to OPEN before starting engine\n`);
        
        alert(`${errorMsg}\n\nMarket Hours: 9:00 AM to 3:30 PM IST (Mon-Fri)\n\nPlease start the engine after market opens.`);
        
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `${errorMsg} - Market hours: 9:00 AM to 3:30 PM IST`
        });
        return;
      }
    } else if (isAutoRestart) {
      console.log('✅ AUTO-RESTART: Skipping market hours check (was previously running)');
      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: `🔄 AUTO-RESTART: Market status is ${marketStatus} - Starting anyway (engine was running before page refresh)`
      });
    }
    
    // ⚡⚡⚡ CHECK 2: Symbols Must Be Configured ⚡⚡⚡
    if (tradingSymbols.length === 0) {
      alert('No trading symbols configured! Please add symbols first.');
      onLog({
        timestamp: Date.now(),
        type: 'WARNING',
        message: '⚠️ No trading symbols configured'
      });
      return;
    }

    // ⚡⚡⚡ CHECK 3: Validate Both CE and PE Symbols Exist ⚡⚡⚡
    const ceSymbols = tradingSymbols.filter(s => s.optionType === 'CE' && s.transactionType === 'BUY' && s.active);
    const peSymbols = tradingSymbols.filter(s => s.optionType === 'PE' && s.transactionType === 'BUY' && s.active);
    
    if (ceSymbols.length === 0 || peSymbols.length === 0) {
      const missing = [];
      if (ceSymbols.length === 0) missing.push('CE (Call)');
      if (peSymbols.length === 0) missing.push('PE (Put)');
      
      const errorMsg = `⚠️ INCOMPLETE SYMBOL SETUP!\n\nMissing: ${missing.join(' and ')} BUY symbols\n\n` +
                      `Engine needs BOTH:\n` +
                      `✅ 1 CE (Call) symbol with Transaction=BUY and ACTIVE\n` +
                      `✅ 1 PE (Put) symbol with Transaction=BUY and ACTIVE\n\n` +
                      `Current Status:\n` +
                      `CE symbols: ${ceSymbols.length}\n` +
                      `PE symbols: ${peSymbols.length}\n\n` +
                      `→ Go to Symbols tab and activate missing symbols!`;
      
      alert(errorMsg);
      console.error('❌ ' + errorMsg);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Missing ${missing.join(' & ')} symbols - Go to Symbols tab and activate them!`
      });
      return;
    }
    
    // ⚡⚡⚡ CHECK 4: Warn User About Active Symbols Before Starting ⚡⚡⚡
    console.log(`\n🔍 ============ ACTIVE SYMBOLS CHECK ============`);
    console.log(`📊 Active CE Symbols: ${ceSymbols.length}`);
    ceSymbols.forEach(s => console.log(`   ✅ ${s.name} (Security ID: ${s.securityId})`));
    console.log(`📊 Active PE Symbols: ${peSymbols.length}`);
    peSymbols.forEach(s => console.log(`   ✅ ${s.name} (Security ID: ${s.securityId})`));
    console.log(`================================================\n`);
    
    // ⚡ Show confirmation dialog with current symbols (SKIP FOR AUTO-RESTART)
    if (!isAutoRestart) {
      const symbolsList = [
        ...ceSymbols.map(s => `• ${s.name} (${s.optionType})`),
        ...peSymbols.map(s => `• ${s.name} (${s.optionType})`)
      ].join('\n');
      
      const confirmStart = confirm(
        `🚀 START AI TRADING ENGINE?\n\n` +
        `Active Symbols:\n${symbolsList}\n\n` +
        `⚠️ IMPORTANT: AI will execute trades AUTOMATICALLY for these symbols!\n\n` +
        `✅ Click OK if these are the CORRECT symbols for TODAY\n` +
        `❌ Click Cancel to change symbols in Symbols tab`
      );
      
      if (!confirmStart) {
        console.log('❌ User cancelled engine start - Going to check/change symbols');
        onLog({
          timestamp: Date.now(),
          type: 'INFO',
          message: '❌ Engine start cancelled - User wants to verify symbols first'
        });
        return;
      }
    } else {
      console.log('✅ AUTO-RESTART: Skipping symbol confirmation (already confirmed)');
    }

    // ⚡ CRITICAL: Validate timeframe selection
    if (!candleInterval || (candleInterval !== '5' && candleInterval !== '15')) {
      console.error(`❌ INVALID TIMEFRAME: ${candleInterval}`);
      alert(`Invalid timeframe selected: ${candleInterval}M. Please select 5M or 15M.`);
      return;
    }

    // ⚡⚡⚡ RESET LAST PROCESSED CANDLE ON START (Only on manual start!)
    console.log(`🔄 RESETTING lastProcessedCandle (was: ${lastProcessedCandle}, ref: ${lastProcessedCandleRef.current})`);
    setLastProcessedCandle('');
    lastProcessedCandleRef.current = ''; // ⚡ CRITICAL: Reset ref too!
    lastAIRequestTimeRef.current = 0; // ⚡ CRITICAL: Reset rate limit timer!
    processedCandlesRef.current.clear(); // Clear all processed candles
    console.log(`✅ Reset complete - fresh start for ${candleInterval}M candles`);
    
    setIsRunning(true);
    isRunningRef.current = true;
    isPositionMonitorActiveRef.current = isPositionMonitorActive; // ⚡ SYNC REF WITH STATE
    localStorage.setItem('engine_running', 'true'); // ⚡ PERSIST STATE (LOCAL)
    localStorage.setItem('engine_interval', candleInterval); // ⚡ PERSIST INTERVAL (LOCAL)
    
    // ⚡⚡⚡ CRITICAL: Clear MANUAL STOP flag (allow auto-restart on page refresh) ⚡⚡⚡
    localStorage.removeItem('engine_manual_stop');
    console.log('✅ Manual stop flag CLEARED - engine will auto-restart on page refresh');
    
    // 🔊 PLAY ENGINE START SOUND
    notifyEngineStart();
    
    // ⚡⚡⚡ NEW: SAVE TO BACKEND FOR MULTI-DEVICE SYNC ⚡⚡⚡
    await saveEngineState(true, candleInterval);
    
    onLog({
      timestamp: Date.now(),
      type: 'ENGINE_START',
      message: `🚀 AI Trading Engine STARTED | ${candleInterval}M Candles | ${tradingSymbols.length} symbols active | 📱 Synced across all devices`
    });

    console.log(`\n✅✅✅ ENGINE STARTED ✅✅✅`);
    console.log(`⚡ TIMEFRAME: ${candleInterval}M (This will be used for ALL AI requests)`);
    console.log(`🔥 Checking every 1 second - Will send to AI ONLY when ${candleInterval}M candle closes`);
    console.log(`📊 Position Monitoring: Every 1 second with same ${candleInterval}M timeframe`);
    console.log(`⚠️ RESET: lastProcessedCandle cleared for fresh start\n`);

    // Clear any existing timers
    if (engineTimerRef.current) {
      clearInterval(engineTimerRef.current);
    }
    clearPositionMonitorLoop();

    ensurePositionMonitorLoop();
    console.log(`☁️ Backend engine started - UI will wait for backend candle-close processing.`);
    await syncEngineState();
  };

  const handleStopEngine = () => {
    stopEngine(true);
    hasAutoRestartedRef.current = false; // ⚡ RESET auto-restart flag so it can restart again
    
    // ⚡ Reset log flag to show "stopped" message once
    (window as any).__engineStoppedLogged = false;
    
    // ⚡⚡⚡ CRITICAL: Mark as MANUAL STOP (prevents auto-restart on page refresh) ⚡⚡⚡
    localStorage.setItem('engine_manual_stop', 'true');
    console.log('🛑 Engine stopped MANUALLY by user - auto-restart DISABLED until next manual start');
    
    // 🔊 PLAY ENGINE STOP SOUND
    notifyEngineStop();
    
    onLog({
      timestamp: Date.now(),
      type: 'ENGINE_STOP',
      message: '⏸️ Engine STOPPED by user | 📱 Synced across all devices'
    });
  };

  const stopEngine = async (syncBackend = true) => {
    console.log('\n🛑🛑🛑 ========== ENGINE STOPPING ========== 🛑🛑🛑');
    
    setIsRunning(false);
    isRunningRef.current = false;
    localStorage.setItem('engine_running', 'false'); // ⚡ PERSIST STATE (LOCAL)
    
    console.log('✅ Engine state set to: STOPPED');
    console.log('✅ isRunningRef.current =', isRunningRef.current);
    
    if (syncBackend) {
      await saveEngineState(false, candleInterval);
    }
    
    if (engineTimerRef.current) {
      clearInterval(engineTimerRef.current);
      engineTimerRef.current = null;
      console.log('✅ Signal detection interval CLEARED');
    }
    
    console.log('📡 Position monitor loop kept alive for independent position management');
    
    console.log('🛑 ENGINE FULLY STOPPED - No background signal detection');
    console.log('========================================\n');
    
    // ⚡⚡⚡ CRITICAL: DO NOT clear positions when stopping engine!
    // Positions should persist even when engine is stopped
    // They will only be removed when actually closed via Dhan API
    // This prevents users from losing track of their open positions
    
    // ⚡ Clear exiting positions tracking (fresh start on restart)
    exitingPositionsRef.current.clear();
    exitFailureCountRef.current.clear(); // ⚡⚡⚡ NEW: Clear all failure counters
    console.log('🔓 Cleared all exit locks and failure counters (engine stopped)');
    
    isProcessingRef.current = false;
  };

  // ============ STOP POSITION MONITOR ============
  const stopPositionMonitor = () => {
    setIsPositionMonitorActive(false);
    isPositionMonitorActiveRef.current = false; // ⚡ UPDATE REF IMMEDIATELY
    
    // ⚡ DON'T clear the interval - just let it check the ref and return early
    // This way we don't need to restart it when enabling again
    
    // Clear all exit locks and failure counters
    exitingPositionsRef.current.clear();
    exitFailureCountRef.current.clear(); // ⚡⚡⚡ NEW: Clear all failure counters
    console.log('🛑 Position Monitor STOPPED - No positions will be auto-exited. Failure counters cleared.');
    
    onLog({
      timestamp: Date.now(),
      type: 'INFO',
      message: '🛑 Position Monitor STOPPED - Auto-exit disabled'
    });
  };

  // ============ START POSITION MONITOR ============
  const startPositionMonitor = () => {
    setIsPositionMonitorActive(true);
    isPositionMonitorActiveRef.current = true; // ⚡ UPDATE REF IMMEDIATELY
    ensurePositionMonitorLoop();
    
    if (activePositionsRef.current.length > 0) {
      monitorPositions().catch(err => console.error('Manual monitor start error:', err));
    }
    
    // ⚡ The interval is still running - it will now start monitoring again
    
    console.log('✅ Position Monitor STARTED - Positions will be auto-monitored');
    
    onLog({
      timestamp: Date.now(),
      type: 'INFO',
      message: '✅ Position Monitor STARTED - Auto-exit enabled'
    });
  };

  // ============ FORCE CHECK & AUTO-DETECT POSITIONS ============
  const forceCheckPositions = async () => {
    console.log('🔥 FORCE POSITION CHECK - Fetching positions from Dhan...');
    try {
      const trackedPositions = activePositionsRef.current;
      const freshToken = await getFreshAccessToken();
      const positionsUrl = userIdRef.current
        ? `${serverUrl}/positions?userId=${encodeURIComponent(userIdRef.current)}`
        : `${serverUrl}/positions`;
      const positionsResponse = await fetch(positionsUrl, {
        headers: { Authorization: `Bearer ${freshToken}` }
      });
      const positionsData = await positionsResponse.json();

      if (!positionsData.success || !positionsData.positions) {
        console.log('⚠️ Could not fetch positions from Dhan');
        return { found: false, count: 0 };
      }

      const dhanPositions = positionsData.positions;
      let positionMetadata: any = {};

      try {
        positionMetadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
      } catch (metadataError) {
        console.error('❌ Failed to parse position metadata:', metadataError);
      }

      // Filter for open positions (netQty != 0)
      const openPositions = dhanPositions.filter((p: any) => {
        const netQty = p.netQty ?? p.buyQty - p.sellQty;
        return Math.abs(netQty) > 0;
      });

      console.log(`📊 Dhan API: ${dhanPositions.length} total, ${openPositions.length} open positions`);

      if (openPositions.length > 0) {
        // Convert ALL Dhan positions to active positions format
        const convertedPositions = openPositions.map((p: any) => {
          const netQty = p.netQty ?? p.buyQty - p.sellQty;
          const entryPrice = parseFloat(p.buyAvg || p.costPrice || p.averagePrice || 0);
          const currentPrice = parseFloat(p.lastPrice || p.ltp || p.lastTradedPrice || p.dayBuyValue / (p.buyQty || 1) || 0);
          const pnl = parseFloat(p.unrealizedProfit || p.unrealizedPnl || p.pnl || p.realizedProfit || ((currentPrice - entryPrice) * Math.abs(netQty)));
          const orderId = getDetectedPositionOrderId(p);
          const optionType = (p.tradingSymbol || '').includes('PE') ? 'PE' : 'CE';
          const positionIndex = detectPositionIndex(p);
          const savedMeta = positionMetadata[orderId];

          // Try to load metadata from localStorage
          let targetAmount = 3000, stopLossAmount = 2000;
          let trailingEnabled = false, trailingActivationAmount = 0;
          let targetJumpAmount = 0, stopLossJumpAmount = 0;
          let currentTarget = targetAmount, currentStopLoss = stopLossAmount;
          let trailingActivated = false;
          let highestPnL = pnl > 0 ? pnl : 0;

          if (savedMeta) {
            targetAmount = savedMeta.targetAmount || targetAmount;
            stopLossAmount = savedMeta.stopLossAmount || stopLossAmount;
            trailingEnabled = savedMeta.trailingEnabled || false;
            trailingActivationAmount = savedMeta.trailingActivationAmount || 0;
            targetJumpAmount = savedMeta.targetJumpAmount || 0;
            stopLossJumpAmount = savedMeta.stopLossJumpAmount || 0;
            currentTarget = savedMeta.currentTarget || targetAmount;
            currentStopLoss = savedMeta.currentStopLoss || stopLossAmount;
            trailingActivated = savedMeta.trailingActivated || false;
            highestPnL = savedMeta.highestPnL ?? highestPnL;
          }

          return {
            symbolId: p.securityId || orderId,
            orderId, symbolName: p.tradingSymbol || 'Unknown', securityId: p.securityId || '',
            optionType: optionType as 'CE' | 'PE', entryPrice, currentPrice,
            quantity: Math.abs(netQty), targetAmount, stopLossAmount,
            currentTarget, currentStopLoss,
            trailingEnabled, trailingActivationAmount, targetJumpAmount, stopLossJumpAmount,
            trailingActivated, highestPnL, pnl,
            entryTime: Date.now(), index: positionIndex, status: 'ACTIVE' as const,
            productType: p.productType || p.product || 'INTRADAY',
            exchangeSegment: p.exchangeSegment || (positionIndex === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO')
          };
        });

        // ⚡ MERGE: Find new positions not already tracked (by orderId)
        const trackedOrderIds = new Set(trackedPositions.map(t => t.orderId));
        const newPositions = convertedPositions.filter(p => !trackedOrderIds.has(p.orderId));

        if (newPositions.length > 0) {
          console.log(`🆕 Found ${newPositions.length} NEW position(s) not yet tracked:`);
          newPositions.forEach(p => console.log(`   → ${p.symbolName} (${p.orderId})`));

          const merged = [...trackedPositions, ...newPositions];
          setActivePositions(merged);
          activePositionsRef.current = merged;
          ensureMonitoringStatusInitialized(merged);
        } else {
          console.log(`✅ All ${convertedPositions.length} Dhan positions already tracked`);
          ensureMonitoringStatusInitialized(trackedPositions);
        }

        // Ensure monitor is active for all positions
        setIsPositionMonitorActive(true);
        isPositionMonitorActiveRef.current = true;
        ensurePositionMonitorLoop();

        if (newPositions.length > 0 || trackedPositions.length === 0) {
          setTimeout(() => {
            monitorPositions().catch(err => console.error('Auto-monitor error:', err));
          }, 1000);
        }

        const totalCount = trackedPositions.length + newPositions.length;
        return { found: true, count: totalCount };
      }

      return { found: false, count: 0 };
    } catch (error) {
      console.error('❌ Force check positions error:', error);
      return { found: false, count: 0 };
    }
  };

  // ⚡ AUTO-CHECK: Every 60 seconds, check for new positions and auto-start monitoring
  // Works regardless of engine running state - ensures positions are always detected
  useEffect(() => {
    console.log('☁️ Backend engine handles position discovery - local auto-check disabled.');
    return () => {
      if (autoPositionCheckRef.current) {
        clearInterval(autoPositionCheckRef.current);
      }
    };
  }, []);

  // ============ EDIT POSITION TARGET/STOPLOSS ============
  const startEditPosition = (orderId: string, currentTarget: number, currentStopLoss: number) => {
    setEditingPosition(orderId);
    setEditValues({
      target: currentTarget.toString(),
      stopLoss: currentStopLoss.toString()
    });
  };

  const cancelEditPosition = () => {
    setEditingPosition(null);
    setEditValues({ target: '', stopLoss: '' });
  };

  const saveEditPosition = async () => {
    if (!editingPosition) return;
    
    const newTarget = parseFloat(editValues.target);
    const newStopLoss = parseFloat(editValues.stopLoss);
    
    if (isNaN(newTarget) || isNaN(newStopLoss)) {
      alert('Please enter valid numbers for Target and Stop Loss');
      return;
    }
    
    // ⚡ NO VALIDATION - Allow any values!
    // With trailing stop-loss, SL can be positive (profit locked)
    // User should have full control to set any target/SL values
    
    // Find the position to get symbol name for logging
    const position = activePositions.find(p => p.orderId === editingPosition);
    
    // Update the position in activePositions
    setActivePositions(prev =>
      prev.map(p => p.orderId === editingPosition ? {
        ...p,
        currentTarget: newTarget,
        currentStopLoss: newStopLoss
      } : p)
    );
    
    // ⚡ UPDATE POSITION METADATA IN LOCALSTORAGE
    try {
      const metadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
      if (metadata[editingPosition]) {
        metadata[editingPosition].currentTarget = newTarget;
        metadata[editingPosition].currentStopLoss = newStopLoss;
        localStorage.setItem('position_metadata', JSON.stringify(metadata));
        console.log(`💾 UPDATED Position Metadata for ${editingPosition} (manual edit)`);
      }
    } catch (err) {
      console.error('Failed to update position metadata:', err);
    }
    
    try {
      const freshToken = await getFreshAccessToken();
      await fetch(`${serverUrl}/position-monitor/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({ orderId: editingPosition, targetAmount: newTarget, stopLossAmount: newStopLoss })
      });
      await syncEngineState();
    } catch (error) {
      console.error('Failed to sync edited position to backend:', error);
    }

    console.log(`✏️ Position ${position?.symbolName || editingPosition} updated - New Target: ₹${newTarget}, New SL: ₹${newStopLoss}`);
    
    onLog({
      timestamp: Date.now(),
      type: 'INFO',
      message: `✏️ ${position?.symbolName || 'Position'} updated - Target: ₹${newTarget}, Stop Loss: ₹${newStopLoss}`
    });
    
    setEditingPosition(null);
    setEditValues({ target: '', stopLoss: '' });
  };

  // ============ CHECK CANDLE STATUS (ONLY PROCESS ON CLOSE) ============
  const checkCandleStatus = async () => {
    if (!isRunningRef.current) {
      // ⚡ CRITICAL: Engine is OFF - Do NOT process signals
      // This prevents background signal detection when engine is stopped
      // Log once per stop to avoid spam
      if (!(window as any).__engineStoppedLogged) {
        console.log('⏹️ Signal detection SKIPPED - Engine is STOPPED (isRunningRef.current = false)');
        (window as any).__engineStoppedLogged = true;
      }
      return;
    }
    
    // Reset the log flag when engine is running
    (window as any).__engineStoppedLogged = false;
    
    // ⚡⚡⚡ ATOMIC GLOBAL LOCK: Try to acquire lock (prevents race conditions) ⚡⚡⚡
    // This MUST happen early, before any timing calculations, to prevent the race condition!
    const globalLockKey = 'indexpilot_processing_lock';
    
    // Step 1: Check if there's an existing lock
    const existingLockData = localStorage.getItem(globalLockKey);
    let shouldProcessThisInstance = false;
    
    if (existingLockData) {
      try {
        const { timestamp, instanceId: lockOwnerId } = JSON.parse(existingLockData);
        const age = Date.now() - timestamp;
        
        // Check if WE own the lock (same instance)
        if (lockOwnerId === instanceIdRef.current) {
          shouldProcessThisInstance = true; // We already own the lock
        } else if (age < 30000) {
          // Another instance owns a fresh lock - SKIP
          if (!(window as any).lastGlobalLockWarning || Date.now() - (window as any).lastGlobalLockWarning > 5000) {
            console.log(`🔒 GLOBAL LOCK OWNED BY ANOTHER INSTANCE (${lockOwnerId.substr(0, 15)}...) - Skipping`);
            (window as any).lastGlobalLockWarning = Date.now();
          }
          return; // EXIT - another instance is processing
        } else {
          // Lock is stale (>30s) - we can try to acquire it
          console.log(`🔓 Stale lock detected (${Math.round(age/1000)}s old) - Acquiring new lock`);
          shouldProcessThisInstance = false; // Will try to acquire below
        }
      } catch (e) {
        // Invalid lock data - try to acquire fresh lock
        shouldProcessThisInstance = false;
      }
    } else {
      // No existing lock - we can try to acquire it
      shouldProcessThisInstance = false;
    }
    
    // Step 2: If no lock exists or it's stale, try to acquire it
    if (!shouldProcessThisInstance) {
      // Try to acquire lock by setting our instance ID
      localStorage.setItem(globalLockKey, JSON.stringify({
        timestamp: Date.now(),
        instanceId: instanceIdRef.current
      }));
      
      // Small delay to let other instances also try to set their lock
      await new Promise(resolve => setTimeout(resolve, 5));
      
      // Read back to see if we got the lock
      const finalLockData = localStorage.getItem(globalLockKey);
      if (finalLockData) {
        try {
          const { instanceId: lockOwnerId } = JSON.parse(finalLockData);
          if (lockOwnerId === instanceIdRef.current) {
            shouldProcessThisInstance = true; // We got the lock!
            console.log(`✅ Lock acquired by this instance (${instanceIdRef.current.substr(0, 20)}...)`);
          } else {
            // Someone else got the lock
            console.log(`❌ Lock acquired by another instance (${lockOwnerId.substr(0, 15)}...) - Skipping`);
            return; // EXIT - we lost the race
          }
        } catch (e) {
          // Invalid lock data - skip this cycle
          return;
        }
      }
    }
    
    // If we reached here and shouldProcessThisInstance is false, skip
    if (!shouldProcessThisInstance) {
      return;
    }
    
    if (isProcessingRef.current) {
      // ⚡ DEBUG: Log if stuck processing
      const now = Date.now();
      if (!(window as any).lastProcessingWarning || now - (window as any).lastProcessingWarning > 10000) {
        console.log('⏳ Still processing previous request, waiting...');
        (window as any).lastProcessingWarning = now;
      }
      return;
    }

    // ⚡ UPDATE HEARTBEAT - Engine is alive!
    lastHeartbeatRef.current = Date.now();

    const now = new Date();
    const istHours = now.getUTCHours() + 5;
    const istMinutes = now.getUTCMinutes() + 30;
    
    let adjustedHours = istHours;
    let adjustedMinutes = istMinutes;
    if (adjustedMinutes >= 60) {
      adjustedHours += 1;
      adjustedMinutes -= 60;
    }
    if (adjustedHours >= 24) {
      adjustedHours -= 24;
    }
    
    const currentSecond = now.getUTCSeconds();
    const currentTimeStr = `${adjustedHours.toString().padStart(2, '0')}:${adjustedMinutes.toString().padStart(2, '0')}:${currentSecond.toString().padStart(2, '0')}`;
    const minutesSinceOpen = (adjustedHours - 9) * 60 + adjustedMinutes;
    const interval = parseInt(candleIntervalRef.current); // ⚡⚡⚡ CRITICAL: Use REF to get LATEST value
    
    // ⚡ FIX: Calculate IST time properly
    // FOR TESTING: Allow 24/7
    let effectiveMinutes = minutesSinceOpen < 0 ? adjustedHours * 60 + adjustedMinutes : minutesSinceOpen;
    
    const secondsSinceOpen = effectiveMinutes * 60 + currentSecond;
    const currentInterval = Math.floor(secondsSinceOpen / (interval * 60));
    const nextIntervalEnd = (currentInterval + 1) * interval * 60;
    const candleKey = `${interval}M-${currentInterval}`;
    const secondsToClose = nextIntervalEnd - secondsSinceOpen;
    
    // ⚡⚡⚡ DEBUG: LOG TIMING CALCULATION FOR 15M ⚡⚡⚡
    const isNearClose = secondsToClose <= 10;
    if (isNearClose && currentSecond % 2 === 0) {
      const timeSinceLastAI = Date.now() - lastAIRequestTimeRef.current;
      const minTimeBetween = interval === 5 ? 240000 : 840000;
      const canSendAI = timeSinceLastAI >= minTimeBetween || lastAIRequestTimeRef.current === 0;
      
      console.log(`\n⏰ ============ CANDLE TIMING (${interval}M) ============`);
      console.log(`   Current IST Time: ${currentTimeStr}`);
      console.log(`   Minutes Since Open: ${effectiveMinutes}`);
      console.log(`   Seconds Since Open: ${secondsSinceOpen}`);
      console.log(`   Current Interval #: ${currentInterval}`);
      console.log(`   Next Interval End: ${nextIntervalEnd}s (${Math.floor(nextIntervalEnd/60)}min ${nextIntervalEnd%60}s)`);
      console.log(`   Candle Key: ${candleKey}`);
      console.log(`   Seconds to Close: ${secondsToClose}s`);
      console.log(`   Last Processed: ${lastProcessedCandleRef.current} (ref)`);
      console.log(`   Is Processing: ${isProcessingRef.current}`);
      console.log(`   ⚡ RATE LIMIT: Can Send AI? ${canSendAI ? '✅ YES' : '❌ NO'} (${Math.round(timeSinceLastAI/1000)}s since last)`);
      console.log(`================================================\n`);
    }
    
    // ⚡⚡⚡ FIRST: ABSOLUTE 60-SECOND COOLDOWN (Prevents any rapid requests) ⚡⚡⚡
    const currentTimestamp = Date.now();
    const timeSinceLastRequest = currentTimestamp - lastAIRequestTimeRef.current;
    if (timeSinceLastRequest < 60000 && lastAIRequestTimeRef.current > 0) {
      // ⚡ HARD BLOCK: No requests within 60 seconds of last request!
      return; // Silent skip - no log spam
    }
    
    // ⚡⚡⚡ NEW STRATEGY: REQUEST AI EXACTLY 2 SECONDS BEFORE CANDLE CLOSES ⚡⚡⚡
    // This gives AI time to process, so signal arrives RIGHT at candle close!
    // ⚡ CRITICAL: Use EXACT match (not range) to prevent multiple requests!
    const isPreCloseWindow = (secondsToClose === 2);
    
    if (isPreCloseWindow) {
      // ⚡⚡⚡ SECONDARY CHECK: TIME-BASED RATE LIMIT (Per timeframe) ⚡⚡⚡
      // Prevent ANY request if we've sent one in the last candle period
      const minTimeBetweenRequests = interval === 5 ? 240000 : 840000; // 4min for 5M, 14min for 15M (safety buffer)
      
      if (timeSinceLastRequest < minTimeBetweenRequests) {
        const remainingTime = Math.round((minTimeBetweenRequests - timeSinceLastRequest) / 1000);
        console.log(`⏸️ RATE LIMIT: Last request ${Math.round(timeSinceLastRequest/1000)}s ago. Need ${remainingTime}s more for ${interval}M. Skipping...`);
        return; // ⚡ EXIT: Too soon since last request
      }
      
      // ⚡⚡⚡ CRITICAL: STRICT DUPLICATE CHECK - Use REF for immediate sync! ⚡⚡⚡
      if (candleKey !== lastProcessedCandleRef.current && 
          !processedCandlesRef.current.has(candleKey) &&
          !isProcessingRef.current) {
        
        const triggerTime = performance.now();
        console.log(`\n🚀🚀🚀 PRE-CLOSE SIGNAL REQUEST - ${candleKey} 🚀🚀🚀`);
        console.log(`⏰ Time: ${currentTimeStr} | ${secondsToClose}s until candle close`);
        console.log(`⚡ EARLY FETCH MODE: Signal will be ready AT candle close!`);
        console.log(`🎯 Target: Order execution within 1s of candle close`);
        console.log(`📊 Processing Status: lastProcessed=${lastProcessedCandleRef.current}, current=${candleKey}, isProcessing=${isProcessingRef.current}`);
        console.log(`📊 Interval: ${interval}M (candleIntervalRef: ${candleIntervalRef.current})`);
        
        // ⚡⚡⚡ IMMEDIATELY mark as processed BEFORE any async calls - Use REF for instant update!
        lastProcessedCandleRef.current = candleKey; // ⚡ REF = instant sync update!
        setLastProcessedCandle(candleKey); // ⚡ State = for UI display only
        processedCandlesRef.current.add(candleKey);
        isProcessingRef.current = true; // Lock processing
        
        // ⚡ Global lock already set during atomic acquisition (earlier in checkCandleStatus)
        console.log(`🔒 Processing lock SET for ${candleKey} | REF updated to: ${lastProcessedCandleRef.current}`);
        
        // ⚡⚡⚡ IMMEDIATE AI REQUEST - Will arrive at candle close ⚡⚡⚡
        await getAISignalUltraFast(triggerTime);
        
        isProcessingRef.current = false; // Unlock after done
        
        // ⚡⚡⚡ CLEAR GLOBAL LOCK (allows other instances to process next candle) ⚡⚡⚡
        localStorage.removeItem('indexpilot_processing_lock');
        console.log(`🔓 Processing lock RELEASED for ${candleKey} | GLOBAL LOCK CLEARED`);
        return; // Exit after processing
      } else {
        // ⚡ DEBUG: Why was this candle skipped?
        if (candleKey === lastProcessedCandleRef.current) {
          // Already processed - this is normal, don't log too much
          if (secondsToClose === 2) {
            console.log(`⏭️ Skipping ${candleKey} - already processed as ${lastProcessedCandleRef.current}`);
          }
        } else if (processedCandlesRef.current.has(candleKey)) {
          console.log(`⏭️ Candle ${candleKey} already in processed set`);
        } else if (isProcessingRef.current) {
          if (secondsToClose === 2) {
            console.log(`⏳ Still processing previous candle, skipping ${candleKey}`);
          }
        }
      }
    }
    
    // ========== DEBUG: LOG COUNTDOWN ==========
    if (secondsToClose <= 10 && secondsToClose > 0 && currentSecond % 5 === 0) {
      console.log(`⏰ [${currentTimeStr}] ${candleKey} | ${secondsToClose}s to close | Last: ${lastProcessedCandleRef.current}`);
    }
  };

  // ============ GET AI SIGNAL (ONLY ON CANDLE CLOSE) ============
  const getAISignal = async () => {
    if (isProcessingRef.current) {
      console.log('⏳ Already processing signal, skipping...');
      return;
    }

    isProcessingRef.current = true;
    const startTime = performance.now();
    
    try {
      onLog({
        timestamp: Date.now(),
        type: 'AI_REQUEST',
        message: `🤖 Requesting AI signal | ${candleInterval}M Candle | ${tradingSymbols.length} symbols waiting`
      });

      const freshToken = await getFreshAccessToken();
      const response = await fetch(`${serverUrl}/ai-trading-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({
          index: tradingSymbols[0]?.index || 'NIFTY',
          candles: 50,
          interval: candleInterval
        })
      });

      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);

      if (data.signal) {
        const normalizedPrimarySignal = normalizeSignalPayload({ signal: data.signal, timestamp: Date.now(), candlesProcessed: data.candlesProcessed });
        setPreviousSignal(lastSignalRef.current); // ⚡ SAVE PREVIOUS FOR ALERT COMPARISON
        setLastSignal(normalizedPrimarySignal);
        lastSignalRef.current = normalizedPrimarySignal;
        setStats(prev => ({
          ...prev,
          totalSignals: prev.totalSignals + 1,
          avgExecutionTime: Math.round((prev.avgExecutionTime + executionTime) / 2)
        }));

        onLog({
          timestamp: Date.now(),
          type: data.signal.action,
          message: `${data.signal.action === 'WAIT' ? '⏸️' : '✅'} AI says ${data.signal.action} - ${data.signal.reasoning.substring(0, 100)}... | Confidence: ${data.signal.confidence}%`
        });

        onLog({
          timestamp: Date.now(),
          type: 'AI_SIGNAL',
          message: `✅ AI Signal: ${data.signal.action} | Bias: ${data.signal.bias} | Confidence: ${data.signal.confidence}% | Institutional: ${data.signal.institutional_bias} | ${executionTime}ms`,
          data: data.signal
        });

      }
    } catch (error) {
      console.error('AI signal error:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ AI signal failed: ${error}`
      });
    } finally {
      isProcessingRef.current = false;
    }
  };

  // ============ GET AI SIGNAL ULTRA FAST (FOR CANDLE CLOSE) ============
  const getAISignalUltraFast = async (triggerTime: number, isRetry = false) => {
    // ⚡ REMOVED DUPLICATE CHECK - checkCandleStatus() already handles the lock!
    // This was causing the bug where requests were never sent!
    
    // ⚡⚡⚡ CRITICAL: Record AI request timestamp to prevent rate limiting ⚡⚡⚡
    lastAIRequestTimeRef.current = Date.now();
    console.log(`📝 AI REQUEST TIMESTAMP RECORDED: ${new Date(lastAIRequestTimeRef.current).toLocaleTimeString()}`);
    
    // ⚡ SAFETY: Force-reset processing flag after 30s (in case of crash)
    const safetyTimeout = setTimeout(() => {
      if (isProcessingRef.current) {
        console.error('🚨 SAFETY TIMEOUT: Processing stuck for 30s! Force-resetting...');
        isProcessingRef.current = false;
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: '🚨 AI request stuck for 30s - force-reset processing lock'
        });
      }
    }, 30000);
    
    const startTime = performance.now();
    
    try {
      // ⚡⚡⚡ CRITICAL: Use REF to get LATEST timeframe value (avoid closure issues)
      const currentInterval = candleIntervalRef.current;
      
      onLog({
        timestamp: Date.now(),
        type: 'AI_REQUEST',
        message: `🤖 Requesting ADVANCED AI signal | ${currentInterval}M Candle | 15+ Indicators`
      });

      // ⚡ OPTIMIZED: Send minimal data, use Promise.race for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s max timeout (increased from 15s for Dhan API rate limiting)
      
      // ⚡ VALIDATE TIMEFRAME BEFORE REQUEST
      const requestInterval = currentInterval.toString();
      console.log(`\n📤 ============ AI REQUEST ============`);
      console.log(`📤 Endpoint: ${serverUrl}/advanced-ai-signal`);
      console.log(`📤 TIMEFRAME: ${requestInterval}M (LATEST from ref: ${currentInterval}M)`);
      console.log(`📤 Type Check: candleIntervalRef.current type = ${typeof currentInterval}, value = "${currentInterval}"`);
      console.log(`📤 Type Check: requestInterval type = ${typeof requestInterval}, value = "${requestInterval}"`);
      console.log(`📤 Index: ${tradingSymbols[0]?.index || 'NIFTY'}`);
      console.log(`📤 Account: ₹100,000`);
      
      if (requestInterval !== '5' && requestInterval !== '15') {
        console.error(`❌ CRITICAL ERROR: Invalid interval "${requestInterval}" being sent to backend!`);
        console.error(`   candleIntervalRef.current: ${currentInterval}`);
        console.error(`   candleInterval state: ${candleInterval}`);
        console.error(`   localStorage value: ${localStorage.getItem('engine_interval')}`);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ Invalid timeframe: ${requestInterval}M. Stopping engine.`
        });
        stopEngine();
        return;
      }
      
      // ⚡ GET FRESH TOKEN BEFORE API CALL
      const freshToken = await getFreshAccessToken();
      
      // ⚡⚡⚡ MULTI-INDEX SUPPORT: Get all unique active indices OR default to all 3 indices
      const userActiveIndices = [...new Set(tradingSymbols.filter(s => s.active).map(s => s.index))];
      
      // ⚡ ALWAYS fetch signals for NIFTY, BANKNIFTY, SENSEX (for multi-symbol display)
      const allIndices = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
      const activeIndices = userActiveIndices.length > 0 
        ? [...new Set([...userActiveIndices, ...allIndices])] // Merge user indices with all three
        : allIndices; // Default to all three if no symbols added
      
      const primaryIndex = userActiveIndices[0] || tradingSymbols[0]?.index || 'NIFTY';
      
      // ⚡ Build spread data for ALL active indices
      const spreadData = activeIndices.map(idx => ({
        index: idx,
        symbols: tradingSymbols.filter(s => s.index === idx && s.active).map(s => ({
          name: s.name,
          optionType: s.optionType,
          transactionType: s.transactionType,
          quantity: s.quantity
        }))
      }));
      
      const requestBody = {
        index: primaryIndex, // Primary index for backward compatibility
        indices: activeIndices, // ✅ NEW: All active indices
        spreadData: spreadData, // ✅ NEW: Symbol details per index
        interval: requestInterval,
        accountBalance: 100000,
        userId: userIdRef.current  // ⚡ Fallback for session-less auth
      };
      
      // ⚡ Compact log (not verbose JSON)
      console.log(`📤 Sending: ${activeIndices.join(', ')} | ${requestBody.interval}M | Balance: ₹${requestBody.accountBalance.toLocaleString()}`);
      console.log(`📤 Sending interval: "${requestBody.interval}" (type: ${typeof requestBody.interval})`);
      
      const response = await fetch(`${serverUrl}/advanced-ai-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      console.log(`📥 Response status: ${response.status} ${response.statusText}`);
      console.log(`📥 Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Backend error (${response.status}):`, errorText);
        
        // ⚡ HANDLE 401 - SESSION EXPIRED (AUTO-REFRESH)
        if (response.status === 401 && !isRetry) {
          console.log(`🔄 Got 401, attempting auto session refresh...`);
          
          try {
            // Try to refresh the session
            const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();
            
            if (!refreshError && session?.access_token) {
              // ⚡ CRITICAL: Update token ref BEFORE retry so getFreshAccessToken gets the new token
              currentAccessTokenRef.current = session.access_token;
              if (session.user?.id) userIdRef.current = session.user.id;
              console.log(`✅ Session refreshed! Token ref updated, retrying AI signal...`);
              onLog({
                timestamp: Date.now(),
                type: 'INFO',
                message: `🔄 Session refreshed automatically — retrying signal now...`
              });
              await getAISignalUltraFast(triggerTime, true);
              return;
            } else {
              // ⚡ Refresh failed — engine continues with anon key + userId fallback (server side)
              console.warn(`⚠️ Session refresh failed (${refreshError?.message}) — retrying with anon key + userId`);
              onLog({
                timestamp: Date.now(),
                type: 'WARN',
                message: `⚠️ Session refresh failed — engine continues with userId fallback`
              });
              await getAISignalUltraFast(triggerTime, true);
              return;
            }
          } catch (refreshErr) {
            console.warn(`⚠️ Error refreshing session — engine continues with userId fallback:`, refreshErr);
            await getAISignalUltraFast(triggerTime, true);
            return;
          }
        } else if (response.status === 401 && isRetry) {
          // Second 401 even after refresh — stop LOCAL polling only, backend engine continues via cron
          console.error(`❌ Still getting 401 after session refresh. Local polling stopped, backend engine continues.`);
          onLog({
            timestamp: Date.now(),
            type: 'WARN',
            message: `⚠️ Session expired — local polling paused. Backend engine continues running via cron. Re-login to resume UI updates.`
          });
          // ⚡ Only stop local state, do NOT call backend stop
          await stopEngine(false);
        } else if (response.status === 400 && errorText.includes('credentials not configured')) {
          // ⚡ HANDLE 400 - CREDENTIALS NOT CONFIGURED
          console.error(`🚨 API CREDENTIALS NOT CONFIGURED!`);
          alert('⚠️ API credentials not configured!\n\nPlease go to Settings tab and configure your Dhan API credentials (Client ID and Access Token).');
          await stopEngine(false);
          onLog({
            timestamp: Date.now(),
            type: 'ERROR',
            message: `🚨 API CREDENTIALS MISSING - Please configure Dhan API in Settings tab.`
          });
        } else {
          onLog({
            timestamp: Date.now(),
            type: 'ERROR',
            message: `❌ Backend returned ${response.status}: ${errorText.substring(0, 200)}`
          });
        }
        return;
      }
      
      const data = await response.json();
      const endTime = performance.now();
      const executionTime = Math.round(endTime - startTime);
      const totalTime = Math.round(endTime - triggerTime);

      console.log(`⚡ AI Response: ${executionTime}ms | Total from candle close: ${totalTime}ms`);
      console.log(`📊 AI Response Data:`, JSON.stringify(data, null, 2)); // ⚡ DEBUG: Log full response with formatting
      
      // ⚡⚡⚡ DEBUG: Check multi-symbol response structure immediately
      if (data.signals) {
        console.log(`\\n🔍 RAW SIGNALS OBJECT:`);
        console.log(`   typeof data.signals:`, typeof data.signals);
        console.log(`   data.signals keys:`, Object.keys(data.signals));
        console.log(`   NIFTY type:`, typeof data.signals.NIFTY, `value:`, data.signals.NIFTY ? 'EXISTS' : 'NULL');
        console.log(`   BANKNIFTY type:`, typeof data.signals.BANKNIFTY, `value:`, data.signals.BANKNIFTY ? 'EXISTS' : 'NULL');
        console.log(`   SENSEX type:`, typeof data.signals.SENSEX, `value:`, data.signals.SENSEX ? 'EXISTS' : 'NULL');
        
        // ⚡⚡⚡ NEW: LOG FULL DETAILS FOR ALL 3 INDICES ⚡⚡⚡
        console.log(`\n\n🔥🔥🔥 ============ COMPLETE AI ANALYSIS FOR ALL 3 INDICES ============ 🔥🔥🔥\n`);
        
        ['NIFTY', 'BANKNIFTY', 'SENSEX'].forEach((indexName) => {
          const signalData = data.signals[indexName];
          if (signalData) {
            console.log(`\n📊 ========== ${indexName} - FULL ANALYSIS ========== 📊`);
            console.log(`\n✅ ACTION: ${signalData.action} | CONFIDENCE: ${signalData.confidence}%`);
            console.log(`💬 REASONING: ${signalData.reasoning}`);
            console.log(`📈 MARKET STATE: ${signalData.market_state} | BIAS: ${signalData.bias}`);
            console.log(`🕐 TIMEFRAME: ${signalData.timeframe} | CANDLES ANALYZED: ${signalData.candlesAnalyzed}`);
            
            console.log(`\n📊 TECHNICAL INDICATORS (${Object.keys(signalData.indicators || {}).length} indicators):`);
            console.log(JSON.stringify(signalData.indicators, null, 2));
            
            console.log(`\n📐 PATTERNS (${signalData.patterns?.length || 0} patterns):`);
            console.log(JSON.stringify(signalData.patterns, null, 2));
            
            console.log(`\n✅ CONFIRMATIONS (${signalData.confirmations?.total || 0}/${signalData.confirmations?.required || 6} met):`);
            console.log(JSON.stringify(signalData.confirmations, null, 2));
            
            console.log(`\n📊 VOLUME ANALYSIS:`);
            console.log(JSON.stringify(signalData.volumeAnalysis, null, 2));
            
            console.log(`\n🎯 RISK MANAGEMENT:`);
            console.log(JSON.stringify(signalData.riskManagement, null, 2));
            
            console.log(`\n🌍 MARKET REGIME:`);
            console.log(JSON.stringify(signalData.marketRegime, null, 2));
            
            console.log(`\n⚡ EXECUTION TIME: ${signalData.executionTime}s`);
            console.log(`\n========== END ${indexName} ANALYSIS ========== \n`);
          } else {
            console.warn(`⚠️ ${indexName} signal data is missing or null!`);
          }
        });
        
        console.log(`\n🔥🔥🔥 ============ END COMPLETE AI ANALYSIS ============ 🔥🔥🔥\n\n`);
      } else {
        console.log(`\\n⚠️ WARNING: data.signals is missing or undefined!`);
      }

      if (data.error) {
        console.error(`❌ Backend returned error:`, data.error);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ Backend error: ${data.error}`
        });
        return;
      }

      if (!data.signal) {
        console.error(`❌ No signal in response! Full data:`, data);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ Backend returned success but no signal object! Check backend logs.`
        });
        return;
      }

      if (data.signal) {
        // ⚡ VERIFY TIMEFRAME IN RESPONSE
        const responseTimeframe = data.timeframe || data.signal.timeframe || 'UNKNOWN';
        const expectedTimeframe = `${requestInterval}M`; // ⚡⚡⚡ FIX: Use requestInterval (what we ACTUALLY sent) not candleInterval (state)
        
        console.log(`✅ Signal received:`, data.signal.action, `Confidence:`, data.signal.confidence);
        console.log(`⚡ TIMEFRAME VERIFICATION:`);
        console.log(`   Requested: ${expectedTimeframe} (requestInterval="${requestInterval}", candleInterval="${candleInterval}")`);
        console.log(`   Received: ${responseTimeframe}`);
        console.log(`   Candles Analyzed: ${data.candlesProcessed || data.signal.candlesAnalyzed || 'N/A'}`);
        
        // ⚡⚡⚡ MULTI-SYMBOL: Check if we have multiple signals ⚡⚡⚡
        if (data.signals) {
          console.log(`\n🎯 ============ MULTI-SYMBOL SIGNALS ============`);
          console.log(`📊 NIFTY: ${data.signals.NIFTY ? data.signals.NIFTY.action + ' (' + data.signals.NIFTY.confidence + '%)' : 'N/A'}`);
          console.log(`📊 BANKNIFTY: ${data.signals.BANKNIFTY ? data.signals.BANKNIFTY.action + ' (' + data.signals.BANKNIFTY.confidence + '%)' : 'N/A'}`);
          console.log(`📊 SENSEX: ${data.signals.SENSEX ? data.signals.SENSEX.action + ' (' + data.signals.SENSEX.confidence + '%)' : 'N/A'}`);
          console.log(`============================================\n`);
          
          // Update multi-symbol signals (use functional update for safety)
          const signalSyncTime = Date.now();
          setMultiSymbolSignals(prev => {
            const newSignals = {
              NIFTY: data.signals.NIFTY ? normalizeSignalPayload({ signal: data.signals.NIFTY, timestamp: signalSyncTime }, 'NIFTY') : null,
              BANKNIFTY: data.signals.BANKNIFTY ? normalizeSignalPayload({ signal: data.signals.BANKNIFTY, timestamp: signalSyncTime }, 'BANKNIFTY') : null,
              SENSEX: data.signals.SENSEX ? normalizeSignalPayload({ signal: data.signals.SENSEX, timestamp: signalSyncTime }, 'SENSEX') : null,
              __timestamp: signalSyncTime // ⚡⚡⚡ FORCE NEW OBJECT REFERENCE
            };
            
            console.log(`\\n⚡⚡⚡ setMultiSymbolSignals CALLBACK EXECUTING ⚡⚡⚡`);
            console.log('   Previous state:', prev);
            console.log('   New state:', newSignals);
            console.log(`⚡⚡⚡ ========================================= ⚡⚡⚡\\n`);
            
            return newSignals;
          });
          
          // ⚡ DEBUG: Verify what we're setting
          console.log(`\n🔧 ============ STATE UPDATE DEBUG ============`);
          console.log(`📝 Setting multiSymbolSignals state with:`);
          console.log(`   NIFTY:`, data.signals.NIFTY ? `${data.signals.NIFTY.action} (${data.signals.NIFTY.confidence}%)` : 'NULL');
          console.log(`   BANKNIFTY:`, data.signals.BANKNIFTY ? `${data.signals.BANKNIFTY.action} (${data.signals.BANKNIFTY.confidence}%)` : 'NULL');
          console.log(`   SENSEX:`, data.signals.SENSEX ? `${data.signals.SENSEX.action} (${data.signals.SENSEX.confidence}%)` : 'NULL');
          console.log(`============================================\n`);
        }
        
        if (responseTimeframe !== expectedTimeframe) {
          console.error(`❌ TIMEFRAME MISMATCH! Expected ${expectedTimeframe} but got ${responseTimeframe}`);
          onLog({
            timestamp: Date.now(),
            type: 'ERROR',
            message: `🚨 TIMEFRAME MISMATCH: Requested ${expectedTimeframe} but received ${responseTimeframe}!`
          });
        } else {
          console.log(`   ✅ VERIFIED: Correct timeframe (${responseTimeframe})`);
        }
        
        const normalizedPrimarySignal = normalizeSignalPayload({ signal: data.signal, timestamp: Date.now(), timeframe: responseTimeframe, candlesProcessed: data.candlesProcessed || data.signal.candlesAnalyzed });
        setPreviousSignal(lastSignalRef.current); // ⚡ SAVE PREVIOUS FOR ALERT COMPARISON
        setLastSignal(normalizedPrimarySignal);
        lastSignalRef.current = normalizedPrimarySignal;
        setStats(prev => ({
          ...prev,
          totalSignals: prev.totalSignals + 1,
          avgExecutionTime: Math.round((prev.avgExecutionTime + executionTime) / 2)
        }));

        // 📝 SHARED DETAILED LOGS FOR ALL SIGNALS
        const logSignalEntries = data.signals
          ? Object.entries(data.signals)
              .filter(([_, signal]) => signal)
              .map(([index, signal]: [string, any]) => ({ index, signal }))
          : [{ index: primaryIndex, signal: data.signal }];

        for (const { index, signal } of logSignalEntries) {
          const confirmationCount = signal.confirmations?.details?.filter((d: string) => d.startsWith('✅')).length || 0;

          onLog({
            timestamp: Date.now(),
            type: signal.action === 'WAIT' ? 'WAIT' : 'AI_SIGNAL',
            message: signal.action === 'WAIT'
              ? `⏸️ ${index}: ${signal.action} (${signal.confidence}%) - ${signal.reasoning || signal.analysis || 'Market unsuitable'} | TF: ${responseTimeframe} | Confirmations: ${confirmationCount}/10 | ${executionTime}ms`
              : `✅ ${index}: ${signal.action} | TF: ${responseTimeframe} | Confidence: ${signal.confidence}% | Confirmations: ${confirmationCount}/10 | ${executionTime}ms`,
            data: {
              index,
              action: signal.action,
              confidence: signal.confidence,
              timeframe: responseTimeframe,
              candlesAnalyzed: data.candlesProcessed || signal.candlesAnalyzed,
              confirmations: signal.confirmations?.details || [],
              confirmationsPassed: confirmationCount,
              patterns: signal.patterns || [],
              marketRegime: signal.marketRegime || {},
              volumeAnalysis: signal.volumeAnalysis || {},
              riskManagement: signal.riskManagement || {},
              indicators: signal.indicators || {},
              reasoning: signal.reasoning || signal.analysis || 'Advanced AI analysis',
              executionTime: `${executionTime}ms`
            }
          });
        }
        
        // 🔊 PLAY SIGNAL GENERATED SOUND (only for BUY signals, not WAIT)
        if (data.signal.action !== 'WAIT') {
          notifySignalGenerated();
        }

        // 🔔 SEND NOTIFICATION for all signals (including WAIT)
        try {
          // Extract symbol name from trading symbols
          const symbolName = tradingSymbols.length > 0 
            ? tradingSymbols[0].name 
            : `${tradingSymbols[0]?.index || 'INDEX'} Option`;
          
          notificationService.notifySignalDetected({
            index: tradingSymbols[0]?.index || 'NIFTY',
            symbol: symbolName,
            action: data.signal.action === 'WAIT' ? 'WAIT' : (data.signal.action === 'BUY_CALL' || data.signal.action === 'BUY_PUT' ? 'BUY' : 'SELL'),
            confidence: data.signal.confidence,
            reasoning: data.signal.reasoning || data.signal.analysis
          });
          console.log(`✅ Notification sent for ${data.signal.action} signal`);
        } catch (notifError) {
          console.error('❌ Failed to send notification:', notifError);
        }

        console.log(`\n☁️ Backend engine is responsible for order execution and duplicate protection.`);
        console.log(`☁️ UI is display-only for signal results.`);
        
        const totalPipelineTime = Math.round(performance.now() - triggerTime);
        console.log(`\n✅ TOTAL PIPELINE: ${totalPipelineTime}ms (Target: <1000ms) ${totalPipelineTime < 1000 ? '✅' : '⚠️'}`);
        onLog({
          timestamp: Date.now(),
          type: 'PERFORMANCE',
          message: `⚡ Execution Speed: ${totalPipelineTime}ms ${totalPipelineTime < 1000 ? '✅ FAST' : '⚠️ SLOW'}`
        });
        console.log(`============================================\n`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('⏱️ AI request timeout (> 30s)');
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `⏱️ AI request timeout (> 30s) - Dhan API rate limiting causing delays. If this persists, check your network or contact support.`
        });
      } else {
        console.error('AI signal error:', error);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ AI signal failed: ${error}`
        });
      }
    } finally {
      clearTimeout(safetyTimeout); // ⚡ Clear safety timeout
      isProcessingRef.current = false;
      
      // ⚡⚡⚡ CRITICAL: Clear global lock even if error occurred ⚡⚡⚡
      localStorage.removeItem('indexpilot_processing_lock');
      
      const totalTime = Math.round(performance.now() - triggerTime);
      console.log(`⚡ TOTAL PIPELINE: ${totalTime}ms (Target: < 3000ms) | Global lock cleared`);
    }
  };

  // ============ PROCESS SIGNAL ============
  const processSignal = async (signal: any) => {
    console.log(`\n🔍 ============ PROCESS SIGNAL ============`);
    console.log(`🔍 Signal Action: ${signal.action}`);
    console.log(`🔍 Signal Confidence: ${signal.confidence}%`);
    console.log(`🔍 Looking for matching symbol...`);
    console.log(`🔍 Total symbols available: ${tradingSymbols.length}`);
    
    // Debug: Show all symbols
    tradingSymbols.forEach((s, i) => {
      console.log(`  Symbol ${i + 1}: ${s.name} | Index: ${s.index} | Type: ${s.optionType} | Transaction: ${s.transactionType} | Active: ${s.active}`);
    });
    
    // ⚡⚡⚡ CRITICAL FIX: Filter by INDEX to match signal's target index
    const targetIndex = signal.index || signal.targetIndex || tradingSymbols[0]?.index;
    console.log(`🎯 Target Index from AI: ${targetIndex}`);
    
    // ⚡⚡⚡ ISSUE #3 FIX: CHECK IF POSITION ALREADY EXISTS FOR THIS INDEX ⚡⚡⚡
    const existingPosition = activePositions.find(p => p.index === targetIndex);
    if (existingPosition) {
      console.log(`\n⚠️⚠️⚠️ DUPLICATE ORDER BLOCKED! ⚠️⚠️⚠️`);
      console.log(`   Index: ${targetIndex}`);
      console.log(`   Existing Position: ${existingPosition.symbolName}`);
      console.log(`   Order ID: ${existingPosition.orderId}`);
      console.log(`   Current P&L: ₹${existingPosition.pnl?.toFixed(2) || '0.00'}`);
      console.log(`   ❌ CANNOT place new order while position is open!`);
      console.log(`   System Rule: Only ONE position per index allowed simultaneously\n`);
      
      onLog({
        timestamp: Date.now(),
        type: 'WARNING',
        message: `⚠️ Order blocked: ${targetIndex} position already exists (${existingPosition.symbolName}). Close existing position first.`
      });
      return; // ⚡ BLOCK ORDER - Prevents duplicate positions for same index
    }
    console.log(`✅ No existing ${targetIndex} position - Proceeding with order...`);
    
    const matchingSymbol = tradingSymbols.find(s => {
      // ✅ MATCH BY: Index + OptionType + TransactionType + Active
      const indexMatch = s.index === targetIndex;
      const callMatch = signal.action === 'BUY_CALL' && s.optionType === 'CE' && s.transactionType === 'BUY' && s.active;
      const putMatch = signal.action === 'BUY_PUT' && s.optionType === 'PE' && s.transactionType === 'BUY' && s.active;
      
      if (indexMatch && callMatch) {
        console.log(`✅ MATCHED ${s.index} CALL: ${s.name}`);
        return true;
      }
      if (indexMatch && putMatch) {
        console.log(`✅ MATCHED ${s.index} PUT: ${s.name}`);
        return true;
      }
      return false;
    });

    if (!matchingSymbol) {
      console.error(`❌ NO MATCHING SYMBOL FOUND!`);
      console.error(`  Looking for: ${signal.action} for ${targetIndex}`);
      console.error(`  Required: index=${targetIndex}, optionType=${signal.action === 'BUY_CALL' ? 'CE' : 'PE'}, transactionType=BUY, active=true`);
      
      // Check if there are ANY symbols at all
      if (tradingSymbols.length === 0) {
        console.error(`  ❌ NO SYMBOLS CONFIGURED! Please add symbols in the Symbols tab.`);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ NO SYMBOLS CONFIGURED! Go to Symbols tab → Add symbols → Mark as ACTIVE`
        });
      } else {
        // Check if there are symbols but none match
        const requiredType = signal.action === 'BUY_CALL' ? 'CE' : 'PE';
        const activeSymbols = tradingSymbols.filter(s => s.active);
        const matchingIndex = tradingSymbols.filter(s => s.index === targetIndex);
        const matchingType = tradingSymbols.filter(s => s.optionType === requiredType);
        const matchingTransaction = tradingSymbols.filter(s => s.transactionType === 'BUY');
        const matchingTypeAndTransaction = tradingSymbols.filter(s => s.index === targetIndex && s.optionType === requiredType && s.transactionType === 'BUY');
        const inactiveMatches = matchingTypeAndTransaction.filter(s => !s.active);
        
        console.error(`  Total symbols: ${tradingSymbols.length}`);
        console.error(`  Active symbols: ${activeSymbols.length}`);
        console.error(`  Matching index (${targetIndex}): ${matchingIndex.length}`);
        console.error(`  Matching type (${requiredType}): ${matchingType.length}`);
        console.error(`  Matching transaction (BUY): ${matchingTransaction.length}`);
        console.error(`  Matching ${targetIndex} + ${requiredType} + BUY but INACTIVE: ${inactiveMatches.length}`);
        
        // More helpful error message
        let errorMsg = `❌ No matching symbol for ${signal.action} on ${targetIndex}. `;
        
        if (inactiveMatches.length > 0) {
          // Found matching symbols but they're inactive
          errorMsg += `Found ${inactiveMatches.length} ${targetIndex} ${requiredType} BUY symbol(s) but they are INACTIVE! ` +
                     `→ Go to Symbols tab → Toggle "${inactiveMatches[0].name}" to ACTIVE ✅`;
        } else if (matchingIndex.length === 0) {
          // No symbols for this index at all
          errorMsg += `No ${targetIndex} symbols found. ` +
                     `→ Go to Symbols tab → Add ${targetIndex} ${requiredType} symbol → Set Transaction=BUY → Mark as ACTIVE ✅`;
        } else if (matchingType.length === 0) {
          // No symbols of this type at all
          errorMsg += `No ${requiredType} symbols found for ${targetIndex}. ` +
                     `→ Go to Symbols tab → Add ${targetIndex} ${requiredType} symbol → Set Transaction=BUY → Mark as ACTIVE ✅`;
        } else if (matchingTransaction.length === 0) {
          // No BUY symbols
          errorMsg += `No BUY symbols found. ` +
                     `→ Go to Symbols tab → Set Transaction Type = BUY → Mark as ACTIVE ✅`;
        } else {
          // Generic message
          errorMsg += `Add a ${targetIndex} ${requiredType} BUY symbol in Symbols tab and mark it ACTIVE ✅`;
        }
        
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: errorMsg
        });
      }
      return;
    }

    console.log(`✅ Found matching symbol: ${matchingSymbol.name}`);
    console.log(`✅ Proceeding to execute order...`);
    console.log(`🔍 DEBUG: dhanClientId = "${dhanClientId}" (length: ${dhanClientId.length})`);
    console.log(`🔍 DEBUG: symbol =`, matchingSymbol);
    
    // ⚡ CRITICAL CHECK: Ensure dhanClientId is loaded
    if (!dhanClientId || dhanClientId.trim() === '') {
      console.error(`❌ CRITICAL ERROR: dhanClientId is empty or not loaded!`);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Cannot execute order: Dhan Client ID not loaded! Go to Settings → Save credentials again.`
      });
      return;
    }
    
    await executeOrder(matchingSymbol, signal);
  };

  // ============ EXECUTE ORDER ============
  const executeOrder = async (symbol: TradingSymbol, signal: any) => {
    console.log(`\n⚡⚡⚡ EXECUTE ORDER CALLED ⚡⚡⚡`);
    console.log(`Symbol:`, symbol.name);
    console.log(`Signal:`, signal.action);
    console.log(`Dhan Client ID:`, dhanClientId);
    console.log(`📊 FULL SYMBOL DATA:`, JSON.stringify(symbol, null, 2));
    
    // ⚠️ CRITICAL: Display target/stop loss values prominently
    console.log(`\n💰 ========== RISK MANAGEMENT VALUES ==========`);
    console.log(`🎯 Target Amount: ₹${symbol.targetAmount}`);
    console.log(`🛑 Stop Loss Amount: ₹${symbol.stopLossAmount}`);
    console.log(`⚡ Trailing Enabled: ${symbol.trailingEnabled ? 'YES' : 'NO'}`);
    if (symbol.trailingEnabled) {
      console.log(`   - Activation: ₹${symbol.trailingActivationAmount || 0}`);
      console.log(`   - Target Jump: +₹${symbol.targetJumpAmount || 0}`);
      console.log(`   - SL Jump: -₹${symbol.stopLossJumpAmount || 0}`);
    }
    
    // ⚠️ WARNING: Check if values are suspiciously low
    if (symbol.targetAmount < 1000) {
      console.warn(`⚠️⚠️⚠️ WARNING: Target amount (₹${symbol.targetAmount}) is less than ₹1000!`);
      console.warn(`⚠️ This symbol was created with old default values.`);
      console.warn(`⚠️ Go to Symbols → Edit this symbol → Update Target to ₹3000`);
    }
    if (symbol.stopLossAmount < 1000) {
      console.warn(`⚠️⚠️⚠️ WARNING: Stop Loss amount (₹${symbol.stopLossAmount}) is less than ₹1000!`);
      console.warn(`⚠️ This symbol was created with old default values.`);
      console.warn(`⚠️ Go to Symbols → Edit this symbol → Update Stop Loss to ₹2000`);
    }
    console.log(`==============================================\n`);
    
    const startTime = performance.now();
    
    try {
      const correlationId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log(`📝 Creating order log...`);
      onLog({
        timestamp: Date.now(),
        type: 'ORDER_PLACING',
        message: `⚡ PLACING ORDER: ${symbol.name} | ${signal.action} | Conf: ${signal.confidence}%`
      });
      
      // ✅ CRITICAL VALIDATION: Check all required fields
      console.log(`🔍 ========== PRE-FLIGHT VALIDATION ==========`);
      const validationErrors = [];
      
      if (!symbol.securityId) validationErrors.push('Missing securityId');
      if (!symbol.transactionType) validationErrors.push('Missing transactionType');
      if (!symbol.exchangeSegment) validationErrors.push('Missing exchangeSegment');
      if (!symbol.quantity || symbol.quantity <= 0) validationErrors.push('Invalid quantity');
      
      if (validationErrors.length > 0) {
        const errorMsg = `❌ VALIDATION FAILED: ${validationErrors.join(', ')}`;
        console.error(errorMsg);
        console.error('Symbol data:', symbol);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: errorMsg
        });
        throw new Error(errorMsg);
      }
      console.log(`✅ All required fields validated`);
      console.log(`🔍 ==========================================`);
      
      console.log(`🔑 Getting fresh access token...`);
      const freshToken = await getFreshAccessToken();
      console.log(`✅ Fresh token obtained (length: ${freshToken.length})`);
      
      console.log(`📊 ORDER DETAILS BEING SENT:`);
      console.log(`  Security ID: ${symbol.securityId}`);
      console.log(`  Transaction Type: ${symbol.transactionType}`);
      console.log(`  Order Type: ${symbol.orderType}`);
      console.log(`  Price: ₹${symbol.price}`);
      console.log(`  Quantity: ${symbol.quantity}`);
      console.log(`  Product Type: ${symbol.productType}`);
      console.log(`  Exchange: ${symbol.exchangeSegment}`);
      console.log(`  After Market Order: ${symbol.afterMarketOrder}`);
      
      console.log(`📤 Sending order to server: ${serverUrl}/execute-dhan-order`);
      
      // ⚡ AUTOMATIC MIGRATION: Fix exchange segments for F&O options
      let exchangeSegment = symbol.exchangeSegment;
      if (exchangeSegment === 'NFO') {
        console.log(`⚡ AUTO-MIGRATION: Converting legacy exchange segment 'NFO' → 'NSE_FNO' for ${symbol.name}`);
        exchangeSegment = 'NSE_FNO';
      } else if (exchangeSegment === 'NSE') {
        // Smart detection: SENSEX should use BSE_FNO
        exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        console.log(`⚡ AUTO-FIX: Converting incorrect exchange 'NSE' → '${exchangeSegment}' for ${symbol.name}`);
      } else if (exchangeSegment === 'BSE') {
        console.log(`⚡ AUTO-FIX: Converting incorrect exchange 'BSE' → 'BSE_FNO' for F&O option ${symbol.name}`);
        exchangeSegment = 'BSE_FNO';
      } else if (!exchangeSegment || exchangeSegment.trim() === '') {
        // Smart default: SENSEX uses BSE_FNO, others use NSE_FNO
        exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        console.log(`⚡ AUTO-FIX: No exchange set, using '${exchangeSegment}' for ${symbol.name} (index: ${symbol.index})`);
      }

      // ✅ SMART PARAMETER CONSTRUCTION - Only send valid parameters
      const orderPayload: any = {
        dhanClientId,
        correlationId,
        transactionType: symbol.transactionType,
        exchangeSegment: exchangeSegment, // ⚡ Using migrated value
        productType: symbol.productType || 'INTRADAY',
        orderType: symbol.orderType || 'MARKET',
        validity: symbol.validity || 'DAY',
        securityId: symbol.securityId,
        quantity: symbol.quantity,
        disclosedQuantity: symbol.disclosedQuantity || 0,
        price: symbol.price || 0,
        triggerPrice: symbol.triggerPrice || 0,
        afterMarketOrder: symbol.afterMarketOrder || false,
        userId: userIdRef.current  // ⚡ Fallback for session-less auth
      };
      
      // ✅ Only add amoTime if afterMarketOrder is true
      if (symbol.afterMarketOrder && symbol.amoTime) {
        orderPayload.amoTime = symbol.amoTime;
      }
      
      // ✅ Only add BO/CO values if productType requires them
      if (symbol.productType === 'BO' && symbol.boProfitValue) {
        orderPayload.boProfitValue = symbol.boProfitValue;
      }
      if ((symbol.productType === 'BO' || symbol.productType === 'CO') && symbol.boStopLossValue) {
        orderPayload.boStopLossValue = symbol.boStopLossValue;
      }
      
      console.log(`📊 ORDER PAYLOAD (smart-cleaned):`, JSON.stringify(orderPayload, null, 2));
      
      const response = await fetch(`${serverUrl}/execute-dhan-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify(orderPayload)
      });

      console.log(`📥 Response received: Status ${response.status}`);
      const data = await response.json();
      console.log(`📊 FULL RESPONSE DATA:`, JSON.stringify(data, null, 2));
      console.log(`  ✅ Success: ${data.success}`);
      console.log(`  📋 Order ID: ${data.orderId}`);
      console.log(`  💰 Average Price: ${data.averagePrice}`);
      console.log(`  📝 Message: ${data.message}`);
      console.log(`  ❌ Error: ${data.error}`);
      const executionTime = Math.round(performance.now() - startTime);

      if (data.success && data.orderId) {
        console.log(`��� Order successful! Order ID: ${data.orderId}`);
        const position: ActivePosition = {
          symbolId: symbol.id,
          symbolName: symbol.name,
          orderId: data.orderId,
          securityId: symbol.securityId,
          quantity: symbol.quantity,
          entryPrice: data.averagePrice || symbol.price,
          currentPrice: data.averagePrice || symbol.price,
          pnl: 0,
          targetAmount: symbol.targetAmount,
          stopLossAmount: symbol.stopLossAmount,
          
          // ⚡ Initialize trailing fields
          currentTarget: symbol.targetAmount, // Start with base target
          currentStopLoss: symbol.stopLossAmount, // Start with base stop loss
          trailingEnabled: symbol.trailingEnabled || false,
          trailingActivationAmount: symbol.trailingActivationAmount || 0,
          targetJumpAmount: symbol.targetJumpAmount || 0,
          stopLossJumpAmount: symbol.stopLossJumpAmount || 0,
          trailingActivated: false,
          highestPnL: 0, // Track highest profit for trailing
          
          entryTime: Date.now(),
          optionType: symbol.optionType,
          index: symbol.index,
          productType: symbol.productType || 'INTRADAY', // ⚡ Store to use same type for exit
          exchangeSegment: exchangeSegment // ⚡ Store to use for exit
        };

        // ⚡ SAVE POSITION METADATA TO LOCALSTORAGE (for persistence across page refresh!)
        try {
          const existingMetadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
          existingMetadata[data.orderId] = {
            targetAmount: symbol.targetAmount,
            stopLossAmount: symbol.stopLossAmount,
            currentTarget: symbol.targetAmount,
            currentStopLoss: symbol.stopLossAmount,
            trailingEnabled: symbol.trailingEnabled || false,
            trailingActivationAmount: symbol.trailingActivationAmount || 0,
            targetJumpAmount: symbol.targetJumpAmount || 0,
            stopLossJumpAmount: symbol.stopLossJumpAmount || 0,
            trailingActivated: false,
            highestPnL: 0,
            symbolName: symbol.name,
            optionType: symbol.optionType,
            savedAt: Date.now()
          };
          localStorage.setItem('position_metadata', JSON.stringify(existingMetadata));
          console.log(`💾 SAVED Position Metadata for ${data.orderId}:`, existingMetadata[data.orderId]);
        } catch (err) {
          console.error('Failed to save position metadata:', err);
        }

        // INITIALIZE MONITORING STATUS IMMEDIATELY (SHOW CARD RIGHT AWAY!)
        const positionDirection = symbol.optionType === 'CE' ? 'BULLISH' : 'BEARISH';
        const initialStatus = {
          decision: 'HOLD' as const,
          reasoning: `POSITION JUST ACTIVATED! Monitoring ${positionDirection} trade. AI Signal: ${signal.action} (${signal.confidence}% confidence). Waiting for first monitoring cycle to analyze market conditions...`,
          marketAnalysis: {
            trend: 'Analyzing...',
            momentum: 'Analyzing...',
            strength: 'Analyzing...',
            nextMoment: 'Fetching fresh market data and analyzing indicators...'
          },
          aiSignal: signal.action,
          confidence: signal.confidence,
          currentPnL: 0,
          pnlPercentage: 0,
          indicators: {
            ema9: 0,
            ema21: 0,
            rsi: 50,
            macd: 0,
            adx: 0,
            vwap: 0
          },
          timestamp: Date.now()
        };
        
        setPositionMonitoringStatus(prev => ({
          ...prev,
          [data.orderId]: initialStatus
        }));
        
        console.log(`MONITORING CARD ACTIVATED for ${symbol.name} - Card will show immediately and update every 1 second!`);
        console.log(`📊 Position Created with Target: ₹${position.targetAmount}, Stop Loss: ₹${position.stopLossAmount}`);
        console.log(`⚡ Trailing Enabled: ${position.trailingEnabled ? 'YES' : 'NO'}${position.trailingEnabled ? ` (Activate: ₹${position.trailingActivationAmount}, Jump: ₹${position.targetJumpAmount})` : ''}`);

        setActivePositions(prev => [...prev, position]);
        setTradingSymbols(prev => prev.filter(s => s.id !== symbol.id));
        setStats(prev => ({ ...prev, totalOrders: prev.totalOrders + 1 }));

        onLog({
          timestamp: Date.now(),
          type: 'ORDER_SUCCESS',
          message: `ORDER EXECUTED! ${symbol.name} | ID: ${data.orderId} | Price: Rs.${data.averagePrice} | ${executionTime}ms | Monitoring ACTIVE!`
        });
        
        // 🔊 PLAY ORDER PLACED SOUND
        notifyOrderPlaced();
        
        // ⚡⚡⚡ TRIGGER FIRST MONITORING CHECK AFTER 3 SECONDS
        // Give Dhan API time to register the position in their system
        console.log(`Triggering first monitoring check in 3 seconds for fresh market analysis...`);
        setTimeout(() => {
          console.log(`🔥 FIRST MONITORING CHECK: Analyzing ${symbol.name}...`);
          monitorPositions().catch(err => console.error('First monitoring check error:', err));
        }, 3000); // ⚡ CRITICAL: Wait 3s for Dhan to register position
      } else {
        console.error(`❌ ❌ ❌ ORDER FAILED!`);
        console.error(`  Success: ${data.success}`);
        console.error(`  Order ID: ${data.orderId}`);
        console.error(`  Message: ${data.message}`);
        console.error(`  Error: ${data.error}`);
        console.error(`  Full Response:`, JSON.stringify(data, null, 2));
        console.error(`\n📤 PAYLOAD THAT WAS SENT:`, JSON.stringify(orderPayload, null, 2));
        
        onLog({
          timestamp: Date.now(),
          type: 'ORDER_FAILED',
          message: `❌ Order failed! ${data.error || data.message || 'Unknown error'}\n  Reason: success=${data.success}, orderId=${data.orderId || 'N/A'}, error=${data.error}\n  Message: ${data.message || 'N/A'}`
        });
      }
    } catch (error) {
      console.error(`❌ Order execution exception:`, error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Order execution error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  };

  // ============ MONITOR POSITIONS ============
  const monitorPositions = async () => {
    // ⚡ CRITICAL: Skip monitoring if disabled by user (USE REF FOR IMMEDIATE CHECK)
    if (!isPositionMonitorActiveRef.current) {
      console.log('⏭️ Position monitor is DISABLED - Skipping auto-exit checks');
      return;
    }

    console.log('☁️ Backend monitor owns exits and P&L updates - syncing UI only.');
    await syncEngineState();
    return;
    
    // ⚡ CRITICAL FIX: Always fetch P&L and check wallet, even with no active positions
    // This ensures wallet debit happens after closing profitable positions
    
    try {
      // ⚡ FETCH REAL POSITIONS FROM DHAN API (ALWAYS, not just when positions active)
      const freshToken = await getFreshAccessToken();
      const positionsUrl = userIdRef.current
        ? `${serverUrl}/positions?userId=${encodeURIComponent(userIdRef.current)}`
        : `${serverUrl}/positions`;
      const positionsResponse = await fetch(positionsUrl, {
        headers: {
          Authorization: `Bearer ${freshToken}`
        }
      });

      const positionsData = await positionsResponse.json();
      
      if (!positionsData.success || !positionsData.positions) {
        console.error('❌ Failed to fetch positions from Dhan');
        return;
      }

      const dhanPositions = positionsData.positions;
      console.log(`📊 Fetched ${dhanPositions.length} positions from Dhan API`);

      // Calculate total unrealized and realized P&L from all positions
      let totalUnrealizedPnL = 0;
      let totalRealizedPnL = 0;

      for (const dhanPos of dhanPositions) {
        const unrealized = parseFloat(dhanPos.unrealizedProfit || dhanPos.unrealizedPnl || 0);
        const realized = parseFloat(dhanPos.realizedProfit || dhanPos.realizedPnl || 0);
        
        totalUnrealizedPnL += unrealized;
        totalRealizedPnL += realized;

        console.log(`  - ${dhanPos.tradingSymbol}: Unrealized: ₹${unrealized.toFixed(2)}, Realized: ₹${realized.toFixed(2)}`);
      }

      // Update stats with real P&L
      const totalPnL = totalUnrealizedPnL + totalRealizedPnL;
      setStats(prev => ({
        ...prev,
        unrealizedPnL: totalUnrealizedPnL,
        realizedPnL: totalRealizedPnL,
        totalPnL: totalPnL
      }));

      console.log(`💰 TOTAL P&L: Unrealized: ₹${totalUnrealizedPnL.toFixed(2)}, Realized: ₹${totalRealizedPnL.toFixed(2)}, Total: ₹${totalPnL.toFixed(2)}`);

      // ✅ FIX: Save total P&L to backend for admin panel display
      try {
        const pnlResponse = await fetch(`${serverUrl}/pnl/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`
          },
          body: JSON.stringify({
            totalPnL,
            unrealizedPnL: totalUnrealizedPnL,
            realizedPnL: totalRealizedPnL,
            timestamp: Date.now()
          })
        });
        
        const pnlData = await pnlResponse.json();
        
        if (pnlResponse.ok) {
          console.log(`💾 Saved P&L to backend: ₹${totalPnL.toFixed(2)}`);
          if (pnlData.results) {
            console.log(`📊 Save results:`, pnlData.results);
          }
        } else {
          console.error('❌ P&L save error:', pnlData.error);
          // Don't block monitoring if P&L save fails - it will retry on next update
        }
      } catch (pnlError: any) {
        console.error('❌ Failed to save P&L to backend:', pnlError?.message || pnlError);
        // Don't block monitoring if P&L save fails - it will retry on next update
      }

      // 💰 AUTO-DEBIT WALLET CHECK: If total profit > ₹200, deduct ₹89
      const totalProfit = totalUnrealizedPnL + totalRealizedPnL;
      if (totalProfit > 200) {
        try {
          console.log(`\n💰 PROFIT ₹${totalProfit.toFixed(2)} > ₹200 - Checking wallet debit...`);
          
          // ⚡ Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
          
          const debitResponse = await fetch(`${serverUrl}/wallet/check-and-debit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${freshToken}`
            },
            body: JSON.stringify({ totalProfit }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          // ⚡ Handle network errors gracefully
          if (!debitResponse.ok) {
            if (debitResponse.status === 503) {
              console.warn('⚠️ Wallet check temporarily unavailable (network issue) - will retry next cycle');
              return; // Skip this cycle, retry next time
            }
            const errorData = await debitResponse.json().catch(() => ({ message: 'Unknown error' }));
            console.error(`❌ Wallet check error (${debitResponse.status}):`, errorData.message);
            return;
          }
          
          const debitData = await debitResponse.json();
          console.log('💳 Wallet debit response:', debitData);
          
          if (debitData.isPlatformOwner) {
            console.log(`👑 PLATFORM OWNER - No charges applied (Free trading)`);
            onLog({
              timestamp: Date.now(),
              type: 'INFO',
              message: `👑 Platform Owner - No charges (Profit: ₹${totalProfit.toFixed(2)})`
            });
          } else if (debitData.deducted) {
            console.log(`✅ Wallet debited: ₹${debitData.amount}`);
            onLog({
              timestamp: Date.now(),
              type: 'WALLET_DEBIT',
              message: `💳 ₹${debitData.amount} deducted from wallet (Profit: ₹${totalProfit.toFixed(2)})`
            });
          } else {
            console.log(`ℹ️ ${debitData.message}`);
          }
        } catch (walletError: any) {
          if (walletError.name === 'AbortError') {
            console.warn('⚠️ Wallet check timed out after 5s - will retry next cycle');
          } else {
            console.warn('⚠️ Wallet check failed (network error) - will retry next cycle:', walletError.message);
          }
          // Don't crash the engine, just skip this cycle and retry next time
        }
      }

    } catch (error) {
      console.error('❌ Error fetching positions:', error);
    }

    // If no active positions, stop here (P&L and wallet check already done)
    const trackedPositions = activePositionsRef.current;

    if (trackedPositions.length === 0) {
      console.log('✅ No active positions - P&L and wallet check completed');
      return;
    }

    ensureMonitoringStatusInitialized(trackedPositions);

    console.log(`\n🔍 MONITORING ${trackedPositions.length} POSITIONS | ${candleInterval}M Timeframe`);

    // ⚡⚡⚡ CRITICAL FIX: Fetch fresh Dhan positions for P&L update
    let dhanPositions: any[] = [];
    try {
      const freshToken = await getFreshAccessToken();
      const freshPositionsUrl = userIdRef.current
        ? `${serverUrl}/positions?userId=${encodeURIComponent(userIdRef.current)}`
        : `${serverUrl}/positions`;
      const freshPositionsResponse = await fetch(freshPositionsUrl, {
        headers: {
          Authorization: `Bearer ${freshToken}`
        }
      });

      const freshPositionsData = await freshPositionsResponse.json();
      if (freshPositionsData.success && freshPositionsData.positions) {
        dhanPositions = freshPositionsData.positions;
        console.log(`🔄 Fetched ${dhanPositions.length} fresh positions for P&L update`);
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch fresh positions for monitoring:', err);
    }

    // Now monitor each position for exit conditions
    for (let posIdx = 0; posIdx < trackedPositions.length; posIdx++) {
      // ⚡⚡⚡ CRITICAL: Always read LATEST position from ref (trailing may have updated it)
      const position = activePositionsRef.current.find(p => p.orderId === trackedPositions[posIdx].orderId) || trackedPositions[posIdx];
      try {
        // ⚡⚡⚡ SKIP if position is already exiting (prevents duplicate orders!)
        if (exitingPositionsRef.current.has(position.orderId)) {
          console.log(`⏭️ Skipping ${position.symbolName} - Exit order already in progress (orderId: ${position.orderId})`);
          continue;
        }
        
        // ⚡⚡⚡ NEW: Check exit failure count to prevent infinite retry loop
        const failureData = exitFailureCountRef.current.get(position.orderId);
        const MAX_EXIT_FAILURES = 3; // Maximum failed exit attempts before giving up
        const RETRY_DELAY_MS = 30000; // 30 seconds between retries after failure
        
        if (failureData) {
          if (failureData.count >= MAX_EXIT_FAILURES) {
            // Too many failures - stop trying and require manual intervention
            console.log(`🚫 SKIP ${position.symbolName} - Max exit failures reached (${failureData.count}/${MAX_EXIT_FAILURES}). Requires manual exit.`);
            
            // Update monitoring status to show error
            setPositionMonitoringStatus(prev => ({
              ...prev,
              [position.orderId]: {
                decision: 'HOLD',
                reasoning: `❌ AUTO-EXIT FAILED ${failureData.count} times! Please exit manually using MARKET EXIT button. (Last error: Insufficient funds or API limit)`,
                marketAnalysis: {
                  trend: 'ERROR',
                  momentum: 'N/A',
                  strength: 'N/A',
                  nextMoment: 'Manual intervention required'
                },
                aiSignal: 'ERROR',
                confidence: 0,
                currentPnL: position.pnl || 0,
                pnlPercentage: 0,
                timestamp: Date.now()
              }
            }));
            
            continue; // Skip this position
          }
          
          // Check if enough time has passed since last failed attempt
          const timeSinceLastAttempt = Date.now() - failureData.lastAttempt;
          if (timeSinceLastAttempt < RETRY_DELAY_MS) {
            const remainingSeconds = Math.ceil((RETRY_DELAY_MS - timeSinceLastAttempt) / 1000);
            console.log(`⏳ SKIP ${position.symbolName} - Waiting ${remainingSeconds}s before retry (attempt ${failureData.count + 1}/${MAX_EXIT_FAILURES})`);
            continue; // Skip this position for now
          }
        }
        
        const monitorStart = performance.now();
        
        // ⚡⚡⚡ MATCH WITH DHAN POSITION FOR FRESH P&L
        const dhanPosition = dhanPositions.find((dp: any) => 
          dp.tradingSymbol === position.symbolName || 
          dp.securityId === position.securityId.toString()
        );

        // ⚡⚡⚡ CRITICAL: Check if position is closed in Dhan (netQty = 0)
        // This prevents closed positions from reappearing in monitoring
        const netQty = typeof dhanPosition?.netQty === 'string' ? parseInt(dhanPosition.netQty) : (dhanPosition?.netQty || 0);
        if (dhanPosition && netQty === 0) {
          console.log(`🚪 Position CLOSED in Dhan: ${position.symbolName} (netQty = ${dhanPosition.netQty})`);
          
          // Remove from exiting ref and failure counter
          exitingPositionsRef.current.delete(position.orderId);
          exitFailureCountRef.current.delete(position.orderId); // ⚡⚡⚡ NEW: Clear failure counter
          
          // Remove from active positions
          setActivePositions(prev => prev.filter(p => p.orderId !== position.orderId));
          
          // ⚡ CLEAN UP POSITION METADATA FROM LOCALSTORAGE
          try {
            const metadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
            delete metadata[position.orderId];
            localStorage.setItem('position_metadata', JSON.stringify(metadata));
            console.log(`🗑️ DELETED Position Metadata for ${position.orderId}`);
          } catch (err) {
            console.error('Failed to delete position metadata:', err);
          }
          
          // Clear monitoring status
          setPositionMonitoringStatus(prev => {
            const updated = { ...prev };
            delete updated[position.orderId];
            console.log(`🔴 MONITORING CARD CLOSED for ${position.symbolName} (Dhan netQty = 0)`);
            return updated;
          });
          
          onLog({
            timestamp: Date.now(),
            type: 'INFO',
            message: `✅ Position auto-removed: ${position.symbolName} (Closed in Dhan)`
          });
          
          console.log(`✅ Removed closed position from monitoring: ${position.symbolName}`);
          continue; // Skip to next position
        }
        
        // ⚡⚡⚡ If position NOT found in Dhan at all, check if it's a new position
        if (!dhanPosition) {
          // ⚡ CRITICAL FIX: Give 10 seconds grace period for new positions to appear in Dhan API
          const positionAge = Date.now() - position.entryTime;
          const isNewPosition = positionAge < 10000; // Less than 10 seconds old
          
          if (isNewPosition) {
            console.log(`⏳ Position NOT YET in Dhan API: ${position.symbolName} (age: ${Math.round(positionAge/1000)}s) - Waiting for Dhan to update...`);
            
            // ⚡ Don't remove new positions - Dhan API needs time to reflect the order
            // Keep the initial monitoring status showing "Analyzing..."
            continue; // Skip to next position
          } else {
            // Position is old and not found - it was actually closed
            console.log(`🚪 Position NOT FOUND in Dhan: ${position.symbolName} (age: ${Math.round(positionAge/1000)}s) - Removing...`);
            
            // Remove from active positions
            setActivePositions(prev => prev.filter(p => p.orderId !== position.orderId));
            
            // ⚡ CLEAN UP POSITION METADATA FROM LOCALSTORAGE
            try {
              const metadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
              delete metadata[position.orderId];
              localStorage.setItem('position_metadata', JSON.stringify(metadata));
              console.log(`🗑️ DELETED Position Metadata for ${position.orderId}`);
            } catch (err) {
              console.error('Failed to delete position metadata:', err);
            }
            
            // Clear monitoring status
            setPositionMonitoringStatus(prev => {
              const updated = { ...prev };
              delete updated[position.orderId];
              console.log(`🔴 MONITORING CARD CLOSED for ${position.symbolName} (Not found in Dhan)`);
              return updated;
            });
            
            onLog({
              timestamp: Date.now(),
              type: 'INFO',
              message: `✅ Position auto-removed: ${position.symbolName} (Not found in Dhan)`
            });
            
            console.log(`✅ Removed missing position from monitoring: ${position.symbolName}`);
            continue; // Skip to next position
          }
        }

        // Get fresh currentPrice and P&L from Dhan
        let currentPrice = position.currentPrice;
        let pnl = position.pnl || 0;

        // Update from Dhan data
        currentPrice = parseFloat(dhanPosition.lastPrice || dhanPosition.ltp || position.currentPrice);
        pnl = parseFloat(dhanPosition.unrealizedProfit || dhanPosition.unrealizedPnl || 0);
        
        console.log(`🔄 ${position.symbolName} - Fresh Price: ₹${currentPrice.toFixed(2)}, Fresh P&L: ₹${pnl.toFixed(2)}`);
        console.log(`📊 Position Details - Target: ₹${position.currentTarget || position.targetAmount}, SL: ₹${position.currentStopLoss || position.stopLossAmount}`);
        
        // ⚡⚡⚡ CRITICAL FIX: Update position in activePositions array with fresh P&L
        // This ensures the UI displays correct values in Active Positions card
        setActivePositions(prev => 
          prev.map(p => p.orderId === position.orderId ? {
            ...p,
            currentPrice: currentPrice,
            pnl: pnl
          } : p)
        );
        
        // ⚡⚡⚡ TRAILING STOP LOSS LOGIC (REF-SAFE) ⚡⚡⚡
        if (position.trailingEnabled && pnl > 0) {
          // Initialize current values if not set
          const currentTarget = position.currentTarget || position.targetAmount;
          const currentStopLossVal = position.currentStopLoss || position.stopLossAmount;
          const currentHighestPnL = position.highestPnL || 0;
          
          // Track if anything changed for ref update
          let trailingChanged = false;
          let newTrailingActivated = position.trailingActivated || false;
          let newCurrentTarget = currentTarget;
          let newCurrentStopLoss = currentStopLossVal;
          let newHighestPnL = currentHighestPnL;
          
          // Update highest PnL
          if (pnl > currentHighestPnL) {
            newHighestPnL = pnl;
            trailingChanged = true;
            
            // Check if trailing should activate or continue
            const activationAmount = position.trailingActivationAmount || 0;
            const targetJump = position.targetJumpAmount || 0;
            const stopLossJump = position.stopLossJumpAmount || 0;
            
            // Activate trailing when profit reaches activation amount
            if (!newTrailingActivated && pnl >= activationAmount) {
              newTrailingActivated = true;
              console.log(`🔥 TRAILING ACTIVATED for ${position.symbolName} at profit ₹${pnl.toFixed(2)}`);
            }
            
            // If trailing is activated, update target and stop loss
            if (newTrailingActivated && targetJump > 0 && stopLossJump > 0) {
              const profitAboveActivation = pnl - activationAmount;
              const numberOfJumps = Math.floor(profitAboveActivation / targetJump);
              
              if (numberOfJumps > 0) {
                const calcTarget = position.targetAmount + (numberOfJumps * targetJump);
                const calcStopLoss = position.stopLossAmount - (numberOfJumps * stopLossJump);
                
                if (calcTarget !== newCurrentTarget || calcStopLoss !== newCurrentStopLoss) {
                  const oldTarget = newCurrentTarget;
                  const oldStopLoss = newCurrentStopLoss;
                  
                  newCurrentTarget = calcTarget;
                  newCurrentStopLoss = calcStopLoss;
                  
                  console.log(`📊 TRAILING UPDATE for ${position.symbolName}:`);
                  console.log(`   Profit: ₹${pnl.toFixed(2)} (Highest: ₹${newHighestPnL.toFixed(2)})`);
                  console.log(`   Target: ₹${oldTarget} → ₹${newCurrentTarget} (+₹${targetJump})`);
                  console.log(`   Stop Loss: ₹${oldStopLoss} → ₹${newCurrentStopLoss} (-₹${stopLossJump})`);
                  
                  if (newCurrentStopLoss <= 0) {
                    console.log(`   🟢 PROFIT LOCKED! Stop Loss is now at ₹${newCurrentStopLoss}`);
                  }
                  
                  onLog({
                    timestamp: Date.now(),
                    type: 'TRAILING_UPDATE',
                    message: `⚡ Trailing updated for ${position.symbolName}: Target ₹${newCurrentTarget}, SL ₹${newCurrentStopLoss}${newCurrentStopLoss <= 0 ? ' 🟢 PROFIT LOCKED!' : ''}`,
                    data: { symbol: position.symbolName, pnl, highestPnL: newHighestPnL, oldTarget, newTarget: newCurrentTarget, oldStopLoss, newStopLoss: newCurrentStopLoss, profitLocked: newCurrentStopLoss <= 0 }
                  });
                }
              }
            }
          }
          
          // ⚡⚡⚡ CRITICAL: Update BOTH state AND ref so trailing persists across iterations
          if (trailingChanged) {
            const updatedFields = {
              currentTarget: newCurrentTarget,
              currentStopLoss: newCurrentStopLoss,
              trailingActivated: newTrailingActivated,
              highestPnL: newHighestPnL
            };
            
            // Update state (triggers UI re-render)
            setActivePositions(prev => 
              prev.map(p => p.orderId === position.orderId ? { ...p, ...updatedFields } : p)
            );
            
            // ⚡⚡⚡ CRITICAL: Update ref IMMEDIATELY so next loop iteration uses fresh values
            activePositionsRef.current = activePositionsRef.current.map(p => 
              p.orderId === position.orderId ? { ...p, ...updatedFields } : p
            );
            
            // Update localStorage metadata
            try {
              const metadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
              if (metadata[position.orderId]) {
                Object.assign(metadata[position.orderId], updatedFields);
                localStorage.setItem('position_metadata', JSON.stringify(metadata));
                console.log(`💾 UPDATED Position Metadata for ${position.orderId} (trailing)`);
              }
            } catch (err) {
              console.error('Failed to update position metadata:', err);
            }
          }
        }
        
        // ⚡ ULTRA-FAST: Get fresh AI signal to check market direction
        const freshToken = await getFreshAccessToken();
        const signalResponse = await fetch(`${serverUrl}/advanced-ai-signal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`
          },
          body: JSON.stringify({
            index: position.index,
            interval: candleInterval, // ⚡ USE SAME TIMEFRAME AS ENGINE!
            accountBalance: 100000
          })
        });

        const signalData = await signalResponse.json();
        const monitorEnd = performance.now();

        if (!signalData.signal) {
          console.error('❌ No signal returned from monitoring check');
          
          // ⚡ FALLBACK: Create basic monitoring status even without AI signal
          const pnlPercentage = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
          
          // Basic exit logic without AI
          let decision: 'HOLD' | 'EXIT' = 'HOLD';
          let reasoning = '';
          
          // ⚡ Use dynamic target/stop loss for trailing
          const activeTarget = position.currentTarget || position.targetAmount;
          const activeStopLoss = position.currentStopLoss || position.stopLossAmount;
          
          if (pnl <= -activeStopLoss) {
            decision = 'EXIT';
            reasoning = `🛑 STOP LOSS HIT - Protecting capital (Loss: ₹${pnl.toFixed(2)})`;
          } else if (pnl >= activeTarget) {
            decision = 'EXIT';
            reasoning = `🎯 TARGET ACHIEVED - Booking profit (Profit: ₹${pnl.toFixed(2)})`;
          } else {
            reasoning = `⏳ MONITORING - Current P&L: ₹${pnl.toFixed(2)} (${pnlPercentage.toFixed(1)}%). Waiting for AI signal...`;
          }
          
          // Update with basic status
          setPositionMonitoringStatus(prev => ({
            ...prev,
            [position.orderId]: {
              decision,
              reasoning,
              marketAnalysis: {
                trend: 'Analyzing...',
                momentum: 'Fetching data...',
                strength: 'UNKNOWN',
                nextMoment: 'Waiting for market data...'
              },
              aiSignal: 'WAIT',
              confidence: 0,
              currentPnL: pnl,
              pnlPercentage,
              indicators: {
                ema9: 0,
                ema21: 0,
                rsi: 50,
                macd: 0,
                adx: 0,
                vwap: 0
              },
              timestamp: Date.now()
            }
          }));
          
          continue;
        }

        const currentSignal = signalData.signal;
        
        // Calculate P&L percentage
        const pnlPercentage = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

        // ⚡⚡⚡ INTELLIGENT MARKET ANALYSIS (HEARTBEAT OF SYSTEM!) ⚡⚡⚡
        const indicators = currentSignal.indicators;
        const marketRegime = currentSignal.marketRegime;
        
        // Analyze market momentum and strength
        const isTrending = indicators.adx > 25;
        const isStrongTrend = indicators.adx > 40;
        const trendDirection = indicators.ema9 > indicators.ema21 ? 'BULLISH' : 'BEARISH';
        const isPriceAboveVWAP = indicators.priceAboveVWAP;
        const rsiStrength = indicators.rsi > 50 ? 'BULLISH' : 'BEARISH';
        const macdStrength = indicators.macdBullish ? 'BULLISH' : 'BEARISH';
        
        // Count bullish/bearish confirmations
        let bullishCount = 0;
        let bearishCount = 0;
        
        if (trendDirection === 'BULLISH') bullishCount++;
        if (trendDirection === 'BEARISH') bearishCount++;
        if (isPriceAboveVWAP) bullishCount++; else bearishCount++;
        if (rsiStrength === 'BULLISH') bullishCount++; else bearishCount++;
        if (macdStrength === 'BULLISH') bullishCount++; else bearishCount++;
        if (currentSignal.volumeAnalysis.orderFlow === 'BULLISH') bullishCount++;
        if (currentSignal.volumeAnalysis.orderFlow === 'BEARISH') bearishCount++;
        
        // Determine current market momentum
        const marketMomentum = bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL';
        const momentumStrength = Math.max(bullishCount, bearishCount);
        
        // Check if position direction matches market momentum
        const positionDirection = position.optionType === 'CE' ? 'BULLISH' : 'BEARISH';
        const isAlignedWithMarket = positionDirection === marketMomentum;
        
        // ⚡⚡⚡ SMART EXIT LOGIC (DON'T EXIT ON SMALL LOSSES IF MARKET IS FAVORABLE!) ⚡⚡⚡
        let exitReason = null;
        let shouldExit = false;
        let holdReason = '';
        
        // ⚡ Use dynamic target/stop loss for trailing
        const activeTarget = position.currentTarget || position.targetAmount;
        const activeStopLoss = position.currentStopLoss || position.stopLossAmount;

        // CRITICAL EXIT CONDITIONS (ALWAYS EXIT)
        // 1. Stop Loss Hit (Hard Exit)
        if (pnl <= -activeStopLoss) {
          exitReason = `🛑 STOP LOSS HIT - Protecting capital (Loss: ₹${pnl.toFixed(2)})`;
          shouldExit = true;
        }
        // 2. Target Hit (Take Profit)
        else if (pnl >= activeTarget) {
          exitReason = `🎯 TARGET ACHIEVED - Booking profit (Profit: ₹${pnl.toFixed(2)})`;
          shouldExit = true;
        }
        // 3. Strong Market Reversal (High Confidence Opposite Signal)
        else if (
          (position.optionType === 'CE' && currentSignal.action === 'BUY_PUT' && currentSignal.confidence >= 90) ||
          (position.optionType === 'PE' && currentSignal.action === 'BUY_CALL' && currentSignal.confidence >= 90)
        ) {
          exitReason = `🔄 STRONG REVERSAL - Market flipped (AI: ${currentSignal.action}, ${currentSignal.confidence}% conf)`;
          shouldExit = true;
        }
        // 4. Extreme Loss with Weak Trend (> 15% loss + weak ADX)
        else if (pnlPercentage < -15 && indicators.adx < 25) {
          exitReason = `🚨 EXTREME LOSS + WEAK TREND - Cut losses (${pnlPercentage.toFixed(1)}%, ADX: ${indicators.adx.toFixed(0)})`;
          shouldExit = true;
        }
        
        // INTELLIGENT HOLD CONDITIONS (DON'T EXIT IF MARKET IS STILL FAVORABLE)
        else {
          // Check if we should HOLD despite small loss
          if (isAlignedWithMarket && momentumStrength >= 3) {
            holdReason = `✅ HOLD - Market momentum ${marketMomentum} matches ${positionDirection} position (${momentumStrength}/6 confirmations). `;
            
            if (isTrending) {
              holdReason += `Strong trend (ADX: ${indicators.adx.toFixed(0)}). `;
            }
            
            if (currentSignal.confidence >= 75) {
              holdReason += `AI confidence high (${currentSignal.confidence}%). `;
            }
            
            holdReason += `Next moment: ${marketMomentum === 'BULLISH' ? '📈 Expecting upward move' : '📉 Expecting downward move'}.`;
            
            // HOLD even with small loss if market is favorable
            if (pnl < 0 && pnl > -activeStopLoss * 0.5) {
              holdReason += ` Small temporary loss (₹${pnl.toFixed(2)}), holding for recovery.`;
            }
          }
          // Market not aligned - check if we should exit
          else if (!isAlignedWithMarket && pnl < -200) {
            exitReason = `⚠️ MARKET NOT FAVORABLE - ${marketMomentum} momentum against ${positionDirection} position (Loss: ₹${pnl.toFixed(2)})`;
            shouldExit = true;
          }
          // WAIT signal with significant loss
          else if (currentSignal.action === 'WAIT' && pnl < -300 && currentSignal.confidence < 60) {
            exitReason = `📉 LOW CONFIDENCE WAIT - Uncertain market with loss (₹${pnl.toFixed(2)}, ${currentSignal.confidence}% conf)`;
            shouldExit = true;
          }
          // Default HOLD if no exit condition met
          else {
            holdReason = `⏳ MONITORING - Market ${marketMomentum}, AI: ${currentSignal.action} (${currentSignal.confidence}%). P&L: ₹${pnl.toFixed(2)} (${pnlPercentage.toFixed(1)}%)`;
          }
        }

        // ⚡⚡⚡ UPDATE POSITION MONITORING STATUS (HEARTBEAT!) ⚡⚡⚡
        const decision = shouldExit ? 'EXIT' : 'HOLD';
        const reasoning = shouldExit ? exitReason! : holdReason;
        
        // Create detailed market analysis for display
        const marketAnalysis = {
          trend: `${trendDirection} (ADX: ${indicators.adx.toFixed(0)})`,
          momentum: `${marketMomentum} (${momentumStrength}/6 confirmations)`,
          strength: isStrongTrend ? 'STRONG' : isTrending ? 'MODERATE' : 'WEAK',
          nextMoment: marketMomentum === 'BULLISH' 
            ? '📈 Expecting upward move - Price likely to rise' 
            : marketMomentum === 'BEARISH'
            ? '📉 Expecting downward move - Price likely to fall'
            : '➡️ Sideways market - No clear direction'
        };
        
        // Update position monitoring status
        setPositionMonitoringStatus(prev => ({
          ...prev,
          [position.orderId]: {
            decision,
            reasoning,
            marketAnalysis,
            aiSignal: currentSignal.action,
            confidence: currentSignal.confidence,
            currentPnL: pnl,
            pnlPercentage,
            indicators: {
              ema9: indicators.ema9,
              ema21: indicators.ema21,
              rsi: indicators.rsi,
              macd: indicators.macd,
              adx: indicators.adx,
              vwap: indicators.vwap
            },
            timestamp: Date.now()
          }
        }));
        
        // Update position P&L in state with fresh data
        setActivePositions(prev => prev.map(p => 
          p.orderId === position.orderId 
            ? { ...p, currentPrice, pnl } 
            : p
        ));

        // ⚡ LOG MONITORING STATUS
        const monitorTime = Math.round(monitorEnd - monitorStart);
        console.log(`📊 ${position.symbolName} | ${decision} | P&L: ₹${pnl.toFixed(2)} (${pnlPercentage.toFixed(1)}%) | ${monitorTime}ms`);
        console.log(`   ${reasoning}`);

        if (shouldExit && exitReason) {
          console.log(`\n🚪 EXIT TRIGGERED: ${exitReason}`);
          
          onLog({
            timestamp: Date.now(),
            type: 'EXIT_SIGNAL',
            message: `🚪 AUTO-EXIT: ${position.symbolName} - ${exitReason}`,
            data: { 
              pnl, 
              pnlPercentage, 
              currentPrice, 
              entryPrice: position.entryPrice,
              reason: exitReason,
              aiSignal: currentSignal.action,
              aiConfidence: currentSignal.confidence,
              marketAnalysis
            }
          });
          
          // 🔊 PLAY AUTO-EXIT SOUND
          notifyAutoExit();
          
          // ⚡ IMMEDIATE EXIT!
          await executeExitOrder(position);
          
          // Update stats
          setStats(prev => ({
            ...prev,
            totalPnL: prev.totalPnL + pnl
          }));
          
          // Clear monitoring status after exit
          setPositionMonitoringStatus(prev => {
            const updated = { ...prev };
            delete updated[position.orderId];
            return updated;
          });
        } else {
          // ✅ HOLD POSITION - Market is favorable
          console.log(`✅ HOLDING ${position.symbolName} - ${holdReason}`);
          
          // Log to activity feed (every 5th check)
          if (Math.random() < 0.2) {
            onLog({
              timestamp: Date.now(),
              type: 'MONITOR',
              message: `💚 HOLDING ${position.symbolName} | ${reasoning}`,
              data: { pnl, pnlPercentage, currentPrice, aiSignal: currentSignal.action, marketAnalysis }
            });
          }
        }

      } catch (error) {
        console.error('Position monitor error:', error);
        onLog({
          timestamp: Date.now(),
          type: 'ERROR',
          message: `❌ Monitor error for ${position.symbolName}: ${error}`
        });
        
        // ⚡ FALLBACK: Update status with error state so UI doesn't stay in loading
        const currentPrice = position.currentPrice;
        const pnl = position.pnl || 0;
        const pnlPercentage = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        
        setPositionMonitoringStatus(prev => ({
          ...prev,
          [position.orderId]: {
            decision: 'HOLD',
            reasoning: `⚠️ Monitoring Error - Last known P&L: ₹${pnl.toFixed(2)} (${pnlPercentage.toFixed(1)}%). System will retry...`,
            marketAnalysis: {
              trend: 'Error fetching data',
              momentum: 'Retrying...',
              strength: 'UNKNOWN',
              nextMoment: 'System recovering from error...'
            },
            aiSignal: 'WAIT',
            confidence: 0,
            currentPnL: pnl,
            pnlPercentage,
            indicators: {
              ema9: 0,
              ema21: 0,
              rsi: 50,
              macd: 0,
              adx: 0,
              vwap: 0
            },
            timestamp: Date.now()
          }
        }));
      }
    }
  };

  // ============ EXECUTE EXIT ORDER ============
  const executeExitOrder = async (position: ActivePosition) => {
    // ⚡⚡⚡ CRITICAL: Prevent duplicate orders using REF (not state!)
    if (exitingPositionsRef.current.has(position.orderId)) {
      console.log(`⚠️ EXIT ALREADY IN PROGRESS for ${position.symbolName} (orderId: ${position.orderId}) - Skipping duplicate order`);
      return;
    }
    
    // ⚡⚡⚡ CRITICAL: Rate limiting to prevent Dhan API throttle (DH-904)
    const timeSinceLastExit = Date.now() - lastExitOrderTimeRef.current;
    const MIN_EXIT_DELAY = 500; // 500ms minimum between exit orders
    
    if (timeSinceLastExit < MIN_EXIT_DELAY) {
      const waitTime = MIN_EXIT_DELAY - timeSinceLastExit;
      console.log(`⏳ RATE LIMIT: Waiting ${waitTime}ms before placing exit order for ${position.symbolName}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Mark position as exiting IMMEDIATELY in ref
    exitingPositionsRef.current.add(position.orderId);
    lastExitOrderTimeRef.current = Date.now(); // Update last exit time
    console.log(`🔒 LOCKED exit for ${position.symbolName} (orderId: ${position.orderId})`);
    
    // Also mark in state for UI
    setActivePositions(prev => prev.map(p => 
      p.orderId === position.orderId ? { ...p, isExiting: true } : p
    ));
    
    const startTime = performance.now();
    
    try {
      const correlationId = `EXIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // ⚡ FORCE MARKET ORDER FOR INSTANT EXECUTION (ignore localStorage)
      const forceMarketOrder = 'MARKET';
      
      console.log(`\\n🚀 ============ EXIT ORDER PLACEMENT ============`);
      console.log(`   Symbol: ${position.symbolName}`);
      console.log(`   Order Type: ${forceMarketOrder} (INSTANT EXECUTION)`);
      console.log(`   Current LTP: ₹${position.currentPrice}`);
      console.log(`   Entry Price: ₹${position.entryPrice}`);
      console.log(`   P&L: ₹${position.pnl?.toFixed(2) || '0.00'}`);
      console.log(`   Quantity: ${position.quantity}`);
      console.log(`   Security ID: ${position.securityId}`);
      console.log(`================================================\\n`);

      onLog({
        timestamp: Date.now(),
        type: 'ORDER_PLACING',
        message: `⚡ PLACING ${forceMarketOrder} EXIT ORDER: ${position.symbolName} | Conf: 100%`
      });

      const freshToken = await getFreshAccessToken();
      const response = await fetch(`${serverUrl}/execute-dhan-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({
          dhanClientId,
          correlationId,
          transactionType: 'SELL',
          exchangeSegment: position.exchangeSegment || 'NSE_FNO', // ⚡ Use stored exchangeSegment from entry order
          productType: position.productType || 'INTRADAY', // ⚡ FIXED: Use same productType as entry order (INTRADAY for F&O, not NRML)
          orderType: forceMarketOrder, // ⚡⚡⚡ ALWAYS MARKET FOR INSTANT EXIT
          validity: 'DAY',
          securityId: position.securityId,
          quantity: position.quantity,
          disclosedQuantity: 0,
          price: 0, // ⚡ ALWAYS 0 for MARKET orders (executes at best price)
          triggerPrice: 0,
          afterMarketOrder: false,
          amoTime: '',
          boProfitValue: 0,
          boStopLossValue: 0
        })
      });

      const data = await response.json();
      const executionTime = Math.round(performance.now() - startTime);

      if (data.success && data.orderId) {
        const exitPrice = data.averagePrice || position.currentPrice;
        const finalPnL = (exitPrice - position.entryPrice) * position.quantity;

        // ⚡ ADD TO TRADING JOURNAL AUTOMATICALLY!
        try {
          const today = new Date().toISOString().split('T')[0];
          await fetch(`${serverUrl}/add-journal-entry`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${freshToken}`
            },
            body: JSON.stringify({
              date: today,
              symbol: position.symbolName,
              strategy: 'AI_ENHANCED_ENGINE',
              side: 'BUY',
              entryPrice: position.entryPrice,
              exitPrice: exitPrice,
              quantity: position.quantity,
              pnl: finalPnL,
              orderId: data.orderId,
              notes: `${position.optionType} option - Target: ₹${position.targetAmount}, SL: ₹${position.stopLossAmount}`
            })
          });
          console.log(`📝 Trade logged to journal: ${position.symbolName} P&L: ₹${finalPnL.toFixed(2)}`);
        } catch (journalError) {
          console.error('Failed to log to journal:', journalError);
        }

        // ⚡ REMOVE POSITION FROM ACTIVE LIST (IT'S NOW CLOSED!)
        setActivePositions(prev => prev.filter(p => p.orderId !== position.orderId));
        
        // ⚡ CLEAN UP POSITION METADATA FROM LOCALSTORAGE
        try {
          const metadata = JSON.parse(localStorage.getItem('position_metadata') || '{}');
          delete metadata[position.orderId];
          localStorage.setItem('position_metadata', JSON.stringify(metadata));
          console.log(`🗑️ DELETED Position Metadata for ${position.orderId}`);
        } catch (err) {
          console.error('Failed to delete position metadata:', err);
        }
        
        // ⚡⚡⚡ CRITICAL: Remove from exiting ref
        exitingPositionsRef.current.delete(position.orderId);
        console.log(`🔓 UNLOCKED exit for ${position.symbolName} (orderId: ${position.orderId}) - Position closed`);
        
        // ⚡⚡⚡ CRITICAL: Clear monitoring status so card disappears!
        setPositionMonitoringStatus(prev => {
          const updated = { ...prev };
          delete updated[position.orderId];
          console.log(`🔴 MONITORING CARD CLOSED for ${position.symbolName} (Position exited)`);
          return updated;
        });
        
        setStats(prev => ({ ...prev, totalOrders: prev.totalOrders + 1 }));

        // ⚡⚡⚡ SUCCESS: Clear failure counter
        exitFailureCountRef.current.delete(position.orderId);
        
        onLog({
          timestamp: Date.now(),
          type: 'ORDER_SUCCESS',
          message: `✅ MARKET EXIT ORDER EXECUTED! ${position.symbolName} | ID: ${data.orderId} | Price: ₹${exitPrice} | P&L: ₹${finalPnL.toFixed(2)} | ${executionTime}ms`
        });
      } else {
        // ⚡⚡⚡ FAILURE: Record failure and keep position locked (PREVENT INFINITE RETRY LOOP)
        const currentFailures = exitFailureCountRef.current.get(position.orderId) || { count: 0, lastAttempt: 0 };
        const newFailureCount = currentFailures.count + 1;
        
        exitFailureCountRef.current.set(position.orderId, {
          count: newFailureCount,
          lastAttempt: Date.now()
        });
        
        // ⚡⚡⚡ CRITICAL: DON'T unlock position - keep it locked to prevent immediate retry
        // Position Monitor will check failure count and retry delay before attempting again
        console.log(`🔒 KEEPING LOCKED ${position.symbolName} (orderId: ${position.orderId}) - Failure #${newFailureCount}. Will retry after 30s delay.`);
        
        // Update UI to show failure count but keep isExiting true
        setActivePositions(prev => prev.map(p => 
          p.orderId === position.orderId ? { ...p, isExiting: true } : p
        ));
        
        const errorMessage = data.error || data.message || 'Unknown error';
        console.error(`❌ EXIT ORDER FAILED for ${position.symbolName} (Attempt ${newFailureCount}):`, errorMessage);
        onLog({
          timestamp: Date.now(),
          type: 'ORDER_FAILED',
          message: `❌ Exit order failed (Attempt ${newFailureCount}/3): ${errorMessage}. ${newFailureCount < 3 ? 'Will retry in 30s.' : 'Manual exit required.'}`
        });
        
        // ⚡ Only unlock if max failures reached (so user can manually exit)
        if (newFailureCount >= 3) {
          exitingPositionsRef.current.delete(position.orderId);
          setActivePositions(prev => prev.map(p => 
            p.orderId === position.orderId ? { ...p, isExiting: false } : p
          ));
          console.log(`🔓 UNLOCKED ${position.symbolName} after ${newFailureCount} failures - Manual exit enabled`);
        }
      }
    } catch (error) {
      // ⚡⚡⚡ EXCEPTION: Record failure and keep position locked (PREVENT INFINITE RETRY LOOP)
      const currentFailures = exitFailureCountRef.current.get(position.orderId) || { count: 0, lastAttempt: 0 };
      const newFailureCount = currentFailures.count + 1;
      
      exitFailureCountRef.current.set(position.orderId, {
        count: newFailureCount,
        lastAttempt: Date.now()
      });
      
      // ⚡⚡⚡ CRITICAL: DON'T unlock position - keep it locked to prevent immediate retry
      console.log(`🔒 KEEPING LOCKED ${position.symbolName} (orderId: ${position.orderId}) - Exception #${newFailureCount}. Will retry after 30s delay.`);
      
      // Update UI to show failure count but keep isExiting true
      setActivePositions(prev => prev.map(p => 
        p.orderId === position.orderId ? { ...p, isExiting: true } : p
      ));
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ EXIT ORDER ERROR for ${position.symbolName} (Attempt ${newFailureCount}):`, errorMessage);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Exit order error (Attempt ${newFailureCount}/3): ${errorMessage}. ${newFailureCount < 3 ? 'Will retry in 30s.' : 'Manual exit required.'}`
      });
      
      // ⚡ Only unlock if max failures reached (so user can manually exit)
      if (newFailureCount >= 3) {
        exitingPositionsRef.current.delete(position.orderId);
        setActivePositions(prev => prev.map(p => 
          p.orderId === position.orderId ? { ...p, isExiting: false } : p
        ));
        console.log(`🔓 UNLOCKED ${position.symbolName} after ${newFailureCount} failures - Manual exit enabled`);
      }
    }
  };

  // ⚡⚡⚡ MANUAL EXIT BUTTON HANDLER ⚡⚡⚡
  const handleManualExit = async (position: ActivePosition) => {
    console.log(`\n🖱️ ============ MANUAL EXIT TRIGGERED ============`);
    console.log(`   Position: ${position.symbolName}`);
    console.log(`   Entry Price: ₹${position.entryPrice}`);
    console.log(`   Current P&L: ₹${position.pnl?.toFixed(2) || '0.00'}`);
    console.log(`   User Action: Manual Exit Button Clicked`);
    console.log(`================================================\n`);
    
    // ⚡⚡⚡ CLEAR any previous failure count (fresh start for manual exit)
    const previousFailures = exitFailureCountRef.current.get(position.orderId);
    if (previousFailures) {
      console.log(`🔄 Clearing ${previousFailures.count} previous auto-exit failures - Fresh manual attempt`);
      exitFailureCountRef.current.delete(position.orderId);
    }
    
    // 🔊 PLAY MANUAL EXIT SOUND
    notifyManualExit();
    
    onLog({
      timestamp: Date.now(),
      type: 'INFO',
      message: `🖱️ MANUAL EXIT: User clicked exit button for ${position.symbolName}`
    });
    
    // Execute immediate market exit
    await executeExitOrder(position);
  };

  return (
    <div className="space-y-4">
      {/* ⚠️ SYMBOL CONFIGURATION WARNING */}
      {(() => {
        const ceSymbols = tradingSymbols.filter(s => s.optionType === 'CE' && s.transactionType === 'BUY');
        const peSymbols = tradingSymbols.filter(s => s.optionType === 'PE' && s.transactionType === 'BUY');
        const hasMissingSymbols = ceSymbols.length === 0 || peSymbols.length === 0;
        
        if (hasMissingSymbols) {
          const missing = [];
          if (ceSymbols.length === 0) missing.push('CE (Call)');
          if (peSymbols.length === 0) missing.push('PE (Put)');
          
          return (
            <Card className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border-red-500/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="size-8 text-red-500 flex-shrink-0 animate-pulse" />
                  <div className="flex-1">
                    <h3 className="font-bold text-red-400 mb-2">⚠️ INCOMPLETE SYMBOL SETUP - ENGINE WILL NOT WORK!</h3>
                    <p className="text-red-200 mb-3">
                      Missing: <span className="font-bold text-red-300">{missing.join(' and ')}</span> BUY symbols
                    </p>
                    <div className="bg-red-950/50 border border-red-500/30 rounded p-3 mb-3">
                      <p className="text-sm text-red-100 mb-2">Engine requires BOTH symbols to execute trades:</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          {ceSymbols.length > 0 ? '✅' : '❌'} 
                          <span className={ceSymbols.length > 0 ? 'text-green-400' : 'text-red-400'}>
                            CE (Call) symbol with Transaction=BUY and ACTIVE
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {peSymbols.length > 0 ? '✅' : '❌'} 
                          <span className={peSymbols.length > 0 ? 'text-green-400' : 'text-red-400'}>
                            PE (Put) symbol with Transaction=BUY and ACTIVE
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-red-200 flex-1">
                        <strong>→ Action Required:</strong> Go to <strong className="text-red-300">Symbols tab</strong> and activate the missing symbol(s)!
                      </p>
                      <Button 
                        onClick={() => {
                          loadSymbols(); // This will auto-activate missing symbols
                          setTimeout(() => window.location.reload(), 100); // Refresh to apply changes
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        🔧 Auto-Fix Now
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }
        return null;
      })()}
      
      {/* ENGINE CONTROLS */}
      <Card className="bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-amber-900/30">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-3">
              <div className="relative">
                <Zap className="size-6 text-amber-500 animate-pulse" />
                <div className="absolute -top-1 -right-1 size-3 rounded-full bg-green-500 animate-ping" />
              </div>
              <div>
                <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
                  ADVANCED AI Trading Engine
                </div>
                <div className="text-xs text-zinc-400 font-normal mt-0.5">
                  ⚡ 15+ Indicators | 🎯 Triple Verification | 💰 Auto P&L Monitor | ⏱️ Millisecond Speed
                </div>
              </div>
            </span>
            <div className="flex gap-2">
              <Badge 
                variant="default"
                className={isRunning 
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse' 
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }
              >
                ⚡ {candleInterval}M | 🚀 Market Exit {isRunning ? '(ACTIVE)' : ''}
              </Badge>
              <Badge 
                variant={marketStatus === 'OPEN' ? 'default' : 'secondary'}
                className={marketStatus === 'OPEN' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}
              >
                {marketStatus}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ⚠️ CRITICAL WARNING - Do NOT close browser/tab/logout */}
          {isRunning && (
            <div className="bg-red-500/10 border-2 border-red-500/50 rounded-lg p-4 mb-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="text-red-400 text-2xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="text-red-400 font-bold text-base mb-1">ENGINE RUNNING - DO NOT INTERRUPT!</h3>
                  <p className="text-red-300 text-sm">
                    ❌ <strong>DO NOT</strong> close this browser tab<br />
                    ❌ <strong>DO NOT</strong> navigate away from this page<br />
                    ❌ <strong>DO NOT</strong> logout from your account<br />
                    <span className="text-red-200 font-semibold">⚡ This will cause signal loss and stop all automated trading!</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Config Row */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label className="text-zinc-400">Candle Interval</Label>
              <Select 
                value={candleInterval} 
                onValueChange={(val: '5' | '15') => {
                  console.log(`⚡ TIMEFRAME CHANGED: ${candleInterval}M → ${val}M`);
                  setCandleInterval(val);
                  void saveEngineState(isRunningRef.current, val, { syncServerEngine: false });
                }} 
                disabled={isRunning}
              >
                <SelectTrigger className="bg-zinc-900 border-zinc-700 hover:border-zinc-600 mt-1 h-10 text-sm font-medium text-white disabled:opacity-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="5" className="text-sm text-zinc-200">5 Minutes</SelectItem>
                  <SelectItem value="15" className="text-sm text-zinc-200">15 Minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-zinc-400">Exit Order Type</Label>
              <div className="mt-1">
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 h-10 px-4 w-full justify-center">
                  <Zap className="size-3 mr-2" />
                  MARKET (Instant Exit)
                </Badge>
                <p className="text-xs text-zinc-300 mt-1">⚡ Always MARKET for guaranteed execution</p>
              </div>
            </div>

            <div>
              <Label className="text-zinc-400">Engine Status</Label>
              <div className="flex items-center gap-2 mt-2">
                {isRunning ? (
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                    <div className="size-2 rounded-full bg-green-500 animate-pulse mr-2" />
                    RUNNING
                  </Badge>
                ) : (
                  <Badge variant="secondary">STOPPED</Badge>
                )}
                
                {/* Position Monitor Status */}
                {isRunning && (
                  <Badge 
                    className={isPositionMonitorActive 
                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                      : "bg-red-500/10 text-red-500 border-red-500/20"}
                  >
                    {isPositionMonitorActive ? (
                      <>
                        <div className="size-2 rounded-full bg-blue-500 animate-pulse mr-2" />
                        Monitor ON
                      </>
                    ) : (
                      <>
                        <Pause className="size-3 mr-2" />
                        Monitor OFF
                      </>
                    )}
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <Label className="text-zinc-400">Next Candle Close</Label>
              <div className="text-sm font-mono text-zinc-100 mt-2">
                {nextCandleClose}
                {secondsToCandle > 0 && (
                  <span className={`text-xs ml-2 font-semibold ${
                    secondsToCandle <= 3 ? 'text-amber-500 animate-pulse' : 'text-zinc-400'
                  }`}>
                    ({secondsToCandle}s{secondsToCandle <= 3 ? ' 🚀' : ''})
                  </span>
                )}
              </div>
              {secondsToCandle > 0 && secondsToCandle <= 3 && (
                <div className="text-xs text-amber-500 mt-1 animate-pulse">
                  ⚡ Fetching signal NOW for instant entry!
                </div>
              )}
            </div>

            <div>
              <Label className="text-zinc-400">Positions</Label>
              <div className="text-sm mt-2">
                <span className="text-amber-500 font-semibold">{tradingSymbols.length}</span> <span className="text-zinc-300">waiting</span> | 
                <span className="text-green-500 font-semibold ml-1">{activePositions.length}</span> <span className="text-zinc-300">active</span>
              </div>
            </div>

            <div>
              <Label className="text-zinc-400">Auto-Execute</Label>
              <div className="text-sm mt-2 flex items-center gap-2">
                <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-600">
                  ⚡ ENABLED
                </Badge>
                <span className="text-xs text-zinc-300">
                  Confidence ≥85%
                </span>
              </div>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2 items-center">
            {!isRunning ? (
              <Button onClick={handleStartEngine} className="bg-green-600 hover:bg-green-700 text-white">
                <Play className="size-4 mr-2" />
                Start Engine
              </Button>
            ) : (
              <>
                <Button onClick={handleStopEngine} variant="destructive" className="text-white">
                  <Pause className="size-4 mr-2" />
                  Stop Engine
                </Button>
                <Badge variant="outline" className="bg-green-900/20 text-green-400 border-green-600 ml-2 px-3 py-1">
                  <div className="size-2 rounded-full bg-green-500 animate-pulse mr-2" />
                  Running {candleInterval}M | Pre-fetch: 2s early | P&L: 1s
                </Badge>
              </>
            )}
            <Button onClick={loadSymbols} variant="outline" size="sm" className="text-white">
              🔄 Reload Symbols
            </Button>
            
            {/* ⚡ POSITION MONITOR CONTROL */}
            {isRunning && (
              <Button 
                onClick={isPositionMonitorActive ? stopPositionMonitor : startPositionMonitor}
                variant={isPositionMonitorActive ? "destructive" : "default"}
                size="sm"
                className={isPositionMonitorActive ? "text-white" : "bg-green-600 hover:bg-green-700 text-white"}
              >
                {isPositionMonitorActive ? (
                  <>
                    <Pause className="size-3 mr-2" />
                    Stop Monitor
                  </>
                ) : (
                  <>
                    <Play className="size-3 mr-2" />
                    Start Monitor
                  </>
                )}
              </Button>
            )}
            
            {/* ⚡ FORCE START TOGGLE (For special sessions) - MORE PROMINENT */}
            <div className={`flex items-center gap-3 ml-auto border-l-2 pl-4 ${
              forceStartEnabled 
                ? 'border-amber-500 bg-amber-500/10 -mx-2 px-4 py-2 rounded-lg' 
                : 'border-zinc-700'
            }`}>
              <div className="flex flex-col">
                <Label htmlFor="force-start-toggle" className={`text-sm font-semibold cursor-pointer flex items-center gap-2 ${
                  forceStartEnabled ? 'text-amber-400' : 'text-zinc-400'
                }`}>
                  <span className="text-lg">{marketStatus === 'WEEKEND' ? '⚠️' : '💡'}</span>
                  Force Start
                </Label>
                <span className={`text-xs ${forceStartEnabled ? 'text-amber-300' : 'text-zinc-400'}`}>
                  (Special Sessions)
                </span>
              </div>
              <Switch
                id="force-start-toggle"
                checked={forceStartEnabled}
                onCheckedChange={setForceStartEnabled}
                disabled={isRunning}
                className={forceStartEnabled ? 'bg-amber-600 scale-110' : ''}
              />
              {forceStartEnabled && (
                <Badge variant="outline" className="bg-amber-900/30 text-amber-300 border-amber-500 text-xs font-bold animate-pulse">
                  ✓ ACTIVE
                </Badge>
              )}
            </div>
            
            <Button 
              onClick={() => {
                console.log('=== ENGINE DEBUG INFO ===');
                console.log('Is Running:', isRunning);
                console.log('Market Status:', marketStatus);
                console.log('Candle Interval:', candleInterval);
                console.log('Trading Symbols:', tradingSymbols.length, tradingSymbols);
                console.log('Active Positions:', activePositions.length, activePositions);
                console.log('Last Signal:', lastSignal);
                console.log('Dhan Client ID:', dhanClientId);
                console.log('Next Candle Close:', nextCandleClose);
                console.log('Seconds to Candle:', secondsToCandle);
                console.log('Last Processed Candle:', lastProcessedCandle);
                console.log('=========================');
                alert('Debug info printed to console!');
              }} 
              variant="outline" 
              size="sm"
              className="text-white"
            >
              🐛 Debug
            </Button>
            
            {/* ⚡ FORCE POSITION MONITOR BUTTON - ALWAYS ENABLED */}
            <Button 
              onClick={async () => {
                console.log('🔥 FORCE POSITION MONITOR TRIGGERED!');
                
                try {
                  // Step 1: Check Dhan for positions (even if activePositions is empty)
                  const result = await forceCheckPositions();
                  
                  if (result.found && result.count > 0) {
                    // Positions found - monitor them
                    console.log(`🚀 Found ${result.count} position(s) - starting monitoring...`);
                    await monitorPositions();
                    console.log('✅ Forced monitoring complete!');
                    alert(`✅ Position monitoring started!\n\n📊 Monitoring ${result.count} active position${result.count > 1 ? 's' : ''}.\n\nP&L tracking and auto-exit enabled.`);
                  } else if (activePositions.length > 0) {
                    // Already have positions in state
                    await monitorPositions();
                    alert(`✅ Position monitoring completed!\n\n📊 Monitored ${activePositions.length} position${activePositions.length > 1 ? 's' : ''}.`);
                  } else {
                    alert('⚠️ No active positions found.\n\nThe system will auto-detect positions every 60 seconds.');
                  }
                } catch (error) {
                  console.error('❌ Forced monitoring error:', error);
                  alert(`❌ Monitoring failed: ${error instanceof Error ? error.message : String(error)}`);
                }
              }} 
              variant="outline" 
              size="sm"
              className="bg-purple-950/30 border-purple-500/50 text-purple-300 hover:bg-purple-900/50"
            >
              <Activity className="size-4 mr-1.5" />
              Force Monitor
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* S/R LEVELS & SIGNAL */}
      {hasAnyAnalysisSignal && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="size-5 text-blue-500" />
                Market Analysis
              </CardTitle>
              <Select value={selectedAnalysisIndex} onValueChange={(value: 'NIFTY' | 'BANKNIFTY' | 'SENSEX') => setSelectedAnalysisIndex(value)}>
                <SelectTrigger className="w-full md:w-[180px] bg-zinc-900 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  <SelectItem value="NIFTY" className="text-zinc-200">NIFTY</SelectItem>
                  <SelectItem value="BANKNIFTY" className="text-zinc-200">BANKNIFTY</SelectItem>
                  <SelectItem value="SENSEX" className="text-zinc-200">SENSEX</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAnalysisSignal ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
                  <span>Showing latest <span className="font-semibold text-zinc-100">{selectedAnalysisIndex}</span> analysis</span>
                  <span>{selectedAnalysisSignal.timeframe || '--'} • {new Date(selectedAnalysisSignal.timestamp || Date.now()).toLocaleTimeString()}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <Label className="text-zinc-400">Action</Label>
                    <div className="font-semibold text-amber-500 mt-1">{selectedAnalysisSignal.action}</div>
                  </div>
                  <div>
                    <Label className="text-zinc-400">Confidence</Label>
                    <div className="font-semibold mt-1">{selectedAnalysisSignal.confidence}%</div>
                  </div>
                  <div>
                    <Label className="text-zinc-400">Bias</Label>
                    <Badge variant={selectedAnalysisSignal.bias === 'Bullish' ? 'default' : 'destructive'} className="mt-1">
                      {selectedAnalysisSignal.bias}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-zinc-400">Institutional</Label>
                    <div className="text-sm mt-1 text-blue-400">{selectedAnalysisSignal.institutional_bias}</div>
                  </div>
                </div>

                {selectedAnalysisSignal.resistance_levels && selectedAnalysisSignal.support_levels && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="p-3 bg-red-950/10 border border-red-900/20 rounded">
                      <div className="text-sm font-semibold text-red-500 mb-2 flex items-center gap-2">
                        <Target className="size-4" />
                        Resistance Levels
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">R1:</span>
                          <span className="text-red-400 font-mono">{formatSignalLevel(selectedAnalysisSignal.resistance_levels.r1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">R2:</span>
                          <span className="text-red-400 font-mono">{formatSignalLevel(selectedAnalysisSignal.resistance_levels.r2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">R3:</span>
                          <span className="text-red-400 font-mono">{formatSignalLevel(selectedAnalysisSignal.resistance_levels.r3)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-green-950/10 border border-green-900/20 rounded">
                      <div className="text-sm font-semibold text-green-500 mb-2 flex items-center gap-2">
                        <Shield className="size-4" />
                        Support Levels
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">S1:</span>
                          <span className="text-green-400 font-mono">{formatSignalLevel(selectedAnalysisSignal.support_levels.s1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">S2:</span>
                          <span className="text-green-400 font-mono">{formatSignalLevel(selectedAnalysisSignal.support_levels.s2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">S3:</span>
                          <span className="text-green-400 font-mono">{formatSignalLevel(selectedAnalysisSignal.support_levels.s3)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedAnalysisSignal.volume_analysis && (
                  <div className="p-3 bg-zinc-800 rounded text-sm">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <span className="text-zinc-400">Volume:</span>
                        <span className={`ml-2 font-semibold ${
                          selectedAnalysisSignal.volume_analysis.is_spike ? 'text-amber-500' : 
                          selectedAnalysisSignal.volume_analysis.is_high ? 'text-yellow-500' : 'text-zinc-400'
                        }`}>
                          {formatSignalLevel(selectedAnalysisSignal.volume_analysis.ratio)}x
                        </span>
                        {selectedAnalysisSignal.volume_analysis.has_data && (
                          <div className="mt-1 text-xs text-zinc-500">
                            Current {formatVolumeCount(selectedAnalysisSignal.volume_analysis.current_volume)} · Avg {formatVolumeCount(selectedAnalysisSignal.volume_analysis.average_volume)}
                          </div>
                        )}
                      </div>
                      <div>
                        <span className="text-zinc-400">Smart Money:</span>
                        <span className={`ml-2 font-semibold ${selectedAnalysisSignal.smart_money_detected ? 'text-green-500' : 'text-zinc-500'}`}>
                          {selectedAnalysisSignal.smart_money_detected ? '✅ YES' : '❌ NO'}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400">Momentum:</span>
                          <span className="ml-2 font-semibold text-blue-400">{getSignalMomentumLabel(selectedAnalysisSignal)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {selectedAnalysisSignal.reasoning && (
                  <div className="text-xs text-zinc-400 italic p-2 bg-zinc-800/50 rounded">
                    {selectedAnalysisSignal.reasoning}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-400">
                No {selectedAnalysisIndex} analysis yet.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ⚡⚡⚡ MULTI-SYMBOL SIGNALS ⚡⚡⚡ */}
      <Card key={`signals-${renderKey}-${multiSymbolSignals.__timestamp || 0}`} className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-5 text-purple-400" />
            Multi-Symbol AI Signals
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {/* NIFTY */}
            <div className={`p-4 rounded-lg border-2 ${
              multiSymbolSignals.NIFTY
                ? multiSymbolSignals.NIFTY.action === 'WAIT'
                  ? 'bg-zinc-800/50 border-zinc-700'
                  : multiSymbolSignals.NIFTY.action.includes('CALL')
                  ? 'bg-green-900/20 border-green-700'
                  : 'bg-red-900/20 border-red-700'
                : 'bg-zinc-800/30 border-zinc-700/50'
            }`}>
              <div className="text-sm font-semibold text-zinc-400 mb-2">NIFTY</div>
              {multiSymbolSignals.NIFTY ? (
                <>
                  <div className={`text-lg font-bold mb-1 ${
                    multiSymbolSignals.NIFTY.action === 'WAIT'
                      ? 'text-zinc-400'
                      : multiSymbolSignals.NIFTY.action.includes('CALL')
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    {multiSymbolSignals.NIFTY.action}
                  </div>
                  <div className="text-sm text-zinc-400">
                    Confidence: <span className="font-semibold">{multiSymbolSignals.NIFTY.confidence}%</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">
                    {multiSymbolSignals.NIFTY.timeframe || '--'} • {new Date(multiSymbolSignals.NIFTY.timestamp || Date.now()).toLocaleTimeString()}
                  </div>
                  {multiSymbolSignals.NIFTY.reasoning && (
                    <div className="text-xs text-zinc-400 mt-2 line-clamp-3">{multiSymbolSignals.NIFTY.reasoning}</div>
                  )}
                  {multiSymbolSignals.NIFTY.bias && (
                    <Badge variant={multiSymbolSignals.NIFTY.bias === 'Bullish' ? 'default' : 'destructive'} className="mt-2">
                      {multiSymbolSignals.NIFTY.bias}
                    </Badge>
                  )}
                </>
              ) : (
                <div className="text-sm text-zinc-400 italic">No signal yet</div>
              )}
            </div>

            {/* BANKNIFTY */}
            <div className={`p-4 rounded-lg border-2 ${
              multiSymbolSignals.BANKNIFTY
                ? multiSymbolSignals.BANKNIFTY.action === 'WAIT'
                  ? 'bg-zinc-800/50 border-zinc-700'
                  : multiSymbolSignals.BANKNIFTY.action.includes('CALL')
                  ? 'bg-green-900/20 border-green-700'
                  : 'bg-red-900/20 border-red-700'
                : 'bg-zinc-800/30 border-zinc-700/50'
            }`}>
              <div className="text-sm font-semibold text-zinc-400 mb-2">BANKNIFTY</div>
              {multiSymbolSignals.BANKNIFTY ? (
                <>
                  <div className={`text-lg font-bold mb-1 ${
                    multiSymbolSignals.BANKNIFTY.action === 'WAIT'
                      ? 'text-zinc-400'
                      : multiSymbolSignals.BANKNIFTY.action.includes('CALL')
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    {multiSymbolSignals.BANKNIFTY.action}
                  </div>
                  <div className="text-sm text-zinc-400">
                    Confidence: <span className="font-semibold">{multiSymbolSignals.BANKNIFTY.confidence}%</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">
                    {multiSymbolSignals.BANKNIFTY.timeframe || '--'} • {new Date(multiSymbolSignals.BANKNIFTY.timestamp || Date.now()).toLocaleTimeString()}
                  </div>
                  {multiSymbolSignals.BANKNIFTY.reasoning && (
                    <div className="text-xs text-zinc-400 mt-2 line-clamp-3">{multiSymbolSignals.BANKNIFTY.reasoning}</div>
                  )}
                  {multiSymbolSignals.BANKNIFTY.bias && (
                    <Badge variant={multiSymbolSignals.BANKNIFTY.bias === 'Bullish' ? 'default' : 'destructive'} className="mt-2">
                      {multiSymbolSignals.BANKNIFTY.bias}
                    </Badge>
                  )}
                </>
              ) : (
                <div className="text-sm text-zinc-400 italic">No signal yet</div>
              )}
            </div>

            {/* SENSEX */}
            <div className={`p-4 rounded-lg border-2 ${
              multiSymbolSignals.SENSEX
                ? multiSymbolSignals.SENSEX.action === 'WAIT'
                  ? 'bg-zinc-800/50 border-zinc-700'
                  : multiSymbolSignals.SENSEX.action.includes('CALL')
                  ? 'bg-green-900/20 border-green-700'
                  : 'bg-red-900/20 border-red-700'
                : 'bg-zinc-800/30 border-zinc-700/50'
            }`}>
              <div className="text-sm font-semibold text-zinc-400 mb-2">SENSEX</div>
              {multiSymbolSignals.SENSEX ? (
                <>
                  <div className={`text-lg font-bold mb-1 ${
                    multiSymbolSignals.SENSEX.action === 'WAIT'
                      ? 'text-zinc-400'
                      : multiSymbolSignals.SENSEX.action.includes('CALL')
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    {multiSymbolSignals.SENSEX.action}
                  </div>
                  <div className="text-sm text-zinc-400">
                    Confidence: <span className="font-semibold">{multiSymbolSignals.SENSEX.confidence}%</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-2">
                    {multiSymbolSignals.SENSEX.timeframe || '--'} • {new Date(multiSymbolSignals.SENSEX.timestamp || Date.now()).toLocaleTimeString()}
                  </div>
                  {multiSymbolSignals.SENSEX.reasoning && (
                    <div className="text-xs text-zinc-400 mt-2 line-clamp-3">{multiSymbolSignals.SENSEX.reasoning}</div>
                  )}
                  {multiSymbolSignals.SENSEX.bias && (
                    <Badge variant={multiSymbolSignals.SENSEX.bias === 'Bullish' ? 'default' : 'destructive'} className="mt-2">
                      {multiSymbolSignals.SENSEX.bias}
                    </Badge>
                  )}
                </>
              ) : (
                <div className="text-sm text-zinc-400 italic">No signal yet</div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-zinc-800/50 rounded text-xs text-zinc-400">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="size-3" />
              <span className="font-semibold">How it works:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>System analyzes all three indices independently</li>
              <li>Each index gets its own AI signal (BUY_CALL, BUY_PUT, or WAIT)</li>
              <li>⚡ ONLY ONE order placed per candle (highest confidence signal)</li>
              <li>Example: NIFTY→85%, BANKNIFTY→45%, SENSEX→78% → Places NIFTY order only</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* ⚡ REAL-TIME ALERT SYSTEM ⚡ */}
      {lastSignal && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <AlertSystem 
              signal={lastSignal} 
              previousSignal={previousSignal}
              timeframe={`${candleInterval}M`}
            />
          </CardContent>
        </Card>
      )}

      {/* ACTIVE POSITIONS */}
      {activePositions.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5 text-yellow-500" />
              Active Positions ({activePositions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activePositions.map((pos) => {
                const monitorStatus = positionMonitoringStatus[pos.orderId];
                const isHolding = monitorStatus?.decision === 'HOLD';
                const isExiting = monitorStatus?.decision === 'EXIT';
                
                return (
                  <div key={pos.orderId} className={`p-4 rounded-lg border-2 ${
                    isExiting ? 'bg-red-950/30 border-red-600' : 
                    isHolding ? 'bg-green-950/30 border-green-600' : 
                    'bg-zinc-800 border-zinc-700'
                  }`}>
                    {/* Position Header */}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-lg">{pos.symbolName}</div>
                          {monitorStatus && (
                            <div className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isExiting ? 'bg-red-600 text-white animate-pulse' : 'bg-green-600 text-white'
                            }`}>
                              {monitorStatus.decision}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400 mt-1">
                          Entry: ₹{pos.entryPrice.toFixed(2)} | Qty: {pos.quantity} | {pos.optionType}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-xl ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ₹{pos.pnl.toFixed(2)}
                        </div>
                        <div className="text-xs text-zinc-400">
                          ({monitorStatus?.pnlPercentage?.toFixed(1) || '0.0'}%)
                        </div>
                        {/* ⚡⚡⚡ MARKET EXIT BUTTON ⚡⚡⚡ */}
                        <Button
                          onClick={() => handleManualExit(pos)}
                          disabled={pos.isExiting}
                          size="sm"
                          className={pos.isExiting ? 'mt-2 w-full bg-zinc-600 cursor-not-allowed' : 'mt-2 w-full bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/30'}
                        >
                          {pos.isExiting ? (
                            <>
                              <RefreshCw className="size-3 mr-1.5 animate-spin" />
                              Exiting...
                            </>
                          ) : (
                            <>
                              <LogOut className="size-3 mr-1.5" />
                              MARKET EXIT
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Risk Levels with Trailing Support & EDIT MODE */}
                    <div className="pt-2 border-t border-zinc-700">
                      {editingPosition === pos.orderId ? (
                        // ⚡ EDIT MODE - Input fields
                        <div className="space-y-2 p-3 bg-zinc-800/50 rounded-lg">
                          <div className="text-xs text-yellow-400 font-semibold mb-2">✏️ Edit Target & Stop Loss</div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-zinc-400">Target (₹)</Label>
                              <Input
                                type="number"
                                value={editValues.target}
                                onChange={(e) => setEditValues(prev => ({ ...prev, target: e.target.value }))}
                                className="h-8 text-sm bg-zinc-900 border-zinc-700 text-green-400"
                                placeholder="e.g. 500"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-zinc-400">Stop Loss (₹)</Label>
                              <Input
                                type="number"
                                value={editValues.stopLoss}
                                onChange={(e) => setEditValues(prev => ({ ...prev, stopLoss: e.target.value }))}
                                className="h-8 text-sm bg-zinc-900 border-zinc-700 text-red-400"
                                placeholder="e.g. -200"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={saveEditPosition}
                              size="sm"
                              className="flex-1 h-7 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <Check className="size-3 mr-1" />
                              Save
                            </Button>
                            <Button
                              onClick={cancelEditPosition}
                              size="sm"
                              variant="outline"
                              className="flex-1 h-7 text-white"
                            >
                              <X className="size-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // ⚡ VIEW MODE - Display with edit button
                        <div className="flex flex-wrap gap-2 text-xs items-center">
                          {/* Target - Show current if trailing active */}
                          <div className="text-green-500">
                            Target: ₹{pos.currentTarget || pos.targetAmount}
                            {pos.trailingActivated && (
                              <span className="ml-1 text-blue-400 animate-pulse">⚡</span>
                            )}
                          </div>
                          <div className="text-zinc-400">|</div>
                          {/* Stop Loss - Green if in profit zone (<=0) */}
                          <div className={
                            (pos.currentStopLoss !== undefined && pos.currentStopLoss <= 0) 
                              ? "text-green-500 font-bold animate-pulse" 
                              : "text-red-500"
                          }>
                            SL: ₹{pos.currentStopLoss || pos.stopLossAmount}
                            {pos.currentStopLoss !== undefined && pos.currentStopLoss <= 0 && (
                              <span className="ml-1">🔒</span>
                            )}
                          </div>
                          {/* Trailing Active Badge */}
                          {pos.trailingEnabled && (
                            <>
                              <div className="text-zinc-400">|</div>
                              <div className={`px-1.5 py-0.5 rounded ${
                                pos.trailingActivated 
                                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                                  : 'bg-zinc-700 text-zinc-400'
                              }`}>
                                Trailing {pos.trailingActivated ? 'ON' : 'OFF'}
                              </div>
                            </>
                          )}
                          <div className="text-zinc-400">|</div>
                          {/* ⚡ EDIT BUTTON */}
                          <Button
                            onClick={() => startEditPosition(
                              pos.orderId,
                              pos.currentTarget || pos.targetAmount,
                              pos.currentStopLoss || pos.stopLossAmount
                            )}
                            size="sm"
                            variant="ghost"
                            className="h-5 px-2 text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                          >
                            <Pencil className="size-3 mr-1" />
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ⚡⚡⚡ POSITION MONITORING ANALYSIS - ONLY SHOWS WHEN POSITIONS ARE ACTIVE ⚡⚡⚡ */}
      {/* 🔴 This card automatically APPEARS when position opens and DISAPPEARS when all positions close */}
      {activePositions.length > 0 && (
        <>
          {/* Info Banner - Explains Auto-Show/Hide Behavior */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-3 animate-in fade-in-50 duration-300">
            <div className="text-blue-400 text-xl">ℹ️</div>
            <div className="flex-1 text-sm text-blue-300">
              <span className="font-semibold">Auto-Monitoring Active:</span> This card appears automatically when you have open positions and disappears when all positions are closed. Real-time updates every second!
            </div>
          </div>
          
          <Card className="bg-gradient-to-br from-purple-950/20 to-blue-950/20 border-purple-500/30 shadow-xl animate-in fade-in-50 duration-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-5 text-purple-400 animate-pulse" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                  🔴 LIVE Position Monitoring
                </span>
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-green-400 font-semibold text-xs">Real-Time Active</span>
                  </div>
                  <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-950/30">
                    {activePositions.length} Position{activePositions.length > 1 ? 's' : ''}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activePositions.map((pos) => {
                const monitorStatus = positionMonitoringStatus[pos.orderId];
                const isHolding = monitorStatus?.decision === 'HOLD';
                const isExiting = monitorStatus?.decision === 'EXIT';
                
                // Show loading state if monitoring data not yet available
                if (!monitorStatus) {
                  return (
                    <div key={pos.orderId} className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-lg">
                      <div className="flex items-center gap-3 text-zinc-400">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
                        <span className="text-sm">Initializing real-time monitoring for <span className="font-bold text-purple-400">{pos.symbolName}</span>...</span>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div key={pos.orderId} className="space-y-3">
                    {/* Monitoring Card - Shows immediately when position activates */}
                    <div className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                      isExiting ? 'bg-red-950/40 border-red-500 shadow-lg shadow-red-500/20 animate-pulse' : 'bg-green-950/40 border-green-500 shadow-lg shadow-green-500/20'
                    }`}>
                        {/* Header with Symbol and Decision */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="font-bold text-lg">{pos.symbolName}</div>
                            <div className={`px-3 py-1 rounded-lg text-sm font-bold ${
                              isExiting ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                            }`}>
                              {isExiting ? '🚪 EXIT SIGNAL' : '✅ HOLD POSITION'}
                            </div>
                            {isHolding && (
                              <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-950/50 px-2 py-1 rounded">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span>Live Monitoring</span>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className={`font-bold text-lg ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              ₹{pos.pnl.toFixed(2)}
                            </div>
                            <div className="text-xs text-zinc-400">
                              {monitorStatus.pnlPercentage.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        {/* Decision Reasoning */}
                        <div className={`p-3 rounded-lg text-sm mb-3 ${
                          isExiting ? 'bg-red-900/60 text-red-100' : 'bg-green-900/60 text-green-100'
                        }`}>
                          <div className="font-semibold mb-1.5 text-base">
                            {isExiting ? '🚨 EXIT DECISION ANALYSIS:' : '💚 HOLDING ANALYSIS:'}
                          </div>
                          <div className="leading-relaxed">
                            {monitorStatus.reasoning}
                          </div>
                        </div>
                        
                        {/* 6 Market Confirmations Analysis */}
                        <div className="mb-3">
                          <div className="text-sm font-semibold text-zinc-300 mb-2">
                            📊 6-Point Market Confirmation Analysis:
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2 bg-zinc-800/70 rounded border border-zinc-700">
                              <div className="text-xs text-zinc-400">Trend Direction</div>
                              <div className="font-semibold text-sm text-white mt-0.5">
                                {monitorStatus.marketAnalysis.trend}
                              </div>
                            </div>
                            <div className="p-2 bg-zinc-800/70 rounded border border-zinc-700">
                              <div className="text-xs text-zinc-400">Market Momentum</div>
                              <div className="font-semibold text-sm text-white mt-0.5">
                                {monitorStatus.marketAnalysis.momentum}
                              </div>
                            </div>
                            <div className="p-2 bg-zinc-800/70 rounded border border-zinc-700">
                              <div className="text-xs text-zinc-400">Trend Strength</div>
                              <div className="font-semibold text-sm text-white mt-0.5">
                                {monitorStatus.marketAnalysis.strength}
                              </div>
                            </div>
                            <div className="p-2 bg-zinc-800/70 rounded border border-zinc-700">
                              <div className="text-xs text-zinc-400">AI Signal</div>
                              <div className="font-semibold text-sm text-white mt-0.5">
                                {monitorStatus.aiSignal}
                              </div>
                            </div>
                            <div className="p-2 bg-zinc-800/70 rounded border border-zinc-700">
                              <div className="text-xs text-zinc-400">AI Confidence</div>
                              <div className="font-semibold text-sm text-white mt-0.5">
                                {monitorStatus.confidence}%
                              </div>
                            </div>
                            <div className="p-2 bg-zinc-800/70 rounded border border-zinc-700">
                              <div className="text-xs text-zinc-400">Position Type</div>
                              <div className="font-semibold text-sm text-white mt-0.5">
                                {pos.optionType === 'CE' ? 'CALL (CE)' : 'PUT (PE)'}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Next Moment Prediction */}
                        <div className="p-3 bg-blue-900/40 rounded-lg text-sm text-blue-100 border border-blue-700 mb-3">
                          <div className="font-semibold mb-1.5">🔮 Next Moment Prediction:</div>
                          <div className="leading-relaxed">{monitorStatus.marketAnalysis.nextMoment}</div>
                        </div>
                        
                        {/* Real-time Heartbeat Status */}
                        <div className="flex justify-between items-center text-xs text-zinc-400 pt-2 border-t border-zinc-700">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              (Date.now() - monitorStatus.timestamp) < 2000 ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                            }`}></div>
                            <span>Updated {Math.round((Date.now() - monitorStatus.timestamp) / 1000)}s ago</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-400">Monitoring Interval:</span>
                            <span className="font-semibold text-purple-400">1 second</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {/* PERFORMANCE STATS */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="size-5 text-blue-500" />
            Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-zinc-400">Signals</Label>
              <div className="text-2xl font-bold">{stats.totalSignals}</div>
            </div>
            <div>
              <Label className="text-zinc-400">Orders</Label>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
            </div>
            <div>
              <Label className="text-zinc-400">Avg Speed</Label>
              <div className="text-2xl font-bold">{stats.avgExecutionTime}ms</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}