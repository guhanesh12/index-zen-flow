// @ts-nocheck
// Notification Bell Button with Badge
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Bell } from 'lucide-react';
import { notificationService } from '@/utils/firebase/notificationService';
import { NotificationCenter } from './NotificationCenter';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasNewNotification, setHasNewNotification] = useState(false);

  useEffect(() => {
    const syncAndUpdate = async () => {
      await notificationService.syncNotificationsFromBackend();
      updateUnreadCount();
    };

    // Load initial count from backend + local cache
    void syncAndUpdate();

    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribe(() => {
      updateUnreadCount();
      setHasNewNotification(true);
      
      // Reset animation after 2 seconds
      setTimeout(() => setHasNewNotification(false), 2000);
    });

    // Keep notifications synced across devices for the same user
    const interval = setInterval(() => {
      void syncAndUpdate();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const updateUnreadCount = () => {
    setUnreadCount(notificationService.getUnreadCount());
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      // Reset "new" animation when opening
      setHasNewNotification(false);
    }
  };

  return (
    <>
      <button
        onClick={handleToggle}
        className="relative p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:bg-zinc-800/50 hover:border-zinc-700 transition-all duration-200 group"
      >
        {/* Bell Icon with Animation */}
        <motion.div
          animate={hasNewNotification ? {
            rotate: [0, -15, 15, -15, 15, 0],
          } : {}}
          transition={{ duration: 0.6 }}
        >
          <Bell className={`w-5 h-5 transition-colors ${
            unreadCount > 0 
              ? 'text-blue-400 group-hover:text-blue-300' 
              : 'text-zinc-400 group-hover:text-zinc-300'
          }`} />
        </motion.div>

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/50"
          >
            <span className="text-white text-xs font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          </motion.div>
        )}

        {/* Pulse Animation for New Notifications */}
        {hasNewNotification && (
          <motion.div
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 bg-blue-500 rounded-xl"
          />
        )}
      </button>

      {/* Notification Center Panel */}
      <NotificationCenter 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  );
}
