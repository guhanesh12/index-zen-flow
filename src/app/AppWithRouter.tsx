// @ts-nocheck
import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router";
import ModernLogin from "./components/ModernLogin";
import ModernRegistration from "./components/ModernRegistration";
import ModernLandingPage from "./components/ModernLandingPage";
import { TradingDashboard } from "./components/TradingDashboard";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AdminDashboard } from "./components/AdminDashboard";
import LandingAdminComplete from "./components/LandingAdminComplete";
import DynamicPage from "./components/DynamicPage";
import { projectId, publicAnonKey } from "@/utils-ext/supabase/info";
import { supabase } from "@/utils-ext/supabase/client";
import { useAnalyticsTracking } from "./hooks/useAnalyticsTracking";
import { getBaseUrl } from "./utils/apiService";

// Extend Window interface for hotkey system
declare global {
  interface Window {
    adminHotkeys: string[];
    adminKeySequence: string;
    adminKeyTimeout: any;
    hotkeyDebugMode: boolean;
  }
}

// ⚡⚡⚡ HOTKEY LISTENER COMPONENT (Works on ALL pages) ⚡⚡⚡
function GlobalHotkeyListener() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.log('🔑 Global hotkey listener active on:', location.pathname);

    // Load admin hotkeys from server
    const loadAdminHotkeys = async () => {
      try {
        const response = await fetch(`${getBaseUrl()}/admin/hotkeys`, {
          headers: { Authorization: `Bearer ${publicAnonKey}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.hotkeys && Array.isArray(data.hotkeys) && data.hotkeys.length > 0) {
            window.adminHotkeys = data.hotkeys;
            console.log('🔑 Admin hotkeys loaded:', window.adminHotkeys);
          }
        }
      } catch (error) {
        console.error('Failed to load admin hotkeys:', error);
      }
    };

    // Initialize
    window.adminHotkeys = ['GUHAN'];
    window.adminKeySequence = '';
    window.hotkeyDebugMode = false;
    loadAdminHotkeys();

    // Refresh every 60s
    const interval = setInterval(loadAdminHotkeys, 60000);

    // ⚡⚡⚡ KEYBOARD LISTENER (Works everywhere!) ⚡⚡⚡
    const handleKeyPress = (e: KeyboardEvent) => {
      const modKey = e.ctrlKey || e.metaKey;
      
      // Debug toggle: Ctrl/Cmd + Shift + H
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        window.hotkeyDebugMode = !window.hotkeyDebugMode;
        console.log(`🔍 Hotkey debug: ${window.hotkeyDebugMode ? 'ON' : 'OFF'}`);
        return;
      }
      
      // Admin hotkey: Ctrl/Cmd + Alt + [Sequence]
      if (modKey && e.altKey && e.code?.startsWith('Key')) {
        e.preventDefault();
        const key = e.code.replace('Key', '').toUpperCase();
        window.adminKeySequence += key;
        
        if (window.hotkeyDebugMode) {
          console.log(`🔑 Sequence: "${window.adminKeySequence}"`);
        }
        
        // Check against all hotkeys
        const matched = window.adminHotkeys.some(hotkey => {
          if (window.adminKeySequence === hotkey) {
            console.log(`✅ HOTKEY MATCHED: "${hotkey}" → Navigating to /admin/login`);
            
            // ⚡ NAVIGATE TO ADMIN LOGIN
            navigate('/admin/login');
            
            window.adminKeySequence = '';
            return true;
          }
          return false;
        });
        
        if (!matched && !window.adminHotkeys.some(h => h.startsWith(window.adminKeySequence))) {
          if (window.hotkeyDebugMode) {
            console.log(`❌ No match for "${window.adminKeySequence}"`);
          }
          window.adminKeySequence = '';
        }
        
        // Reset after 3s
        clearTimeout(window.adminKeyTimeout);
        window.adminKeyTimeout = setTimeout(() => {
          if (window.adminKeySequence) {
            if (window.hotkeyDebugMode) {
              console.log(`⏱️ Timeout - Reset sequence`);
            }
            window.adminKeySequence = '';
          }
        }, 3000);
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      clearInterval(interval);
      clearTimeout(window.adminKeyTimeout);
    };
  }, [navigate, location]);

  return null;
}

// ⚡⚡⚡ PROTECTED ROUTE (Requires login) ⚡⚡⚡
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAccessToken(session?.access_token || null);
      setChecking(false);
    };
    checkAuth();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// ⚡⚡⚡ ADMIN PROTECTED ROUTE ⚡⚡⚡
function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    setAdminToken(token);
    setChecking(false);
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!adminToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
}

// ⚡⚡⚡ MAIN APP ROUTER ⚡⚡⚡
function AppRoutes() {
  const navigate = useNavigate();
  const [currentPageSlug, setCurrentPageSlug] = useState('');
  
  // 📊 Track page views automatically
  useAnalyticsTracking();

  const handleLogin = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        navigate('/user/dashboard');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const handleSignup = async (email: string, password: string, name: string) => {
    try {
      const response = await fetch(`${getBaseUrl()}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ email, password, name })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.message);

      // Auto-login after signup
      await handleLogin(email, password);
    } catch (error: any) {
      console.error('Signup error:', error);
      throw error;
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <>
      {/* ⚡ GLOBAL HOTKEY LISTENER (Works on ALL pages) */}
      <GlobalHotkeyListener />

      <Routes>
        {/* ⚡ PUBLIC ROUTES */}
        <Route path="/" element={
          <ModernLandingPage
            onSignInClick={() => navigate('/login')}
            onSignUpClick={() => navigate('/register')}
            onPageNavigate={(slug) => {
              setCurrentPageSlug(slug);
              navigate(`/page/${slug}`);
            }}
          />
        } />
        
        <Route path="/home" element={
          <ModernLandingPage
            onSignInClick={() => navigate('/login')}
            onSignUpClick={() => navigate('/register')}
            onPageNavigate={(slug) => {
              setCurrentPageSlug(slug);
              navigate(`/page/${slug}`);
            }}
          />
        } />

        <Route path="/login" element={
          <ModernLogin
            onLoginSuccess={handleLogin}
            onSwitchToSignup={() => navigate('/register')}
            onBackToHome={() => navigate('/')}
          />
        } />

        <Route path="/register" element={
          <ModernRegistration
            onSignupSuccess={handleSignup}
            onSwitchToLogin={() => navigate('/login')}
            onBackToHome={() => navigate('/')}
          />
        } />

        <Route path="/page/:slug" element={
          <DynamicPage
            slug={currentPageSlug}
            onBack={() => navigate('/')}
          />
        } />

        {/* ⚡ PROTECTED USER ROUTES */}
        <Route path="/user/dashboard" element={
          <ProtectedRoute>
            <ErrorBoundary>
              <TradingDashboard
                accessToken={''} // Will be fetched inside
                onLogout={handleLogout}
                onOpenLandingAdmin={() => navigate('/admin/landing')}
              />
            </ErrorBoundary>
          </ProtectedRoute>
        } />

        {/* ⚡ ADMIN ROUTES (Accessible via HOTKEY) */}
        <Route path="/admin/login" element={
          <AdminLogin onAdminLoginSuccess={() => navigate('/admin/dashboard')} />
        } />

        <Route path="/admin/dashboard" element={
          <AdminProtectedRoute>
            <AdminDashboard
              onLogout={() => {
                localStorage.removeItem('admin_access_token');
                navigate('/admin/login');
              }}
            />
          </AdminProtectedRoute>
        } />

        <Route path="/admin/landing" element={
          <AdminProtectedRoute>
            <LandingAdminComplete
              accessToken={localStorage.getItem('admin_access_token') || ''}
              onClose={() => navigate('/admin/dashboard')}
            />
          </AdminProtectedRoute>
        } />

        {/* ⚡ 404 FALLBACK */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

// ⚡⚡⚡ ADMIN LOGIN COMPONENT ⚡⚡⚡
function AdminLogin({ onAdminLoginSuccess }: { onAdminLoginSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${getBaseUrl()}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success && data.accessToken) {
        localStorage.setItem('admin_access_token', data.accessToken);
        onAdminLoginSuccess();
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl mb-4">
              <span className="text-3xl">🔒</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
            <p className="text-zinc-400 text-sm">Accessed via hotkey: Ctrl+Alt+{window.adminHotkeys?.[0] || 'GUHAN'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="admin@indexpilotai.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white font-medium rounded-lg transition-all duration-300 disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login as Admin'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-3 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium rounded-lg transition-all duration-300"
            >
              Back to Home
            </button>
          </form>

          <div className="mt-6 p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg">
            <p className="text-xs text-zinc-500 text-center">
              🔑 Access this page anytime using the hotkey:<br/>
              <span className="text-zinc-300 font-mono">Ctrl+Alt+{window.adminHotkeys?.[0] || 'GUHAN'}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ⚡⚡⚡ MAIN EXPORT ⚡⚡⚡
export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}