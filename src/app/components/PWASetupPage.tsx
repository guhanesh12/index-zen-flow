// @ts-nocheck
import { ArrowLeft } from 'lucide-react';
import { Button } from './ui/button';
import { PWAIconGenerator } from './PWAIconGenerator';
import { SEO, SEO_CONFIGS } from '../utils/seo';

interface PWASetupPageProps {
  onBack?: () => void;
}

export function PWASetupPage({ onBack }: PWASetupPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950">
      <SEO {...SEO_CONFIGS.pwaSetup} />
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          {onBack && (
            <Button
              onClick={onBack}
              variant="outline"
              className="mb-4 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          
          <h1 className="text-4xl font-bold text-white mb-2">
            📱 PWA Setup
          </h1>
          <p className="text-slate-400 text-lg">
            Generate icons and configure your Progressive Web App
          </p>
        </div>

        {/* Icon Generator */}
        <div className="max-w-4xl">
          <PWAIconGenerator />
        </div>

        {/* Installation Instructions */}
        <div className="max-w-4xl mt-8 p-6 rounded-xl bg-slate-900/50 border border-slate-700">
          <h2 className="text-2xl font-bold text-white mb-4">📖 How to Install the App</h2>
          
          <div className="space-y-6">
            {/* Android Chrome */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">📱 Android (Chrome)</h3>
              <ol className="text-slate-300 space-y-1 ml-4 list-decimal">
                <li>Open IndexpilotAI in Chrome browser</li>
                <li>Look for the install prompt at the bottom of the screen</li>
                <li>Tap "Install App" or tap the menu (⋮) → "Add to Home screen"</li>
                <li>Confirm installation</li>
                <li>App icon will appear on your home screen!</li>
              </ol>
            </div>

            {/* iPhone Safari */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">📱 iPhone (Safari)</h3>
              <ol className="text-slate-300 space-y-1 ml-4 list-decimal">
                <li>Open IndexpilotAI in Safari browser</li>
                <li>Tap the Share button (square with arrow)</li>
                <li>Scroll down and tap "Add to Home Screen"</li>
                <li>Edit the name if needed, then tap "Add"</li>
                <li>App icon will appear on your home screen!</li>
              </ol>
            </div>

            {/* Desktop Chrome */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">💻 Desktop (Chrome/Edge)</h3>
              <ol className="text-slate-300 space-y-1 ml-4 list-decimal">
                <li>Open IndexpilotAI in Chrome or Edge</li>
                <li>Look for the install icon (⊕) in the address bar</li>
                <li>Click the icon or the install prompt</li>
                <li>Click "Install"</li>
                <li>App will open in its own window!</li>
              </ol>
            </div>

            {/* Desktop Mac */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">💻 Mac (Safari)</h3>
              <ol className="text-slate-300 space-y-1 ml-4 list-decimal">
                <li>Open IndexpilotAI in Safari</li>
                <li>Click File → "Add to Dock"</li>
                <li>Or Share button → "Add to Dock"</li>
                <li>App icon will appear in your Dock!</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="max-w-4xl mt-8 p-6 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20">
          <h2 className="text-2xl font-bold text-white mb-4">✨ Why Install?</h2>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
              <div>
                <h3 className="text-white font-semibold">Faster Access</h3>
                <p className="text-slate-400 text-sm">Launch instantly from your home screen or desktop</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
              <div>
                <h3 className="text-white font-semibold">Native Experience</h3>
                <p className="text-slate-400 text-sm">Opens in app mode without browser UI</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
              <div>
                <h3 className="text-white font-semibold">Offline Support</h3>
                <p className="text-slate-400 text-sm">Access cached content even without internet</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-2" />
              <div>
                <h3 className="text-white font-semibold">Better Performance</h3>
                <p className="text-slate-400 text-sm">Faster loading with service worker caching</p>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="max-w-4xl mt-8 p-6 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <h2 className="text-2xl font-bold text-white mb-4">🔧 Troubleshooting</h2>
          
          <div className="space-y-3 text-slate-300">
            <div>
              <h3 className="font-semibold text-yellow-300">Install button doesn't appear?</h3>
              <p className="text-sm text-slate-400">
                Use your browser's menu → "Add to Home Screen" or "Install App" option
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-yellow-300">Already installed but can't find the icon?</h3>
              <p className="text-sm text-slate-400">
                On Android: Check app drawer. On iPhone: Swipe right on home screen to search.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-yellow-300">Need to reinstall?</h3>
              <p className="text-sm text-slate-400">
                Long-press the app icon → Remove. Then visit the website again to reinstall.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
