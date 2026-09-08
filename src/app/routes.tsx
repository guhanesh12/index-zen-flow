// @ts-nocheck
import { createBrowserRouter, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
// Landing page stays eager: it is the LCP route for search crawlers/first paint.
import ModernLandingPage from './components/ModernLandingPage';
import { lazyWithPreload, preloadOnIdle } from './utils/lazyPreload';
// Everything else is code-split so the landing bundle stays small.
const ModernLogin = lazyWithPreload(() => import('./components/ModernLogin'));
const PinGate = lazyWithPreload(() => import('./components/PinGate'));
const ModernRegistration = lazyWithPreload(() => import('./components/ModernRegistration'));
const TradingDashboard = lazyWithPreload(() => import('./components/TradingDashboard'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const DynamicPage = lazy(() => import('./components/DynamicPage'));
const LandingAdminComplete = lazy(() => import('./components/LandingAdminComplete'));
const PWASetupPage = lazy(() => import('./components/PWASetupPage').then(m => ({ default: m.PWASetupPage })));
const IconGeneratorPage = lazy(() => import('./components/IconGeneratorPage'));
const Sitemap = lazy(() => import('./components/Sitemap'));
const ManualIndexPage = lazy(() => import('./components/ManualIndexPage'));
const NotFoundPage = lazy(() => import('./components/NotFoundPage'));
const HTMLFileServer = lazy(() => import('./components/HTMLFileServer'));
const TermsAndConditions = lazy(() => import('./components/TermsAndConditions').then(m => ({ default: m.TermsAndConditions })));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const RefundPolicy = lazy(() => import('./components/RefundPolicy').then(m => ({ default: m.RefundPolicy })));
const Disclaimer = lazy(() => import('./components/Disclaimer').then(m => ({ default: m.Disclaimer })));
const AboutUs = lazy(() => import('./components/AboutUs').then(m => ({ default: m.AboutUs })));
const ContactUs = lazy(() => import('./components/ContactUs').then(m => ({ default: m.ContactUs })));

import { ErrorBoundary } from './components/ErrorBoundary';
import { publicAnonKey } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { trackPageView } from './hooks/useAnalyticsTracking';
import { getBaseUrl, api, API_ENDPOINTS } from './utils/apiService';
import { fetchWithApiFallback } from '@/utils-ext/config/apiConfig';

// 🔧 SERVER URL - Using centralized API service
const serverUrl = getBaseUrl();

// ═══════════════════════════════════════════════════════════════
// 📊 PAGE VIEW TRACKER - Auto-track all page views with heartbeat
// ═══════════════════════════════════════════════════════════════
function PageViewTracker({ children }: { children: ReactNode }) {
  const location = useLocation();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Track page view whenever location changes
    trackPageView(location.pathname);
    
    // Clear any existing heartbeat interval
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    // Send immediate heartbeat to mark visitor as active
    const sendHeartbeat = () => {
      fetchWithApiFallback(`/analytics/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ page: location.pathname }),
      }).then(() => {
        console.log('💓 Heartbeat sent successfully');
      }).catch((error) => {
        console.error('❌ Heartbeat failed:', error);
      });
    };
    
    // Send first heartbeat immediately
    sendHeartbeat();
    
    // Send heartbeat every 1 minute to keep session alive and ensure real-time tracking
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 60000); // 1 minute
    
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [location.pathname]);
  
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
          </div>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

// Landing Page Wrapper with SPA navigation
function LandingPageWrapper() {
  const navigate = useNavigate();

  // Warm the login/register chunks while the landing page is idle, so those
  // buttons open instantly instead of downloading a chunk on click.
  useEffect(() => {
    preloadOnIdle(ModernLogin.preload, ModernRegistration.preload);
  }, []);

  return (
    <ModernLandingPage 
      onSignInClick={() => {
        console.log('🚀 Navigating to login page (SPA)');
        navigate('/login');
      }}
      onSignUpClick={() => {
        console.log('🚀 Navigating to register page (SPA)');
        navigate('/register');
      }}
      onPageNavigate={(slug: string) => {
        console.log('🚀 Navigating to dynamic page (SPA):', slug);
        navigate(`/page/${slug}`);
      }}
    />
  );
}

// Protected Route wrapper for user dashboard - SINGLE SOURCE OF TRUTH
function ProtectedRoute({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState<string>('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const navigate = useNavigate();

  // Warm the PIN + dashboard chunks as soon as a protected route mounts, so
  // unlocking flips straight to the dashboard with no chunk download.
  useEffect(() => {
    preloadOnIdle(PinGate.preload, TradingDashboard.preload);
  }, []);
  
  
  useEffect(() => {
    let mounted = true;
    
    // Check Supabase session and refresh token periodically
    const checkAuth = async () => {
      try {
        console.log('🔍 ProtectedRoute: Checking authentication status...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!mounted) {
          console.log('⚠️ Component unmounted, aborting auth check');
          return;
        }
        
        if (error) {
          console.error('❌ Session check error:', error);
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
          return;
        }
        
        if (session?.access_token) {
          console.log('✅ ProtectedRoute: Session found, verifying with server...');
          
          // Verify with server that this session still exists and has not been revoked
          const { data: userData, error: userError } = await supabase.auth.getUser();
          
          if (!mounted) return;
          
          if (userError || !userData?.user) {
            console.warn('⚠️ Stale or revoked session detected:', userError?.message);
            // Try refresh once
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            
            if (!mounted) return;
            
            if (refreshError || !refreshData.session?.access_token) {
              console.error('❌ Session invalid and cannot be refreshed:', refreshError?.message);
              await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
              setIsAuthenticated(false);
              setIsCheckingAuth(false);
              return;
            }
            
            console.log('✅ Session refreshed successfully on auth verification');
            setAccessToken(refreshData.session.access_token);
            setIsAuthenticated(true);
            setIsCheckingAuth(false);
            return;
          }
          
          // Check if token is about to expire (within 5 minutes)
          const expiresAt = session.expires_at! * 1000;
          const timeUntilExpiry = expiresAt - Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          
          if (timeUntilExpiry < fiveMinutes) {
            console.log('⚠️ Token expiring soon, refreshing session...');
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            
            if (!mounted) return;
            
            if (refreshError) {
              console.error('❌ Failed to refresh session:', refreshError);
              await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
              setIsAuthenticated(false);
              setIsCheckingAuth(false);
              return;
            }
            
            if (refreshData.session?.access_token) {
              console.log('✅ Token refreshed successfully');
              setAccessToken(refreshData.session.access_token);
              setIsAuthenticated(true);
              setIsCheckingAuth(false);
            }
          } else {
            setAccessToken(session.access_token);
            setIsAuthenticated(true);
            setIsCheckingAuth(false);
          }
        } else {
          console.log('❌ ProtectedRoute: No valid session');
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
        }
      } catch (error) {
        console.error('❌ Auth check failed:', error);
        if (mounted) {
          setIsAuthenticated(false);
          setIsCheckingAuth(false);
        }
      }
    };
    
    // Initial check
    checkAuth();
    
    // Listen for global session-expired events dispatched by API clients or engines
    const handleSessionExpired = async () => {
      console.warn('🚨 Session expired event received in ProtectedRoute - logging out');
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      if (mounted) {
        setIsAuthenticated(false);
        navigate('/login', { replace: true });
      }
    };
    window.addEventListener('indexpilot:session-expired', handleSessionExpired);
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !newSession) {
        setIsAuthenticated(false);
        setAccessToken(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (newSession?.access_token) {
          setAccessToken(newSession.access_token);
          setIsAuthenticated(true);
        }
      }
    });
    
    // Refresh token every 45 minutes to prevent expiration
    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing session to prevent token expiration...');
      checkAuth();
    }, 45 * 60 * 1000); // 45 minutes
    
    // Cleanup
    return () => {
      console.log('🧹 ProtectedRoute: Cleaning up');
      mounted = false;
      clearInterval(refreshInterval);
      window.removeEventListener('indexpilot:session-expired', handleSessionExpired);
      subscription?.unsubscribe();
    };
  }, []); // Only run once on mount - NO DEPENDENCIES
  
  // Show loading state while checking auth
  if (isCheckingAuth || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-lg">Verifying session...</div>
      </div>
    );
  }
  
  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    console.log('🔒 ProtectedRoute: Not authenticated - redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  // Show error if no access token
  if (!accessToken) {
    console.error('❌ ProtectedRoute: No access token available');
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white mb-4">Session expired. Please log in again.</div>
          <button 
            onClick={() => navigate('/login')}
            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }
  

  // Render dashboard with access token and logout handler
  console.log('🎯 ProtectedRoute: Rendering TradingDashboard');
  
  
  const handleLogout = async () => {
    console.log('👋 Logging out...');
    try {
      await supabase.auth.signOut();
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
    navigate('/', { replace: true });
  };
  
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="size-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-zinc-400 text-sm font-medium">Loading Trading Terminal...</p>
        </div>
      </div>
    }>
      <PinGate onLogout={handleLogout}>
        <Suspense fallback={
          <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="size-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-zinc-400 text-sm font-medium">Initializing Dashboard...</p>
            </div>
          </div>
        }>
          <TradingDashboard 
            accessToken={accessToken}
            onLogout={handleLogout}
          />
        </Suspense>
      </PinGate>
    </Suspense>
  );
}

// Admin Route wrapper - verifies unique code from URL + IP/geo guard
function AdminRoute({ children }: { children: ReactNode }) {
  const { uniqueCode } = useParams<{ uniqueCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [guard, setGuard] = useState<{ status: 'checking' | 'allowed' | 'denied'; reason?: string; ip?: string; country?: string }>({ status: 'checking' });

  // Store/update the unique code from URL when present
  useEffect(() => {
    if (uniqueCode) {
      const storedCode = sessionStorage.getItem('admin_unique_code');
      const hasAdminToken = sessionStorage.getItem('admin_access_token');
      const hasAdminUser = sessionStorage.getItem('admin_user');
      const hasAdminSession = hasAdminToken && hasAdminUser;

      if (storedCode && storedCode !== uniqueCode && hasAdminSession) {
        sessionStorage.removeItem('admin_access_token');
        sessionStorage.removeItem('admin_user');
        if (!location.pathname.includes('/login')) {
          navigate(`/admin/hotkey/${uniqueCode}/login`, { replace: true });
          return;
        }
      }
      if (storedCode !== uniqueCode) {
        sessionStorage.setItem('admin_unique_code', uniqueCode);
      }
    }
  }, [uniqueCode, location.pathname, navigate]);

  // IP allowlist + geo-block check via edge function
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const adminUserRaw = sessionStorage.getItem('admin_user');
        const adminUser = adminUserRaw ? JSON.parse(adminUserRaw) : null;
        const { data, error } = await supabase.functions.invoke('admin-access-guard', {
          body: { userId: adminUser?.id ?? null, email: adminUser?.email ?? null },
        });
        if (cancelled) return;
        if (error) {
          // Fail-open on infra error but log; this prevents lockout from a transient network blip
          console.warn('admin-access-guard error, allowing:', error);
          setGuard({ status: 'allowed' });
          return;
        }
        if (data?.allowed) setGuard({ status: 'allowed', ip: data.ip, country: data.country });
        else setGuard({ status: 'denied', reason: data?.reason, ip: data?.ip, country: data?.country });
      } catch (e) {
        console.warn('admin-access-guard exception, allowing:', e);
        if (!cancelled) setGuard({ status: 'allowed' });
      }
    })();
    return () => { cancelled = true; };
  }, [location.pathname]);

  if (!uniqueCode) return <Navigate to="/" replace />;

  if (guard.status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Verifying secure access…</p>
        </div>
      </div>
    );
  }

  if (guard.status === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md w-full border border-destructive/40 rounded-lg p-6 bg-card shadow-lg space-y-4">
          <div className="text-4xl">🛡️</div>
          <h1 className="text-xl font-bold text-destructive">Access Blocked</h1>
          <p className="text-sm text-muted-foreground">
            Your network is not authorized to access the admin panel. This attempt has been logged.
          </p>
          <div className="text-xs bg-muted/40 rounded p-3 font-mono space-y-1">
            <div><span className="text-muted-foreground">Reason:</span> {guard.reason}</div>
            {guard.ip && <div><span className="text-muted-foreground">IP:</span> {guard.ip}</div>}
            {guard.country && <div><span className="text-muted-foreground">Country:</span> {guard.country}</div>}
          </div>
          <button
            onClick={() => navigate('/', { replace: true })}
            className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium hover:opacity-90"
          >
            Go to home
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


// Wrapper components for routes with params
function AdminLoginPage() {
  const { uniqueCode } = useParams<{ uniqueCode: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (uniqueCode) {
      sessionStorage.setItem('admin_unique_code', uniqueCode);
    }
  }, [uniqueCode]);
  
  return (
    <AdminRoute>
      <AdminLogin
        onLogin={(admin, token) => {
          console.log('✅ Admin logged in, navigating to dashboard (SPA)');
          sessionStorage.setItem('admin_access_token', token || '');
          sessionStorage.setItem('admin_user', JSON.stringify(admin));
          const sessionCode = admin?.uniqueCode || uniqueCode;
          if (sessionCode) sessionStorage.setItem('admin_unique_code', sessionCode);
          navigate(`/admin/hotkey/${sessionCode}/dashboard`, { replace: true });
        }}
        serverUrl={serverUrl}
        accessToken={publicAnonKey}
        onClose={() => {
          console.log('🏠 Navigating to home (SPA)');
          navigate('/', { replace: true });
        }}
        pressedHotkey=""
        uniqueCode={uniqueCode || ''}
      />
    </AdminRoute>
  );
}

function AdminDashboardPage() {
  const { uniqueCode } = useParams<{ uniqueCode: string }>();
  const navigate = useNavigate();
  
  return (
    <AdminRoute>
      <AdminDashboard
        serverUrl={serverUrl}
        accessToken={sessionStorage.getItem('admin_access_token') || publicAnonKey}
        show={true}
        onClose={() => {
          console.log('🚪 Admin logout, clearing session and navigating home (SPA)');
          sessionStorage.removeItem('admin_access_token');
          sessionStorage.removeItem('admin_user');
          sessionStorage.removeItem('admin_unique_code');
          navigate('/', { replace: true });
        }}
        pressedHotkey=""
      />
    </AdminRoute>
  );
}

function AdminLandingPage() {
  const { uniqueCode } = useParams<{ uniqueCode: string }>();
  const navigate = useNavigate();
  
  return (
    <AdminRoute>
      <LandingAdminComplete
        accessToken={sessionStorage.getItem('admin_access_token') || ''}
        onClose={() => {
          console.log('🏠 Navigating to admin dashboard (SPA)');
          navigate(`/admin/hotkey/${uniqueCode}/dashboard`, { replace: true });
        }}
      />
    </AdminRoute>
  );
}

function DynamicPageWrapper() {
  const { slug } = useParams<{ slug: string }>();
  
  return (
    <DynamicPage 
      slug={slug || ''}
      serverUrl={serverUrl}
      publicAnonKey={publicAnonKey}
    />
  );
}

// Wrapper for Login page - SIMPLIFIED - No session check to allow back button
function LoginPageWrapper() {
  const navigate = useNavigate();

  // While the user types credentials, fetch the PIN + dashboard chunks.
  useEffect(() => {
    preloadOnIdle(PinGate.preload, TradingDashboard.preload, ModernRegistration.preload);
  }, []);

  return (
    <ModernLogin 
      onLoginSuccess={(token) => {
        console.log('🎉 Login successful - navigating to dashboard (SPA mode)');
        navigate('/dashboard', { replace: true });
      }}
      onSwitchToSignup={() => {
        console.log('🔄 Switching to signup (SPA)');
        navigate('/register');
      }}
      onBackToHome={() => {
        console.log('🏠 Back to home (SPA)');
        navigate('/');
      }}
      serverUrl={serverUrl}
      publicAnonKey={publicAnonKey}
    />
  );
}

// Wrapper for Registration page - SIMPLIFIED - No session check to allow back button
function RegistrationPageWrapper() {
  const navigate = useNavigate();

  // Warm login + PIN + dashboard chunks while the form is being filled in.
  useEffect(() => {
    preloadOnIdle(ModernLogin.preload, PinGate.preload, TradingDashboard.preload);
  }, []);

  return (
    <ModernRegistration 
      onRegistrationSuccess={(token) => {
        console.log('🎉 Registration successful - navigating to dashboard (SPA mode)');
        navigate('/dashboard', { replace: true });
      }}
      onSwitchToSignin={() => {
        console.log('🔄 Switching to login (SPA)');
        navigate('/login');
      }}
      onBackToHome={() => {
        console.log('🏠 Back to home (SPA)');
        navigate('/');
      }}
      serverUrl={serverUrl}
      publicAnonKey={publicAnonKey}
    />
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PageViewTracker><LandingPageWrapper /></PageViewTracker>,
  },
  {
    path: '/login',
    element: <PageViewTracker><LoginPageWrapper /></PageViewTracker>,
  },
  {
    path: '/register',
    element: <PageViewTracker><RegistrationPageWrapper /></PageViewTracker>,
  },
  {
    path: '/dashboard',
    element: <PageViewTracker><ProtectedRoute><div /></ProtectedRoute></PageViewTracker>,
  },
  {
    path: '/admin/hotkey/:uniqueCode/login',
    element: <PageViewTracker><AdminLoginPage /></PageViewTracker>,
  },
  {
    path: '/admin/hotkey/:uniqueCode/dashboard',
    element: <PageViewTracker><AdminDashboardPage /></PageViewTracker>,
  },
  {
    path: '/admin/hotkey/:uniqueCode/landing',
    element: <PageViewTracker><AdminLandingPage /></PageViewTracker>,
  },
  {
    path: '/page/:slug',
    element: <PageViewTracker><DynamicPageWrapper /></PageViewTracker>,
  },
  {
    path: '/pwa-setup',
    element: <PageViewTracker><PWASetupPage /></PageViewTracker>,
  },
  {
    path: '/icon-generator',
    element: <PageViewTracker><IconGeneratorPage /></PageViewTracker>,
  },
  {
    path: '/sitemap',
    element: <PageViewTracker><Sitemap /></PageViewTracker>,
  },
  {
    path: '/manual-index',
    element: <PageViewTracker><ManualIndexPage /></PageViewTracker>,
  },
  {
    path: '/terms',
    element: <PageViewTracker><TermsAndConditions /></PageViewTracker>,
  },
  {
    path: '/privacy',
    element: <PageViewTracker><PrivacyPolicy /></PageViewTracker>,
  },
  {
    path: '/refund',
    element: <PageViewTracker><RefundPolicy /></PageViewTracker>,
  },
  {
    path: '/disclaimer',
    element: <PageViewTracker><Disclaimer /></PageViewTracker>,
  },
  {
    path: '/about-us',
    element: <PageViewTracker><AboutUs /></PageViewTracker>,
  },
  {
    path: '/contact-us',
    element: <PageViewTracker><ContactUs /></PageViewTracker>,
  },
  // ❌ REMOVED: React Router routes for sitemap.xml and robots.txt
  // These files exist in /public and should be served as static files
  // React Router should NOT intercept these requests
  {
    path: '/sitemap-diagnostic.html',
    element: <PageViewTracker><HTMLFileServer filePath="/sitemap-diagnostic.html" /></PageViewTracker>,
  },
  {
    path: '*',
    element: <PageViewTracker><NotFoundPage /></PageViewTracker>,
  },
]);