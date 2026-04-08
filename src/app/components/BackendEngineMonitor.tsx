// @ts-nocheck
/**
 * 🚀 BACKEND ENGINE MONITOR - Frontend displays data from backend engine
 * 
 * KEY CONCEPT:
 * - Engine runs 100% on SERVER (backend)
 * - Frontend ONLY displays status and data
 * - No frontend timers, no localStorage for critical data
 * - Everything persists in database
 */

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Play, Square, RefreshCw, Activity, Zap, TrendingUp } from 'lucide-react';
import { api, API_ENDPOINTS } from '../utils/apiService';

interface EngineStatus {
  isRunning: boolean;
  userId: string;
  candleInterval: '5' | '15';
  symbols: any[];
  lastProcessedCandle: string;
  activePositions: any[];
  stats: {
    totalSignals: number;
    totalOrders: number;
    totalPnL: number;
  };
  startTime: number;
  lastHeartbeat: number;
}

interface BackendEngineMonitorProps {
  accessToken: string;
  tradingSymbols: any[];
  candleInterval: '5' | '15';
  onLog: (log: any) => void;
}

export function BackendEngineMonitor({ 
  accessToken, 
  tradingSymbols,
  candleInterval,
  onLog 
}: BackendEngineMonitorProps) {
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [signals, setSignals] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  
  const statusCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // ⚡ FETCH ENGINE STATUS FROM BACKEND (every 2 seconds)
  const fetchEngineStatus = async () => {
    try {
      const status = await api.get(API_ENDPOINTS.TRADING.ENGINE_STATUS, accessToken);
      setEngineStatus(status);

      // Also fetch signals, orders, positions
      const [signalsData, ordersData, positionsData] = await Promise.all([
        api.get(API_ENDPOINTS.TRADING.SIGNALS, accessToken),
        api.get(API_ENDPOINTS.TRADING.ORDERS, accessToken),
        api.get(API_ENDPOINTS.TRADING.POSITIONS, accessToken)
      ]);

      setSignals(signalsData.signals || []);
      setOrders(ordersData.orders || []);
      setPositions(positionsData.positions || []);

    } catch (error) {
      console.error('❌ Failed to fetch engine status:', error);
    }
  };

  // ⚡ START BACKEND ENGINE
  const startBackendEngine = async () => {
    try {
      setIsLoading(true);

      const activeSymbols = tradingSymbols.filter(s => s.active);

      if (activeSymbols.length === 0) {
        alert('❌ No active symbols! Please select symbols first.');
        return;
      }

      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: `🚀 Starting backend engine with ${activeSymbols.length} symbols...`
      });

      const result = await api.post(
        API_ENDPOINTS.TRADING.ENGINE_START, 
        {
          candleInterval,
          symbols: activeSymbols
        },
        accessToken
      );

      if (result.success) {
        onLog({
          timestamp: Date.now(),
          type: 'SUCCESS',
          message: `✅ Backend engine started! Running 24/7 on server.`
        });

        // Start monitoring
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
        }
        statusCheckInterval.current = setInterval(fetchEngineStatus, 2000);

        // Immediate fetch
        await fetchEngineStatus();
      } else {
        throw new Error(result.message || 'Failed to start engine');
      }

    } catch (error: any) {
      console.error('❌ Error starting backend engine:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Failed to start engine: ${error.message}`
      });
      alert(`❌ Failed to start engine: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // ⚡ STOP BACKEND ENGINE
  const stopBackendEngine = async () => {
    try {
      setIsLoading(true);

      onLog({
        timestamp: Date.now(),
        type: 'INFO',
        message: `🛑 Stopping backend engine...`
      });

      const result = await api.post(
        API_ENDPOINTS.TRADING.ENGINE_STOP,
        {},
        accessToken
      );

      if (result.success) {
        onLog({
          timestamp: Date.now(),
          type: 'INFO',
          message: `✅ Backend engine stopped.`
        });

        // Stop monitoring
        if (statusCheckInterval.current) {
          clearInterval(statusCheckInterval.current);
          statusCheckInterval.current = null;
        }

        setEngineStatus(null);
      } else {
        throw new Error(result.message || 'Failed to stop engine');
      }

    } catch (error: any) {
      console.error('❌ Error stopping backend engine:', error);
      onLog({
        timestamp: Date.now(),
        type: 'ERROR',
        message: `❌ Failed to stop engine: ${error.message}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ⚡ CHECK ENGINE STATUS ON MOUNT
  useEffect(() => {
    fetchEngineStatus();

    // Start monitoring if engine is running
    if (engineStatus?.isRunning) {
      statusCheckInterval.current = setInterval(fetchEngineStatus, 2000);
    }

    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
    };
  }, []);

  const isRunning = engineStatus?.isRunning || false;
  const stats = engineStatus?.stats || { totalSignals: 0, totalOrders: 0, totalPnL: 0 };

  return (
    <Card className="border-blue-500/20 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-amber-500" />
            <span>24/7 Backend Trading Engine</span>
            <Badge variant={isRunning ? "default" : "secondary"} className={isRunning ? "bg-green-600" : ""}>
              {isRunning ? "RUNNING" : "STOPPED"}
            </Badge>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={fetchEngineStatus}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>

            {isRunning ? (
              <Button
                onClick={stopBackendEngine}
                variant="destructive"
                size="sm"
                disabled={isLoading}
              >
                <Square className="size-4 mr-1" />
                Stop Engine
              </Button>
            ) : (
              <Button
                onClick={startBackendEngine}
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                size="sm"
                disabled={isLoading}
              >
                <Play className="size-4 mr-1" />
                Start Engine
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {engineStatus ? (
          <div className="space-y-4">
            {/* Status Info */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-slate-400">Candle Interval</p>
                <p className="text-lg font-bold text-white">{engineStatus.candleInterval}M</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Active Symbols</p>
                <p className="text-lg font-bold text-white">{engineStatus.symbols.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Active Positions</p>
                <p className="text-lg font-bold text-white">{engineStatus.activePositions.length}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-700">
              <div>
                <p className="text-sm text-slate-400">Total Signals</p>
                <p className="text-2xl font-bold text-blue-400">{stats.totalSignals}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Total Orders</p>
                <p className="text-2xl font-bold text-purple-400">{stats.totalOrders}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Total P&L</p>
                <p className={`text-2xl font-bold ${stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{stats.totalPnL.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Heartbeat */}
            {engineStatus.lastHeartbeat && (
              <div className="flex items-center gap-2 text-sm text-slate-400 pt-2">
                <Activity className="size-4 text-green-400 animate-pulse" />
                <span>Last heartbeat: {new Date(engineStatus.lastHeartbeat).toLocaleTimeString()}</span>
              </div>
            )}

            {/* Last Candle */}
            {engineStatus.lastProcessedCandle && (
              <div className="text-sm text-slate-400">
                Last processed: {engineStatus.lastProcessedCandle}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <p>Engine status not available</p>
            <p className="text-sm mt-2">Click "Start Engine" to begin trading</p>
          </div>
        )}

        {/* Info Banner */}
        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-sm text-blue-300 flex items-center gap-2">
            <Zap className="size-4" />
            <span>
              <strong>24/7 Server Engine:</strong> Runs independently on the backend. 
              Works even when browser is closed!
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
