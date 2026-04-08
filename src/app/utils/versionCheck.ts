/**
 * 🔄 AUTO VERSION CHECK & RELOAD SYSTEM
 * 
 * This utility automatically detects when a new version of the app is deployed
 * and forces a refresh to load the latest code. No user action needed!
 * 
 * How it works:
 * 1. Stores build timestamp in a version.json file
 * 2. Checks every 60 seconds if version changed
 * 3. Auto-reloads page with cache-busting when new version detected
 * 4. Works for ALL users automatically!
 */

const VERSION_CHECK_INTERVAL = 60000; // Check every 60 seconds
const VERSION_FILE = '/version.json';

let currentVersion: string | null = null;
let checkInterval: number | null = null;

interface VersionInfo {
  version: string;
  buildTime: string;
  timestamp: number;
}

/**
 * Fetch the current version from version.json
 */
async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    // Add cache-busting to ensure we get fresh version.json
    const response = await fetch(`${VERSION_FILE}?t=${Date.now()}`, {
      cache: 'no-cache',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    if (!response.ok) {
      // Silent - version.json doesn't exist yet (normal before first build)
      return null;
    }
    
    const versionInfo: VersionInfo = await response.json();
    return versionInfo;
  } catch (error) {
    // Silent - version check is optional, don't spam console
    return null;
  }
}

/**
 * Force reload the page with cache-busting
 */
function forceReload() {
  console.log('🔄 NEW VERSION DETECTED! Reloading with fresh cache...');
  
  // Clear all caches if available
  if ('caches' in window) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  
  // Hard reload with cache-busting
  window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
}

/**
 * Check if a new version is available
 */
async function checkForNewVersion(): Promise<boolean> {
  const newVersionInfo = await fetchVersion();
  
  if (!newVersionInfo) {
    return false;
  }
  
  // First time checking - store current version
  if (currentVersion === null) {
    currentVersion = newVersionInfo.version;
    console.log(`✅ Version check initialized: ${currentVersion} (built ${newVersionInfo.buildTime})`);
    return false;
  }
  
  // Check if version changed
  if (newVersionInfo.version !== currentVersion) {
    console.log(`🆕 NEW VERSION AVAILABLE!`);
    console.log(`   Current: ${currentVersion}`);
    console.log(`   New: ${newVersionInfo.version}`);
    console.log(`   Built: ${newVersionInfo.buildTime}`);
    return true;
  }
  
  return false;
}

/**
 * Start periodic version checking
 */
export function startVersionCheck() {
  // Don't start if already running
  if (checkInterval !== null) {
    return;
  }
  
  console.log('🔍 Version check service started (checking every 60s)');
  
  // Check immediately
  checkForNewVersion();
  
  // Then check periodically
  checkInterval = window.setInterval(async () => {
    const newVersionAvailable = await checkForNewVersion();
    
    if (newVersionAvailable) {
      // Stop checking
      stopVersionCheck();
      
      // Show notification (optional - can be removed if too intrusive)
      try {
        const toast = await import('sonner');
        toast.toast.info('New version available! Reloading...', {
          duration: 2000
        });
      } catch (e) {
        // Toast not available, that's ok
      }
      
      // Reload after 2 seconds to show notification
      setTimeout(forceReload, 2000);
    }
  }, VERSION_CHECK_INTERVAL);
}

/**
 * Stop version checking
 */
export function stopVersionCheck() {
  if (checkInterval !== null) {
    window.clearInterval(checkInterval);
    checkInterval = null;
    console.log('⏸️ Version check service stopped');
  }
}

/**
 * Manual version check (for testing)
 */
export async function manualVersionCheck() {
  console.log('🔍 Manual version check triggered...');
  const newVersionAvailable = await checkForNewVersion();
  
  if (newVersionAvailable) {
    const confirmed = window.confirm(
      'A new version is available! Click OK to reload and get the latest updates.'
    );
    
    if (confirmed) {
      forceReload();
    }
  } else {
    console.log('✅ You are running the latest version!');
    alert('You are running the latest version!');
  }
}