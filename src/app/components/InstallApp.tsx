import { useState, useEffect } from 'react';
import { Download, X, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// 🎯 LOCAL STORAGE KEYS
const INSTALL_DISMISSED_KEY = 'pwa-install-dismissed';
const INSTALL_PROMPT_SHOWN_KEY = 'pwa-install-prompt-shown';

export function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showFloatingButton, setShowFloatingButton] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    console.log('📱 InstallApp: Initializing PWA install handler...');
    
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    
    if (isStandalone || isIOSStandalone) {
      console.log('✅ App is already installed (running in standalone mode)');
      setIsInstalled(true);
      setShowFloatingButton(false);
      return;
    }

    console.log('📲 App is NOT installed - setting up install listeners...');

    // 🆕 CHECK FOR GLOBALLY CAPTURED PROMPT FIRST
    if ((window as any).deferredInstallPrompt) {
      console.log('🎯 Found globally captured install prompt!');
      setDeferredPrompt((window as any).deferredInstallPrompt);
      setShowFloatingButton(true);
    }

    // 🆕 CRITICAL: Listen for install prompt BEFORE page loads
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('🎯 beforeinstallprompt event CAPTURED!', e);
      e.preventDefault(); // Prevent browser's default mini-infobar
      
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      (window as any).deferredInstallPrompt = promptEvent; // Store globally too
      setShowFloatingButton(true);
      
      console.log('✅ Install prompt saved! Ready for one-click install.');
      
      // Show popup only once
      const wasShown = localStorage.getItem(INSTALL_PROMPT_SHOWN_KEY) === 'true';
      if (!wasShown) {
        setShowInstallPrompt(true);
        localStorage.setItem(INSTALL_PROMPT_SHOWN_KEY, 'true');
        console.log('📲 Showing install popup for first time');
      }
    };

    // 🆕 Add listener IMMEDIATELY - don't wait for anything
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    console.log('✅ beforeinstallprompt listener attached');

    // Listen for successful installation
    const handleAppInstalled = () => {
      console.log('✅ PWA installed successfully!');
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setShowFloatingButton(false);
      setDeferredPrompt(null);
      (window as any).deferredInstallPrompt = null;
      setIsInstalling(false);
      localStorage.removeItem(INSTALL_DISMISSED_KEY);
      localStorage.removeItem(INSTALL_PROMPT_SHOWN_KEY);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // 🆕 Register service worker IMMEDIATELY
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('✅ Service Worker registered:', registration.scope);
          
          // Force update check
          registration.update().catch(() => {
            console.log('ℹ️ Service Worker update check skipped');
          });
        })
        .catch((error) => {
          console.log('⚠️ Service Worker registration failed:', error.message);
        });
    }

    // Check PWA manifest
    fetch('/manifest.json')
      .then(res => {
        if (!res.ok) throw new Error('Manifest not found');
        return res.json();
      })
      .then(manifest => {
        console.log('✅ PWA Manifest loaded:', manifest.short_name || manifest.name);
      })
      .catch(() => {
        console.log('⚠️ PWA Manifest not available');
      });

    // 🆕 ALWAYS show button after 500ms (faster response)
    const showButtonTimer = setTimeout(() => {
      if (!isInstalled) {
        console.log('⏰ Showing install button');
        setShowFloatingButton(true);
        
        // Check global prompt again
        if ((window as any).deferredInstallPrompt && !deferredPrompt) {
          console.log('🔄 Syncing with global install prompt');
          setDeferredPrompt((window as any).deferredInstallPrompt);
        }
      }
    }, 500); // Show button quickly

    return () => {
      clearTimeout(showButtonTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    console.log('🔘 Install button clicked');
    
    if (!deferredPrompt) {
      console.log('⚠️ Install prompt not available - showing instructions');
      
      // Check if we're already in HTTPS
      const isHTTPS = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
      
      if (!isHTTPS) {
        alert('⚠️ Installation requires HTTPS\n\nPlease visit this site using HTTPS to install the app.');
        return;
      }
      
      // Show browser-specific instructions via dialog  
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isFirefox = /firefox|fxios/i.test(navigator.userAgent);
      const isChrome = /chrome|chromium|crios/i.test(navigator.userAgent) && !/edg/i.test(navigator.userAgent);
      const isEdge = /edg/i.test(navigator.userAgent);
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isAndroid = /android/i.test(navigator.userAgent);
      
      let message = '';
      let title = '📱 Install IndexpilotAI';
      
      if (isSafari || isIOS) {
        message = `To install on iPhone/iPad:\n\n1. Tap the Share button (⬆️) at the bottom\n2. Scroll and tap "Add to Home Screen"\n3. Tap "Add" to install\n\nThe app will appear on your home screen!`;
      } else if (isAndroid && (isChrome || isEdge)) {
        message = `To install on Android:\n\n1. Tap the menu (⋮) in the browser\n2. Tap "Install app" or "Add to Home screen"\n3. Tap "Install" to confirm\n\nThe app will appear on your home screen!`;
      } else if (isFirefox) {
        message = `To install on Firefox:\n\n1. Tap the menu (⋯)\n2. Tap "Install"\n3. Confirm the installation\n\nThe app will be installed!`;
      } else {
        // Desktop Chrome/Edge
        message = `To install on Desktop:\n\n✅ Look for the install icon (⊕) in the address bar\n✅ OR click the menu (⋮) → "Install IndexpilotAI"\n✅ Confirm the installation\n\nThe app will open in its own window!`;
      }
      
      alert(`${title}\n\n${message}`);
      return;
    }

    setIsInstalling(true);

    try {
      console.log('📲 Showing native install prompt...');
      
      // Trigger the browser's native install dialog
      await deferredPrompt.prompt();

      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        console.log('✅ User accepted installation');
        localStorage.removeItem(INSTALL_DISMISSED_KEY);
        setShowFloatingButton(false);
        setIsInstalling(false);
      } else {
        console.log('❌ User cancelled installation');
        setIsInstalling(false);
      }

      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('❌ Install prompt error:', error);
      setIsInstalling(false);
      alert('⚠️ Installation failed. Please use your browser\'s install option from the menu.');
    }
  };

  const handleDismissPopup = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setShowInstallPrompt(false);
    console.log('📱 Install popup dismissed (floating button still visible)');
  };

  // Don't show if already installed
  if (isInstalled) {
    console.log('✅ App installed - hiding all install UI');
    return null;
  }

  return (
    <>
      {/* 🆕 Floating Install Button - ALWAYS VISIBLE when not installed */}
      {showFloatingButton && !isInstalled && (
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className={`fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-semibold rounded-full shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105 animate-in slide-in-from-bottom-8 group ${
            isInstalling ? 'opacity-50 cursor-wait' : ''
          }`}
          title="Install IndexpilotAI"
        >
          {isInstalling ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Installing...</span>
            </>
          ) : (
            <>
              <Download className="w-5 h-5 group-hover:animate-bounce" />
              <span className="hidden sm:inline">Install App</span>
            </>
          )}
        </button>
      )}

      {/* Smart Install Popup - Shows once on first visit */}
      {showInstallPrompt && !isInstalling && (
        <div className="fixed bottom-24 right-6 z-50 animate-in slide-in-from-bottom-4 duration-500">
          <Card className="border-blue-500/50 bg-gradient-to-br from-blue-950/95 to-slate-950/95 shadow-2xl backdrop-blur-xl max-w-sm">
            <CardContent className="p-4">
              <button
                onClick={handleDismissPopup}
                className="absolute top-2 right-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <Download className="w-6 h-6 text-blue-400" />
                </div>

                <div className="flex-1 pr-4">
                  <h3 className="text-white font-semibold mb-1">
                    Install IndexpilotAI
                  </h3>
                  <p className="text-slate-400 text-sm mb-3">
                    Install this app for instant access from your home screen.
                  </p>

                  <Button
                    onClick={handleInstallClick}
                    size="sm"
                    disabled={isInstalling}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {isInstalling ? 'Installing...' : 'Install Now'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}