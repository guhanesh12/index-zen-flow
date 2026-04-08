import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import {
  Activity,
  Users,
  Globe,
  Monitor,
  Smartphone,
  UserPlus,
  LogIn,
  LogOut,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  MapPin,
  Eye,
  BarChart3,
  RefreshCw,
  Search,
  Filter,
  Download,
  Circle
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface VisitorAnalytics {
  totalVisitors: number;
  newVisitors: number;
  returningVisitors: number;
  uniqueVisitors: number;
  totalPageViews: number;
  avgSessionTime: string;
  bounceRate: number;
  activeNow: number;
}

interface VisitorInfo {
  id: string;
  ipAddress: string;
  deviceType: string;
  browser: string;
  os: string;
  country: string;
  pagesVisited: string[];
  entryPage: string;
  exitPage: string;
  visitTime: string;
  duration: string;
  isActive: boolean;
}

interface LoginActivity {
  totalAttempts: number;
  successful: number;
  failed: number;
  recentLogins: Array<{
    id: string;
    email: string;
    time: string;
    ipAddress: string;
    device: string;
    status: 'success' | 'failed';
  }>;
}

interface SignupActivity {
  totalSignups: number;
  completed: number;
  incomplete: number;
  incompleteUsers: Array<{
    id: string;
    name?: string;
    email?: string;
    mobile?: string;
    startTime: string;
    lastActivity: string;
    completionPercent: number;
  }>;
}

interface AdvancedMonitoringProps {
  serverUrl: string;
  accessToken: string;
}

export function AdvancedMonitoring({ serverUrl, accessToken }: AdvancedMonitoringProps) {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<VisitorAnalytics>({
    totalVisitors: 0,
    newVisitors: 0,
    returningVisitors: 0,
    uniqueVisitors: 0,
    totalPageViews: 0,
    avgSessionTime: '0m 0s',
    bounceRate: 0,
    activeNow: 0
  });
  const [visitors, setVisitors] = useState<VisitorInfo[]>([]);
  const [loginActivity, setLoginActivity] = useState<LoginActivity>({
    totalAttempts: 0,
    successful: 0,
    failed: 0,
    recentLogins: []
  });
  const [signupActivity, setSignupActivity] = useState<SignupActivity>({
    totalSignups: 0,
    completed: 0,
    incomplete: 0,
    incompleteUsers: []
  });
  const [trafficData, setTrafficData] = useState<any[]>([]);
  const [deviceData, setDeviceData] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch monitoring data
  const fetchMonitoringData = useCallback(async () => {
    try {
      console.log('📊 [MONITORING] Fetching analytics data...');
      
      const response = await fetch(`${serverUrl}/admin/monitoring?range=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [MONITORING] Data received:', data);
        
        if (data.analytics) setAnalytics(data.analytics);
        if (data.visitors) setVisitors(data.visitors);
        if (data.loginActivity) setLoginActivity(data.loginActivity);
        if (data.signupActivity) setSignupActivity(data.signupActivity);
        if (data.trafficData) setTrafficData(data.trafficData);
        if (data.deviceData) setDeviceData(data.deviceData);
        if (data.topPages) setTopPages(data.topPages);
        
        setLastUpdate(new Date());
        setLoading(false);
      } else {
        console.error('❌ [MONITORING] Failed to fetch data:', response.status);
        setLoading(false);
      }
    } catch (error) {
      console.error('❌ [MONITORING] Error fetching data:', error);
      setLoading(false);
    }
  }, [serverUrl, accessToken, timeRange]);

  useEffect(() => {
    fetchMonitoringData();
    
    // Auto-refresh every 10 seconds for real-time tracking
    const interval = setInterval(fetchMonitoringData, 10000);
    return () => clearInterval(interval);
  }, [fetchMonitoringData]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const filteredVisitors = visitors.filter(v => 
    v.ipAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.browser.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="size-7 text-blue-400" />
            Advanced Website Monitoring
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Real-time analytics and visitor tracking • Refreshes every 10s • Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={timeRange === 'today' ? 'default' : 'outline'}
              onClick={() => setTimeRange('today')}
            >
              Today
            </Button>
            <Button
              size="sm"
              variant={timeRange === 'week' ? 'default' : 'outline'}
              onClick={() => setTimeRange('week')}
            >
              Week
            </Button>
            <Button
              size="sm"
              variant={timeRange === 'month' ? 'default' : 'outline'}
              onClick={() => setTimeRange('month')}
            >
              Month
            </Button>
          </div>
          <Button onClick={fetchMonitoringData} size="sm" variant="outline">
            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-blue-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Visitors</p>
                  <h3 className="text-3xl font-bold text-white mt-1">{analytics.totalVisitors.toLocaleString()}</h3>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="size-4 text-green-400" />
                    <span className="text-xs text-green-400">+12.5%</span>
                  </div>
                </div>
                <div className="size-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <Users className="size-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-green-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Active Now</p>
                  <h3 className="text-3xl font-bold text-white mt-1">{analytics.activeNow}</h3>
                  <div className="flex items-center gap-1 mt-2">
                    <Circle className="size-3 text-green-400 fill-green-400 animate-pulse" />
                    <span className="text-xs text-green-400">Live</span>
                  </div>
                </div>
                <div className="size-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Activity className="size-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-purple-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Page Views</p>
                  <h3 className="text-3xl font-bold text-white mt-1">{analytics.totalPageViews.toLocaleString()}</h3>
                  <div className="flex items-center gap-1 mt-2">
                    <Eye className="size-4 text-purple-400" />
                    <span className="text-xs text-purple-400">Avg: {(analytics.totalPageViews / Math.max(analytics.totalVisitors, 1)).toFixed(1)}/visitor</span>
                  </div>
                </div>
                <div className="size-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Eye className="size-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-orange-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Bounce Rate</p>
                  <h3 className="text-3xl font-bold text-white mt-1">{analytics.bounceRate}%</h3>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingDown className="size-4 text-green-400" />
                    <span className="text-xs text-green-400">-3.2%</span>
                  </div>
                </div>
                <div className="size-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <LogOut className="size-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-500/20 bg-slate-900/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">New Visitors</p>
                <p className="text-2xl font-bold text-white mt-1">{analytics.newVisitors}</p>
              </div>
              <UserPlus className="size-8 text-blue-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-500/20 bg-slate-900/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Returning Visitors</p>
                <p className="text-2xl font-bold text-white mt-1">{analytics.returningVisitors}</p>
              </div>
              <Users className="size-8 text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-500/20 bg-slate-900/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Avg. Session Time</p>
                <p className="text-2xl font-bold text-white mt-1">{analytics.avgSessionTime}</p>
              </div>
              <Clock className="size-8 text-purple-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Traffic Chart */}
        <Card className="border-blue-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="size-5 text-blue-400" />
              Website Traffic
            </CardTitle>
            <CardDescription>Visitor trends over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trafficData}>
                <defs>
                  <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
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
                  dataKey="visitors" 
                  stroke="#3b82f6" 
                  fillOpacity={1} 
                  fill="url(#colorVisitors)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Device Distribution */}
        <Card className="border-green-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Monitor className="size-5 text-green-400" />
              Device Distribution
            </CardTitle>
            <CardDescription>Breakdown by device type</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={deviceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {deviceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #10b981',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Login & Signup Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-purple-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <LogIn className="size-5 text-purple-400" />
              Login Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-xs text-slate-400">Total</p>
                <p className="text-xl font-bold text-white mt-1">{loginActivity.totalAttempts}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-400">Success</p>
                <p className="text-xl font-bold text-green-400 mt-1">{loginActivity.successful}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">Failed</p>
                <p className="text-xl font-bold text-red-400 mt-1">{loginActivity.failed}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-300">Recent Logins</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {loginActivity.recentLogins.map((login) => (
                  <div key={login.id} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={login.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                          {login.status}
                        </Badge>
                        <span className="text-sm text-white">{login.email}</span>
                      </div>
                      <span className="text-xs text-slate-400">{login.time}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>{login.ipAddress}</span>
                      <span>•</span>
                      <span>{login.device}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <UserPlus className="size-5 text-orange-400" />
              Signup Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-slate-800/50">
                <p className="text-xs text-slate-400">Total</p>
                <p className="text-xl font-bold text-white mt-1">{signupActivity.totalSignups}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-400">Completed</p>
                <p className="text-xl font-bold text-green-400 mt-1">{signupActivity.completed}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs text-yellow-400">Incomplete</p>
                <p className="text-xl font-bold text-yellow-400 mt-1">{signupActivity.incomplete}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-300">Incomplete Signups</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {signupActivity.incompleteUsers.map((user) => (
                  <div key={user.id} className="p-3 rounded-lg bg-slate-800/50 border border-yellow-500/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-white">{user.email || 'No email'}</span>
                      <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-500/50">
                        {user.completionPercent}% done
                      </Badge>
                    </div>
                    {user.name && <p className="text-xs text-slate-400">Name: {user.name}</p>}
                    {user.mobile && <p className="text-xs text-slate-400">Mobile: {user.mobile}</p>}
                    <p className="text-xs text-slate-500 mt-1">Started: {user.startTime}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Most Visited Pages */}
      <Card className="border-blue-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <BarChart3 className="size-5 text-blue-400" />
            Most Visited Pages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topPages}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="page" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1e293b', 
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey="visits" fill="#3b82f6" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Live Visitors Table */}
      <Card className="border-green-500/20 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Globe className="size-5 text-green-400" />
              Live Visitor Tracking
              <Badge variant="outline" className="ml-2 text-green-400 border-green-500/50">
                <Circle className="size-2 mr-1 fill-green-400 animate-pulse" />
                {filteredVisitors.filter(v => v.isActive).length} active
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  placeholder="Search IP, country, browser..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64 bg-slate-800 border-slate-700"
                />
              </div>
              <Button size="sm" variant="outline">
                <Download className="size-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">IP Address</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Location</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Device</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Browser</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Current Page</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase">Duration</th>
                </tr>
              </thead>
              <tbody>
                {filteredVisitors.map((visitor) => (
                  <motion.tr 
                    key={visitor.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3 px-4">
                      {visitor.isActive ? (
                        <Circle className="size-3 text-green-400 fill-green-400 animate-pulse" />
                      ) : (
                        <Circle className="size-3 text-slate-600" />
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-white font-mono">{visitor.ipAddress}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <MapPin className="size-4 text-blue-400" />
                        <span className="text-sm text-slate-300">{visitor.country}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-xs">
                        {visitor.deviceType === 'Mobile' && <Smartphone className="size-3 mr-1" />}
                        {visitor.deviceType === 'Desktop' && <Monitor className="size-3 mr-1" />}
                        {visitor.deviceType}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-300">{visitor.browser}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-blue-400">{visitor.pagesVisited[visitor.pagesVisited.length - 1]}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-400">{visitor.duration}</span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {filteredVisitors.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <Users className="size-12 mx-auto mb-3 opacity-50" />
                <p>No visitors found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
