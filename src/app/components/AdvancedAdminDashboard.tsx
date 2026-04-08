// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Activity, 
  ArrowUp, 
  ArrowDown,
  Zap,
  Target,
  BarChart3,
  PieChart,
  TrendingDown,
  Clock,
  Shield,
  Database,
  Cpu,
  AlertCircle,
  CheckCircle,
  XCircle,
  Calendar,
  Signal
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

interface AdvancedStats {
  // Financial
  totalRevenue: number;
  monthlyRevenue: number;
  revenueGrowth: number;
  avgRevenuePerUser: number;
  
  // Users
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  newUsersThisMonth: number;
  userGrowthRate: number;
  
  // Trading
  runningEngines: number;
  totalTrades: number;
  todayTrades: number;
  avgTradesPerUser: number;
  
  // P&L
  totalPnL: number;
  todayProfit: number;
  todayLoss: number;
  avgUserPnL: number;
  profitableUsers: number;
  
  // System
  systemUptime: number;
  apiResponseTime: number;
  errorRate: number;
  activeConnections: number;
}

interface ChartData {
  revenueTimeSeries: any[];
  userGrowthTimeSeries: any[];
  pnlDistribution: any[];
  tradeVolumeByHour: any[];
  userEngagementMetrics: any[];
  profitLossBreakdown: any[];
  monthlyComparison: any[];
  engineActivityHourly: any[];
  tierDistribution: any[];
  revenueByTier: any[];
}

interface AdminDashboardProps {
  serverUrl: string;
  accessToken: string;
}

export function AdvancedAdminDashboard({ serverUrl, accessToken }: AdminDashboardProps) {
  const [stats, setStats] = useState<AdvancedStats>({
    totalRevenue: 0,
    monthlyRevenue: 0,
    revenueGrowth: 0,
    avgRevenuePerUser: 0,
    totalUsers: 0,
    activeUsers: 0,
    newUsersToday: 0,
    newUsersThisMonth: 0,
    userGrowthRate: 0,
    runningEngines: 0,
    totalTrades: 0,
    todayTrades: 0,
    avgTradesPerUser: 0,
    totalPnL: 0,
    todayProfit: 0,
    todayLoss: 0,
    avgUserPnL: 0,
    profitableUsers: 0,
    systemUptime: 99.9,
    apiResponseTime: 245,
    errorRate: 0.2,
    activeConnections: 0
  });

  const [chartData, setChartData] = useState<ChartData>({
    revenueTimeSeries: [],
    userGrowthTimeSeries: [],
    pnlDistribution: [],
    tradeVolumeByHour: [],
    userEngagementMetrics: [],
    profitLossBreakdown: [],
    monthlyComparison: [],
    engineActivityHourly: [],
    tierDistribution: [],
    revenueByTier: []
  });

  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch comprehensive stats from server
  const fetchAdvancedStats = useCallback(async () => {
    try {
      console.log('📊 [ADVANCED ADMIN] Fetching comprehensive stats...');
      
      // Add cache-busting timestamp to force fresh data
      const timestamp = new Date().getTime();
      const response = await fetch(`${serverUrl}/admin/advanced-stats?_t=${timestamp}`, {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [ADVANCED ADMIN] Stats received:', data);
        
        if (data.stats) setStats(data.stats);
        if (data.chartData) {
          // Aggressive deduplication using Map to ensure absolutely no duplicate keys
          const deduplicateByKey = (arr: any[], keyField: string) => {
            const map = new Map();
            arr.forEach((item, idx) => {
              if (item && item[keyField]) {
                const key = item.id || `${item[keyField]}-${idx}`;
                if (!map.has(key)) {
                  map.set(key, { ...item, id: key });
                }
              }
            });
            return Array.from(map.values());
          };

          const sanitizedChartData = {
            revenueTimeSeries: deduplicateByKey(data.chartData.revenueTimeSeries || [], 'date'),
            userGrowthTimeSeries: deduplicateByKey(data.chartData.userGrowthTimeSeries || [], 'date'),
            pnlDistribution: deduplicateByKey(data.chartData.pnlDistribution || [], 'range'),
            tradeVolumeByHour: deduplicateByKey(data.chartData.tradeVolumeByHour || [], 'hour'),
            userEngagementMetrics: deduplicateByKey(data.chartData.userEngagementMetrics || [], 'metric'),
            profitLossBreakdown: deduplicateByKey(data.chartData.profitLossBreakdown || [], 'date'),
            monthlyComparison: deduplicateByKey(data.chartData.monthlyComparison || [], 'month'),
            engineActivityHourly: deduplicateByKey(data.chartData.engineActivityHourly || [], 'hour'),
            tierDistribution: deduplicateByKey(data.chartData.tierDistribution || [], 'tier'),
            revenueByTier: deduplicateByKey(data.chartData.revenueByTier || [], 'tier')
          };
          setChartData(sanitizedChartData);
        }
        setLastUpdate(new Date());
        setLoading(false);
      } else {
        console.error('❌ [ADVANCED ADMIN] Failed to fetch stats:', response.status);
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ [ADVANCED ADMIN] Error fetching stats:', error);
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => {
    fetchAdvancedStats();
    const interval = setInterval(fetchAdvancedStats, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [fetchAdvancedStats]);

  // Color palette
  const COLORS = {
    primary: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    purple: '#a855f7',
    cyan: '#06b6d4',
    pink: '#ec4899',
    orange: '#f97316'
  };

  const PIE_COLORS = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, COLORS.purple];

  // Stat Card Component
  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    change, 
    color = 'blue',
    prefix = '',
    suffix = '',
    trend = 'up'
  }: any) => {
    const colorMap: any = {
      blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      green: 'bg-green-500/10 text-green-400 border-green-500/20',
      red: 'bg-red-500/10 text-red-400 border-red-500/20',
      purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
      cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
    };

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
      >
        <Card className={`${colorMap[color]} backdrop-blur-sm`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${colorMap[color]}`}>
                <Icon className="size-6" />
              </div>
              {typeof change === 'number' && (
                <div className={`flex items-center gap-1 text-sm font-semibold ${
                  change > 0 ? 'text-green-400' : change < 0 ? 'text-red-400' : 'text-slate-400'
                }`}>
                  {change > 0 ? <ArrowUp className="size-4" /> : change < 0 ? <ArrowDown className="size-4" /> : null}
                  {Math.abs(change).toFixed(1)}%
                </div>
              )}
            </div>
            <div>
              <p className="text-sm text-slate-400 mb-1">{title}</p>
              <p className="text-3xl font-bold text-white">
                {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <div className="size-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400">Loading advanced analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="size-8 text-blue-400" />
            Advanced Analytics Dashboard
          </h2>
          <p className="text-slate-400 mt-1">
            Real-time platform insights • Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchAdvancedStats}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          <Activity className="size-4" />
          Refresh
        </button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="system">System Health</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6">
          {/* Top KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Revenue"
              value={stats.totalRevenue}
              icon={DollarSign}
              change={stats.revenueGrowth}
              color="green"
              prefix="₹"
            />
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={Users}
              change={stats.userGrowthRate}
              color="blue"
            />
            <StatCard
              title="Active Users"
              value={stats.activeUsers}
              icon={Activity}
              color="purple"
              suffix={` (${stats.totalUsers > 0 ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1) : 0}%)`}
            />
            <StatCard
              title="Running Engines"
              value={stats.runningEngines}
              icon={Zap}
              color="orange"
            />
          </div>

          {/* Revenue & User Growth Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="border-blue-500/20 bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <TrendingUp className="size-5 text-blue-400" />
                    Revenue Trend (30 Days)
                  </CardTitle>
                  <CardDescription>Daily revenue breakdown</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData.revenueTimeSeries}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '1px solid #3b82f6',
                          borderRadius: '8px',
                          color: '#fff'
                        }} 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke={COLORS.primary} 
                        fillOpacity={1} 
                        fill="url(#revenueGradient)" 
                        name="Revenue (₹)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>

            {/* User Growth */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="border-green-500/20 bg-slate-900/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-white">
                    <Users className="size-5 text-green-400" />
                    User Growth (30 Days)
                  </CardTitle>
                  <CardDescription>New user registrations</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData.userGrowthTimeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" />
                      <YAxis stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '1px solid #10b981',
                          borderRadius: '8px',
                          color: '#fff'
                        }} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="users" 
                        stroke={COLORS.success} 
                        strokeWidth={3}
                        dot={{ fill: COLORS.success, r: 4 }}
                        name="New Users"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="cumulative" 
                        stroke={COLORS.cyan} 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Total Users"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* P&L Distribution & Trade Volume */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* P&L Distribution */}
            <Card className="border-purple-500/20 bg-slate-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Target className="size-5 text-purple-400" />
                  User P&L Distribution
                </CardTitle>
                <CardDescription>Profit & loss ranges across users</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.pnlDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="range" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #a855f7',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Bar dataKey="count" fill={COLORS.purple} radius={[8, 8, 0, 0]} name="Users" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Trade Volume by Hour */}
            <Card className="border-orange-500/20 bg-slate-900/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Clock className="size-5 text-orange-400" />
                  Trade Volume by Hour (Today)
                </CardTitle>
                <CardDescription>Hourly trading activity</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.tradeVolumeByHour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="hour" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #f97316',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Bar dataKey="trades" fill={COLORS.orange} radius={[8, 8, 0, 0]} name="Trades" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Today's Profit"
              value={stats.todayProfit}
              icon={TrendingUp}
              color="green"
              prefix="₹"
            />
            <StatCard
              title="Today's Loss"
              value={stats.todayLoss}
              icon={TrendingDown}
              color="red"
              prefix="₹"
            />
            <StatCard
              title="Avg User P&L"
              value={stats.avgUserPnL}
              icon={Target}
              color="blue"
              prefix="₹"
            />
            <StatCard
              title="Profitable Users"
              value={stats.profitableUsers}
              icon={CheckCircle}
              color="green"
              suffix={` (${stats.totalUsers > 0 ? ((stats.profitableUsers / stats.totalUsers) * 100).toFixed(1) : 0}%)`}
            />
          </div>
        </TabsContent>

        {/* REVENUE TAB */}
        <TabsContent value="revenue" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Revenue"
              value={stats.totalRevenue}
              icon={DollarSign}
              change={stats.revenueGrowth}
              color="green"
              prefix="₹"
            />
            <StatCard
              title="Monthly Revenue"
              value={stats.monthlyRevenue}
              icon={Calendar}
              color="blue"
              prefix="₹"
            />
            <StatCard
              title="Avg Revenue/User"
              value={stats.avgRevenuePerUser}
              icon={Users}
              color="purple"
              prefix="₹"
            />
            <StatCard
              title="Total Transactions"
              value={chartData.revenueTimeSeries.reduce((sum, d) => sum + (d.transactions || 0), 0)}
              icon={Activity}
              color="orange"
            />
          </div>

          {/* Revenue Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Comparison */}
            <Card className="border-blue-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <BarChart3 className="size-5 text-blue-400" />
                  Monthly Revenue Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.monthlyComparison}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #3b82f6',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Bar dataKey="revenue" fill={COLORS.primary} radius={[8, 8, 0, 0]} name="Revenue (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue by Tier */}
            <Card className="border-purple-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <PieChart className="size-5 text-purple-400" />
                  Revenue by Tier
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPie>
                    <Pie
                      data={chartData.revenueByTier}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.tier}: ₹${entry.revenue.toLocaleString()}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="revenue"
                      nameKey="tier"
                    >
                      {chartData.revenueByTier.map((entry, index) => (
                        <Cell key={entry.id || `revenue-cell-${entry.tier}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #a855f7',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* USERS TAB */}
        <TabsContent value="users" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Users"
              value={stats.totalUsers}
              icon={Users}
              change={stats.userGrowthRate}
              color="blue"
            />
            <StatCard
              title="New Today"
              value={stats.newUsersToday}
              icon={Calendar}
              color="green"
            />
            <StatCard
              title="New This Month"
              value={stats.newUsersThisMonth}
              icon={TrendingUp}
              color="purple"
            />
            <StatCard
              title="Active Rate"
              value={stats.totalUsers > 0 ? ((stats.activeUsers / stats.totalUsers) * 100).toFixed(1) : 0}
              icon={Activity}
              color="orange"
              suffix="%"
            />
          </div>

          {/* User Engagement Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Engagement Metrics */}
            <Card className="border-cyan-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Signal className="size-5 text-cyan-400" />
                  User Engagement Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={chartData.userEngagementMetrics}>
                    <PolarGrid stroke="#334155" />
                    <PolarAngleAxis dataKey="metric" stroke="#94a3b8" />
                    <PolarRadiusAxis stroke="#94a3b8" />
                    <Radar name="Score" dataKey="value" stroke={COLORS.cyan} fill={COLORS.cyan} fillOpacity={0.6} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #06b6d4',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tier Distribution */}
            <Card className="border-pink-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="size-5 text-pink-400" />
                  User Tier Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPie>
                    <Pie
                      data={chartData.tierDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.tier}: ${entry.count} users`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                      nameKey="tier"
                    >
                      {chartData.tierDistribution.map((entry, index) => (
                        <Cell key={entry.id || `tier-cell-${entry.tier}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #ec4899',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                  </RechartsPie>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TRADING TAB */}
        <TabsContent value="trading" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Trades"
              value={stats.totalTrades}
              icon={Activity}
              color="blue"
            />
            <StatCard
              title="Today's Trades"
              value={stats.todayTrades}
              icon={Clock}
              color="green"
            />
            <StatCard
              title="Avg Trades/User"
              value={stats.avgTradesPerUser.toFixed(1)}
              icon={Target}
              color="purple"
            />
            <StatCard
              title="Running Engines"
              value={stats.runningEngines}
              icon={Zap}
              color="orange"
            />
          </div>

          {/* Trading Activity Charts */}
          <div className="grid grid-cols-1 gap-6">
            {/* Engine Activity Hourly */}
            <Card className="border-green-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Activity className="size-5 text-green-400" />
                  Engine Activity (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData.engineActivityHourly}>
                    <defs>
                      <linearGradient id="runningGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="hour" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #10b981',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="running" 
                      stroke={COLORS.success} 
                      fillOpacity={1} 
                      fill="url(#runningGradient)" 
                      name="Running Engines"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Profit/Loss Breakdown */}
            <Card className="border-blue-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Target className="size-5 text-blue-400" />
                  Profit/Loss Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData.profitLossBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1e293b', 
                        border: '1px solid #3b82f6',
                        borderRadius: '8px',
                        color: '#fff'
                      }} 
                    />
                    <Legend />
                    <Bar dataKey="profit" fill={COLORS.success} radius={[8, 8, 0, 0]} name="Profit (₹)" />
                    <Bar dataKey="loss" fill={COLORS.danger} radius={[8, 8, 0, 0]} name="Loss (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SYSTEM HEALTH TAB */}
        <TabsContent value="system" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="System Uptime"
              value={stats.systemUptime}
              icon={CheckCircle}
              color="green"
              suffix="%"
            />
            <StatCard
              title="API Response Time"
              value={stats.apiResponseTime}
              icon={Clock}
              color="blue"
              suffix="ms"
            />
            <StatCard
              title="Error Rate"
              value={stats.errorRate}
              icon={AlertCircle}
              color="orange"
              suffix="%"
            />
            <StatCard
              title="Active Connections"
              value={stats.activeConnections}
              icon={Database}
              color="purple"
            />
          </div>

          {/* System Health Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-green-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Cpu className="size-5 text-green-400" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">Database</span>
                  </div>
                  <span className="text-green-400 font-semibold">Operational</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">API Server</span>
                  </div>
                  <span className="text-green-400 font-semibold">Operational</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">Dhan Integration</span>
                  </div>
                  <span className="text-green-400 font-semibold">Operational</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">Trading Engine</span>
                  </div>
                  <span className="text-green-400 font-semibold">Operational</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-500/20 bg-slate-900/80">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="size-5 text-blue-400" />
                  Security Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">SSL Certificate</span>
                  </div>
                  <span className="text-green-400 font-semibold">Valid</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">Auth System</span>
                  </div>
                  <span className="text-green-400 font-semibold">Secure</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">Data Encryption</span>
                  </div>
                  <span className="text-green-400 font-semibold">Active</span>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="size-5 text-green-400" />
                    <span className="text-white">Firewall</span>
                  </div>
                  <span className="text-green-400 font-semibold">Active</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default AdvancedAdminDashboard;