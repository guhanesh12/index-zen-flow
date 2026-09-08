// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { BarChart3, Settings, FileText, DollarSign, LogOut, Wallet, MessageSquare, Menu, X, Zap, Server, Key, Link2, Lock, Unlock, MoreVertical, User, FlaskConical, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "./ui/sheet";
const logoWhite = "/logo-white.png";
import { SettingsPanel } from "./SettingsPanel";
import { UserDedicatedIPManager } from "./UserDedicatedIPManager";
import { SymbolManager } from "./SymbolManager";
import { AutoSymbolConfig } from "./AutoSymbolConfig";
import { AdvancedDashboard } from "./AdvancedDashboard";
import { AdvancedPositionMonitor } from "./AdvancedPositionMonitor";
import { EnhancedTradingEngine } from "./EnhancedTradingEngine";
import { TradingJournal } from "./TradingJournal";
import WalletManagement from "./WalletManagement";
import { ProfitDashboard } from "./ProfitDashboard";
import { UserSupport } from "./UserSupport";
import { StrategyManager } from "./StrategyManager";
import { StrategyBacktest } from "./StrategyBacktest";
import { BrokerRequest } from "./BrokerRequest";
import UserProfile from "./UserProfile";
import { projectId } from "@/utils-ext/supabase/info";
import { getServerUrl } from "@/utils-ext/config/apiConfig";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useResponsive } from "../hooks/useResponsive";
import { NotificationBell } from "./NotificationBell";
import { NotificationContainer } from "./NotificationContainer";
import { SEO, SEO_CONFIGS } from "../utils/seo";
import { KpiGrid, MarketOverview, RiskCenter, PerformanceChart, SectionHeader, IndicesTicker, useFundLimits, usePositions } from "./dashboard/DashboardUI";
import { Brain, Shield, Activity as ActivityIcon, Sparkles, ChevronDown, ShoppingCart, Info, LayoutGrid, ShoppingBag, Radio } from "lucide-react";
import { WelcomeOnboarding } from "./WelcomeOnboarding";
import { AIAssistantBot } from "./AIAssistantBot";
import { BrokerLogo } from "../brokerLogos";
import { ProTradingTerminalView } from "./dashboard/ProTradingTerminalView";
import { DhanOrderManager } from "./DhanOrderManager";
import { OrdersSection } from "./OrdersSection";
import { PositionsSection } from "./PositionsSection";


interface TradingDashboardProps {
  accessToken: string;
  onLogout: () => void;
  onOpenLandingAdmin?: () => void;
}

// Symbol with Target/SL
interface TradingSymbol {
  id: string;
  name: string;
  securityId: string;
  expiry: string;
  strike: number;
  optionType: 'CE' | 'PE';
  lotSize: number;
  targetAmount: number;
  stopLossAmount: number;
}

// Active Position
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
  orderId?: string;
}

export function TradingDashboard({ accessToken, onLogout, onOpenLandingAdmin }: TradingDashboardProps) {
  const serverUrl = getServerUrl();
  
  // Get userId from accessToken (JWT decode)
  const [userId, setUserId] = useState<string>('');
  
  useEffect(() => {
    // Decode JWT to get user ID
    if (!accessToken) {
      console.log('⏳ Waiting for access token...');
      return;
    }
    
    try {
      const base64Url = accessToken.split('.')[1];
      if (!base64Url) {
        throw new Error('Invalid token format');
      }
      
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonPayload);
      setUserId(payload.sub || '');
      console.log('✅ User ID decoded from token:', payload.sub);
    } catch (error) {
      console.error('Failed to decode access token:', error);
      setUserId('user_' + Date.now()); // Fallback
    }
  }, [accessToken]);
  
  // Core states
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  // 🔀 Active broker (common for all brokers — Dhan is the default)
  const [activeBroker, setActiveBroker] = useState<string>('dhan');
  const [activeBrokerName, setActiveBrokerName] = useState<string>('Dhan');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // 🔴 REAL DATA — active broker fund limits & positions (auto-refetch on broker switch)
  const { funds: dhanFunds, loading: fundsLoading, error: fundsError } = useFundLimits(serverUrl, accessToken, activeBroker);
  const { positions: dhanPositions, loading: positionsLoading } = usePositions(serverUrl, accessToken, activeBroker);

  // 🌐 Broker-agnostic P&L / qty readers (Dhan, Kite, Groww, Upstox, Fyers, Angel One, Aliceblue, 5paisa)
  const posQty = (p: any) =>
    Number(
      p.netQty ?? p.net_quantity ?? p.netQuantity ?? p.quantity ?? p.qty ?? p.netTradedQuantity ?? 0
    );
  const posPnL = (p: any) => {
    const direct =
      p.pnl ?? p.PnL ?? p.profitAndLoss ?? p.unrealizedProfit ?? p.unrealisedProfit ?? p.unrealised_pnl;
    if (direct !== undefined && direct !== null && direct !== '') return Number(direct) || 0;
    const un = Number(p.unrealizedPnl ?? p.unrealisedPnl ?? p.unrealized_pnl ?? 0) || 0;
    const re = Number(p.realizedPnl ?? p.realisedPnl ?? p.realized_pnl ?? p.realisedProfit ?? 0) || 0;
    return un + re;
  };

  const openPositions = (dhanPositions || []).filter((p: any) => posQty(p) !== 0);
  const closedPositions = (dhanPositions || []).filter((p: any) => posQty(p) === 0);
  const realPositionsPnL = (dhanPositions || []).reduce((s: number, p: any) => s + posPnL(p), 0);
  const openPositionsPnL = openPositions.reduce((s: number, p: any) => s + posPnL(p), 0);
  const closedPositionsPnL = closedPositions.reduce((s: number, p: any) => s + posPnL(p), 0);
  const realOpenTrades = openPositions.length;

  const realAccountBalance = Number(dhanFunds?.availableBalance ?? 0);
  const realMarginUsed = Number(dhanFunds?.utilizationAmount ?? 0);

  const [logs, setLogs] = useState<any[]>([]);

  const normalizeLogs = (rawLogs: any[]) => {
    if (!Array.isArray(rawLogs)) return [];

    return rawLogs
      .filter(Boolean)
      .map((log) => {
        if (typeof log === 'object') {
          return {
            ...log,
            timestamp: typeof log.timestamp === 'number' ? log.timestamp : Date.now(),
            type: typeof log.type === 'string' ? log.type : String(log.type || 'INFO'),
            message: typeof log.message === 'string' ? log.message : JSON.stringify(log.message || log),
          };
        }

        return {
          timestamp: Date.now(),
          type: 'INFO',
          message: String(log),
        };
      })
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 500);
  };

  const areLogsEqual = (currentLogs: any[], nextLogs: any[]) => {
    if (currentLogs.length !== nextLogs.length) return false;

    return currentLogs.every((log, index) => {
      const nextLog = nextLogs[index];
      return (
        log?.timestamp === nextLog?.timestamp &&
        log?.type === nextLog?.type &&
        log?.message === nextLog?.message
      );
    });
  };

  // ⚡ LIVE LOG SYNC FROM BACKEND (same user = same logs on all devices + after refresh)
  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    const loadLogs = async () => {
      try {
        const cleanBase = serverUrl ? serverUrl.replace(/\/+$/, '') : '';
        const targetUrl = cleanBase ? `${cleanBase}/logs` : '/logs';
        const response = await fetchWithAuth(targetUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) return;

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) return;

        const data = await response.json();
        const nextLogs = normalizeLogs(data.logs || []);

        if (!cancelled && Array.isArray(nextLogs)) {
          setLogs(prev => areLogsEqual(prev, nextLogs) ? prev : nextLogs);
        }
      } catch (error: any) {
        // Silently retry on transient network hiccups or dev-server reloads
        console.warn('⚠️ Log sync retry notice:', error?.message || error);
      }
    };

    loadLogs();
    const interval = setInterval(loadLogs, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [accessToken, serverUrl]);
  const [stats, setStats] = useState({
    totalTrades: 0,
    profitableTrades: 0,
    totalPnL: 0,
    winRate: 0
  });
  const [showWallet, setShowWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletLoading, setWalletLoading] = useState(true);
  
  // Support notification state
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  
  // ⚡ CRITICAL: Track active tab to keep engine mounted
  const [activeTab, setActiveTab] = useState("dashboard");
  const [mobileTabMenuOpen, setMobileTabMenuOpen] = useState(false);

  // Broker Setup sub-tab
  const [brokerTab, setBrokerTab] = useState<'static-ip' | 'broker-request' | 'broker-connect'>('broker-connect');
  
  // ⚡ PERSISTENT ENGINE STATES
  const [candleInterval, setCandleInterval] = useState<'5' | '15'>(() => {
    const saved = localStorage.getItem('engine_interval');
    return (saved === '5' || saved === '15') ? (saved as '5' | '15') : '5';
  });
  const [tradingSymbols, setTradingSymbols] = useState<any[]>([]);
  
  // Dhan Authentication Error State
  const [dhanAuthError, setDhanAuthError] = useState<boolean>(false);

  // ══ LOCK SCREEN ══
  const [isLocked, setIsLocked] = useState(false);
  const [lockTime, setLockTime] = useState('');
  const wakeLockRef = useRef<any>(null);

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('🔒 Wake lock acquired');
      }
    } catch { /* browser may deny on battery */ }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  useEffect(() => {
    if (!isLocked) return;
    acquireWakeLock();
    const updateTime = () => setLockTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    // If user switches tab, bring them back
    const handleVisibility = () => { if (document.hidden && isLocked) document.title = '🔒 Screen Locked — IndexpilotAI'; else document.title = 'IndexpilotAI'; };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [isLocked]);

  const handleLock = () => { setIsLocked(true); };
  const handleUnlock = () => { setIsLocked(false); releaseWakeLock(); };
  const [lastDhanError, setLastDhanError] = useState<string>('');

  // Listen for Dhan authentication errors from console
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: any[]) => {
      const errorMsg = args.join(' ');
      
      // Detect Dhan authentication errors
      if (errorMsg.includes('DH-901') || 
          errorMsg.includes('Invalid_Authentication') || 
          errorMsg.includes('Client ID or user generated access token is invalid or expired')) {
        setDhanAuthError(true);
        setLastDhanError(errorMsg);
      }
      
      originalError.apply(console, args);
    };
    
    return () => {
      console.error = originalError;
    };
  }, []);

  // Listen for support unread count updates
  useEffect(() => {
    const handleSupportUnreadCount = (event: any) => {
      setSupportUnreadCount(event.detail || 0);
    };
    window.addEventListener('support-unread-count', handleSupportUnreadCount);
    return () => {
      window.removeEventListener('support-unread-count', handleSupportUnreadCount);
    };
  }, []);

  // Listen for broker switch events from SettingsPanel or other components
  useEffect(() => {
    const handleBrokerSwitched = (event: any) => {
      const broker = event?.detail?.broker;
      const bName = event?.detail?.brokerName;
      if (broker) {
        setActiveBroker(broker);
        if (bName) setActiveBrokerName(bName);
        fetchActiveBroker();
      }
    };
    window.addEventListener('broker-switched', handleBrokerSwitched);
    return () => {
      window.removeEventListener('broker-switched', handleBrokerSwitched);
    };
  }, []);

  // ⚡ RESPONSIVE DESIGN
  const { isMobile, isTablet, isDesktop, deviceType } = useResponsive();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // HIGH-SPEED ENGINE STATES (Integrated)
  const [engineRunning, setEngineRunning] = useState(false);
  const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | 'WEEKEND'>('CLOSED');
  const [symbols, setSymbols] = useState<TradingSymbol[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [activePositions, setActivePositions] = useState<ActivePosition[]>([]);
  const [lastSignal, setLastSignal] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [multiSymbolSignals, setMultiSymbolSignals] = useState<{
    NIFTY: any | null;
    BANKNIFTY: any | null;
    SENSEX: any | null;
    __timestamp?: number;
  }>(() => {
    try {
      const saved = localStorage.getItem('engine_signals');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { NIFTY: null, BANKNIFTY: null, SENSEX: null, __timestamp: 0 };
  });
  const [executionCount, setExecutionCount] = useState(0);
  const [avgExecutionTime, setAvgExecutionTime] = useState(0);

  // Manual Entry Form
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntry, setManualEntry] = useState({
    name: '',
    securityId: '',
    expiry: '',
    strike: 0,
    optionType: 'CE' as 'CE' | 'PE',
    lotSize: 50,
    targetAmount: 0,
    stopLossAmount: 0
  });

  // Engine timers
  const engineTimerRef = useRef<NodeJS.Timeout | null>(null);
  const positionMonitorRef = useRef<NodeJS.Timeout | null>(null);
  
  // Tab scroll ref for mobile
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);

  // ⚡ HEADER ENGINE STATUS & SIGNALS — synced from backend (same source as the engine card)
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await fetch(`${serverUrl}/engine/db-status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;
        setEngineRunning(Boolean(data.engine?.isRunning));
        
        // ⚡ CRITICAL FIX: Sync candle interval from backend database (multi-device mobile/desktop sync)
        const rawBackendInterval = data.engine?.strategySettings?.candleInterval || data.engine?.candleInterval;
        const backendInterval = String(rawBackendInterval || '').replace(/[^0-9]/g, '');
        if (backendInterval === '5' || backendInterval === '15') {
          const validInterval = backendInterval as '5' | '15';
          setCandleInterval(prev => {
            if (prev !== validInterval) {
              console.log(`☁️ Synced candle interval from backend: ${prev}M → ${validInterval}M`);
              localStorage.setItem('engine_interval', validInterval);
              window.dispatchEvent(new CustomEvent('engine-interval-changed', { detail: { interval: validInterval } }));
              return validInterval;
            }
            return prev;
          });
        }
        
        if (data.engine?.signals || data.signals) {
          const remoteSignals = data.engine?.signals || data.signals;
          if (remoteSignals) {
            setMultiSymbolSignals(prev => ({
              ...prev,
              ...(remoteSignals.NIFTY ? { NIFTY: remoteSignals.NIFTY } : {}),
              ...(remoteSignals.BANKNIFTY ? { BANKNIFTY: remoteSignals.BANKNIFTY } : {}),
              ...(remoteSignals.SENSEX ? { SENSEX: remoteSignals.SENSEX } : {}),
              __timestamp: Date.now()
            }));
          }
        }
      } catch {
        /* transient network error — keep last known status */
      }
    };
    pull();
    const id = setInterval(pull, 5000);

    const handleSignalsUpdated = (e: any) => {
      if (e.detail) {
        setMultiSymbolSignals(e.detail);
      }
    };
    const handleIntervalChanged = (e: any) => {
      const newInterval = e.detail?.interval;
      if (newInterval === '5' || newInterval === '15') {
        setCandleInterval(newInterval);
        localStorage.setItem('engine_interval', newInterval);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'engine_interval' && (e.newValue === '5' || e.newValue === '15')) {
        setCandleInterval(e.newValue as '5' | '15');
      }
    };

    window.addEventListener('engine-signals-updated', handleSignalsUpdated);
    window.addEventListener('engine-interval-changed', handleIntervalChanged);
    window.addEventListener('storage', handleStorage);

    return () => { 
      cancelled = true; 
      clearInterval(id);
      window.removeEventListener('engine-signals-updated', handleSignalsUpdated);
      window.removeEventListener('engine-interval-changed', handleIntervalChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, [serverUrl, accessToken]);


  // ⚡ LOAD TRADING SYMBOLS FOR PERSISTENT ENGINE
  useEffect(() => {
    const loadSymbols = () => {
      try {
        const stored = localStorage.getItem('trading_symbols');
        if (stored) {
          const allSymbols = JSON.parse(stored);
          const activeSyms = allSymbols.filter((s: any) => s.active);
          setTradingSymbols(activeSyms);
          console.log(`✅ Loaded ${activeSyms.length} active symbols for persistent engine`);
        }
      } catch (error) {
        console.error('Failed to load symbols:', error);
      }
    };

    loadSymbols();

    // Listen for symbol changes
    const handleSymbolsChanged = () => {
      loadSymbols();
    };
    window.addEventListener('symbols-changed', handleSymbolsChanged);

    return () => {
      window.removeEventListener('symbols-changed', handleSymbolsChanged);
    };
  }, []);

  // ⚡ UPDATE MARKET STATUS EVERY SECOND
  useEffect(() => {
    const updateMarketStatus = () => {
      const now = new Date();
      const day = now.getDay();
      
      // Weekend check
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

    // Update immediately
    updateMarketStatus();

    // Update every second
    const interval = setInterval(updateMarketStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  // ⚡ MOBILE: Ensure Dashboard tab is visible on load
  useEffect(() => {
    if (isMobile && tabsScrollRef.current) {
      // Find the TabsList element (first child with overflow-x-auto)
      const tabsList = tabsScrollRef.current.querySelector('[role="tablist"]') as HTMLElement;
      if (tabsList) {
        // Scroll to the beginning to show Dashboard tab
        tabsList.scrollLeft = 0;
        console.log('📱 Mobile: Scrolled to Dashboard tab');
      }
    }
  }, [isMobile]);

  // Check if credentials are configured on load
  useEffect(() => {
    if (!accessToken) {
      console.log('⏳ Waiting for access token before checking credentials...');
      return;
    }
    
    refreshBrokerStatus();
    fetchWalletBalance();

    // Re-check broker connection every 20s and when the tab regains focus
    const brokerInterval = setInterval(refreshBrokerStatus, 20000);
    const onFocus = () => refreshBrokerStatus();
    window.addEventListener('focus', onFocus);

    
    // Refresh wallet balance every 30 seconds
    const walletInterval = setInterval(fetchWalletBalance, 30000);
    
    return () => {
      clearInterval(walletInterval);
      clearInterval(brokerInterval);
      window.removeEventListener('focus', onFocus);
    };

  }, [accessToken]); // Add accessToken as dependency

  const fetchWalletBalance = async () => {
    if (!accessToken) {
      console.log('⏳ Skipping wallet balance fetch - no access token');
      return;
    }
    
    try {
      const response = await fetchWithAuth(`${serverUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        console.warn('⚠️ Wallet balance response status:', response.status);
        return;
      }
      const data = await response.json();
      
      if (data.success) {
        setWalletBalance(data.balance || 0);
      }
    } catch (error: any) {
      console.warn("⚠️ Could not fetch wallet balance:", error?.message || error);
    } finally {
      setWalletLoading(false);
    }
  };

  // 🔀 Which broker is this user on, and is it connected?
  const fetchActiveBroker = async (): Promise<string> => {
    const cachedChoice = typeof window !== 'undefined' ? localStorage.getItem('indexpilot_broker_choice') : null;
    try {
      const response = await fetchWithAuth(`${serverUrl}/broker/active`);
      if (!response.ok) {
        console.warn('⚠️ Active broker response status:', response.status);
        if (cachedChoice) {
          setActiveBroker(cachedChoice);
          setActiveBrokerName(cachedChoice === 'upstox' ? 'Upstox' : cachedChoice === 'zerodha' ? 'Zerodha Kite' : 'Dhan');
          return cachedChoice;
        }
        return 'dhan';
      }
      const data = await response.json();
      if (data?.success) {
        const broker = data.activeBroker || cachedChoice || 'dhan';
        setActiveBroker(broker);
        setActiveBrokerName(data.activeBrokerName || (broker === 'upstox' ? 'Upstox' : broker === 'zerodha' ? 'Zerodha Kite' : 'Dhan'));
        // For non-Dhan brokers the /api-credentials check does not apply —
        // trust the broker status returned by the router.
        if (broker !== 'dhan') {
          setCredentialsConfigured(data.connected === true);
        }
        return broker;
      }
    } catch (error: any) {
      console.warn('⚠️ Could not fetch active broker:', error?.message || error);
    }
    if (cachedChoice) {
      setActiveBroker(cachedChoice);
      setActiveBrokerName(cachedChoice === 'upstox' ? 'Upstox' : cachedChoice === 'zerodha' ? 'Zerodha Kite' : 'Dhan');
      return cachedChoice;
    }
    return 'dhan';
  };

  // Always resolve the active broker FIRST, then only run the Dhan-specific
  // credentials check when Dhan is actually the active broker. Otherwise the
  // Dhan check would overwrite a connected Angel One / Fyers / Zerodha status.
  const refreshBrokerStatus = async () => {
    const broker = await fetchActiveBroker();
    if (broker === 'dhan') {
      await checkCredentials();
    }
  };

  const checkCredentials = async () => {
    try {
      const response = await fetchWithAuth(`${serverUrl}/api-credentials`);
      
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/json")) {
        setCredentialsConfigured(false);
        return;
      }
      
      const data = await response.json();
      
      console.log('Credentials check:', data);
      
      // Use the isConfigured flag from backend
      const isConfigured = data.isConfigured === true;
      setCredentialsConfigured(isConfigured);
      
      // Automatically disable test mode if credentials are configured
      if (isConfigured) {
        console.log('✓ Credentials configured - Real mode activated');
        console.log('✓ Client ID:', data.credentials?.dhanClientId);
        console.log('✓ Access Token:', data.credentials?.dhanAccessToken);
      } else {
        console.log('⚠ Credentials not configured - Using test mode');
        console.log('Status:', data.status);
      }
    } catch (error) {
      console.error("❌ Failed to fetch credentials:", error);
      setCredentialsConfigured(false);
    }
  };

  const addLog = async (logOrType: string | any, message?: string, data?: any) => {
    // Support both object and individual parameters
    let log: any;
    if (typeof logOrType === 'object') {
      log = logOrType;
    } else {
      log = { timestamp: Date.now(), type: logOrType, message: message || '', data };
    }
    
    try {
      // Add userId to log
      const logWithUser = { ...log, userId };
      
      const cleanBase = serverUrl ? serverUrl.replace(/\/+$/, '') : '';
      const targetUrl = cleanBase ? `${cleanBase}/logs` : '/logs';
      await fetchWithAuth(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(logWithUser)
      });
      
      // ⚡ CRITICAL FIX: Limit logs to prevent memory leak and browser crash
      setLogs(prev => {
        const newLogs = [logWithUser, ...prev];
        // Keep only the last 500 logs (reduced from unlimited)
        return newLogs.slice(0, 500);
      });
    } catch (error: any) {
      console.warn("Log write notice:", error?.message || error);
    }
  };

  const clearLogs = async () => {
    try {
      const cleanBase = serverUrl ? serverUrl.replace(/\/+$/, '') : '';
      const targetUrl = cleanBase ? `${cleanBase}/logs` : '/logs';
      await fetchWithAuth(targetUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setLogs([]);
    } catch (error: any) {
      console.warn('Log clear notice:', error?.message || error);
    }
  };

  const handleToggleEngine = async () => {
    const nextState = !engineRunning;
    setEngineRunning(nextState);
    const currentInterval = candleInterval || (localStorage.getItem('engine_interval') as '5' | '15') || '5';
    try {
      const endpoint = nextState ? `${serverUrl}/engine/start` : `${serverUrl}/engine/stop`;
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userId,
          broker: activeBroker,
          candleInterval: currentInterval,
          symbols: tradingSymbols.filter((s: any) => s.active)
        })
      });
      if (res.ok) {
        addLog({
          type: nextState ? 'ENGINE_START' : 'ENGINE_STOP',
          message: nextState ? `AI Trading Engine activated (${currentInterval}M candles)` : 'AI Trading Engine stopped by user'
        });
      }
    } catch (err: any) {
      console.error('Engine toggle error:', err);
    }
  };

  const handleSquareOffAll = async () => {
    try {
      const res = await fetchWithAuth(`${serverUrl}/positions/square-off-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ broker: activeBroker, userId })
      });
      const data = await res.json().catch(() => ({}));
      addLog({
        type: 'ORDER',
        message: `Square-off all requested: ${data?.message || 'Positions closing initiated'}`
      });
    } catch (err: any) {
      console.error('Square off all error:', err);
      addLog({
        type: 'ERROR',
        message: `Square-off request error: ${err?.message || 'Unknown error'}`
      });
    }
  };

  return (
    <div className="min-h-screen gradient-hero">
      <SEO {...SEO_CONFIGS.dashboard} />
      <WelcomeOnboarding />
      {/* Indices ticker rail */}
      <div className="hidden md:block border-b border-border/40 bg-card/40 backdrop-blur-md">
        <div className="container mx-auto px-4 py-1.5">
          <IndicesTicker serverUrl={serverUrl} accessToken={accessToken} />
        </div>
      </div>

      {/* ══ LOCK SCREEN OVERLAY ══ */}
      {isLocked && (
        <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-zinc-950 via-slate-950 to-black flex flex-col items-center justify-center select-none" style={{ touchAction: 'none' }}>
          {/* Ambient glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl animate-pulse delay-1000" />
          </div>

          <div className="relative z-10 text-center space-y-8">
            {/* Logo */}
            <img src={logoWhite} alt="IndexpilotAI" className="h-16 w-auto mx-auto opacity-80" />

            {/* Clock */}
            <div className="text-6xl font-bold font-mono bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent tabular-nums tracking-tight">
              {lockTime}
            </div>

            <div className="text-zinc-400 text-lg font-medium">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>

            {/* Status */}
            <div className="flex items-center justify-center gap-3 text-sm">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-medium">Engine Running — Trading Active</span>
              </div>
            </div>

            <p className="text-zinc-600 text-sm max-w-xs mx-auto leading-relaxed">
              Screen is locked. Your trading engine, signal detection, and order placement continue running in the background.
            </p>

            {/* Unlock button */}
            <button
              onClick={handleUnlock}
              className="mt-4 flex items-center gap-2 mx-auto px-8 py-3 rounded-full bg-zinc-800/80 border border-zinc-700 text-zinc-300 hover:bg-zinc-700/80 hover:text-white hover:border-zinc-600 transition-all duration-200 text-sm font-medium"
            >
              <Unlock className="size-4" />
              Unlock Screen
            </button>

            <p className="text-zinc-700 text-xs">
              Do not close this tab. Your system will sleep if you switch windows.
            </p>
          </div>
        </div>
      )}
      {/* Professional Header with Glassmorphism & Live Upside Index Run - RESPONSIVE */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-950/90 border-b border-zinc-800/70 shadow-2xl">
        <div className="w-full px-3 sm:px-6 py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* Left: Active Broker Logo + Live Indices Ticker Run */}
            <div className="flex items-center gap-3 sm:gap-5 min-w-0">
              {/* Connected Broker Logo & Monogram Badge */}
              <div 
                onClick={() => {
                  setActiveTab('settings');
                  setBrokerTab('broker-connect');
                }}
                className="group flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-indigo-500/50 cursor-pointer transition-all duration-300 shrink-0 shadow-inner"
                title={`Connected Broker: ${activeBrokerName}`}
              >
                <div className="relative">
                  <BrokerLogo id={activeBroker} name={activeBrokerName} size={28} className="rounded-lg shadow-sm" />
                  <span className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-zinc-950 ${credentialsConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                </div>
                <div className="hidden sm:block text-left leading-none pr-1">
                  <div className="text-[11px] font-bold text-white tracking-tight flex items-center gap-1">
                    {activeBrokerName}
                  </div>
                  <div className={`text-[9px] font-medium ${credentialsConfigured ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {credentialsConfigured ? 'Connected' : 'Offline'}
                  </div>
                </div>
              </div>

              {/* 📈 UPSIDE INDEX RUN (NIFTY, SENSEX, India VIX) */}
              <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto no-scrollbar py-0.5">
                {/* NIFTY 50 */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs shrink-0">
                  <span className="font-bold text-zinc-300">NIFTY</span>
                  <span className="font-bold tabular-nums text-white">23,756.30</span>
                  <span className="text-[11px] font-semibold tabular-nums text-red-400 bg-red-500/10 px-1 py-0.2 rounded border border-red-500/20">
                    -141.40 (-0.59%)
                  </span>
                </div>

                {/* SENSEX */}
                <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs shrink-0">
                  <span className="font-bold text-zinc-300">SENSEX</span>
                  <span className="font-bold tabular-nums text-white">76,029.56</span>
                  <span className="text-[11px] font-semibold tabular-nums text-red-400 bg-red-500/10 px-1 py-0.2 rounded border border-red-500/20">
                    -485.87 (-0.63%)
                  </span>
                </div>

                {/* India VIX */}
                <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-xs shrink-0">
                  <span className="font-bold text-zinc-300">India VIX</span>
                  <span className="font-bold tabular-nums text-white">11.14</span>
                  <span className="text-[11px] font-semibold tabular-nums text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20">
                    +0.46 (+4.31%)
                  </span>
                </div>
              </div>
            </div>

            {/* Middle & Right: Navigation Tabs matching screenshot & Profile Actions */}
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              {/* Primary Top Nav Tabs (Desktop) */}
              {isDesktop && (
                <nav className="flex items-center gap-1 text-sm font-medium">
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-3.5 py-1.5 transition-all relative ${
                      activeTab === 'dashboard'
                        ? 'text-white font-semibold after:absolute after:bottom-[-10px] after:left-0 after:right-0 after:h-[2.5px] after:bg-gradient-to-r after:from-purple-500 after:to-indigo-500 after:rounded-full'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Home
                  </button>
                  <button
                    onClick={() => setActiveTab('symbols')}
                    className={`px-3.5 py-1.5 transition-all relative ${
                      activeTab === 'symbols'
                        ? 'text-white font-semibold after:absolute after:bottom-[-10px] after:left-0 after:right-0 after:h-[2.5px] after:bg-gradient-to-r after:from-purple-500 after:to-indigo-500 after:rounded-full'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    My List
                  </button>
                  <button
                    onClick={() => setActiveTab('orders')}
                    className={`px-3.5 py-1.5 transition-all relative ${
                      activeTab === 'orders'
                        ? 'text-white font-semibold after:absolute after:bottom-[-10px] after:left-0 after:right-0 after:h-[2.5px] after:bg-gradient-to-r after:from-purple-500 after:to-indigo-500 after:rounded-full'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Orders
                  </button>
                  <button
                    onClick={() => setActiveTab('positions')}
                    className={`px-3.5 py-1.5 transition-all relative ${
                      activeTab === 'positions'
                        ? 'text-white font-semibold after:absolute after:bottom-[-10px] after:left-0 after:right-0 after:h-[2.5px] after:bg-gradient-to-r after:from-purple-500 after:to-indigo-500 after:rounded-full'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Positions
                  </button>

                  {/* More Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                      className={`flex items-center gap-1 px-3.5 py-1.5 transition-all ${
                        ['settings', 'strategies', 'backtest', 'journal', 'support', 'profile', 'logs'].includes(activeTab)
                          ? 'text-purple-400 font-semibold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      More
                      <ChevronDown className="size-3.5" />
                    </button>

                    {moreMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl p-1.5 z-50 animate-in fade-in-50 zoom-in-95">
                        {[
                          { value: 'strategies', label: 'Strategy Manager', icon: Zap },
                          { value: 'backtest', label: 'Strategy Backtest', icon: FlaskConical },
                          { value: 'settings', label: 'Broker Setup & IP', icon: Settings },
                          { value: 'journal', label: 'Trading Journal', icon: FileText },
                          { value: 'support', label: 'Support Desk', icon: MessageSquare },
                          { value: 'profile', label: 'User Profile', icon: User },
                          { value: 'logs', label: 'System Logs', icon: FileText },
                        ].map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <button
                              key={item.value}
                              onClick={() => {
                                setActiveTab(item.value);
                                setMoreMenuOpen(false);
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors ${
                                activeTab === item.value
                                  ? 'bg-purple-600/20 text-purple-300 font-semibold'
                                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              <ItemIcon className="size-3.5 text-zinc-400" />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </nav>
              )}

              {/* Wallet Funds Pill */}
              <button
                id="tour-wallet-btn"
                onClick={() => setShowWallet(true)}
                className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/40 transition-all duration-200 shadow-inner"
              >
                <Wallet className="size-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 leading-none">Funds</div>
                  <div className="text-xs font-bold text-white tabular-nums">
                    ₹{walletBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </button>

              {/* Dedicated Static IP / VPS Indicator */}
              <div 
                onClick={() => {
                  setActiveTab('settings');
                  setBrokerTab('static-ip');
                }}
                className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 cursor-pointer transition-all"
                title="Dedicated Broker Static IP: 143.110.180.201"
              >
                <Server className="size-3 text-cyan-400" />
                <span className="text-[11px] font-mono text-zinc-300">143.110.180.201</span>
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              {/* User Avatar Circle */}
              <button
                onClick={() => setActiveTab('profile')}
                className="size-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 text-white text-xs font-bold flex items-center justify-center ring-2 ring-zinc-800 hover:ring-purple-500/50 transition-all"
                title="User Profile"
              >
                RP
              </button>

              {/* Lock Screen */}
              <button
                onClick={handleLock}
                className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-amber-400 hover:border-amber-500/40 transition-all"
                title="Lock Screen"
              >
                <Lock className="size-3.5" />
              </button>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/40 transition-all"
                title="Logout"
              >
                <LogOut className="size-3.5" />
              </button>

              {/* Mobile Menu Button */}
              {(isMobile || isTablet) && (
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 transition-colors"
                >
                  {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {(isMobile || isTablet) && mobileMenuOpen && (
          <div className="border-t border-zinc-800 bg-zinc-950/98 backdrop-blur-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'dashboard', label: 'Home', icon: BarChart3 },
                { value: 'symbols', label: 'My List', icon: DollarSign },
                { value: 'orders', label: 'Orders', icon: FileText },
                { value: 'positions', label: 'Positions', icon: ActivityIcon },
                { value: 'strategies', label: 'Strategies', icon: Zap },
                { value: 'backtest', label: 'Backtest', icon: FlaskConical },
                { value: 'settings', label: 'Broker Setup', icon: Settings },
                { value: 'journal', label: 'Journal', icon: FileText },
                { value: 'support', label: 'Support', icon: MessageSquare },
                { value: 'profile', label: 'Profile', icon: User },
              ].map((item) => {
                const ItemIcon = item.icon;
                return (
                  <button
                    key={item.value}
                    onClick={() => {
                      setActiveTab(item.value);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      activeTab === item.value
                        ? 'bg-purple-600 text-white font-bold'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-300'
                    }`}
                  >
                    <ItemIcon className="size-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="w-full px-2 sm:px-4 lg:px-6 py-3 sm:py-4">
        {/* ⚠️ CREDENTIALS WARNING BANNER */}
        {!credentialsConfigured && (
          <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="size-2 rounded-full bg-amber-400 animate-ping" />
                <span className="text-xs font-semibold text-amber-300">
                  {activeBrokerName} is not connected. Connect in Broker Setup to activate automated trading.
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setActiveTab('settings');
                  setBrokerTab('broker-connect');
                }}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-7 text-xs px-3 rounded-lg"
              >
                Connect Now
              </Button>
            </div>
          </div>
        )}

        <Tabs 
          key="trading-tabs-v1" 
          value={activeTab}
          defaultValue="dashboard" 
          className="space-y-4"
          onValueChange={(value) => setActiveTab(value)}
        >
          {/* ⚡⚡⚡ PERSISTENT ENGINE - ALWAYS MOUNTED, CONDITIONALLY VISIBLE ⚡⚡⚡ */}
          {walletBalance >= 89 && (
            <div className={activeTab === "dashboard" ? "hidden" : "hidden"}>
              <EnhancedTradingEngine
                serverUrl={serverUrl}
                accessToken={accessToken}
                onLog={addLog}
              />
            </div>
          )}

          {/* 🚀 PRIMARY HOME / DASHBOARD TAB — 3-COLUMN PROFESSIONAL TERMINAL VIEW */}
          <TabsContent value="dashboard" className="space-y-4 animate-in fade-in-50 duration-300 m-0">
            <ProTradingTerminalView
              serverUrl={serverUrl}
              accessToken={accessToken}
              activeBroker={activeBroker}
              activeBrokerName={activeBrokerName}
              credentialsConfigured={credentialsConfigured}
              realPositionsPnL={realPositionsPnL}
              realAccountBalance={realAccountBalance || walletBalance}
              realOpenTrades={realOpenTrades || activePositions.length}
              openPositionsPnL={openPositionsPnL}
              closedPositionsPnL={closedPositionsPnL}
              closedPositionsCount={closedPositions.length}
              openPositions={openPositions}
              closedPositions={closedPositions}
              dhanPositions={dhanPositions}
              symbols={symbols}
              logs={logs}
              engineRunning={engineRunning}
              candleInterval={candleInterval}
              onCandleIntervalChange={async (interval) => {
                setCandleInterval(interval);
                localStorage.setItem('engine_interval', interval);
                window.dispatchEvent(new CustomEvent('engine-interval-changed', { detail: { interval } }));
                try {
                  if (accessToken) {
                    await fetchWithAuth(`${serverUrl}/engine/state`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken}`
                      },
                      body: JSON.stringify({
                        isRunning: engineRunning,
                        candleInterval: interval,
                        timestamp: Date.now()
                      })
                    });
                  }
                } catch (err) {
                  console.warn('Failed to sync timeframe change to backend:', err);
                }
              }}
              onToggleEngine={handleToggleEngine}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onOpenWallet={() => setShowWallet(true)}
              onOpenBrokerSetup={() => {
                setActiveTab('settings');
                setBrokerTab('broker-connect');
              }}
              onOpenLockScreen={handleLock}
              onSquareOffAll={handleSquareOffAll}
              lastSignal={lastSignal}
              signals={signals}
              multiSymbolSignals={multiSymbolSignals}
            />
          </TabsContent>

          {/* 📋 ORDERS TAB */}
          <TabsContent value="orders" className="space-y-4 animate-in fade-in-50 duration-300 m-0">
            <OrdersSection
              accessToken={accessToken}
              userId={userId}
              activeBroker={activeBroker}
            />
          </TabsContent>

          {/* 📊 POSITIONS TAB */}
          <TabsContent value="positions" className="space-y-4 animate-in fade-in-50 duration-300 m-0">
            <PositionsSection
              accessToken={accessToken}
              userId={userId}
              activeBroker={activeBroker}
              onSquareOffAll={handleSquareOffAll}
            />
          </TabsContent>

          <TabsContent value="symbols">
            <div className="animate-in fade-in-50 duration-500 space-y-4">
              <Tabs defaultValue="auto" className="w-full">
                <TabsList className="w-full grid grid-cols-2 bg-zinc-800/70 border border-zinc-700/50">
                  <TabsTrigger value="auto" className="flex items-center gap-2">
                    ⚡ Auto
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">Recommended</span>
                  </TabsTrigger>
                  <TabsTrigger value="manual">📝 Manual</TabsTrigger>
                </TabsList>
                <TabsContent value="auto" className="mt-4">
                  <AutoSymbolConfig serverUrl={serverUrl} accessToken={accessToken} userId={userId} />
                </TabsContent>
                <TabsContent value="manual" className="mt-4">
                  <SymbolManager serverUrl={serverUrl} accessToken={accessToken} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>


          <TabsContent value="backtest">
            <StrategyBacktest accessToken={accessToken} />
          </TabsContent>

          <TabsContent value="journal">
            <div className="animate-in fade-in-50 duration-500">
              <TradingJournal 
                serverUrl={serverUrl}
                accessToken={accessToken}
                userId={userId}
              />
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="animate-in fade-in-50 duration-500 space-y-4">
              {/* Broker Setup Sub-Tabs */}
              <div className="flex gap-1 p-1 bg-zinc-800/70 rounded-xl border border-zinc-700/50">
                <button
                  onClick={() => setBrokerTab('broker-connect')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    brokerTab === 'broker-connect'
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
                  }`}
                >
                  <Link2 className="w-4 h-4 flex-shrink-0" />
                  <span className={isMobile ? 'text-xs' : ''}>Connect</span>
                </button>
                <button
                  onClick={() => setBrokerTab('static-ip')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    brokerTab === 'static-ip'
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
                  }`}
                >
                  <Server className="w-4 h-4 flex-shrink-0" />
                  <span className={isMobile ? 'text-xs' : ''}>Static IP</span>
                </button>
                <button
                  onClick={() => setBrokerTab('broker-request')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    brokerTab === 'broker-request'
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span className={isMobile ? 'text-xs' : ''}>Broker Request</span>
                </button>
              </div>

              {/* Tab 1: Connect (Dhan credentials + connect) */}
              {brokerTab === 'broker-connect' && (
                <div className="animate-in fade-in-50 duration-300">
                  <SettingsPanel 
                    serverUrl={serverUrl} 
                    accessToken={accessToken}
                    onSettingsSaved={() => {
                      refreshBrokerStatus();
                    }}

                    onGoToStaticIp={() => setBrokerTab('static-ip')}
                  />
                </div>
              )}

              {/* Tab 2: Static IP */}
              {brokerTab === 'static-ip' && (
                <div className="animate-in fade-in-50 duration-300">
                  <UserDedicatedIPManager 
                    serverUrl={serverUrl}
                    accessToken={accessToken}
                    walletBalance={walletBalance}
                  />
                </div>
              )}

              {/* Tab 3: Broker Request */}
              {brokerTab === 'broker-request' && (
                <div className="animate-in fade-in-50 duration-300">
                  <BrokerRequest 
                    serverUrl={serverUrl}
                    accessToken={accessToken}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="support">
            <div className="animate-in fade-in-50 duration-500">
              <UserSupport 
                serverUrl={serverUrl}
                accessToken={accessToken}
              />
            </div>
          </TabsContent>

          <TabsContent value="strategies">
            <div className="animate-in fade-in-50 duration-500">
              <StrategyManager 
                serverUrl={serverUrl}
                accessToken={accessToken}
              />
            </div>
          </TabsContent>

          <TabsContent value="profile">
            <div className="animate-in fade-in-50 duration-500">
              <UserProfile
                accessToken={accessToken}
                walletBalance={typeof walletBalance === 'number' ? walletBalance : 0}
                totalProfit={0}
              />
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <div className="animate-in fade-in-50 duration-500">
              <Card className="bg-zinc-900 border-zinc-800 shadow-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="size-5 text-blue-500" />
                      Advanced AI System Logs
                    </span>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {logs.length} logs
                      </Badge>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={clearLogs}
                      >
                        Clear Logs
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[600px] overflow-auto">
                    {logs.length === 0 ? (
                      <div className="text-center text-zinc-500 py-12 border border-dashed border-zinc-700 rounded">
                        <FileText className="size-12 mx-auto mb-3 text-zinc-600" />
                        <div className="text-lg mb-1">No logs yet</div>
                        <div className="text-sm">Start the Advanced AI Engine to see detailed logs</div>
                      </div>
                    ) : (
                      logs.map((log, index) => {
                        // Ensure log is a valid object with the expected structure
                        if (!log || typeof log !== 'object') {
                          return null;
                        }
                        
                        // Extract and validate properties
                        const timestamp = typeof log.timestamp === 'number' ? log.timestamp : Date.now();
                        const type = typeof log.type === 'string' ? log.type : String(log.type || 'UNKNOWN');
                        const message = typeof log.message === 'string' ? log.message : JSON.stringify(log.message || log);
                        const hasData = log.data && typeof log.data === 'object';
                        
                        // Color coding by type
                        let bgColor = 'bg-zinc-800';
                        let borderColor = 'border-zinc-700';
                        let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
                        
                        if (type.includes('SUCCESS') || type.includes('BUY') || type === 'HOLD') {
                          bgColor = 'bg-green-950/20';
                          borderColor = 'border-green-900/30';
                          badgeVariant = 'default';
                        } else if (type.includes('ERROR') || type.includes('FAILED')) {
                          bgColor = 'bg-red-950/20';
                          borderColor = 'border-red-900/30';
                          badgeVariant = 'destructive';
                        } else if (type.includes('WARNING') || type === 'WAIT') {
                          bgColor = 'bg-yellow-950/20';
                          borderColor = 'border-yellow-900/30';
                        } else if (type.includes('AI_SIGNAL') || type.includes('ADVANCED')) {
                          bgColor = 'bg-blue-950/20';
                          borderColor = 'border-blue-900/30';
                        } else if (type.includes('MONITOR') || type.includes('POSITION')) {
                          bgColor = 'bg-purple-950/20';
                          borderColor = 'border-purple-900/30';
                        }
                        
                        return (
                          <div key={index} className={`flex flex-col gap-2 p-3 ${bgColor} rounded border ${borderColor}`}>
                            <div className="flex gap-3 items-start">
                              <div className="text-xs text-zinc-500 w-20 shrink-0 font-mono">
                                {new Date(timestamp).toLocaleTimeString()}
                              </div>
                              <Badge variant={badgeVariant} className="shrink-0 text-xs">
                                {type}
                              </Badge>
                              <div className="flex-1 text-sm text-zinc-200">
                                {message}
                              </div>
                            </div>
                            
                            {/* Show detailed data if available */}
                            {hasData && (
                              <div className="ml-24 mt-1">
                                {/* Confirmations */}
                                {log.data.confirmations && Array.isArray(log.data.confirmations) && (
                                  <div className="text-xs bg-zinc-900/50 p-2 rounded border border-zinc-700 mb-2">
                                    <div className="font-semibold text-amber-500 mb-1">📊 Confirmations:</div>
                                    {log.data.confirmations.map((conf: string, i: number) => (
                                      <div key={i} className={conf.startsWith('✅') ? 'text-green-400' : 'text-red-400'}>
                                        {conf}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Patterns */}
                                {log.data.patterns && Array.isArray(log.data.patterns) && log.data.patterns.length > 0 && (
                                  <div className="text-xs bg-zinc-900/50 p-2 rounded border border-zinc-700 mb-2">
                                    <div className="font-semibold text-blue-500 mb-1">🔍 Patterns Detected:</div>
                                    {log.data.patterns.map((pattern: any, i: number) => (
                                      <div key={i} className="text-zinc-300">
                                        • {pattern.type || 'Unknown Pattern'} - {pattern.strength || 'N/A'} ({pattern.direction || 'N/A'}, {pattern.confidence || 0}% confidence)
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Market Regime */}
                                {log.data.marketRegime && (
                                  <div className="text-xs bg-zinc-900/50 p-2 rounded border border-zinc-700 mb-2">
                                    <div className="font-semibold text-purple-500 mb-1">📈 Market Regime:</div>
                                    <div className="text-zinc-300">
                                      Type: {log.data.marketRegime.type || 'N/A'} | 
                                      Strength: {typeof log.data.marketRegime.strength === 'number' ? `${log.data.marketRegime.strength.toFixed(1)}%` : (log.data.marketRegime.trendStrength || 'N/A')}
                                    </div>
                                  </div>
                                )}
                                
                                {/* Analysis Action */}
                                {log.data.action && (log.data.reason || log.data.reasoning) && (
                                  <div className="text-xs bg-zinc-900/50 p-2 rounded border border-zinc-700">
                                    <div className="font-semibold text-zinc-400 mb-1">🎯 Decision:</div>
                                    <div className="text-zinc-300">
                                      <span className="font-semibold text-amber-500">{log.data.action}</span> - {log.data.reason || log.data.reasoning}
                                    </div>
                                  </div>
                                )}
                                
                                {/* ⚡⚡⚡ NEW: Full AI Response Data (Expandable) ⚡⚡⚡ */}
                                {(log.data.indicators || log.data.volumeAnalysis || log.data.riskManagement) && (
                                  <details className="text-xs bg-zinc-900/50 p-2 rounded border border-zinc-700 mt-2">
                                    <summary className="font-semibold text-blue-400 cursor-pointer hover:text-blue-300">
                                      📊 Full AI Response Data (Click to Expand)
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                      {/* Indicators */}
                                      {log.data.indicators && (
                                        <div className="bg-zinc-950/50 p-2 rounded">
                                          <div className="font-semibold text-green-400 mb-1">Technical Indicators:</div>
                                          <pre className="text-[10px] text-zinc-300 overflow-x-auto">
                                            {JSON.stringify(log.data.indicators, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      
                                      {/* Volume Analysis */}
                                      {log.data.volumeAnalysis && (
                                        <div className="bg-zinc-950/50 p-2 rounded">
                                          <div className="font-semibold text-orange-400 mb-1">Volume Analysis:</div>
                                          <pre className="text-[10px] text-zinc-300 overflow-x-auto">
                                            {JSON.stringify(log.data.volumeAnalysis, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      
                                      {/* Risk Management */}
                                      {log.data.riskManagement && (
                                        <div className="bg-zinc-950/50 p-2 rounded">
                                          <div className="font-semibold text-red-400 mb-1">Risk Management:</div>
                                          <pre className="text-[10px] text-zinc-300 overflow-x-auto">
                                            {JSON.stringify(log.data.riskManagement, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </details>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Wallet Management Modal */}
      {showWallet && (
        <WalletManagement onClose={() => { setShowWallet(false); fetchWalletBalance(); }} />
      )}
      
      {/* 🔔 Notification Toast Container - Shows all notifications */}
      <NotificationContainer />

      {/* 🤖 AI Trading Assistant floating bot */}
      <AIAssistantBot accessToken={accessToken} />
    </div>
  );
}

export default TradingDashboard;