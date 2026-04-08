// @ts-nocheck
// 🎯 PWA Utility Functions

/**
 * Check if app is installed (running in standalone mode)
 */
export function isAppInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true; // iOS
}

/**
 * Check if install prompt is available
 */
export function canInstall(): boolean {
  return 'BeforeInstallPromptEvent' in window;
}

/**
 * Reset install prompt state (for testing)
 */
export function resetInstallPrompt(): void {
  localStorage.removeItem('pwa-install-dismissed');
  localStorage.removeItem('pwa-install-prompt-shown');
  console.log('✅ Install prompt state reset - reload to see prompt again');
}

/**
 * Check if install prompt was dismissed
 */
export function wasInstallDismissed(): boolean {
  return localStorage.getItem('pwa-install-dismissed') === 'true';
}

/**
 * Check if install prompt was already shown
 */
export function wasInstallShown(): boolean {
  return localStorage.getItem('pwa-install-prompt-shown') === 'true';
}

/**
 * Manually trigger install (if prompt is available)
 * Returns true if install was triggered, false otherwise
 */
export async function manualInstall(deferredPrompt: any): Promise<boolean> {
  if (!deferredPrompt) {
    console.warn('⚠️ No install prompt available');
    return false;
  }

  try {
    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    
    if (choiceResult.outcome === 'accepted') {
      console.log('✅ User accepted manual install');
      localStorage.removeItem('pwa-install-dismissed');
      return true;
    } else {
      console.log('❌ User dismissed manual install');
      localStorage.setItem('pwa-install-dismissed', 'true');
      return false;
    }
  } catch (error) {
    console.error('❌ Manual install error:', error);
    return false;
  }
}

/**
 * Get install instructions based on browser/platform
 */
export function getInstallInstructions(): {
  platform: string;
  browser: string;
  instructions: string[];
  canAutoInstall: boolean;
} {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  const isChrome = /chrome/.test(userAgent);
  const isFirefox = /firefox/.test(userAgent);

  // iOS Safari
  if (isIOS && isSafari) {
    return {
      platform: 'iOS',
      browser: 'Safari',
      instructions: [
        'Tap the Share button (square with arrow)',
        'Scroll down and tap "Add to Home Screen"',
        'Edit the name if needed',
        'Tap "Add"',
        'App icon will appear on your home screen'
      ],
      canAutoInstall: false
    };
  }

  // Android Chrome
  if (isAndroid && isChrome) {
    return {
      platform: 'Android',
      browser: 'Chrome',
      instructions: [
        'Look for the install prompt at the bottom',
        'Or tap menu (⋮) → "Add to Home screen"',
        'Tap "Install"',
        'App icon will appear on your home screen'
      ],
      canAutoInstall: true
    };
  }

  // Desktop Chrome/Edge
  if (isChrome && !isAndroid && !isIOS) {
    return {
      platform: 'Desktop',
      browser: 'Chrome',
      instructions: [
        'Look for the install icon (⊕) in the address bar',
        'Or click menu (⋮) → "Install IndexpilotAI"',
        'Click "Install"',
        'App will open in its own window'
      ],
      canAutoInstall: true
    };
  }

  // Mac Safari
  if (isSafari && !isIOS) {
    return {
      platform: 'Mac',
      browser: 'Safari',
      instructions: [
        'Click File → "Add to Dock"',
        'Or Share button → "Add to Dock"',
        'App icon will appear in your Dock'
      ],
      canAutoInstall: false
    };
  }

  // Firefox
  if (isFirefox) {
    return {
      platform: isAndroid ? 'Android' : 'Desktop',
      browser: 'Firefox',
      instructions: [
        'Tap/Click menu (≡)',
        'Select "Install"',
        'Confirm installation'
      ],
      canAutoInstall: false
    };
  }

  // Generic fallback
  return {
    platform: 'Unknown',
    browser: 'Unknown',
    instructions: [
      'Look for "Add to Home Screen" in your browser menu',
      'Or look for an install icon in the address bar',
      'Follow your browser\'s installation prompts'
    ],
    canAutoInstall: false
  };
}

/**
 * Share the app installation link
 */
export async function shareInstallLink(url: string = window.location.origin): Promise<boolean> {
  if (!navigator.share) {
    console.warn('⚠️ Web Share API not supported');
    return false;
  }

  try {
    await navigator.share({
      title: 'IndexpilotAI - AI Trading Platform',
      text: 'Install IndexpilotAI for faster access to AI-powered trading!',
      url: url
    });
    console.log('✅ Share successful');
    return true;
  } catch (error) {
    console.error('❌ Share error:', error);
    return false;
  }
}

/**
 * Get platform emoji for UI
 */
export function getPlatformEmoji(): string {
  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  const isMac = /mac/.test(userAgent) && !isIOS;
  const isWindows = /win/.test(userAgent);

  if (isIOS) return '📱';
  if (isAndroid) return '📱';
  if (isMac) return '💻';
  if (isWindows) return '💻';
  return '🖥️';
}

/**
 * Log PWA status for debugging
 */
export function logPWAStatus(): void {
  console.group('📱 PWA Status');
  console.log('Installed:', isAppInstalled());
  console.log('Can Install:', canInstall());
  console.log('Was Dismissed:', wasInstallDismissed());
  console.log('Was Shown:', wasInstallShown());
  console.log('Platform:', getInstallInstructions().platform);
  console.log('Browser:', getInstallInstructions().browser);
  console.log('Auto Install:', getInstallInstructions().canAutoInstall);
  console.groupEnd();
}

// Make utilities available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).pwaUtils = {
    isAppInstalled,
    canInstall,
    resetInstallPrompt,
    wasInstallDismissed,
    wasInstallShown,
    getInstallInstructions,
    shareInstallLink,
    logPWAStatus
  };
  
  console.log('💡 PWA Utils available at: window.pwaUtils');
  console.log('   Try: window.pwaUtils.logPWAStatus()');
}
