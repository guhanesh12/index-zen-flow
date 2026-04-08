import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Activity } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { supabase } from '../../../utils/supabase/client';
import { getBaseUrl } from '../utils/apiService';

interface SignalMonitorProps {
  accessToken: string;
}

interface AdvancedSignal {
  action: 'BUY_CALL' | 'BUY_PUT' | 'WAIT' | 'EXIT' | 'HOLD';
  confidence: number;
  reasoning: string;
  market_state: string;
  bias: 'Bullish' | 'Bearish' | 'Neutral';
  confirmations: {
    total: number;
    required: number;
    details: string[];
  };
  indicators: any;
  patterns: Array<{
    type: string;
    strength: string;
    direction: string;
  }>;
}

export function SignalMonitor({ accessToken }: SignalMonitorProps) {
  const [niftySignal, setNiftySignal] = useState<AdvancedSignal | null>(null);
  const [bankniftySignal, setBankniftySignal] = useState<AdvancedSignal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const serverUrl = getBaseUrl();

  // ⚡ HELPER: Get fresh access token (auto-refresh if needed)
  const getFreshAccessToken = async (): Promise<string | null> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        // ⚡ Suppress "Auth session missing" - expected for unauthenticated users
        if (error?.message !== 'Auth session missing!') {
          console.error('❌ Failed to get session:', error?.message);
        }
        return null;
      }
      
      // Check if token is about to expire (within 5 minutes)
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = expiresAt ? expiresAt - now : 0;
      
      if (timeUntilExpiry < 300) {
        // Token expires in < 5 minutes, refresh it
        console.log('🔄 Token expiring soon, refreshing...');
        const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
        
        if (refreshError || !newSession) {
          console.error('❌ Failed to refresh session:', refreshError?.message);
          return null;
        }
        
        console.log('✅ Token refreshed successfully');
        return newSession.access_token;
      }
      
      return session.access_token;
    } catch (err) {
      console.error('❌ Error getting fresh token:', err);
      return null;
    }
  };

  // Debug: Log the accessToken on mount
  useEffect(() => {
    console.log('🔍 SignalMonitor accessToken check:', {
      hasToken: !!accessToken,
      tokenLength: accessToken?.length,
      tokenStart: accessToken?.substring(0, 20) + '...',
      isAnonKey: accessToken === publicAnonKey
    });
  }, [accessToken]);

  // Helper function to fetch with timeout and retry
  const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, timeout = 30000): Promise<Response> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (err: any) {
        if (attempt === retries) throw err;
        
        // Only retry on network errors
        if (err.name === 'AbortError' || err.message.includes('network') || err.message.includes('fetch')) {
          console.log(`Retry attempt ${attempt}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
          continue;
        }
        throw err;
      }
    }
    throw new Error('Max retries reached');
  };

  const fetchSignals = async () => {
    setLoading(true);
    setError(null);

    // ⚡ GET FRESH TOKEN INSTEAD OF USING PROP
    const freshToken = await getFreshAccessToken();
    
    if (!freshToken) {
      setError('Session expired. Please log in again.');
      setLoading(false);
      return;
    }

    // Debug: Check token before making request
    console.log('🔍 SignalMonitor fetchSignals - Token check:', {
      hasToken: !!freshToken,
      tokenLength: freshToken?.length || 0,
      tokenPrefix: freshToken?.substring(0, 30) + '...',
      tokenSuffix: '...' + freshToken?.substring(freshToken.length - 10),
      isPublicAnonKey: freshToken === publicAnonKey,
    });

    if (!freshToken || freshToken === publicAnonKey) {
      setError('Invalid authentication token. Please log in again.');
      setLoading(false);
      return;
    }

    try {
      // Fetch NIFTY signal
      console.log('📡 Sending request to /advanced-ai-signal with token');
      const niftyResponse = await fetchWithRetry(`${serverUrl}/advanced-ai-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshToken}`,  // Use fresh token
        },
        body: JSON.stringify({
          index: 'NIFTY',
          interval: '5'  // Valid interval
        })
      });

      console.log('📡 NIFTY response status:', niftyResponse.status);

      if (!niftyResponse.ok) {
        const errorData = await niftyResponse.json();
        console.error('❌ NIFTY signal error response:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to fetch NIFTY signal');
      }

      const niftyData = await niftyResponse.json();
      console.log('✅ NIFTY signal received successfully');
      setNiftySignal(niftyData.signal);

      // Fetch BANKNIFTY signal
      console.log('📡 Sending request to /advanced-ai-signal with token');
      const bankniftyResponse = await fetchWithRetry(`${serverUrl}/advanced-ai-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${freshToken}`,  // Use fresh token
        },
        body: JSON.stringify({
          index: 'BANKNIFTY',
          interval: '5'  // Valid interval
        })
      });

      console.log('📡 BANKNIFTY response status:', bankniftyResponse.status);

      if (!bankniftyResponse.ok) {
        const errorData = await bankniftyResponse.json();
        console.error('❌ BANKNIFTY signal error response:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to fetch BANKNIFTY signal');
      }

      const bankniftyData = await bankniftyResponse.json();
      console.log('✅ BANKNIFTY signal received successfully');
      setBankniftySignal(bankniftyData.signal);

      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('Error fetching signals:', err);
      setError(err.message || 'Failed to fetch signals');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 10 seconds when enabled
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchSignals();
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Initial fetch
  useEffect(() => {
    fetchSignals();
  }, []);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'BUY_CALL':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'BUY_PUT':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      default:
        return <Minus className="w-5 h-5 text-gray-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY_CALL':
        return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'BUY_PUT':
        return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'WAIT':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    }
  };

  const getBiasColor = (bias: string) => {
    switch (bias) {
      case 'Bullish':
        return 'bg-green-500/20 text-green-400';
      case 'Bearish':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const renderSignalCard = (symbol: string, signal: AdvancedSignal | null) => {
    if (!signal) {
      return (
        <Card className="bg-[#1a1d29] border-[#2a2f3f]">
          <CardHeader>
            <CardTitle className="text-lg">{symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center h-32 text-gray-500">
              <Activity className="w-6 h-6 mr-2 animate-pulse" />
              Loading signal...
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="bg-[#1a1d29] border-[#2a2f3f]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{symbol}</CardTitle>
            <Badge className={getBiasColor(signal.bias)}>
              {signal.bias}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getActionIcon(signal.action)}
              <span className="font-medium">Signal</span>
            </div>
            <Badge className={getActionColor(signal.action)}>
              {signal.action}
            </Badge>
          </div>

          {/* Confidence */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-400">Confidence</span>
              <span className="font-bold text-lg">{signal.confidence}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  signal.confidence >= 80 ? 'bg-green-500' :
                  signal.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${signal.confidence}%` }}
              />
            </div>
          </div>

          {/* Confirmations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Confirmations</span>
              <span className="font-medium">
                {signal.confirmations.total}/{signal.confirmations.required}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {signal.confirmations.details.slice(0, 5).map((detail, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30"
                >
                  {detail}
                </Badge>
              ))}
            </div>
          </div>

          {/* Market State */}
          <div className="pt-2 border-t border-gray-700">
            <div className="text-xs text-gray-400 mb-1">Market State</div>
            <div className="text-sm">{signal.market_state}</div>
          </div>

          {/* Reasoning */}
          <div className="pt-2 border-t border-gray-700">
            <div className="text-xs text-gray-400 mb-1">AI Reasoning</div>
            <div className="text-sm text-gray-300">{signal.reasoning}</div>
          </div>

          {/* Patterns */}
          {signal.patterns && signal.patterns.length > 0 && (
            <div className="pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-2">Detected Patterns</div>
              <div className="flex flex-wrap gap-2">
                {signal.patterns.slice(0, 3).map((pattern, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className={`text-xs ${
                      pattern.direction === 'BULLISH' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                      pattern.direction === 'BEARISH' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                      'bg-gray-500/10 text-gray-400 border-gray-500/30'
                    }`}
                  >
                    {pattern.type} ({pattern.strength})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Key Indicators */}
          {signal.indicators && (
            <div className="pt-2 border-t border-gray-700">
              <div className="text-xs text-gray-400 mb-2">Key Indicators</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-500">RSI:</span>{' '}
                  <span className={
                    signal.indicators.rsi > 70 ? 'text-red-400' :
                    signal.indicators.rsi < 30 ? 'text-green-400' :
                    'text-gray-300'
                  }>
                    {signal.indicators.rsi?.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">ADX:</span>{' '}
                  <span className={signal.indicators.adxStrong ? 'text-green-400' : 'text-gray-300'}>
                    {signal.indicators.adx?.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">EMA9:</span>{' '}
                  <span className="text-gray-300">{signal.indicators.ema9?.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-gray-500">VWAP:</span>{' '}
                  <span className="text-gray-300">{signal.indicators.vwap?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-[#1a1d29] border-[#2a2f3f]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Live Market Signals
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={autoRefresh ? "default" : "outline"}
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fetchSignals}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
          {lastUpdate && (
            <div className="text-xs text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </CardHeader>
        {error && (
          <CardContent>
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Signal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderSignalCard('NIFTY 50', niftySignal)}
        {renderSignalCard('BANKNIFTY', bankniftySignal)}
      </div>
    </div>
  );
}