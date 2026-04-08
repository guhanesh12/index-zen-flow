import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X, Check } from 'lucide-react';
import { Button } from './ui/button';
import { subscribeToPushNotifications, isPushNotificationsEnabled } from '../utils/pushNotifications';

interface NotificationSubscriptionPromptProps {
  serverUrl: string;
  userId?: string;
}

export function NotificationSubscriptionPrompt({ serverUrl, userId }: NotificationSubscriptionPromptProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    if (!('Notification' in window)) {
      return;
    }

    // Check if already subscribed
    if (isPushNotificationsEnabled()) {
      setSubscribed(true);
      return;
    }

    // Check if user has denied permission
    if (Notification.permission === 'denied') {
      return;
    }

    // Show prompt after 5 seconds if not subscribed
    const timer = setTimeout(() => {
      if (!isPushNotificationsEnabled() && Notification.permission !== 'denied') {
        setShowPrompt(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleSubscribe = async () => {
    setSubscribing(true);

    try {
      const result = await subscribeToPushNotifications(serverUrl, userId);

      if (result.success) {
        setSubscribed(true);
        setShowPrompt(false);
        
        // Show success message
        setTimeout(() => {
          alert('✅ You will now receive push notifications for trading alerts and updates!');
        }, 300);
      } else {
        alert('❌ Failed to enable notifications: ' + result.error);
      }
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setSubscribing(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    
    // Don't show again for this session
    sessionStorage.setItem('notification_prompt_dismissed', 'true');
  };

  if (subscribed) {
    return null;
  }

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 right-6 z-[9998] max-w-sm"
        >
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-cyan-500/30 rounded-lg shadow-2xl p-5">
            {/* Close Button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors"
            >
              <X className="size-4" />
            </button>

            {/* Content */}
            <div className="flex items-start gap-4">
              <div className="size-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Bell className="size-6 text-white" />
              </div>

              <div className="flex-1">
                <h3 className="text-white font-semibold mb-1">
                  Enable Push Notifications
                </h3>
                <p className="text-slate-300 text-sm mb-4">
                  Get real-time alerts for trading signals, market updates, and important notifications.
                </p>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
                    size="sm"
                  >
                    {subscribing ? (
                      <>
                        <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Enabling...
                      </>
                    ) : (
                      <>
                        <Check className="size-4 mr-2" />
                        Enable
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleDismiss}
                    variant="ghost"
                    className="text-slate-400 hover:text-white"
                    size="sm"
                  >
                    Later
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default NotificationSubscriptionPrompt;
