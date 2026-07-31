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
import { AdminReferrals } from './AdminReferrals';
import { AdminCommunication } from './AdminCommunication';
import { AdminMobileAppUpdate } from './AdminMobileAppUpdate';
import { AdminAuditLogViewer } from './AdminAuditLogViewer';
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
  LogOut,
  Gift,
  Mail,
  Smartphone,
  ScrollText
} from 'lucide-react';
import type { AdminUser, AdminDashboardProps } from './AdminTypes';

import { useAllowedTabs } from '@/hooks/useAllowedTabs';

// Re-export types for backward compatibility
export type { AdminUser, AdminDashboardProps } from './AdminTypes';

const ADMIN_MAIN_TAB_KEYS = [
  'dashboard', 'users', 'transactions', 'support', 'landing', 'adminUsers',
  'adminManagement', 'settings', 'referrals', 'communication', 'mobile', 'audit',
];

export function AdminDashboard({ serverUrl, accessToken, show, onClose, pressedHotkey }: AdminDashboardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingSupportCount, setPendingSupportCount] = useState(0);
  const [realAccessToken, setRealAccessToken] = useState(accessToken);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  // Must be called unconditionally (rules of hooks) — before any early returns below.
  const tabs = useAllowedTabs({
    enabled: isAuthenticated && !!currentAdmin,
    userId: currentAdmin?.user_id || currentAdmin?.id || null,
    email: currentAdmin?.email || null,
  });

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

  const canAccessTab = (tab: string) => {
    if (tabs.loading) return false;
    return tabs.allowMain(tab);
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

  useEffect(() => {
    if (!isAuthenticated || !currentAdmin || tabs.loading) return;
    if (canAccessTab(activeTab)) return;
    const firstAllowed = ADMIN_MAIN_TAB_KEYS.find((key) => tabs.allowMain(key));
    if (firstAllowed) setActiveTab(firstAllowed);
  }, [isAuthenticated, currentAdmin, tabs.loading, tabs.permissionKey, activeTab]);

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

  const hasAllowedTabs = ADMIN_MAIN_TAB_KEYS.some((key) => canAccessTab(key));

  if (tabs.loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-2xl mb-2">Admin Portal</div>
          <div className="text-slate-400">Loading permissions...</div>
        </div>
      </div>
    );
  }

  const adminName =
    (currentAdmin as any).full_name || (currentAdmin as any).name ||
    (currentAdmin.email || '').split('@')[0];
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <div className="fixed inset-0 z-[9999] min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-slate-900/80 backdrop-blur-sm border-b border-blue-500/20 z-50 shrink-0"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden bg-slate-800/60 border-slate-700 text-slate-200"
            >
              <Menu className="size-4" />
            </Button>
            <Shield className="size-7 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-white truncate">Admin Dashboard</h1>
              <p className="hidden sm:block text-sm text-slate-400">IndexpilotAI Control Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <Badge variant="outline" className="hidden md:inline-flex bg-green-500/10 text-green-400 border-green-500">
              {currentAdmin.email}
            </Badge>
            <Button 
              onClick={handleClose}
              variant="outline"
              className="hidden sm:inline-flex bg-slate-500/10 text-slate-400 border-slate-500 hover:bg-slate-500/20"
            >
              Close Admin
            </Button>
            <Button 
              onClick={handleLogout}
              variant="outline"
              className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
            >
              <LogOut className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Body: vertical nav + content */}
      <div className="flex-1 flex min-h-0">
        {/* Desktop vertical nav */}
        <motion.aside
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col border-r border-blue-500/15 bg-slate-900/50 backdrop-blur-sm"
        >
          <AdminSideNav
            activeTab={activeTab}
            onTabChange={setActiveTab}
            allowMain={canAccessTab}
            allowSub={tabs.allowSub}
            pendingSupportCount={pendingSupportCount}
          />
        </motion.aside>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileNavOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setMobileNavOpen(false)}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm lg:hidden"
              />
              <motion.aside
                initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="fixed left-0 top-0 bottom-0 z-[61] w-72 max-w-[85vw] bg-slate-900 border-r border-blue-500/20 flex flex-col lg:hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <span className="text-white font-semibold">Menu</span>
                  <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)} className="text-slate-400">
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <AdminSideNav
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    allowMain={canAccessTab}
                    allowSub={tabs.allowSub}
                    pendingSupportCount={pendingSupportCount}
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-auto px-3 sm:px-6 py-5">
          {/* Welcome banner */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-5 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-600/15 via-slate-900/40 to-slate-900/10 px-4 sm:px-6 py-4 flex items-center gap-4"
          >
            <div className="size-11 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-200 font-bold text-lg shrink-0">
              {String(adminName).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-white truncate">
                {greeting}, {adminName} 👋
              </h2>
              <p className="text-sm text-slate-400 truncate">
                Welcome back to the IndexpilotAI control center.
              </p>
            </div>
          </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {!hasAllowedTabs && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-6 text-slate-300">
              No admin tabs are assigned to this account.
            </div>
          )}


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

          {canAccessTab('support') && (
            <TabsContent value="support">
              <AdminSupport serverUrl={serverUrl} accessToken={realAccessToken} />
            </TabsContent>
          )}

          {canAccessTab('landing') && (
            <TabsContent value="landing">
              <AdminLandingPage serverUrl={serverUrl} accessToken={realAccessToken} />
            </TabsContent>
          )}

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

          {canAccessTab('referrals') && (
            <TabsContent value="referrals">
              <AdminReferrals accessToken={realAccessToken} />
            </TabsContent>
          )}

          {canAccessTab('communication') && (
            <TabsContent value="communication">
              <AdminCommunication />
            </TabsContent>
          )}

          {canAccessTab('mobile') && (
            <TabsContent value="mobile">
              <AdminMobileAppUpdate />
            </TabsContent>
          )}

          {canAccessTab('audit') && (
            <TabsContent value="audit">
              <AdminAuditLogViewer />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}

export default AdminDashboard;
