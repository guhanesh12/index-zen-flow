// @ts-nocheck
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { PWADebugger } from './components/PWADebugger';
import { startCacheRecovery } from './utils/cacheRecovery';
import { startVersionCheck } from './utils/versionCheck';
import { getBaseUrl, api, API_ENDPOINTS } from './utils/apiService';
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

export default function App() {
  useEffect(() => {
    startCacheRecovery().catch(() => undefined);

    // 🔄 START AUTO-VERSION CHECK (prevents cache issues!)
    startVersionCheck();
    
    // 🔒 Initialize Security System (bank-level hardening)
    initializeSecurity({
      enableDevToolsMonitor: import.meta.env.PROD, // Production only
      onSessionTimeout: () => {
        // Inactivity locks the dashboard with the PIN; it must never destroy the
        // valid Supabase login session or send the user back to email/password.
        sessionStorage.removeItem('ip_pin_unlocked_at');
        window.dispatchEvent(new CustomEvent('indexpilot:pin-lock'));
      },
      onSessionWarning: () => {
        console.warn('🔒 Session will expire in 5 minutes due to inactivity.');
      },
    });

    // Reset idle timer on auth events + auto-subscribe to push
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        SessionManager.extend();
        // Silent push auto-subscribe
        if (session?.user?.id) {
          import('./utils/pushNotifications')
            .then((m) => m.autoSubscribeOnLogin(session.user.id))
            .catch(() => {});
        }
      }
    });

    // Also try on initial load if already signed in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        import('./utils/pushNotifications')
          .then((m) => m.autoSubscribeOnLogin(session.user.id))
          .catch(() => {});
      }
    });

    
    // Initialize hotkey system (matching happens server-side so that every
    // admin's personal hotkey works without exposing the hotkey list).
    window.adminHotkeys = [];
    window.adminKeySequence = '';
    window.hotkeyDebugMode = false;

    const hotkeyRefreshInterval = 0;
    const handleHotkeyUpdate = () => {};


    // Setup admin hotkey listener
    const handleKeyPress = (e: KeyboardEvent) => {
      const modKey = e.ctrlKey || e.metaKey; // Ctrl (Windows/Linux) or Cmd (Mac)
      
      // Utility hotkeys
      // Ctrl/Cmd + Shift + H: Toggle hotkey debug mode
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        window.hotkeyDebugMode = !window.hotkeyDebugMode;
        console.log(`🔍 Hotkey debug mode: ${window.hotkeyDebugMode ? 'ENABLED' : 'DISABLED'}`);
        return;
      }
      
      // Admin hotkey: Ctrl/Cmd + Alt + [Sequence]
      if (modKey && e.altKey) {
        if (e.code && e.code.startsWith('Key')) {
          e.preventDefault();
          
          // Extract letter (e.g., "KeyG" → "G")
          const key = e.code.replace('Key', '').toUpperCase();
          
          // Build sequence
          window.adminKeySequence += key;
          
          // Debug output
          if (window.hotkeyDebugMode) {
            console.log(`🔑 Key pressed: ${key} | Sequence now: "${window.adminKeySequence}"`);
            console.log(`   e.code: ${e.code} | e.key: ${e.key} | Platform: ${e.metaKey ? 'Mac uses Option' : 'Windows uses Alt'}`);
          }
          
          // Check if sequence matches any registered hotkey
          checkHotkeyMatch(window.adminKeySequence);
          
          // Reset sequence after 2 seconds of inactivity
          clearTimeout(window.adminKeyTimeout);
          window.adminKeyTimeout = setTimeout(() => {
            if (window.hotkeyDebugMode && window.adminKeySequence) {
              console.log(`⏱️ Sequence timeout - resetting: "${window.adminKeySequence}"`);
            }
            window.adminKeySequence = '';
          }, 2000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('admin-hotkeys-updated', handleHotkeyUpdate);
      clearInterval(hotkeyRefreshInterval);
      clearTimeout(window.adminKeyTimeout);
      authSub?.subscription?.unsubscribe?.();
      SessionManager.stop();
    };

  }, []);

  // 🔐 Resolve the typed sequence server-side. Any admin's personal hotkey
  // (created in Admin Management) works immediately — no client-side list.
  const checkHotkeyMatch = async (sequence: string) => {
    try {
      const response = await fetch(`${serverUrl}/admin/hotkey/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ sequence }),
      });
      if (!response.ok) return;
      const data = await response.json();

      if (data?.match && data.uniqueCode) {
        window.adminKeySequence = '';
        clearTimeout(window.adminKeyTimeout);
        try {
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

      // Not a match and not a prefix of any hotkey → drop the sequence.
      if (!data?.prefix && window.adminKeySequence === sequence) {
        window.adminKeySequence = '';
      }
    } catch (error) {
      if (window.hotkeyDebugMode) console.error('Hotkey resolve failed:', error);
    }
  };


  // Generate unique code from server and redirect to admin login
  const generateUniqueCodeAndRedirect = async (hotkey: string) => {
    try {
      console.log(`🔐 Generating unique code for hotkey: ${hotkey}`);
      
      const response = await fetch(`${serverUrl}/admin/generate-unique-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ hotkey: hotkey.toUpperCase() }),
      });

      const data = await response.json();

      if (response.ok && data.success && data.uniqueCode) {
        console.log(`✅ Unique code generated: ${data.uniqueCode}`);
        
        // NOTE: Do NOT store unique code here - AdminRoute will handle it from the URL
        // The URL is the single source of truth for the unique code
        
        const adminLoginPath = `/admin/hotkey/${data.uniqueCode}/login`;
        console.log(`🚀 Navigating to admin login: ${adminLoginPath}`);
        await router.navigate(adminLoginPath);
      } else {
        console.error('❌ Failed to generate unique code:', data.message);
        alert('Failed to generate admin access code. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error generating unique code:', error);
      alert('Failed to access admin panel. Please try again.');
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