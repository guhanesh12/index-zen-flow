// @ts-nocheck
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AdminLogin } from './AdminLogin';
import { AdvancedAdminDashboard } from './AdvancedAdminDashboard';
import { AdminUsers } from './AdminUsers';
import { AdminTransactions } from './AdminTransactions';
import { AdminSupport } from './AdminSupport';
import { AdminLandingPage } from './AdminLandingPage';
import { AdminActivityLogs } from './AdminActivityLogs';
import { AdminUserManagement } from './AdminUserManagement';
import { AdminSettings } from './AdminSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Shield, 
  TrendingUp, 
  Users, 
  DollarSign, 
  MessageSquare, 
  Globe, 
  Activity, 
  UsersRound, 
  Settings, 
  LogOut 
} from 'lucide-react';
import type { AdminUser, AdminDashboardProps } from './AdminTypes';

// Re-export types for backward compatibility
export type { AdminUser, AdminDashboardProps } from './AdminTypes';

export function AdminDashboard({ serverUrl, accessToken, show, onClose, pressedHotkey }: AdminDashboardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingSupportCount, setPendingSupportCount] = useState(0);
  const [realAccessToken, setRealAccessToken] = useState(accessToken);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Update realAccessToken when accessToken changes
  useEffect(() => {
    setRealAccessToken(accessToken);
  }, [accessToken]);

  // Check for existing admin session on mount
  useEffect(() => {
    console.log('🔍 AdminDashboard: Checking for existing admin session...');
    
    const storedAdminUser = sessionStorage.getItem('admin_user');
    const storedAccessToken = sessionStorage.getItem('admin_access_token');
    
    if (storedAdminUser && storedAccessToken) {
      try {
        const admin = JSON.parse(storedAdminUser);
        console.log('✅ AdminDashboard: Found existing admin session for:', admin.email);
        setCurrentAdmin(admin);
        setIsAuthenticated(true);
        setRealAccessToken(storedAccessToken);
        
        // Store current admin info for heartbeat tracking
        localStorage.setItem('current_admin_email', admin.email);
        localStorage.setItem('current_admin_id', admin.id);
      } catch (error) {
        console.error('❌ AdminDashboard: Error parsing stored admin user:', error);
      }
    } else {
      console.log('⚠️ AdminDashboard: No existing admin session found');
    }
    
    setIsCheckingSession(false);
  }, []); // Only run once on mount

  const handleLogin = (admin: AdminUser, newAccessToken?: string) => {
    console.log('🔐 Admin logged in:', admin.email);
    console.log('👤 Admin permissions:', admin.role);
    console.log('✅ Admin Management permission:', admin.role.adminManagement);
    
    setCurrentAdmin(admin);
    setIsAuthenticated(true);
    
    // Store current admin info for heartbeat tracking
    localStorage.setItem('current_admin_email', admin.email);
    localStorage.setItem('current_admin_id', admin.id);
    
    // If we got a new access token from admin login, use it
    if (newAccessToken) {
      setRealAccessToken(newAccessToken);
      console.log('✅ Admin authenticated with new JWT token');
    }
  };

  const handleLogout = () => {
    // Log logout activity
    if (currentAdmin && typeof (window as any).logAdminActivity === 'function') {
      (window as any).logAdminActivity({
        adminId: currentAdmin.id,
        adminEmail: currentAdmin.email,
        action: 'logout',
        target: 'admin_panel',
        details: `${currentAdmin.email} logged out`,
        status: 'offline',
        ipAddress: 'N/A',
        userAgent: navigator.userAgent,
      });
    }

    // Clear current admin tracking
    localStorage.removeItem('current_admin_email');
    localStorage.removeItem('current_admin_id');

    setCurrentAdmin(null);
    setIsAuthenticated(false);
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  // Listen for pending support count updates
  useEffect(() => {
    const handlePendingCount = (event: any) => {
      setPendingSupportCount(event.detail || 0);
    };
    window.addEventListener('admin-pending-support-count', handlePendingCount);
    return () => {
      window.removeEventListener('admin-pending-support-count', handlePendingCount);
    };
  }, []);

  // Don't render anything if admin panel is not shown
  if (!show) {
    return null;
  }

  // Show loading while checking for existing session
  if (isCheckingSession) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl mb-2">Admin Portal</div>
          <div className="text-slate-400">Verifying session...</div>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated || !currentAdmin) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950">
        <AdminLogin 
          onLogin={handleLogin} 
          serverUrl={serverUrl} 
          accessToken={realAccessToken}
          onClose={handleClose}
          pressedHotkey={pressedHotkey || ''}
        />
      </div>
    );
  }

  const canAccessTab = (tab: keyof AdminUser['role']) => {
    const hasAccess = currentAdmin.role[tab];
    console.log(`🔍 Checking tab access: ${tab} = ${hasAccess}`);
    return hasAccess;
  };

  return (
    <div className="fixed inset-0 z-[9999] min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-auto">
      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-slate-900/80 backdrop-blur-sm border-b border-blue-500/20 sticky top-0 z-50"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="size-8 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-sm text-slate-400">IndexpilotAI Control Center</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500">
              {currentAdmin.email}
            </Badge>
            <Button 
              onClick={handleClose}
              variant="outline"
              className="bg-slate-500/10 text-slate-400 border-slate-500 hover:bg-slate-500/20"
            >
              Close Admin
            </Button>
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
            >
              <LogOut className="size-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-slate-800/50 border border-blue-500/20 mb-6">
            {canAccessTab('dashboard') && (
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-blue-600">
                <TrendingUp className="size-4 mr-2" />
                Dashboard
              </TabsTrigger>
            )}
            {canAccessTab('users') && (
              <TabsTrigger value="users" className="data-[state=active]:bg-blue-600">
                <Users className="size-4 mr-2" />
                Users
              </TabsTrigger>
            )}
            {canAccessTab('transactions') && (
              <TabsTrigger value="transactions" className="data-[state=active]:bg-blue-600">
                <DollarSign className="size-4 mr-2" />
                Transactions
              </TabsTrigger>
            )}
            <TabsTrigger value="support" className="data-[state=active]:bg-blue-600 relative">
              <MessageSquare className="size-4 mr-2" />
              Support
              {pendingSupportCount > 0 && (
                <span className="absolute -top-1 -right-1 size-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                  {pendingSupportCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="landing" className="data-[state=active]:bg-blue-600">
              <Globe className="size-4 mr-2" />
              Landing Page
            </TabsTrigger>
            {canAccessTab('adminUsers') && (
              <TabsTrigger value="adminUsers" className="data-[state=active]:bg-blue-600">
                <Activity className="size-4 mr-2" />
                Admin Users
              </TabsTrigger>
            )}
            {canAccessTab('adminManagement') && (
              <TabsTrigger value="adminManagement" className="data-[state=active]:bg-blue-600">
                <UsersRound className="size-4 mr-2" />
                Admin Management
              </TabsTrigger>
            )}
            {canAccessTab('settings') && (
              <TabsTrigger value="settings" className="data-[state=active]:bg-blue-600">
                <Settings className="size-4 mr-2" />
                Settings
              </TabsTrigger>
            )}
          </TabsList>

          {canAccessTab('dashboard') && (
            <TabsContent value="dashboard">
              <AdvancedAdminDashboard serverUrl={serverUrl} accessToken={realAccessToken} />
            </TabsContent>
          )}

          {canAccessTab('users') && (
            <TabsContent value="users">
              <AdminUsers serverUrl={serverUrl} accessToken={realAccessToken} />
            </TabsContent>
          )}

          {canAccessTab('transactions') && (
            <TabsContent value="transactions">
              <AdminTransactions serverUrl={serverUrl} accessToken={realAccessToken} />
            </TabsContent>
          )}

          <TabsContent value="support">
            <AdminSupport serverUrl={serverUrl} accessToken={realAccessToken} />
          </TabsContent>

          <TabsContent value="landing">
            <AdminLandingPage serverUrl={serverUrl} accessToken={realAccessToken} />
          </TabsContent>

          {canAccessTab('adminUsers') && (
            <TabsContent value="adminUsers">
              <AdminActivityLogs serverUrl={serverUrl} accessToken={realAccessToken} />
            </TabsContent>
          )}

          {canAccessTab('adminManagement') && (
            <TabsContent value="adminManagement">
              <AdminUserManagement 
                serverUrl={serverUrl} 
                accessToken={realAccessToken} 
                currentAdmin={currentAdmin}
              />
            </TabsContent>
          )}

          {canAccessTab('settings') && (
            <TabsContent value="settings">
              <AdminSettings 
                serverUrl={serverUrl} 
                accessToken={realAccessToken} 
                currentAdmin={currentAdmin}
                onAdminUpdate={setCurrentAdmin}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export default AdminDashboard;
