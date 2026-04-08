import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

interface PWAStatus {
  manifestLoaded: boolean;
  manifestValid: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerActive: boolean;
  httpsEnabled: boolean;
  installPromptAvailable: boolean;
  isStandalone: boolean;
  iconsValid: boolean;
  errors: string[];
  warnings: string[];
}

export function PWADebugger() {
  const [status, setStatus] = useState<PWAStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);

  const checkPWAStatus = async () => {
    setIsChecking(true);
    const errors: string[] = [];
    const warnings: string[] = [];
    const newStatus: PWAStatus = {
      manifestLoaded: false,
      manifestValid: false,
      serviceWorkerRegistered: false,
      serviceWorkerActive: false,
      httpsEnabled: false,
      installPromptAvailable: false,
      isStandalone: false,
      iconsValid: false,
      errors,
      warnings,
    };

    try {
      // Check HTTPS
      newStatus.httpsEnabled = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
      if (!newStatus.httpsEnabled) {
        errors.push('HTTPS required for PWA');
      }

      // Check standalone mode
      newStatus.isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      if (newStatus.isStandalone) {
        warnings.push('App is already installed (running in standalone mode)');
      }

      // Check manifest
      try {
        const manifestResponse = await fetch('/manifest.json');
        if (manifestResponse.ok) {
          newStatus.manifestLoaded = true;
          const manifest = await manifestResponse.json();
          
          // Validate manifest
          if (manifest.name && manifest.short_name && manifest.start_url && manifest.display && manifest.icons) {
            newStatus.manifestValid = true;
            
            // Check icons
            const hasMinimumIcons = manifest.icons.some((icon: any) => 
              icon.sizes === '192x192' || icon.sizes === '512x512'
            );
            
            if (hasMinimumIcons) {
              newStatus.iconsValid = true;
            } else {
              warnings.push('Missing 192x192 or 512x512 icons');
            }
          } else {
            errors.push('Manifest missing required fields');
          }
        } else {
          errors.push(`Manifest not found (${manifestResponse.status})`);
        }
      } catch (error) {
        errors.push(`Manifest load error: ${(error as Error).message}`);
      }

      // Check service worker
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration) {
            newStatus.serviceWorkerRegistered = true;
            newStatus.serviceWorkerActive = registration.active !== null;
            
            if (!newStatus.serviceWorkerActive) {
              warnings.push('Service worker registered but not active');
            }
          } else {
            warnings.push('Service worker not registered yet');
          }
        } catch (error) {
          warnings.push(`Service worker check failed: ${(error as Error).message}`);
        }
      } else {
        errors.push('Service workers not supported in this browser');
      }

      // Check install prompt availability
      // Note: We can't directly check if beforeinstallprompt will fire
      // We can only check if the conditions are met
      if (newStatus.manifestValid && newStatus.httpsEnabled && !newStatus.isStandalone) {
        newStatus.installPromptAvailable = true;
      } else {
        if (newStatus.isStandalone) {
          warnings.push('App is already installed');
        } else {
          errors.push('PWA criteria not met for install prompt');
        }
      }

    } catch (error) {
      errors.push(`Status check failed: ${(error as Error).message}`);
    }

    setStatus(newStatus);
    setIsChecking(false);
  };

  useEffect(() => {
    // Auto-check on mount
    checkPWAStatus();

    // Listen for install prompt event
    const handleBeforeInstallPrompt = () => {
      console.log('✅ PWA Debugger: beforeinstallprompt event detected!');
      if (status) {
        setStatus({ ...status, installPromptAvailable: true });
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Hide debugger in production unless activated
  useEffect(() => {
    // Show debugger if URL contains ?debug=pwa
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'pwa') {
      setShowDebugger(true);
    }
  }, []);

  if (!showDebugger) {
    return null;
  }

  return (
    <div className="fixed bottom-24 left-6 z-50 max-w-md">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-blue-400" />
            PWA Debugger
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={checkPWAStatus}
              disabled={isChecking}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowDebugger(false)}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Close"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {status && (
          <div className="space-y-2 text-xs">
            {/* Status Items */}
            <StatusItem
              label="HTTPS Enabled"
              status={status.httpsEnabled}
              critical
            />
            <StatusItem
              label="Manifest Loaded"
              status={status.manifestLoaded}
              critical
            />
            <StatusItem
              label="Manifest Valid"
              status={status.manifestValid}
              critical
            />
            <StatusItem
              label="Icons Valid"
              status={status.iconsValid}
              critical
            />
            <StatusItem
              label="Service Worker Registered"
              status={status.serviceWorkerRegistered}
            />
            <StatusItem
              label="Service Worker Active"
              status={status.serviceWorkerActive}
            />
            <StatusItem
              label="Install Prompt Available"
              status={status.installPromptAvailable}
              critical
            />
            <StatusItem
              label="Already Installed"
              status={status.isStandalone}
              info
            />

            {/* Errors */}
            {status.errors.length > 0 && (
              <div className="mt-3 p-2 bg-red-950/50 border border-red-900/50 rounded">
                <p className="text-red-400 font-semibold mb-1">Errors:</p>
                {status.errors.map((error, i) => (
                  <p key={i} className="text-red-300 text-xs">• {error}</p>
                ))}
              </div>
            )}

            {/* Warnings */}
            {status.warnings.length > 0 && (
              <div className="mt-2 p-2 bg-yellow-950/50 border border-yellow-900/50 rounded">
                <p className="text-yellow-400 font-semibold mb-1">Warnings:</p>
                {status.warnings.map((warning, i) => (
                  <p key={i} className="text-yellow-300 text-xs">• {warning}</p>
                ))}
              </div>
            )}

            {/* Success */}
            {status.errors.length === 0 && !status.isStandalone && (
              <div className="mt-3 p-2 bg-green-950/50 border border-green-900/50 rounded">
                <p className="text-green-400 text-xs">
                  ✅ PWA is configured correctly. Install prompt should appear!
                </p>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
          <p>Add <code className="text-blue-400">?debug=pwa</code> to URL to show this panel</p>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ 
  label, 
  status, 
  critical = false,
  info = false 
}: { 
  label: string; 
  status: boolean; 
  critical?: boolean;
  info?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-slate-300">{label}</span>
      {status ? (
        <CheckCircle2 className={`w-4 h-4 ${info ? 'text-blue-400' : 'text-green-400'}`} />
      ) : (
        <XCircle className={`w-4 h-4 ${critical ? 'text-red-400' : 'text-yellow-400'}`} />
      )}
    </div>
  );
}
