// @ts-nocheck
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { InstallApp } from './components/InstallApp';
import { PWADebugger } from './components/PWADebugger';
import { startCacheRecovery } from './utils/cacheRecovery';
import { startVersionCheck } from './utils/versionCheck';
import { getBaseUrl, api, API_ENDPOINTS } from './utils/apiService';
import { initializeSecurity, SessionManager } from '@/utils-ext/security/SecurityHardening';
import { AuditLogger } from '@/utils-ext/security/AuditLogger';
import { supabase } from '@/integrations/supabase/client';


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
      onSessionTimeout: async () => {
        try {
          await AuditLogger.log({ action: 'session_timeout', status: 'success' });
          await supabase.auth.signOut();
        } catch {}
        // Hard redirect to clear all in-memory state
        window.location.href = '/login';
      },
      onSessionWarning: () => {
        console.warn('🔒 Session will expire in 5 minutes due to inactivity.');
      },
    });

    // Reset idle timer on auth events
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        SessionManager.extend();
      }
    });

    
    // Initialize hotkey system — no hardcoded defaults; the server is the source of truth.
    window.adminHotkeys = [];
    window.adminKeySequence = '';
    window.hotkeyDebugMode = false;

    // Probe whether ANY hotkey is configured server-side (count only — never the value)
    loadAdminHotkeys();

    // Auto-refresh hotkeys every 60 seconds
    const hotkeyRefreshInterval = setInterval(() => {
      loadAdminHotkeys().catch(() => {});
    }, 60000);

    // Listen for hotkey updates
    const handleHotkeyUpdate = () => {
      loadAdminHotkeys();
    };
    window.addEventListener('admin-hotkeys-updated', handleHotkeyUpdate);

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

  // Probe server for whether any admin hotkey is configured (count only — value never leaves the server)
  const loadAdminHotkeys = async () => {
    try {
      const response = await fetch(`${serverUrl}/admin/hotkeys`, {
        headers: { 'Authorization': `Bearer ${publicAnonKey}` },
      });
      if (response.ok) {
        const data = await response.json();
        // Store sentinel array with the right length so existing length checks still work.
        const n = Number(data?.count || 0);
        window.adminHotkeys = Array.from({ length: n }, () => '');
        console.log(`🔑 Admin hotkeys configured: ${n}`);
      }
    } catch (error) {
      console.error('❌ Failed to probe admin hotkeys:', error);
    }
  };

  // Send the captured sequence to the server for verification.
  // The server compares against its private list; we never know the hotkey value.
  const checkHotkeyMatch = async (sequence: string) => {
    if (!sequence || sequence.length < 3) return;
    // Avoid spamming the server — wait for the user to finish typing.
    clearTimeout(window.adminKeyTimeout);
    window.adminKeyTimeout = setTimeout(async () => {
      const attempt = window.adminKeySequence;
      window.adminKeySequence = '';
      if (!attempt || attempt.length < 3) return;
      await generateUniqueCodeAndRedirect(attempt);
    }, 600);
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
        <InstallApp />
        <PWADebugger />
      </div>
    </HelmetProvider>
  );
}