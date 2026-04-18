// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { BarChart3, Settings, FileText, DollarSign, LogOut, Wallet, MessageSquare, Menu, X, Zap, Server, Key, Link2, Lock, Unlock, ChevronLeft, ChevronRight } from "lucide-react";
const logoWhite = "/logo-white.png";
import { SettingsPanel } from "./SettingsPanel";
import { UserDedicatedIPManager } from "./UserDedicatedIPManager";
import { SymbolManager } from "./SymbolManager";
import { AdvancedDashboard } from "./AdvancedDashboard";
import { EnhancedTradingEngine } from "./EnhancedTradingEngine";
import { TradingJournal } from "./TradingJournal";
import WalletManagement from "./WalletManagement";
import { ProfitDashboard } from "./ProfitDashboard";
import { UserSupport } from "./UserSupport";
import { StrategyManager } from "./StrategyManager";
import { BrokerRequest } from "./BrokerRequest";
import { projectId } from "@/utils-ext/supabase/info";
import { getServerUrl } from "@/utils-ext/config/apiConfig";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useResponsive } from "../hooks/useResponsive";
import { NotificationBell } from "./NotificationBell";
import { NotificationContainer } from "./NotificationContainer";
import { SEO, SEO_CONFIGS } from "../utils/seo";

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
        const response = await fetchWithAuth(`${serverUrl}/logs`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        const nextLogs = normalizeLogs(data.logs || []);

        if (!cancelled) {
          setLogs(prev => areLogsEqual(prev, nextLogs) ? prev : nextLogs);
        }
      } catch (error) {
        console.error('Failed to load logs from backend:', error);
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

  // Broker Setup sub-tab
  const [brokerTab, setBrokerTab] = useState<'static-ip' | 'broker-request' | 'broker-connect'>('broker-connect');
  
  // ⚡ PERSISTENT ENGINE STATES
  const [candleInterval, setCandleInterval] = useState<'5' | '15'>('15');
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
    
    checkCredentials();
    fetchWalletBalance();
    
    // Refresh wallet balance every 30 seconds
    const walletInterval = setInterval(fetchWalletBalance, 30000);
    
    return () => {
      clearInterval(walletInterval);
    };
  }, [accessToken]); // Add accessToken as dependency

  const fetchWalletBalance = async () => {
    if (!accessToken) {
      console.log('⏳ Skipping wallet balance fetch - no access token');
      return;
    }
    
    try {
      const response = await fetch(`${serverUrl}/wallet/balance`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      
      if (data.success) {
        setWalletBalance(data.balance || 0);
      }
    } catch (error) {
      console.error("Failed to fetch wallet balance:", error);
    } finally {
      setWalletLoading(false);
    }
  };

  const checkCredentials = async () => {
    if (!accessToken) {
      console.log('⏳ Skipping credentials check - no access token');
      return;
    }
    
    try {
      const response = await fetch(`${serverUrl}/api-credentials`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch credentials: ${response.status}`);
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
      
      await fetchWithAuth(`${serverUrl}/logs`, {
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
    } catch (error) {
      console.error("Failed to add log:", error);
    }
  };

  const clearLogs = async () => {
    try {
      await fetchWithAuth(`${serverUrl}/logs`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <SEO {...SEO_CONFIGS.dashboard} />

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
      {/* Professional Header with Glassmorphism - RESPONSIVE */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-zinc-800/50 shadow-2xl">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo & Branding - Responsive */}
            <div className="flex items-center gap-2 sm:gap-4">
              <img src={logoWhite} alt="IndexpilotAI Logo" className="h-8 sm:h-10 w-auto" />
              <div>
                <h1 className="text-base sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-cyan-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent">
                  IndexpilotAI
                </h1>
                <p className="hidden sm:block text-xs text-zinc-500">Professional Options Trading Platform</p>
              </div>
            </div>

            {/* Desktop Actions */}
            {isDesktop && (
              <div className="flex items-center gap-4">
                {/* Market Status */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className={`size-2 rounded-full animate-pulse ${
                    marketStatus === 'OPEN' ? 'bg-emerald-500' : 
                    marketStatus === 'CLOSED' ? 'bg-red-500' : 'bg-amber-500'
                  }`}></div>
                  <span className="text-sm font-medium text-zinc-300">
                    Market {marketStatus === 'OPEN' ? 'Open' : marketStatus === 'CLOSED' ? 'Closed' : 'Weekend'}
                  </span>
                </div>

                {/* 🔔 Notification Bell */}
                <NotificationBell />

                {/* Wallet Balance - Enhanced */}
                <button
                  onClick={() => setShowWallet(true)}
                  className="group relative px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600/20 to-blue-600/20 border border-emerald-500/30 hover:border-emerald-400/50 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/20"
                >
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                      <div className="text-xs text-zinc-500">Wallet Balance</div>
                      {walletLoading ? (
                        <div className="h-4 w-16 bg-zinc-700 rounded animate-pulse"></div>
                      ) : (
                        <div className="text-sm font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                          ₹{walletBalance.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>

                {/* Lock Screen Button */}
                <Button
                  onClick={handleLock}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400 transition-all duration-300"
                  title="Lock screen — keeps engine running 24/7"
                >
                  <Lock className="size-4 mr-2" />
                  Lock Screen
                </Button>

                {/* Logout Button */}
                <Button
                  onClick={onLogout}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300"
                >
                  <LogOut className="size-4 mr-2" />
                  Logout
                </Button>
              </div>
            )}

            {/* Mobile & Tablet Actions */}
            {(isMobile || isTablet) && (
              <div className="flex items-center gap-2">
                {/* 🔔 Notification Bell Mobile */}
                <NotificationBell />
                
                {/* Mobile Wallet Balance - Enhanced & Clear Display */}
                <button
                  onClick={() => setShowWallet(true)}
                  className="relative px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600/20 to-blue-600/20 border border-emerald-500/30 hover:border-emerald-400/50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4 text-emerald-400" />
                    {walletLoading ? (
                      <div className="h-4 w-12 bg-zinc-700 rounded animate-pulse"></div>
                    ) : (
                      <span className="text-sm font-bold bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                        ₹{walletBalance.toFixed(0)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white hover:bg-zinc-700 transition-colors"
                >
                  {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {(isMobile || isTablet) && mobileMenuOpen && (
          <div className="border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-xl">
            <div className="container mx-auto px-3 py-3 space-y-2">
              {/* Market Status Mobile */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/50">
                <span className="text-sm text-zinc-400">Market Status</span>
                <div className="flex items-center gap-2">
                  <div className={`size-2 rounded-full animate-pulse ${
                    marketStatus === 'OPEN' ? 'bg-emerald-500' : 
                    marketStatus === 'CLOSED' ? 'bg-red-500' : 'bg-amber-500'
                  }`}></div>
                  <span className="text-sm font-medium text-white">
                    {marketStatus === 'OPEN' ? 'Open' : marketStatus === 'CLOSED' ? 'Closed' : 'Weekend'}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <Button
                onClick={() => {
                  handleLock();
                  setMobileMenuOpen(false);
                }}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-300 hover:border-amber-500/50 hover:bg-amber-500/10 hover:text-amber-400"
              >
                <Lock className="size-4 mr-2" />
                Lock Screen
              </Button>
              <Button
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-400"
              >
                <LogOut className="size-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* ⚠️ CREDENTIALS WARNING BANNER */}
        {!credentialsConfigured && (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
            <div className="flex items-start gap-3">
              <div className="text-amber-500 text-2xl">⚠️</div>
              <div className="flex-1">
                <h3 className="text-amber-500 font-semibold mb-1">Dhan Credentials Not Configured</h3>
                <p className="text-zinc-300 text-sm mb-2">
                  Please configure your Dhan credentials in the <strong>Broker Setup</strong> tab to enable real trading.
                </p>
                <p className="text-zinc-400 text-xs">
                  Without valid credentials, all API calls will fail with "Invalid Token" error.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 🔑 DHAN ACCESS TOKEN EXPIRED BANNER */}
        {dhanAuthError && (
          <div className="mb-6 p-5 bg-red-500/10 border-2 border-red-500/50 rounded-lg animate-pulse">
            <div className="flex items-start gap-4">
              <div className="text-red-400 text-3xl">🔐</div>
              <div className="flex-1">
                <h3 className="text-red-400 font-bold text-lg mb-2">⚠️ DHAN ACCESS TOKEN EXPIRED!</h3>
                <p className="text-zinc-200 text-sm mb-3">
                  Your <strong>Dhan Access Token</strong> has expired and needs to be refreshed. 
                  Dhan tokens expire regularly for security reasons.
                </p>
                
                <div className="bg-zinc-900/50 p-3 rounded border border-zinc-700 mb-3">
                  <p className="text-xs text-zinc-400 mb-2 font-semibold">🔧 HOW TO FIX:</p>
                  <ol className="text-xs text-zinc-300 space-y-1 list-decimal ml-4">
                    <li>Go to <strong className="text-emerald-400">Broker Setup tab</strong></li>
                    <li>Click <strong className="text-blue-400">"Get New Token from Dhan"</strong> link</li>
                    <li>Login to Dhan portal → Generate new Access Token</li>
                    <li>Copy the new token</li>
                    <li>Paste it in the <strong className="text-emerald-400">Dhan Access Token</strong> field</li>
                    <li>Click <strong className="text-emerald-400">Save Credentials</strong></li>
                  </ol>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setActiveTab('settings');
                      setBrokerTab('broker-connect');
                      const settingsTab = document.querySelector('[value="settings"]') as HTMLElement;
                      if (settingsTab) settingsTab.click();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Go to Broker Setup
                  </Button>
                  <Button
                    onClick={() => setDhanAuthError(false)}
                    variant="outline"
                    className="bg-zinc-700 border-zinc-600"
                  >
                    Dismiss (I'll fix it later)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <Tabs 
          key="trading-tabs-v1" 
          defaultValue="dashboard" 
          className="space-y-4 sm:space-y-6"
          onValueChange={(value) => setActiveTab(value)}
        >
          {/* Professional Tabs with Smooth Animation - RESPONSIVE SCROLLABLE */}
          <div className="relative" ref={tabsScrollRef}>
            {isMobile && (
              <button
                type="button"
                aria-label="Scroll tabs left"
                onClick={() => {
                  const list = tabsScrollRef.current?.querySelector('[role="tablist"]') as HTMLElement | null;
                  if (list) list.scrollLeft = Math.max(0, list.scrollLeft - 200);
                }}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center size-8 rounded-full bg-zinc-900/95 border border-zinc-700/60 text-white shadow-lg active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {isMobile && (
              <button
                type="button"
                aria-label="Scroll tabs right"
                onClick={() => {
                  const list = tabsScrollRef.current?.querySelector('[role="tablist"]') as HTMLElement | null;
                  if (list) list.scrollLeft = Math.min(list.scrollWidth - list.clientWidth, list.scrollLeft + 200);
                }}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center size-8 rounded-full bg-zinc-900/95 border border-zinc-700/60 text-white shadow-lg active:scale-95"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            <TabsList 
              className={`${
              isMobile 
                ? '!flex !w-full !h-auto !max-w-full overflow-x-auto overflow-y-hidden scrollbar-hide px-10' 
                : 'grid grid-cols-7 w-full'
            } bg-zinc-900/50 backdrop-blur-sm border border-zinc-800/50 p-1 rounded-xl shadow-xl gap-1`}
            style={isMobile ? { scrollbarWidth: 'none', msOverflowStyle: 'none', scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' } : {}}
            >
            <TabsTrigger 
              value="dashboard"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[100px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden">Home</span>
            </TabsTrigger>
            <TabsTrigger 
              value="symbols"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[100px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm`}
            >
              <DollarSign className="w-4 h-4" />
              <span className={isMobile ? '' : 'hidden sm:inline'}>Symbols</span>
            </TabsTrigger>
            <TabsTrigger 
              value="settings"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[120px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm`}
            >
              <Settings className="w-4 h-4" />
              <span className={isMobile ? 'text-xs' : 'hidden sm:inline'}>Broker Setup</span>
            </TabsTrigger>
            <TabsTrigger 
              value="journal"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[100px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm`}
            >
              <FileText className="w-4 h-4" />
              <span className={isMobile ? '' : 'hidden sm:inline'}>Journal</span>
            </TabsTrigger>
            <TabsTrigger 
              value="strategies"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[110px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm`}
            >
              <Zap className="w-4 h-4" />
              <span className={isMobile ? 'text-xs' : 'hidden sm:inline'}>Strategies</span>
            </TabsTrigger>
            <TabsTrigger 
              value="support"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[100px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm relative`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className={isMobile ? '' : 'hidden sm:inline'}>Support</span>
              {supportUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  {supportUnreadCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="logs"
              className={`${
                isMobile ? 'flex-shrink-0 min-w-[100px]' : ''
              } text-zinc-400 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 flex items-center justify-center gap-2 px-3 py-2 text-sm`}
            >
              <FileText className="w-4 h-4" />
              <span className={isMobile ? '' : 'hidden sm:inline'}>Logs</span>
            </TabsTrigger>
          </TabsList>
          
          {/* Mobile Scroll Indicator */}
          {isMobile && (
            <div className="text-center mt-2">
              <p className="text-xs text-zinc-500 animate-pulse">← Swipe to see more tabs →</p>
            </div>
          )}
          </div>

          {/* ⚡⚡⚡ PERSISTENT ENGINE - ALWAYS MOUNTED, CONDITIONALLY VISIBLE ⚡⚡⚡ */}
          {/* This stays mounted even when switching tabs to keep the engine running */}
          {walletBalance >= 89 && (
            <div 
              className={activeTab === "dashboard" ? "block space-y-6" : "hidden"}
            >
              <EnhancedTradingEngine
                serverUrl={serverUrl}
                accessToken={accessToken}
                onLog={addLog}
              />
            </div>
          )}

          {/* Dashboard Tab Content */}
          <TabsContent value="dashboard" className="space-y-6 animate-in fade-in-50 duration-500">
            {/* 💰 WALLET BALANCE CHECK - Show Dashboard UI only if balance >= ₹89 */}
            {walletBalance >= 89 ? (
              <>
                {/* 💰 PROFIT DASHBOARD - Tiered Pricing & Daily Stats */}
                <ProfitDashboard accessToken={accessToken} />
                
                {/* 📊 POSITIONS & ANALYTICS - Shows current positions and P&L */}
                <AdvancedDashboard 
                  serverUrl={serverUrl}
                  accessToken={accessToken}
                  credentialsConfigured={credentialsConfigured}
                />
              </>
            ) : (
              /* 💳 INSUFFICIENT WALLET BALANCE WARNING */
              <Card className="bg-gradient-to-br from-red-900/20 to-orange-900/20 border-2 border-red-500/50">
                <CardContent className="p-8">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Wallet className="w-10 h-10 text-red-400" />
                    </div>
                    
                    <h2 className="text-2xl font-bold text-white mb-3">
                      Insufficient Wallet Balance
                    </h2>
                    
                    <p className="text-zinc-300 mb-2">
                      Your wallet balance is <span className="font-bold text-red-400">₹{walletBalance.toLocaleString('en-IN')}</span>
                    </p>
                    
                    <p className="text-zinc-400 text-sm mb-6">
                      You need at least <span className="font-bold text-green-400">₹89</span> to access the AI Trading Engine
                    </p>
                    
                    <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-700 mb-6 max-w-md mx-auto">
                      <div className="text-sm text-zinc-300 space-y-2">
                        <div className="flex items-center justify-between">
                          <span>Required Balance:</span>
                          <span className="font-bold text-green-400">₹89</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Current Balance:</span>
                          <span className="font-bold text-red-400">₹{walletBalance}</span>
                        </div>
                        <div className="border-t border-zinc-700 pt-2 mt-2 flex items-center justify-between">
                          <span>Need to Add:</span>
                          <span className="font-bold text-yellow-400">₹{Math.max(0, 89 - walletBalance)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <Button
                        onClick={() => setShowWallet(true)}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-8 py-6 text-lg font-semibold shadow-xl"
                      >
                        <Wallet className="w-5 h-5 mr-2" />
                        Recharge Wallet Now
                      </Button>
                      
                      <p className="text-xs text-zinc-500">
                        💡 Pay only ₹89 when your profit exceeds ₹200. No profit? No charge!
                      </p>
                    </div>
                    
                    <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <div className="text-blue-400 text-xl">ℹ️</div>
                        <div className="text-left text-sm text-blue-300">
                          <p className="font-semibold mb-1">How It Works:</p>
                          <ul className="space-y-1 text-blue-200 text-xs">
                            <li>• Recharge your wallet with any amount (min ₹100)</li>
                            <li>• Trade with AI-powered signals</li>
                            <li>• ₹89 auto-deducted only when profit {`>`} ₹200</li>
                            <li>• Profit below ₹200 or loss? Completely FREE!</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="symbols">
            <div className="animate-in fade-in-50 duration-500">
              <SymbolManager serverUrl={serverUrl} accessToken={accessToken} />
            </div>
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
                      checkCredentials();
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
    </div>
  );
}

export default TradingDashboard;