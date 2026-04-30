// @ts-nocheck
import { useEffect, lazy, Suspense, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { router } from './routes';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { InstallApp } from './components/InstallApp';
import { startCacheRecovery } from './utils/cacheRecovery';
import { startVersionCheck } from './utils/versionCheck';
import { getBaseUrl, api, API_ENDPOINTS } from './utils/apiService';
import { initializeSecurity } from '@/utils-ext/security/SecurityHardening';

const PWADebugger = lazy(() => import('./components/PWADebugger').then(m => ({ default: m.PWADebugger })));

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
  const [showInstallApp, setShowInstallApp] = useState(false);
  const showPwaDebugger = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'pwa';

  useEffect(() => {
    // 🚀 PERF: Defer ALL non-critical startup work until browser is idle so the landing
    //         page paints/LCP fast for Google PageSpeed and SEO crawlers.
    const idle = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb, { timeout: 4000 });
      } else {
        setTimeout(cb, 2000);
      }
    };

    let hotkeyRefreshInterval: any;

    idle(() => {
      setShowInstallApp(true);
      startCacheRecovery().catch(() => undefined);
      startVersionCheck();
      initializeSecurity({ enableDevToolsMonitor: false });

      // Initialize hotkey system
      window.adminHotkeys = ['GUHAN'];
      window.adminKeySequence = '';
      window.hotkeyDebugMode = false;

      loadAdminHotkeys();
      hotkeyRefreshInterval = setInterval(() => {
        loadAdminHotkeys().catch(() => {});
      }, 60000);
    });

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
    };
  }, []);

  // Load admin hotkeys from server
  const loadAdminHotkeys = async () => {
    try {
      const response = await fetch(`${serverUrl}/admin/hotkeys`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.hotkeys && Array.isArray(data.hotkeys)) {
          // Extract just the hotkey string from each object (server returns { id, hotkey, name, ... })
          window.adminHotkeys = data.hotkeys
            .map((h: any) => (typeof h === 'string' ? h : h.hotkey || ''))
            .filter(Boolean)
            .map((s: string) => s.toUpperCase());
          console.log(`🔑 Loaded ${window.adminHotkeys.length} admin hotkeys:`, window.adminHotkeys);
        }
      }
    } catch (error) {
      console.error('❌ Failed to load admin hotkeys:', error);
    }
  };

  // Check if hotkey sequence matches and generate unique code + redirect
  const checkHotkeyMatch = async (sequence: string) => {
    const matchedHotkey = window.adminHotkeys.find(
      hotkey => hotkey.toUpperCase() === sequence.toUpperCase()
    );
    
    if (matchedHotkey) {
      console.log(`🎯 Admin hotkey matched: ${matchedHotkey}`);
      
      // Clear the sequence
      window.adminKeySequence = '';
      clearTimeout(window.adminKeyTimeout);
      
      // Generate unique code and redirect
      await generateUniqueCodeAndRedirect(matchedHotkey);
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
        {showInstallApp && <InstallApp />}
        {showPwaDebugger && (
          <Suspense fallback={null}>
            <PWADebugger />
          </Suspense>
        )}
      </div>
    </HelmetProvider>
  );
}