import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { TrendingUp, Award, RefreshCw, Info } from 'lucide-react';
import { projectId } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { getBaseUrl } from '../utils/apiService';

interface PricingTier {
  min: number;
  max: number;
  fee: number;
  tier: number;
  name: string;
}

interface DailyStats {
  date: string;
  profit: number;
  currentTier: string;
  currentTierFee: number;
  lastDebitedTier: number;
  nextTier?: {
    name: string;
    threshold: number;
    fee: number;
    remaining: number;
  } | null;
  pricingTiers: PricingTier[];
}

interface WalletBalance {
  balance: number;
  totalProfit: number;
  totalDeducted: number;
}

export function ProfitDashboard({ accessToken }: { accessToken: string }) {
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
  
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [walletBalance, setWalletBalance] = useState<WalletBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverUrl = getBaseUrl();

  const loadData = async () => {
    try {
      setRefreshing(true);
      setError(null);
      
      console.log('🔍 ProfitDashboard: Loading data...', { serverUrl, hasToken: !!accessToken });
      
      // ⚡ GET FRESH TOKEN before API calls
      const freshToken = await getFreshAccessToken();
      
      // Load daily stats
      const statsResponse = await fetch(`${serverUrl}/wallet/daily-stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📊 Daily stats response:', statsResponse.status, statsResponse.statusText);
      
      if (!statsResponse.ok) {
        const errorText = await statsResponse.text();
        console.error('❌ Daily stats error:', errorText);
        
        if (statsResponse.status === 401) {
          console.error('⚠️ Authentication expired. Retrying with fresh token...');
          // Token was refreshed - the next interval will use it
          return;
        }
        
        throw new Error(`Failed to load daily stats: ${statsResponse.status}`);
      }
      
      const statsData = await statsResponse.json();
      console.log('✅ Daily stats loaded:', statsData);
      setDailyStats(statsData);
      
      // Load wallet balance
      const balanceResponse = await fetch(`${serverUrl}/wallet/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('💰 Wallet balance response:', balanceResponse.status, balanceResponse.statusText);
      
      if (!balanceResponse.ok) {
        const errorText = await balanceResponse.text();
        console.error('❌ Wallet balance error:', errorText);
        throw new Error(`Failed to load wallet balance: ${balanceResponse.status}`);
      }
      
      const balanceData = await balanceResponse.json();
      console.log('✅ Wallet balance loaded:', balanceData);
      setWalletBalance(balanceData);
      
    } catch (error) {
      console.error('❌ Failed to load profit dashboard data:', error);
      setError(error instanceof Error ? error.message : 'An unknown error occurred');
      // Clear any partial data on error
      setDailyStats(null);
      setWalletBalance(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [accessToken]);

  if (loading) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="text-center text-zinc-400 text-sm">Loading profit dashboard...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-amber-400 flex items-center gap-2">
            <Info className="size-4" />
            Dashboard Unavailable
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="text-xs text-zinc-400">
            Backend not responding. Supabase Edge Functions may not be deployed.
          </div>
          <div className="p-2 bg-blue-900/10 border border-blue-600/30 rounded text-xs text-zinc-400">
            <strong className="text-blue-400">Note:</strong> Trading works normally. Billing inactive until backend is deployed.
          </div>
          <Button onClick={loadData} variant="outline" size="sm" className="w-full">
            <RefreshCw className="size-3 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!dailyStats || !walletBalance) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="p-4">
          <div className="text-center text-zinc-400 text-sm">No data available</div>
        </CardContent>
      </Card>
    );
  }

  // Calculate progress to next tier
  const progressPercentage = dailyStats.nextTier 
    ? Math.min(100, (dailyStats.profit / dailyStats.nextTier.threshold) * 100)
    : 100;

  return (
    <div className="space-y-3">
      {/* Compact Daily Profit & Stats */}
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-green-500" />
              Today's Profit
            </CardTitle>
            <Button 
              onClick={loadData} 
              size="sm" 
              variant="ghost"
              disabled={refreshing}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Compact Stats Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
              <div className="text-[10px] text-zinc-500 uppercase">Profit</div>
              <div className="text-lg font-bold text-green-400">₹{dailyStats.profit.toFixed(0)}</div>
            </div>
            <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
              <div className="text-[10px] text-zinc-500 uppercase">Tier</div>
              <Badge className={`mt-1 text-[10px] px-1 py-0 h-5 ${
                dailyStats.currentTier === 'FREE' 
                  ? 'bg-green-900/30 text-green-400 border-green-600' 
                  : 'bg-amber-900/30 text-amber-400 border-amber-600'
              }`}>
                {dailyStats.currentTier}
              </Badge>
            </div>
            <div className="bg-zinc-800/50 rounded p-2 border border-zinc-700">
              <div className="text-[10px] text-zinc-500 uppercase">Fee</div>
              <div className="text-lg font-bold text-amber-400">₹{dailyStats.currentTierFee}</div>
            </div>
          </div>

          {/* Progress Bar */}
          {dailyStats.nextTier && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-zinc-500">Next: {dailyStats.nextTier.name}</span>
                <span className="text-zinc-400">₹{dailyStats.nextTier.remaining.toFixed(0)} left</span>
              </div>
              <Progress value={progressPercentage} className="h-1" />
            </div>
          )}

          {/* Wallet Stats */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800">
            <div className="text-center">
              <div className="text-[10px] text-zinc-500">Balance</div>
              <div className="text-sm font-semibold text-blue-400">₹{walletBalance.balance.toFixed(0)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-zinc-500">Total Profit</div>
              <div className="text-sm font-semibold text-green-400">₹{walletBalance.totalProfit.toFixed(0)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-zinc-500">Total Paid</div>
              <div className="text-sm font-semibold text-amber-400">₹{walletBalance.totalDeducted.toFixed(0)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compact Pricing Tiers */}
      <Card className="bg-zinc-900 border-zinc-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="size-4 text-amber-500" />
            Pricing Tiers
          </CardTitle>
          <CardDescription className="text-xs">Pay only when you profit</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {dailyStats.pricingTiers?.map((tier) => {
            if (!tier || typeof tier.min === 'undefined' || typeof tier.max === 'undefined') {
              return null;
            }
            
            const isCurrentTier = tier.name === dailyStats.currentTier;
            const isPaid = tier.tier <= dailyStats.lastDebitedTier;
            
            return (
              <div
                key={tier.tier}
                className={`flex items-center justify-between p-2 rounded border text-xs ${
                  isCurrentTier
                    ? 'bg-amber-900/20 border-amber-600'
                    : 'bg-zinc-800/30 border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`flex items-center justify-center size-6 rounded-full text-xs ${
                    isPaid 
                      ? 'bg-green-900/30 text-green-400' 
                      : isCurrentTier
                      ? 'bg-amber-900/30 text-amber-400'
                      : 'bg-zinc-700 text-zinc-500'
                  }`}>
                    {isPaid ? '✓' : tier.tier}
                  </div>
                  <div>
                    <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                      {tier.name}
                      {isCurrentTier && (
                        <Badge variant="outline" className="bg-amber-900/30 text-amber-400 border-amber-600 text-[9px] px-1 py-0 h-4">
                          NOW
                        </Badge>
                      )}
                      {isPaid && tier.fee > 0 && (
                        <Badge variant="outline" className="bg-green-900/30 text-green-400 border-green-600 text-[9px] px-1 py-0 h-4">
                          PAID
                        </Badge>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      ₹{(tier.min || 0).toLocaleString()} - {tier.max === Infinity ? '₹2K+' : `₹${(tier.max || 0).toLocaleString()}`}
                    </div>
                  </div>
                </div>
                <div className={`text-base font-bold ${
                  tier.fee === 0 
                    ? 'text-green-400' 
                    : isPaid 
                    ? 'text-green-400' 
                    : 'text-zinc-400'
                }`}>
                  {tier.fee === 0 ? 'FREE' : `₹${tier.fee}`}
                </div>
              </div>
            );
          })}
          
          <div className="mt-2 p-2 bg-blue-900/10 border border-blue-600/30 rounded">
            <div className="flex items-start gap-2">
              <Info className="size-3 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-[10px] text-zinc-400 leading-relaxed">
                Fees auto-deduct from wallet as you reach tiers. Pay only the difference. Resets daily.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}