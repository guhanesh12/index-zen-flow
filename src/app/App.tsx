// @ts-nocheck
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import { PWADebugger } from './components/PWADebugger';
import { startCacheRecovery } from './utils/cacheRecovery';
import { startVersionCheck } from './utils/versionCheck';
import { getBaseUrl } from './utils/apiService';
import { initializeSecurity, SessionManager } from '@/utils-ext/security/SecurityHardening';
import { supabase } from '@/utils-ext/supabase/client';

// Extend Window interface for hotkey system
declare global {
  interface Window {
    adminHotkeys: string[];
    adminKeySequence: string;
    adminKeyTimeout: any;
    hotkeyDebugMode: boolean;
  }
}

const serverUrl = getBaseUrl();
const localToken = 'cloud-run-local-token';

export default function App() {
  useEffect(() => {
    startCacheRecovery().catch(() => undefined);

    // 🔄 START AUTO-VERSION CHECK
    startVersionCheck();

    // 🔐 Sync Supabase Auth Session with Local Storage
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        localStorage.setItem('auth_token', session.access_token);
        localStorage.setItem('user_session', JSON.stringify(session));
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_session');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        localStorage.setItem('auth_token', session.access_token);
        localStorage.setItem('user_session', JSON.stringify(session));
      }
    });
    
    // 🔒 Initialize Security System
    initializeSecurity({
      enableDevToolsMonitor: import.meta.env.PROD,
      onSessionTimeout: () => {
        sessionStorage.removeItem('ip_pin_unlocked_at');
        window.dispatchEvent(new CustomEvent('indexpilot:pin-lock'));
      },
      onSessionWarning: () => {
        console.warn('🔒 Session will expire in 5 minutes due to inactivity.');
      },
    });

    // Initialize hotkey system
    window.adminHotkeys = [];
    window.adminKeySequence = '';
    window.hotkeyDebugMode = false;

    const hotkeyRefreshInterval = 0;
    const handleHotkeyUpdate = () => {};

    // Setup admin hotkey listener
    const handleKeyPress = (e: KeyboardEvent) => {
      const modKey = e.ctrlKey || e.metaKey;
      
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        window.hotkeyDebugMode = !window.hotkeyDebugMode;
        console.log(`🔍 Hotkey debug mode: ${window.hotkeyDebugMode ? 'ENABLED' : 'DISABLED'}`);
        return;
      }
      
      if (modKey && e.altKey) {
        if (e.code && e.code.startsWith('Key')) {
          e.preventDefault();
          const key = e.code.replace('Key', '').toUpperCase();
          window.adminKeySequence += key;
          
          if (window.hotkeyDebugMode) {
            console.log(`🔑 Key pressed: ${key} | Sequence now: "${window.adminKeySequence}"`);
          }
          
          checkHotkeyMatch(window.adminKeySequence);
          
          clearTimeout(window.adminKeyTimeout);
          window.adminKeyTimeout = setTimeout(() => {
            window.adminKeySequence = '';
          }, 2000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      authSub?.subscription?.unsubscribe();
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('admin-hotkeys-updated', handleHotkeyUpdate);
      clearInterval(hotkeyRefreshInterval);
      clearTimeout(window.adminKeyTimeout);
      SessionManager.stop();
    };

  }, []);

  const checkHotkeyMatch = async (sequence: string) => {
    try {
      const response = await fetch(`${serverUrl}/admin/hotkey/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localToken}`,
        },
        body: JSON.stringify({ sequence }),
      });
      if (!response.ok) return;
      const data = await response.json();

      if (data?.match && data.uniqueCode) {
        window.adminKeySequence = '';
        clearTimeout(window.adminKeyTimeout);
        try {
          sessionStorage.setItem('admin_unique_code', data.uniqueCode);
          sessionStorage.setItem(
            'admin_hotkey_owner',
            JSON.stringify({
              hotkey: data.hotkey,
              email: data.ownerEmail || '',
              name: data.ownerName || '',
              username: data.ownerUsername || '',
              pressedAt: Date.now(),
            }),
          );
        } catch { /* ignore */ }
        await router.navigate(`/admin/hotkey/${data.uniqueCode}/login`);
        return;
      }

      if (!data?.prefix && window.adminKeySequence === sequence) {
        window.adminKeySequence = '';
      }
    } catch (error) {
      if (window.hotkeyDebugMode) console.error('Hotkey resolve failed:', error);
    }
  };

  return (
    <HelmetProvider>
      <div className="app-container">
        <RouterProvider router={router} />
        <PWADebugger />
      </div>
    </HelmetProvider>
  );
}
