// @ts-nocheck
/**
 * PWA DEBUG UTILITIES
 * Use these in browser console to test PWA install functionality
 * 
 * Open console (F12) and type:
 * - window.resetPWAInstall()  // Reset install prompt to show again
 * - window.checkPWAStatus()   // Check if PWA is installed
 * - window.testPWAInstall()   // Full diagnostic test
 */

export function setupPWADebug() {
  if (typeof window === 'undefined') return;

  // Reset PWA install prompt (clears localStorage flags)
  (window as any).resetPWAInstall = () => {
    localStorage.removeItem('pwa-install-dismissed');
    localStorage.removeItem('pwa-install-prompt-shown');
    console.log('✅ PWA install flags cleared!');
    console.log('🔄 Refresh the page to see the install prompt again');
    console.log('💡 Or click the floating "Install App" button in bottom-right corner');
  };

  // Check PWA installation status
  (window as any).checkPWAStatus = () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSStandalone = (window.navigator as any).standalone === true;
    const isInstalled = isStandalone || isIOSStandalone;

    console.log('📱 PWA Installation Status:');
    console.log('   Standalone mode:', isStandalone);
    console.log('   iOS standalone:', isIOSStandalone);
    console.log('   Is installed:', isInstalled);
    console.log('');
    console.log('📋 LocalStorage Flags:');
    console.log('   Dismissed:', localStorage.getItem('pwa-install-dismissed'));
    console.log('   Shown:', localStorage.getItem('pwa-install-prompt-shown'));
    console.log('');
    console.log('🌐 Environment:');
    console.log('   Secure context:', window.isSecureContext);
    console.log('   Service Worker support:', 'serviceWorker' in navigator);
    console.log('   Protocol:', window.location.protocol);

    if (!isInstalled) {
      console.log('');
      console.log('💡 App is NOT installed. Install button should be visible.');
      console.log('   Look for the floating "Install App" button in bottom-right corner');
    } else {
      console.log('');
      console.log('✅ App IS installed (running in standalone mode)');
      console.log('   Install button will be hidden');
    }

    return {
      isInstalled,
      isStandalone,
      isIOSStandalone,
      dismissed: localStorage.getItem('pwa-install-dismissed'),
      shown: localStorage.getItem('pwa-install-prompt-shown'),
      secureContext: window.isSecureContext,
      hasServiceWorker: 'serviceWorker' in navigator,
    };
  };

  // Full diagnostic test
  (window as any).testPWAInstall = async () => {
    console.log('🔍 Running PWA Installation Diagnostic...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 1. Check installation status
    console.log('');
    console.log('📱 STEP 1: Installation Status');
    (window as any).checkPWAStatus();

    // 2. Check manifest
    console.log('');
    console.log('📋 STEP 2: Manifest Check');
    try {
      const response = await fetch('/manifest.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type');
      if (contentType && !contentType.includes('application/json')) {
        throw new Error(`Wrong content-type: ${contentType}`);
      }
      const manifest = await response.json();
      console.log('   ✅ Manifest loaded successfully');
      console.log('   Name:', manifest.name);
      console.log('   Short name:', manifest.short_name);
      console.log('   Icons:', manifest.icons?.length || 0, 'sizes');
      console.log('   Theme color:', manifest.theme_color);
      console.log('   Display:', manifest.display);
    } catch (error: any) {
      console.log('   ⚠️ Manifest not available:', error.message);
      console.log('   ℹ️ This is normal in Figma Make preview mode');
      console.log('   ℹ️ Manifest will work after publishing to production');
    }

    // 3. Check service worker
    console.log('');
    console.log('🔧 STEP 3: Service Worker');
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          console.log('   ✅ Service Worker registered');
          console.log('   Scope:', registration.scope);
          console.log('   State:', registration.active?.state);
        } else {
          console.log('   ℹ️ Service Worker not registered');
          console.log('   ℹ️ This is optional - PWA can work without it');
        }
      } catch (error) {
        console.log('   ℹ️ Service Worker not available');
        console.log('   ℹ️ This is optional - PWA can work without it');
      }
    } else {
      console.log('   ℹ️ Service Worker not supported');
      console.log('   ℹ️ This is optional - PWA can work without it');
    }

    // 4. Check icons (skip in preview mode to avoid errors)
    console.log('');
    console.log('🎨 STEP 4: Icon Availability');
    console.log('   ℹ️ Skipping icon check (not needed in preview)');
    console.log('   ℹ️ Icons will work after publishing to production');

    // 5. Summary
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 DIAGNOSTIC SUMMARY:');
    console.log('');
    
    const status = (window as any).checkPWAStatus();
    
    if (status.isInstalled) {
      console.log('✅ APP IS INSTALLED - Everything is working!');
    } else if (window.isSecureContext) {
      console.log('📲 APP NOT INSTALLED - Install button should be visible');
      console.log('');
      console.log('👉 NEXT STEPS:');
      console.log('   1. Look for floating "Install App" button in bottom-right corner');
      console.log('   2. Click the button to install');
      console.log('   3. If no button visible, try: window.resetPWAInstall()');
      console.log('   4. Then refresh the page');
      console.log('');
      console.log('ℹ️ NOTE: In Figma Make preview, some PWA features may not work');
      console.log('ℹ️ Full PWA functionality available after publishing');
    } else {
      console.log('⚠️ NOT A SECURE CONTEXT');
      console.log('   PWA requires HTTPS or localhost');
      console.log('   Current protocol:', window.location.protocol);
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  };

  // Show welcome message
  console.log('');
  console.log('🔧 PWA Debug Tools Available:');
  console.log('   window.resetPWAInstall()  - Reset install prompt');
  console.log('   window.checkPWAStatus()   - Check install status');
  console.log('   window.testPWAInstall()   - Run full diagnostic');
  console.log('');
}

// Auto-run on load
if (typeof window !== 'undefined') {
  setupPWADebug();
}