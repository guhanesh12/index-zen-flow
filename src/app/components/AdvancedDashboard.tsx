// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { TrendingUp, TrendingDown, Activity, Zap, BarChart3, DollarSign, AlertCircle } from "lucide-react";
import { getIndexConfig } from "./IndicesConfig";
import { supabase } from "../../../utils/supabase/client";

interface AdvancedDashboardProps {
  serverUrl: string;
  accessToken: string;
  credentialsConfigured: boolean;
}

interface FundLimit {
  sodLimit: number;
  availableBalance: number;
  collateralAmount: number;
  utilizationAmount: number;
  blockedPayinAmount: number;
  blockedPayoutAmount: number;
}

interface AIAnalysis {
  marketState: string;
  bias: string;
  confidence: number;
  recommendation: string;
  lastUpdated: string;
  rawData: any;
}

interface Position {
  strike: string;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  status: string;
  lotSize: number;
}

export function AdvancedDashboard({ serverUrl, accessToken, credentialsConfigured }: AdvancedDashboardProps) {
  // ⚡ Store current access token in ref to get fresh token
  const currentAccessTokenRef = useRef(accessToken);
  
  // Update ref when accessToken prop changes
  useEffect(() => {
    currentAccessTokenRef.current = accessToken;
  }, [accessToken]);
  
  // ⚡ HELPER: Get fresh access token (with auto-refresh if needed)
  const getFreshAccessToken = async (): Promise<string> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        // ⚡ Suppress "Auth session missing" - this is expected for public pages
        if (error.message !== 'Auth session missing!') {
          console.error('❌ Error getting session:', error.message);
        }
        return currentAccessTokenRef.current; // Fallback to prop
      }
      
      if (session?.access_token) {
        // Update ref with fresh token
        currentAccessTokenRef.current = session.access_token;
        return session.access_token;
      }
      
      // No session, try to refresh
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (!refreshError && refreshedSession?.access_token) {
        console.log('✅ Session auto-refreshed successfully');
        currentAccessTokenRef.current = refreshedSession.access_token;
        return refreshedSession.access_token;
      }
      
      console.warn('⚠️ Could not refresh session, using existing token');
      return currentAccessTokenRef.current; // Fallback to prop
    } catch (err) {
      console.error('❌ Error in getFreshAccessToken:', err);
      return currentAccessTokenRef.current; // Fallback to prop
    }
  };
  
  const [index, setIndex] = useState("NIFTY");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [fundLimits, setFundLimits] = useState<FundLimit | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [aiEngineActive, setAiEngineActive] = useState(false);
  const [engineSpeed, setEngineSpeed] = useState("High Speed");
  const [totalPnL, setTotalPnL] = useState<number>(0);
  const [realizedPnL, setRealizedPnL] = useState<number>(0);
  const [unrealizedPnL, setUnrealizedPnL] = useState<number>(0);
  const [loadingFunds, setLoadingFunds] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [loadingPosition, setLoadingPosition] = useState(false);
  const [pnlAnimation, setPnlAnimation] = useState<'increase' | 'decrease' | null>(null);

  const indexConfig = getIndexConfig(index);

  // Fetch live price
  useEffect(() => {
    if (!credentialsConfigured || !indexConfig) return;

    const fetchLivePrice = async () => {
      try {
        setLoadingPrice(true);
        const response = await fetch(`${serverUrl}/market-quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            securityId: indexConfig.securityId,
            exchangeSegment: indexConfig.exchangeSegment
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.quote) {
            const newPrice = data.quote.ltp;
            if (livePrice) {
              setPriceChange(((newPrice - livePrice) / livePrice) * 100);
            }
            setLivePrice(newPrice);
          }
        }
      } catch (error) {
        console.error('Failed to fetch live price:', error);
      } finally {
        setLoadingPrice(false);
      }
    };

    fetchLivePrice();
    const interval = setInterval(fetchLivePrice, 15000); // Changed to 15s to avoid rate limits
    return () => clearInterval(interval);
  }, [credentialsConfigured, indexConfig, serverUrl, accessToken]);

  // Fetch fund limits
  useEffect(() => {
    if (!credentialsConfigured) return;

    const loadFundLimits = async () => {
      try {
        setLoadingFunds(true);
        console.log('🔄 Fetching fund limits from Dhan API...');
        
        // ⚡ GET FRESH TOKEN before API call
        const freshToken = await getFreshAccessToken();
        
        // ⚡ ADD TIMEOUT to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const response = await fetch(`${serverUrl}/fund-limits`, {
          headers: { Authorization: `Bearer ${freshToken}` },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Fund limits HTTP error:', response.status, errorText);
          
          if (response.status === 401) {
            console.error('⚠️ Authentication expired. Retrying with fresh token...');
            // Token was refreshed - the next interval will use it
          }
          
          return;
        }
        
        const data = await response.json();
        console.log('📊 Fund limits response:', data);
        if (data.funds) {
          console.log('✅ Real fund data received:', data.funds);
          setFundLimits(data.funds);
        } else if (data.error) {
          console.error('❌ Fund limits error:', data.error);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('❌ Fund limits request timeout (>10s)');
        } else {
          console.error('❌ Failed to load fund limits:', error.message || error);
        }
        // Don't spam errors - fail silently after logging
      } finally {
        setLoadingFunds(false);
      }
    };

    loadFundLimits();
    const interval = setInterval(loadFundLimits, 30000);
    return () => clearInterval(interval);
  }, [credentialsConfigured, serverUrl, accessToken]);

  // Fetch AI analysis
  useEffect(() => {
    if (!credentialsConfigured) return;

    const loadAIAnalysis = async () => {
      try {
        const response = await fetch(`${serverUrl}/ai-analysis`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data.analysis) setAiAnalysis(data.analysis);
      } catch (error) {
        console.error('Failed to load AI analysis:', error);
      }
    };

    loadAIAnalysis();
    const interval = setInterval(loadAIAnalysis, 15000);
    return () => clearInterval(interval);
  }, [credentialsConfigured, serverUrl, accessToken]);

  // Fetch positions
  useEffect(() => {
    if (!credentialsConfigured) return;

    const fetchPositions = async () => {
      try {
        setLoadingPosition(true);
        
        // ⚡ ADD TIMEOUT to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const response = await fetch(`${serverUrl}/positions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // Silently fail - don't spam console for positions
          return;
        }
        
        const data = await response.json();
        
        // ⚡ SILENT UPDATE - Only log errors, not every successful fetch
        
        if (data.success && data.positions && data.positions.length > 0) {
          // Calculate TOTAL P&L from ALL positions
          let totalRealizedPnl = 0;
          let totalUnrealizedPnl = 0;
          
          data.positions.forEach((pos: any) => {
            const realized = parseFloat(pos.realizedPnl || pos.realizedProfit || 0);
            const unrealized = parseFloat(pos.unrealizedPnl || pos.unrealizedProfit || 0);
            
            totalRealizedPnl += realized;
            totalUnrealizedPnl += unrealized;
          });
          
          const totalPnl = totalRealizedPnl + totalUnrealizedPnl;
          
          // Show first position details in the card (prefer OPEN positions, fallback to CLOSED)
          const openPosition = data.positions.find((p: any) => p.positionType === 'LONG' || p.positionType === 'SHORT');
          const dhanPos = openPosition || data.positions[0];
          
          setPosition({
            strike: dhanPos.tradingSymbol || `Security ${dhanPos.securityId}`,
            entryPrice: parseFloat(dhanPos.buyAvg || dhanPos.sellAvg || dhanPos.averagePrice || 0),
            currentPrice: parseFloat(dhanPos.ltp || dhanPos.currentPrice || dhanPos.sellAvg || dhanPos.buyAvg || 0),
            pnl: parseFloat(dhanPos.pnl || ((dhanPos.realizedPnl || dhanPos.realizedProfit || 0) + (dhanPos.unrealizedPnl || dhanPos.unrealizedProfit || 0))),
            status: dhanPos.positionType === 'CLOSED' ? 'CLOSED' : 'OPEN',
            lotSize: Math.abs(dhanPos.netQty || dhanPos.quantity || 0)
          });
          
          // Set TOTAL P&L from ALL positions
          setTotalPnL(totalPnl);
          setRealizedPnL(totalRealizedPnl);
          setUnrealizedPnL(totalUnrealizedPnl);
        } else {
          setPosition(null);
          setTotalPnL(0);
          setRealizedPnL(0);
          setUnrealizedPnL(0);
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          // Silently fail on timeout - don't spam console every second
        } else if (error.message && !error.message.includes('Failed to fetch')) {
          // Only log errors that aren't generic network errors
          console.error('❌ Error fetching positions:', error.message || error);
        }
        // Silently fail for generic "Failed to fetch" errors to avoid console spam
      } finally {
        setLoadingPosition(false);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, 1000); // ⚡ 1-SECOND UPDATES for live P&L
    return () => clearInterval(interval);
  }, [credentialsConfigured, serverUrl, accessToken]);

  const getBiasColor = (bias: string) => {
    if (bias === "Bullish") return "text-emerald-400";
    if (bias === "Bearish") return "text-red-400";
    return "text-zinc-400";
  };

  const getMarketStateColor = (state: string) => {
    if (state === "Trending") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    if (state === "Range") return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    if (state === "Reversal Risk") return "bg-red-500/10 text-red-400 border-red-500/30";
    return "bg-zinc-500/10 text-zinc-400 border-zinc-500/30";
  };

  if (!credentialsConfigured) {
    return (
      <Card className="bg-amber-900/20 border-amber-500/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-amber-400" />
            <div>
              <div className="font-semibold text-amber-400">Configure Dhan API Credentials</div>
              <div className="text-sm text-zinc-400 mt-1">
                Go to Settings tab and enter your Dhan Client ID, Access Token, and ChatGPT API Key to activate real-time trading.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Index Selection */}
        <Card className="bg-gradient-to-br from-blue-900/20 to-zinc-900 border-blue-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">Index</span>
              <BarChart3 className="w-4 h-4 text-blue-400" />
            </div>
            <Select value={index} onValueChange={setIndex}>
              <SelectTrigger className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-12">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="NIFTY">NIFTY 50</SelectItem>
                <SelectItem value="BANKNIFTY">BANK NIFTY</SelectItem>
                <SelectItem value="SENSEX">SENSEX</SelectItem>
              </SelectContent>
            </Select>
            <div className="mt-3 text-2xl font-mono">
              {livePrice ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-emerald-400">₹{livePrice.toFixed(2)}</span>
                  <span className={`text-sm ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <span className="text-zinc-500">Loading...</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Engine Status */}
        <Card className="bg-gradient-to-br from-purple-900/20 to-zinc-900 border-purple-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">AI Engine</span>
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${aiEngineActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                <span className="text-lg text-white">{aiEngineActive ? 'ACTIVE' : 'IDLE'}</span>
              </div>
              <div className="text-sm text-zinc-400">
                Speed: <span className="text-zinc-100">{engineSpeed}</span>
              </div>
              <div className="text-xs text-zinc-500">
                Analysis: {aiAnalysis ? 'Running' : 'Waiting'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Analysis Status */}
        <Card className="bg-gradient-to-br from-emerald-900/20 to-zinc-900 border-emerald-500/30">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">AI Analysis</span>
              <Activity className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <Badge className={getMarketStateColor(aiAnalysis?.marketState || 'N/A')} variant="outline">
                {aiAnalysis?.marketState || 'N/A'}
              </Badge>
              <div className="flex items-center gap-2">
                {aiAnalysis?.bias === "Bullish" && <TrendingUp className="w-4 h-4 text-emerald-400" />}
                {aiAnalysis?.bias === "Bearish" && <TrendingDown className="w-4 h-4 text-red-400" />}
                <span className={getBiasColor(aiAnalysis?.bias || 'Neutral')}>
                  {aiAnalysis?.bias || 'Neutral'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={aiAnalysis?.confidence || 0} className="flex-1 h-2 bg-zinc-800" />
                <span className="text-xs text-zinc-400">{aiAnalysis?.confidence || 0}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* P&L Status */}
        <Card className={`bg-gradient-to-br ${totalPnL >= 0 ? 'from-emerald-900/20' : 'from-red-900/20'} to-zinc-900 border-${totalPnL >= 0 ? 'emerald' : 'red'}-500/30`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">Total P&L</span>
              <DollarSign className={`w-4 h-4 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
            </div>
            <div className="space-y-2">
              <div className={`text-3xl font-mono ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(2)}
              </div>
              <div className="text-xs text-zinc-400">
                {position ? `Position: ${position.status}` : 'No Position'}
              </div>
              {position && (
                <div className="text-xs text-zinc-500">
                  Lot: {position.lotSize}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fund Details */}
      {fundLimits && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg text-white font-semibold">Account Funds</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="space-y-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wider">Available</div>
                <div className="text-xl font-mono text-emerald-400">
                  ₹{fundLimits.availableBalance.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wider">SOD Limit</div>
                <div className="text-xl font-mono text-zinc-100">
                  ₹{fundLimits.sodLimit.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wider">Utilized</div>
                <div className="text-xl font-mono text-amber-400">
                  ₹{fundLimits.utilizationAmount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wider">Collateral</div>
                <div className="text-lg font-mono text-blue-400">
                  ₹{fundLimits.collateralAmount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wider">Blocked In</div>
                <div className="text-lg font-mono text-red-400">
                  ₹{fundLimits.blockedPayinAmount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-zinc-400 uppercase tracking-wider">Blocked Out</div>
                <div className="text-lg font-mono text-red-400">
                  ₹{fundLimits.blockedPayoutAmount.toLocaleString('en-IN')}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <div className="text-xs text-zinc-500">
                Utilization: {fundLimits.sodLimit > 0 ? ((fundLimits.utilizationAmount / fundLimits.sodLimit) * 100).toFixed(1) : 0}%
              </div>
              <Progress 
                value={fundLimits.sodLimit > 0 ? (fundLimits.utilizationAmount / fundLimits.sodLimit) * 100 : 0} 
                className="h-2 mt-2 bg-zinc-800" 
              />
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* P&L Breakdown Card - Live Data from Dhan */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg text-white font-semibold">Live P&L Breakdown</h3>
            <Badge className="ml-auto bg-blue-500/20 text-blue-400 border-blue-500/50">
              Real-Time Dhan Data
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Unrealized P&L */}
            <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Unrealized P&L</div>
              <div className={`text-3xl font-mono ${unrealizedPnL >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                {unrealizedPnL >= 0 ? '+' : ''}₹{unrealizedPnL.toFixed(2)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Open Positions</div>
            </div>
            
            {/* Realized P&L */}
            <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Realized P&L</div>
              <div className={`text-3xl font-mono ${realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {realizedPnL >= 0 ? '+' : ''}₹{realizedPnL.toFixed(2)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">Closed Positions</div>
            </div>
            
            {/* Total P&L */}
            <div className="p-4 bg-gradient-to-br from-emerald-900/30 to-zinc-800/50 rounded-lg border border-emerald-500/30">
              <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Total P&L</div>
              <div className={`text-3xl font-mono font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toFixed(2)}
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {loadingPosition ? 'Updating...' : 'Live from Dhan API'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Analysis Details */}
      {aiAnalysis && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg text-white font-semibold">AI Strategy Analysis</h3>
              <Badge className="ml-auto" variant="outline">
                {aiAnalysis.recommendation || 'WAIT'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Market State</div>
                <Badge className={getMarketStateColor(aiAnalysis.marketState)} variant="outline">
                  {aiAnalysis.marketState}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Directional Bias</div>
                <div className="flex items-center gap-2">
                  {aiAnalysis.bias === "Bullish" && <TrendingUp className="w-5 h-5 text-emerald-400" />}
                  {aiAnalysis.bias === "Bearish" && <TrendingDown className="w-5 h-5 text-red-400" />}
                  <span className={`text-lg ${getBiasColor(aiAnalysis.bias)}`}>
                    {aiAnalysis.bias}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Confidence Level</div>
                <div className="flex items-center gap-3">
                  <Progress value={aiAnalysis.confidence} className="flex-1 h-3 bg-zinc-800" />
                  <span className="text-lg font-mono text-white">{aiAnalysis.confidence}%</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Last Updated</div>
                <div className="text-sm text-zinc-300">
                  {aiAnalysis.lastUpdated || 'N/A'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Position Details */}
      {position && position.status === 'OPEN' && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg text-white font-semibold">Active Position</h3>
              <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
                {position.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Strike</div>
                <div className="text-lg font-mono text-white">{position.strike}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Entry Price</div>
                <div className="text-lg font-mono text-white">₹{position.entryPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Current Price</div>
                <div className="text-lg font-mono text-blue-400">₹{position.currentPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Lot Size</div>
                <div className="text-lg font-mono text-white">{position.lotSize}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">P&L</div>
                <div className={`text-xl font-mono ${position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {position.pnl >= 0 ? '+' : ''}₹{position.pnl.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Closed Position Details */}
      {position && position.status === 'CLOSED' && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-zinc-400" />
              <h3 className="text-lg text-white font-semibold">Recent Closed Position</h3>
              <Badge className="ml-auto bg-zinc-500/20 text-zinc-400 border-zinc-500/50">
                {position.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Strike</div>
                <div className="text-lg font-mono text-white">{position.strike}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Entry Price</div>
                <div className="text-lg font-mono text-white">₹{position.entryPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Exit Price</div>
                <div className="text-lg font-mono text-blue-400">₹{position.currentPrice.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Lot Size</div>
                <div className="text-lg font-mono text-white">{position.lotSize}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Realized P&L</div>
                <div className={`text-xl font-mono ${position.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {position.pnl >= 0 ? '+' : ''}₹{position.pnl.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}