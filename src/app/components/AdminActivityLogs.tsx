// @ts-nocheck
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Activity,
  Filter,
  Download,
  RefreshCw,
  User,
  Clock,
  Shield,
  LogIn,
  LogOut,
  Settings,
  Trash2,
  Eye,
  Search,
  Calendar,
  CheckCircle,
  AlertCircle,
  XCircle,
  Users,
  FileText,
  Circle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AdminUser } from './AdminTypes';

export interface AdminActivity {
  id: string;
  adminId: string;
  adminEmail: string;
  action: 'login' | 'logout' | 'view' | 'edit' | 'delete' | 'create' | 'settings_change' | 'permission_change';
  target?: string; // What was affected (e.g., 'user', 'transaction', 'settings')
  details: string;
  timestamp: number;
  status: 'online' | 'offline';
  ipAddress?: string;
  userAgent?: string;
}

interface AdminActivityLogsProps {
  serverUrl: string;
  accessToken: string;
}

export function AdminActivityLogs({ serverUrl, accessToken }: AdminActivityLogsProps) {
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAdmin, setFilterAdmin] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<AdminActivity | null>(null);

  useEffect(() => {
    loadActivities();
    loadAdmins();
    
    // Poll for new activities every 5 seconds
    const interval = setInterval(loadActivities, 5000);
    
    // Send heartbeat for current admin to show as online
    const heartbeatInterval = setInterval(() => {
      const currentAdminEmail = localStorage.getItem('current_admin_email');
      if (currentAdminEmail && typeof (window as any).logAdminActivity === 'function') {
        (window as any).logAdminActivity({
          adminId: localStorage.getItem('current_admin_id') || 'unknown',
          adminEmail: currentAdminEmail,
          action: 'view',
          target: 'admin_panel',
          details: 'Active session',
          status: 'online',
          ipAddress: 'N/A',
          userAgent: navigator.userAgent,
        });
      }
    }, 60000); // Every 60 seconds
    
    return () => {
      clearInterval(interval);
      clearInterval(heartbeatInterval);
    };
  }, []);

  const loadActivities = () => {
    const stored = localStorage.getItem('admin_activities') || '[]';
    const parsed = JSON.parse(stored);
    setActivities(parsed.sort((a: AdminActivity, b: AdminActivity) => b.timestamp - a.timestamp));
  };

  const loadAdmins = () => {
    const stored = localStorage.getItem('admin_users') || '[]';
    const parsed = JSON.parse(stored);
    
    // Add default admin
    const defaultAdmin: AdminUser = {
      id: 'default-admin',
      email: 'airoboengin@smilykat.com',
      password: 'defaultpass',
      role: {
        dashboard: true,
        users: true,
        transactions: true,
        settings: true,
        instruments: true,
        journals: true,
        support: true,
        landing: true,
        adminUsers: true,
        adminManagement: true,
      },
      hotkey: {
        windows: 'Control+Alt+GUHAN',
        mac: 'Meta+Alt+GUHAN'
      },
      twoFactorEnabled: false
    };
    
    setAdmins([defaultAdmin, ...parsed]);
  };

  const logActivity = (activity: Omit<AdminActivity, 'id' | 'timestamp'>) => {
    const newActivity: AdminActivity = {
      ...activity,
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };

    const stored = JSON.parse(localStorage.getItem('admin_activities') || '[]');
    stored.push(newActivity);
    
    // Keep only last 1000 activities
    if (stored.length > 1000) {
      stored.shift();
    }
    
    localStorage.setItem('admin_activities', JSON.stringify(stored));
    loadActivities();
  };

  // Expose logActivity globally for other components to use
  useEffect(() => {
    (window as any).logAdminActivity = logActivity;
    return () => {
      delete (window as any).logAdminActivity;
    };
  }, []);

  const clearAllLogs = () => {
    if (confirm('Are you sure you want to clear all activity logs? This cannot be undone.')) {
      localStorage.setItem('admin_activities', '[]');
      loadActivities();
    }
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(activities, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-activity-logs-${new Date().toISOString()}.json`;
    link.click();
  };

  const getActionIcon = (action: AdminActivity['action']) => {
    switch (action) {
      case 'login': return LogIn;
      case 'logout': return LogOut;
      case 'view': return Eye;
      case 'edit': return Settings;
      case 'delete': return Trash2;
      case 'create': return CheckCircle;
      case 'settings_change': return Settings;
      case 'permission_change': return Shield;
      default: return Activity;
    }
  };

  const getActionColor = (action: AdminActivity['action']) => {
    switch (action) {
      case 'login': return 'text-green-400 bg-green-500/10 border-green-500/30';
      case 'logout': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'view': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      case 'edit': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
      case 'delete': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'create': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
      case 'settings_change': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'permission_change': return 'text-pink-400 bg-pink-500/10 border-pink-500/30';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
    }
  };

  const getAdminStatus = (adminEmail: string) => {
    const recentActivity = activities.find(
      a => a.adminEmail === adminEmail && Date.now() - a.timestamp < 300000 // 5 minutes
    );
    return recentActivity?.status || 'offline';
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = 
      activity.adminEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.details.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || activity.action === filterType;
    const matchesAdmin = filterAdmin === 'all' || activity.adminEmail === filterAdmin;
    
    return matchesSearch && matchesType && matchesAdmin;
  });

  const uniqueActionTypes = Array.from(new Set(activities.map(a => a.action)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="size-6 text-purple-400" />
            Admin Activity Logs
          </h2>
          <p className="text-slate-400">Track all admin actions and logins</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={exportLogs} 
            variant="outline" 
            className="border-blue-500/30 hover:bg-blue-500/10"
          >
            <Download className="size-4 mr-2" />
            Export
          </Button>
          <Button 
            onClick={clearAllLogs} 
            variant="outline" 
            className="border-red-500/30 hover:bg-red-500/10 text-red-400"
          >
            <Trash2 className="size-4 mr-2" />
            Clear Logs
          </Button>
        </div>
      </div>

      {/* Admin Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {admins.map((admin) => {
          const status = getAdminStatus(admin.email);
          const isOnline = status === 'online';
          const adminActivities = activities.filter(a => a.adminEmail === admin.email);
          const lastActivity = adminActivities[0];

          return (
            <motion.div
              key={admin.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
            >
              <Card className="border-slate-700 bg-slate-900/50 hover:border-purple-500/30 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge 
                      className={`${
                        isOnline 
                          ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                          : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}
                    >
                      <Circle className={`size-2 mr-1 ${isOnline ? 'fill-green-400' : 'fill-slate-400'}`} />
                      {isOnline ? 'Online' : 'Offline'}
                    </Badge>
                    <Shield className="size-4 text-purple-400" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="font-semibold text-white text-sm truncate">
                      {admin.email}
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Activity className="size-3" />
                      <span>{adminActivities.length} actions</span>
                    </div>

                    {lastActivity && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="size-3" />
                        <span>
                          {new Date(lastActivity.timestamp).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="size-5 text-blue-400" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-400">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search activities..."
                  className="pl-10 bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-400">Action Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="all">All Actions</option>
                {uniqueActionTypes.map(type => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-slate-400">Admin</label>
              <select
                value={filterAdmin}
                onChange={(e) => setFilterAdmin(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
              >
                <option value="all">All Admins</option>
                {admins.map(admin => (
                  <option key={admin.id} value={admin.email}>
                    {admin.email}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-cyan-400" />
            Activity Timeline ({filteredActivities.length} entries)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
            <AnimatePresence>
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Activity className="size-12 mx-auto mb-3 opacity-30" />
                  <p>No activities found</p>
                </div>
              ) : (
                filteredActivities.map((activity, index) => {
                  const Icon = getActionIcon(activity.action);
                  const colorClass = getActionColor(activity.action);

                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.02 }}
                      className="flex items-start gap-4 p-4 bg-slate-800/50 rounded-lg hover:bg-slate-800/70 transition-all cursor-pointer border border-transparent hover:border-purple-500/30"
                      onClick={() => setSelectedActivity(activity)}
                    >
                      <div className={`p-2 rounded-lg border ${colorClass}`}>
                        <Icon className="size-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-white text-sm">
                            {activity.adminEmail}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {activity.action.replace('_', ' ')}
                          </Badge>
                          {activity.target && (
                            <Badge variant="outline" className="text-xs bg-slate-700/50">
                              {activity.target}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-400 truncate">
                          {activity.details}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                        <span>{new Date(activity.timestamp).toLocaleDateString()}</span>
                        <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </CardContent>
      </Card>

      {/* Activity Detail Modal */}
      <AnimatePresence>
        {selectedActivity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setSelectedActivity(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 rounded-xl border border-purple-500/30 p-6 max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Activity className="size-6 text-purple-400" />
                  Activity Details
                </h3>
                <Button
                  onClick={() => setSelectedActivity(null)}
                  variant="ghost"
                  className="text-slate-400 hover:text-white"
                >
                  ×
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-400">Admin</label>
                  <p className="text-white font-semibold">{selectedActivity.adminEmail}</p>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Action</label>
                  <p className="text-white">
                    {selectedActivity.action.charAt(0).toUpperCase() + 
                     selectedActivity.action.slice(1).replace('_', ' ')}
                  </p>
                </div>

                {selectedActivity.target && (
                  <div>
                    <label className="text-sm text-slate-400">Target</label>
                    <p className="text-white">{selectedActivity.target}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm text-slate-400">Details</label>
                  <p className="text-white">{selectedActivity.details}</p>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Timestamp</label>
                  <p className="text-white">
                    {new Date(selectedActivity.timestamp).toLocaleString()}
                  </p>
                </div>

                <div>
                  <label className="text-sm text-slate-400">Status</label>
                  <Badge className={`${
                    selectedActivity.status === 'online'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-slate-500/20 text-slate-400'
                  }`}>
                    <Circle className="size-2 mr-1 fill-current" />
                    {selectedActivity.status}
                  </Badge>
                </div>

                {selectedActivity.ipAddress && (
                  <div>
                    <label className="text-sm text-slate-400">IP Address</label>
                    <p className="text-white font-mono text-sm">{selectedActivity.ipAddress}</p>
                  </div>
                )}

                {selectedActivity.userAgent && (
                  <div>
                    <label className="text-sm text-slate-400">User Agent</label>
                    <p className="text-white text-sm break-all">{selectedActivity.userAgent}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}