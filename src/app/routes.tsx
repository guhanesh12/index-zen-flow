// @ts-nocheck
import { createBrowserRouter, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import ModernLandingPage from './components/ModernLandingPage';
import NotFoundPage from './components/NotFoundPage';
import ModernLogin from './components/ModernLogin';
import ModernRegistration from './components/ModernRegistration';
import { TermsAndConditions } from './components/TermsAndConditions';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { RefundPolicy } from './components/RefundPolicy';
import { Disclaimer } from './components/Disclaimer';
import { AboutUs } from './components/AboutUs';
import { ContactUs } from './components/ContactUs';

const loadTradingDashboard = () => import('./components/TradingDashboard');
const TradingDashboard = lazy(() => import('./components/TradingDashboard'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const DynamicPage = lazy(() => import('./components/DynamicPage'));
const LandingAdminComplete = lazy(() => import('./components/LandingAdminComplete'));
const PWASetupPage = lazy(() => import('./components/PWASetupPage').then(m => ({ default: m.PWASetupPage })));
const IconGeneratorPage = lazy(() => import('./components/IconGeneratorPage'));
const Sitemap = lazy(() => import('./components/Sitemap'));
const ManualIndexPage = lazy(() => import('./components/ManualIndexPage'));
const HTMLFileServer = lazy(() => import('./components/HTMLFileServer'));

const RouteSuspense = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-lg">Loading…</div>
    </div>
  }>{children}</Suspense>
);
import { publicAnonKey } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { trackPageView } from './hooks/useAnalyticsTracking';
import { getBaseUrl, api, API_ENDPOINTS } from './utils/apiService';

// 🔧 SERVER URL - Using centralized API service
const serverUrl = getBaseUrl();

// ═══════════════════════════════════════════════════════════════
// 📊 PAGE VIEW TRACKER - Auto-track all page views with heartbeat
// ═══════════════════════════════════════════════════════════════
function PageViewTracker({ children }: { children: ReactNode }) {
  const location = useLocation();
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Track page view (lightweight, sync)
    trackPageView(location.pathname);

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    const sendHeartbeat = () => {
      // Use keepalive + low priority so it never blocks paint or LCP
      try {
        fetch(`${serverUrl}/analytics/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ page: location.pathname }),
          keepalive: true,
        }).catch(() => {});
      } catch {}
    };

    // 🚀 SEO/PERF: Defer first heartbeat until browser is idle so it never delays LCP
    const idle = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb, { timeout: 4000 });
      } else {
        setTimeout(cb, 2500);
      }
    };
    idle(sendHeartbeat);

    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 60000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [location.pathname]);

  return <>{children}</>;
}

// Landing Page Wrapper with SPA navigation
function LandingPageWrapper() {
  const navigate = useNavigate();
  
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
  const [accessToken, setAccessToken] = useState<string>(() => history.state?.usr?.accessToken || '');
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => !history.state?.usr?.accessToken);
  const navigate = useNavigate();
  const location = useLocation();
  
  useEffect(() => {
    let mounted = true;
    let refreshInterval: NodeJS.Timeout;
    const routeToken = location.state?.accessToken || history.state?.usr?.accessToken;
    if (routeToken) {
      setAccessToken(routeToken);
      setIsAuthenticated(true);
      setIsCheckingAuth(false);
      loadTradingDashboard().catch(() => {});
    }
    
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
          console.log('✅ ProtectedRoute: Valid session found');
          console.log('📝 Token expiry:', new Date(session.expires_at! * 1000).toLocaleString());
          
          // Check if token is about to expire (within 5 minutes)
          const expiresAt = session.expires_at! * 1000;
          const timeUntilExpiry = expiresAt - Date.now();
          const fiveMinutes = 5 * 60 * 1000;
          
          if (timeUntilExpiry < fiveMinutes) {
            console.log('⚠️ Token expiring soon, refreshing session...');
            const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
            
            if (refreshError) {
              console.error('❌ Failed to refresh session:', refreshError);
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
    
    // Initial check: defer if the fresh login/register route already provided a token.
    if (routeToken) {
      setTimeout(checkAuth, 1000);
    } else {
      checkAuth();
    }
    
    // Refresh token every 45 minutes to prevent expiration
    refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing session to prevent token expiration...');
      checkAuth();
    }, 45 * 60 * 1000); // 45 minutes
    
    // Cleanup
    return () => {
      console.log('🧹 ProtectedRoute: Cleaning up');
      mounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
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
    <TradingDashboard 
      accessToken={accessToken}
      onLogout={handleLogout}
    />
  );
}

// Admin Route wrapper - verifies unique code from URL
function AdminRoute({ children }: { children: ReactNode }) {
  const { uniqueCode } = useParams<{ uniqueCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Store/update the unique code from URL when present
  useEffect(() => {
    if (uniqueCode) {
      const storedCode = sessionStorage.getItem('admin_unique_code');
      const hasAdminToken = sessionStorage.getItem('admin_access_token');
      const hasAdminUser = sessionStorage.getItem('admin_user');
      const hasAdminSession = hasAdminToken && hasAdminUser;
      
      console.log('🔍 AdminRoute Check:', {
        urlCode: uniqueCode,
        storedCode: storedCode,
        hasToken: !!hasAdminToken,
        hasUser: !!hasAdminUser,
        hasSession: hasAdminSession,
        pathname: location.pathname
      });
      
      // If this is a DIFFERENT unique code AND we have an existing admin session, clear it
      if (storedCode && storedCode !== uniqueCode && hasAdminSession) {
        console.log('🔄 Different admin unique code detected, clearing old session');
        console.log(`   Old code: ${storedCode}, New code: ${uniqueCode}`);
        sessionStorage.removeItem('admin_access_token');
        sessionStorage.removeItem('admin_user');
        
        // If not on login page, redirect to login with new code
        if (!location.pathname.includes('/login')) {
          console.log('🔒 Redirecting to login with new unique code');
          navigate(`/admin/hotkey/${uniqueCode}/login`, { replace: true });
          return;
        }
      }
      
      // Always update the stored code to match the URL (even if no session exists yet)
      if (storedCode !== uniqueCode) {
        console.log('🔑 Updating admin unique code:', uniqueCode);
        sessionStorage.setItem('admin_unique_code', uniqueCode);
      } else {
        console.log('✅ Admin unique code already matches:', uniqueCode);
      }
    }
  }, [uniqueCode, location.pathname, navigate]);
  
  // If no unique code in URL, deny access
  if (!uniqueCode) {
    console.error('🔒 AdminRoute: No unique code in URL');
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

// Wrapper components for routes with params
function AdminLoginPage() {
  const { uniqueCode } = useParams<{ uniqueCode: string }>();
  const navigate = useNavigate();
  
  return (
    <AdminRoute>
      <AdminLogin
        onLogin={(admin, token) => {
          console.log('✅ Admin logged in, navigating to dashboard (SPA)');
          sessionStorage.setItem('admin_access_token', token || '');
          sessionStorage.setItem('admin_user', JSON.stringify(admin));
          navigate(`/admin/hotkey/${uniqueCode}/dashboard`, { replace: true });
        }}
        serverUrl={serverUrl}
        accessToken={publicAnonKey}
        onClose={() => {
          console.log('🏠 Navigating to home (SPA)');
          navigate('/', { replace: true });
        }}
        pressedHotkey=""
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
  const prefetchDashboard = () => loadTradingDashboard().catch(() => {});
  
  return (
    <ModernLogin 
      onLoginSuccess={(token) => {
        console.log('🎉 Login successful - navigating to dashboard (SPA mode)');
        navigate('/dashboard', { replace: true, state: { accessToken: token } });
      }}
      onSwitchToSignup={() => {
        console.log('🔄 Switching to signup (SPA)');
        navigate('/register');
      }}
      onBackToHome={() => {
        console.log('🏠 Back to home (SPA)');
        navigate('/');
      }}
      onReadyForDashboard={prefetchDashboard}
      serverUrl={serverUrl}
      publicAnonKey={publicAnonKey}
    />
  );
}

// Wrapper for Registration page - SIMPLIFIED - No session check to allow back button
function RegistrationPageWrapper() {
  const navigate = useNavigate();
  const prefetchDashboard = () => loadTradingDashboard().catch(() => {});
  
  return (
    <ModernRegistration 
      onRegistrationSuccess={(token) => {
        console.log('🎉 Registration successful - navigating to dashboard (SPA mode)');
        navigate('/dashboard', { replace: true, state: { accessToken: token } });
      }}
      onSwitchToSignin={() => {
        console.log('🔄 Switching to login (SPA)');
        navigate('/login');
      }}
      onBackToHome={() => {
        console.log('🏠 Back to home (SPA)');
        navigate('/');
      }}
      onReadyForDashboard={prefetchDashboard}
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
    element: <PageViewTracker><RouteSuspense><LoginPageWrapper /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/register',
    element: <PageViewTracker><RouteSuspense><RegistrationPageWrapper /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/dashboard',
    element: <PageViewTracker><RouteSuspense><ProtectedRoute><div /></ProtectedRoute></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/admin/hotkey/:uniqueCode/login',
    element: <PageViewTracker><RouteSuspense><AdminLoginPage /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/admin/hotkey/:uniqueCode/dashboard',
    element: <PageViewTracker><RouteSuspense><AdminDashboardPage /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/admin/hotkey/:uniqueCode/landing',
    element: <PageViewTracker><RouteSuspense><AdminLandingPage /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/page/:slug',
    element: <PageViewTracker><RouteSuspense><DynamicPageWrapper /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/pwa-setup',
    element: <PageViewTracker><RouteSuspense><PWASetupPage /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/icon-generator',
    element: <PageViewTracker><RouteSuspense><IconGeneratorPage /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/sitemap',
    element: <PageViewTracker><RouteSuspense><Sitemap /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/manual-index',
    element: <PageViewTracker><RouteSuspense><ManualIndexPage /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/terms',
    element: <PageViewTracker><RouteSuspense><TermsAndConditions /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/privacy',
    element: <PageViewTracker><RouteSuspense><PrivacyPolicy /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/refund',
    element: <PageViewTracker><RouteSuspense><RefundPolicy /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/disclaimer',
    element: <PageViewTracker><RouteSuspense><Disclaimer /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/about-us',
    element: <PageViewTracker><RouteSuspense><AboutUs /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/contact-us',
    element: <PageViewTracker><RouteSuspense><ContactUs /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '/sitemap-diagnostic.html',
    element: <PageViewTracker><RouteSuspense><HTMLFileServer filePath="/sitemap-diagnostic.html" /></RouteSuspense></PageViewTracker>,
  },
  {
    path: '*',
    element: <PageViewTracker><NotFoundPage /></PageViewTracker>,
  },
]);