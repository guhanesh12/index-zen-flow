// @ts-nocheck
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

  return null;
}