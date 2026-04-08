// Notification Toast Container - Manages all active notifications
import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { NotificationToast } from './NotificationToast';
import { NotificationData, notificationService } from '@/utils/firebase/notificationService';

export function NotificationContainer() {
  const [activeNotifications, setActiveNotifications] = useState<NotificationData[]>([]);
  const maxVisible = 5; // Maximum number of visible notifications

  useEffect(() => {
    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribe((notification) => {
      setActiveNotifications(prev => {
        // Add new notification at the top
        const updated = [notification, ...prev];
        // Keep only the most recent notifications
        return updated.slice(0, maxVisible);
      });
    });

    return unsubscribe;
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setActiveNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const handleRead = useCallback((id: string) => {
    // Use setTimeout to avoid setState during render warnings
    setTimeout(() => {
      notificationService.markAsRead(id);
    }, 0);
  }, []);

  return (
    <div className="fixed top-4 right-4 z-[9999] pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md">
        <AnimatePresence mode="popLayout">
          {activeNotifications.map((notification) => (
            <NotificationToast
              key={notification.id}
              notification={notification}
              onDismiss={handleDismiss}
              onRead={handleRead}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

NotificationContainer.displayName = 'NotificationContainer';