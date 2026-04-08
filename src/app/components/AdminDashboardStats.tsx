// @ts-nocheck
import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { 
  TrendingUp, 
  Users, 
  DollarSign, 
  Activity, 
  ArrowUp, 
  ArrowDown,
  Zap,
  Target
} from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api, API_ENDPOINTS } from '../utils/apiService';

interface DashboardStats {
  totalRevenue: number;
  totalUsers: number;
  activeUsers: number;
  runningEngines: number;
  todayProfit: number;
  todayLoss: number;
  avgUserPnL: number;
  totalTrades: number;
}

interface AdminDashboardStatsProps {
  accessToken: string;
}

export function AdminDashboardStats({ accessToken }: AdminDashboardStatsProps) {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalUsers: 0,
    activeUsers: 0,
    runningEngines: 0,
    todayProfit: 0,
    todayLoss: 0,
    avgUserPnL: 0,
    totalTrades: 0,
  });

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [userPnLDistribution, setUserPnLDistribution] = useState<any[]>([]);
  const [engineStats, setEngineStats] = useState<any[]>([]);
  
  // Track if this is first load to show initial animation
  const isFirstLoad = useRef(true);
  
  // Use refs to store previous data for comparison
  const prevStatsRef = useRef<DashboardStats>(stats);
  const prevRevenueRef = useRef<any[]>(revenueData);
  const prevPnLDistRef = useRef<any[]>(userPnLDistribution);
  const prevEngineRef = useRef<any[]>(engineStats);

  useEffect(() => {
    // Load REAL stats from backend
    const loadRealStats = async () => {
      try {
        if (!isFirstLoad.current) {
          // Silent background refresh - no console logs
        } else {
          console.log('📊 [ADMIN STATS] Initial load from server...');
        }
        
        // Fetch real data from server using centralized API
        const serverData = await api.get(API_ENDPOINTS.ADMIN.STATS, accessToken);
        
        if (isFirstLoad.current) {
          console.log('📊 [ADMIN STATS] Data received:', serverData);
          isFirstLoad.current = false;
        }
        
        // Only update state if data actually changed (prevents unnecessary re-renders)
        if (JSON.stringify(serverData.stats) !== JSON.stringify(prevStatsRef.current)) {
          setStats(serverData.stats);
          prevStatsRef.current = serverData.stats;
        }
        if (JSON.stringify(serverData.revenueData || []) !== JSON.stringify(prevRevenueRef.current)) {
          // Add unique keys to revenue data
          const revenueWithKeys = (serverData.revenueData || []).map((item: any, index: number) => ({
            ...item,
            key: item.key || `revenue-${index}-${item.date || index}`
          }));
          setRevenueData(revenueWithKeys);
          prevRevenueRef.current = revenueWithKeys;
        }
        if (JSON.stringify(serverData.userPnLDistribution || []) !== JSON.stringify(prevPnLDistRef.current)) {
          // Add unique keys to P&L distribution
          const pnlWithKeys = (serverData.userPnLDistribution || []).map((item: any, index: number) => ({
            ...item,
            key: item.key || `pnl-${index}-${item.range || index}`
          }));
          setUserPnLDistribution(pnlWithKeys);
          prevPnLDistRef.current = pnlWithKeys;
        }
        if (JSON.stringify(serverData.engineStats || []) !== JSON.stringify(prevEngineRef.current)) {
          // Add unique keys to engine stats
          const engineWithKeys = (serverData.engineStats || []).map((item: any, index: number) => ({
            ...item,
            key: item.key || `engine-${index}-${item.time || index}`
          }));
          setEngineStats(engineWithKeys);
          prevEngineRef.current = engineWithKeys;
        }
      } catch (error) {
        if (isFirstLoad.current) {
          console.error('📊 [ADMIN STATS] Failed to load server stats:', error);
        }
        // Fallback to localStorage if server fails
        loadLocalStats();
      }
    };

    const loadLocalStats = () => {
      // Get REAL data from localStorage - NO MOCK DATA
      const usersRaw = localStorage.getItem('platform_users');
      const transactionsRaw = localStorage.getItem('wallet_transactions');
      const tradesRaw = localStorage.getItem('all_trades');
      
      console.log('🔍 Loading REAL admin stats...');
      console.log('Users raw:', usersRaw);
      console.log('Transactions raw:', transactionsRaw);
      console.log('Trades raw:', tradesRaw);
      
      const users = usersRaw ? JSON.parse(usersRaw) : [];
      const transactions = transactionsRaw ? JSON.parse(transactionsRaw) : [];
      const trades = tradesRaw ? JSON.parse(tradesRaw) : [];
      
      console.log('✅ Parsed users:', users);
      console.log('✅ Parsed transactions:', transactions);
      console.log('✅ Parsed trades:', trades);

      // Calculate REAL active users (engine running)
      const activeUsers = users.filter((u: any) => u.engineRunning === true).length;
      
      // Calculate REAL total revenue (wallet debits only)
      const totalRevenue = transactions
        .filter((t: any) => t.type === 'debit')
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      // Calculate today's P&L
      const today = new Date().toDateString();
      const todayTrades = trades.filter((t: any) => new Date(t.timestamp).toDateString() === today);
      const todayProfit = todayTrades
        .filter((t: any) => (t.pnl || 0) > 0)
        .reduce((sum: number, t: any) => sum + (t.pnl || 0), 0);
      const todayLoss = Math.abs(todayTrades
        .filter((t: any) => (t.pnl || 0) < 0)
        .reduce((sum: number, t: any) => sum + (t.pnl || 0), 0));

      // Calculate average user P&L from REAL users only
      const totalUserPnL = users.reduce((sum: number, u: any) => sum + (u.totalPnL || 0), 0);
      const avgUserPnL = users.length > 0 ? totalUserPnL / users.length : 0;

      const realStats = {
        totalUsers: users.length,
        activeUsers: activeUsers,
        runningEngines: activeUsers, // Same as active users
        totalRevenue: totalRevenue,
        todayProfit: todayProfit,
        todayLoss: todayLoss,
        avgUserPnL: avgUserPnL,
        totalTrades: trades.length,
      };

      console.log('📊 Calculated REAL stats:', realStats);
      setStats(realStats);

      // Generate revenue data from transactions
      const monthlyRevenue: any = {};
      transactions.forEach((t: any) => {
        const month = new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short' });
        if (!monthlyRevenue[month]) {
          monthlyRevenue[month] = { revenue: 0, users: 0 };
        }
        if (t.type === 'debit') {
          monthlyRevenue[month].revenue += (t.amount || 0);
        }
      });
      const revenueDataArray = Object.entries(monthlyRevenue).map(([date, data]: any, index) => ({ 
        date, 
        ...data,
        key: `revenue-${index}-${date}` // Add unique key
      }));
      setRevenueData(revenueDataArray.length > 0 ? revenueDataArray : []);

      // Generate user P&L distribution from REAL users
      const pnlRanges = [
        { range: '< -5000', count: 0, key: 'pnl-0' },
        { range: '-5000 to 0', count: 0, key: 'pnl-1' },
        { range: '0 to 5000', count: 0, key: 'pnl-2' },
        { range: '5000 to 10000', count: 0, key: 'pnl-3' },
        { range: '> 10000', count: 0, key: 'pnl-4' },
      ];
      users.forEach((u: any) => {
        const pnl = u.totalPnL || 0;
        if (pnl < -5000) pnlRanges[0].count++;
        else if (pnl >= -5000 && pnl < 0) pnlRanges[1].count++;
        else if (pnl >= 0 && pnl < 5000) pnlRanges[2].count++;
        else if (pnl >= 5000 && pnl < 10000) pnlRanges[3].count++;
        else pnlRanges[4].count++;
      });
      setUserPnLDistribution(pnlRanges);

      // Generate engine stats (empty if no data)
      setEngineStats([]);
    };

    loadRealStats();
    const interval = setInterval(loadRealStats, 5000); // Silent background refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, [accessToken]); // Remove stats dependencies to prevent re-render loop

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    change, 
    color,
    prefix = '',
    suffix = ''
  }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={`border-${color}-500/20 bg-gradient-to-br from-slate-900 to-slate-800`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg bg-${color}-500/10`}>
              <Icon className={`size-6 text-${color}-400`} />
            </div>
            {change && (
              <div className={`flex items-center gap-1 text-sm ${change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {change > 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                {Math.abs(change)}%
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

  return (
    <div className="space-y-6">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Revenue"
          value={stats.totalRevenue}
          icon={DollarSign}
          change={12.5}
          color="green"
          prefix="₹"
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          change={8.3}
          color="blue"
        />
        <StatCard
          title="Active Users"
          value={stats.activeUsers}
          icon={Activity}
          change={15.7}
          color="purple"
        />
        <StatCard
          title="Running Engines"
          value={stats.runningEngines}
          icon={Zap}
          change={-3.2}
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Trend */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-blue-500/20 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <TrendingUp className="size-5 text-blue-400" />
                Revenue & User Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop key="revenue-stop-1" offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop key="revenue-stop-2" offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="usersGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop key="users-stop-1" offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop key="users-stop-2" offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid key="grid-revenue" strokeDasharray="3 3" stroke="#334155" />
                  <XAxis key="xaxis-revenue" dataKey="date" stroke="#94a3b8" />
                  <YAxis key="yaxis-revenue" stroke="#94a3b8" />
                  <Tooltip 
                    key="tooltip-revenue"
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #3b82f6',
                      borderRadius: '8px',
                      color: '#fff'
                    }} 
                  />
                  <Legend key="legend-revenue" />
                  <Area 
                    key="area-revenue"
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#revenueGradient)" 
                    name="Revenue (₹)"
                  />
                  <Area 
                    key="area-users"
                    type="monotone" 
                    dataKey="users" 
                    stroke="#10b981" 
                    fillOpacity={1} 
                    fill="url(#usersGradient)" 
                    name="Users"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* User P&L Distribution */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-purple-500/20 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Target className="size-5 text-purple-400" />
                User P&L Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={userPnLDistribution}>
                  <CartesianGrid key="grid-pnl" strokeDasharray="3 3" stroke="#334155" />
                  <XAxis key="xaxis-pnl" dataKey="range" stroke="#94a3b8" />
                  <YAxis key="yaxis-pnl" stroke="#94a3b8" />
                  <Tooltip 
                    key="tooltip-pnl"
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: '1px solid #a855f7',
                      borderRadius: '8px',
                      color: '#fff'
                    }} 
                  />
                  <Bar key="bar-count" dataKey="count" fill="#a855f7" radius={[8, 8, 0, 0]} name="Users" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Engine Activity */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-orange-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Activity className="size-5 text-orange-400" />
              Engine Activity (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={engineStats}>
                <CartesianGrid key="grid-engine" strokeDasharray="3 3" stroke="#334155" />
                <XAxis key="xaxis-engine" dataKey="time" stroke="#94a3b8" />
                <YAxis key="yaxis-engine" stroke="#94a3b8" />
                <Tooltip 
                  key="tooltip-engine"
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #f97316',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
                <Legend key="legend-engine" />
                <Line 
                  key="line-running"
                  type="monotone" 
                  dataKey="running" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  dot={{ fill: '#10b981', r: 4 }}
                  name="Running"
                />
                <Line 
                  key="line-stopped"
                  type="monotone" 
                  dataKey="stopped" 
                  stroke="#ef4444" 
                  strokeWidth={2} 
                  dot={{ fill: '#ef4444', r: 4 }}
                  name="Stopped"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Today's Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          icon={ArrowDown}
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
      </div>
    </div>
  );
}