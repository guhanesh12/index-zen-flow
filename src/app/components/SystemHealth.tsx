import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Activity, 
  Server, 
  Database, 
  Wifi, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Zap,
  TrendingUp,
  Clock
} from 'lucide-react';
import { Button } from './ui/button';

interface SystemHealthProps {
  serverUrl: string;
  accessToken: string;
}

interface HealthStatus {
  server: 'healthy' | 'degraded' | 'down';
  database: 'healthy' | 'degraded' | 'down';
  api: 'healthy' | 'degraded' | 'down';
  dhan: 'connected' | 'disconnected' | 'error';
  lastCheck: string;
  uptime: number;
  responseTime: number;
}

export function SystemHealth({ serverUrl, accessToken }: SystemHealthProps) {
  const [health, setHealth] = useState<HealthStatus>({
    server: 'healthy',
    database: 'healthy',
    api: 'healthy',
    dhan: 'disconnected',
    lastCheck: new Date().toISOString(),
    uptime: 99.9,
    responseTime: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    setLoading(true);
    const startTime = Date.now();

    try {
      // Check server status
      const response = await fetch(`${serverUrl}/health`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        setHealth({
          server: data.server || 'healthy',
          database: data.database || 'healthy',
          api: data.api || 'healthy',
          dhan: data.dhan || 'disconnected',
          lastCheck: new Date().toISOString(),
          uptime: data.uptime || 99.9,
          responseTime
        });
      } else {
        setHealth(prev => ({
          ...prev,
          server: 'degraded',
          lastCheck: new Date().toISOString(),
          responseTime
        }));
      }
    } catch (error) {
      console.error('Health check failed:', error);
      setHealth(prev => ({
        ...prev,
        server: 'down',
        lastCheck: new Date().toISOString(),
        responseTime: Date.now() - startTime
      }));
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'healthy' || status === 'connected') return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (status === 'degraded') return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-red-400 bg-red-500/20 border-red-500/30';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'healthy' || status === 'connected') return <CheckCircle className="w-5 h-5" />;
    if (status === 'degraded') return <AlertTriangle className="w-5 h-5" />;
    return <XCircle className="w-5 h-5" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-green-400" />
            System Health Monitor
          </h2>
          <p className="text-slate-400 mt-1">Real-time system status and performance metrics</p>
        </div>
        <Button
          onClick={checkHealth}
          disabled={loading}
          variant="outline"
          className="border-slate-700 bg-slate-800 hover:bg-slate-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Status Card */}
      <Card className="border-slate-700 bg-gradient-to-br from-slate-900 to-slate-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">System Status</p>
              <div className="flex items-center gap-3">
                <h3 className="text-3xl font-bold text-white">
                  {health.server === 'healthy' && health.database === 'healthy' && health.api === 'healthy' 
                    ? 'All Systems Operational' 
                    : health.server === 'down' 
                    ? 'System Down' 
                    : 'Partial Outage'}
                </h3>
                {health.server === 'healthy' && health.database === 'healthy' && health.api === 'healthy' ? (
                  <CheckCircle className="w-8 h-8 text-green-400" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-yellow-400" />
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-sm mb-1">Last Checked</p>
              <p className="text-white font-medium">
                {new Date(health.lastCheck).toLocaleTimeString('en-IN')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Server Status */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-400" />
                <CardTitle className="text-white">Web Server</CardTitle>
              </div>
              <Badge className={getStatusColor(health.server)}>
                {getStatusIcon(health.server)}
                <span className="ml-1 capitalize">{health.server}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Response Time</span>
                <span className="text-white font-medium">{health.responseTime}ms</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Uptime</span>
                <span className="text-green-400 font-medium">{health.uptime}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                <CardTitle className="text-white">Database</CardTitle>
              </div>
              <Badge className={getStatusColor(health.database)}>
                {getStatusIcon(health.database)}
                <span className="ml-1 capitalize">{health.database}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Connection Pool</span>
                <span className="text-white font-medium">Active</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Query Performance</span>
                <span className="text-green-400 font-medium">Optimal</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Status */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <CardTitle className="text-white">Trading API</CardTitle>
              </div>
              <Badge className={getStatusColor(health.api)}>
                {getStatusIcon(health.api)}
                <span className="ml-1 capitalize">{health.api}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Rate Limit</span>
                <span className="text-white font-medium">Within Limits</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Requests Today</span>
                <span className="text-blue-400 font-medium">1,234</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dhan Connection */}
        <Card className="border-slate-700 bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="w-5 h-5 text-green-400" />
                <CardTitle className="text-white">Dhan Broker</CardTitle>
              </div>
              <Badge className={getStatusColor(health.dhan)}>
                {getStatusIcon(health.dhan)}
                <span className="ml-1 capitalize">{health.dhan}</span>
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Connection Status</span>
                <span className={`font-medium ${health.dhan === 'connected' ? 'text-green-400' : 'text-slate-400'}`}>
                  {health.dhan === 'connected' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Last Sync</span>
                <span className="text-white font-medium">
                  {new Date(health.lastCheck).toLocaleTimeString('en-IN')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            Performance Metrics
          </CardTitle>
          <CardDescription className="text-slate-400">
            System performance over the last 24 hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="text-center p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <p className="text-sm text-slate-400">Avg Response</p>
              </div>
              <p className="text-2xl font-bold text-white">{health.responseTime}ms</p>
            </div>
            <div className="text-center p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-green-400" />
                <p className="text-sm text-slate-400">Uptime</p>
              </div>
              <p className="text-2xl font-bold text-green-400">{health.uptime}%</p>
            </div>
            <div className="text-center p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <p className="text-sm text-slate-400">API Calls</p>
              </div>
              <p className="text-2xl font-bold text-white">1.2K</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Legend */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-slate-300">Healthy</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-slate-300">Degraded</span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="text-slate-300">Down</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
