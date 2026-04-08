// @ts-nocheck
// 🌟 ADVANCED NOTIFICATION CENTER - World's Most Beautiful UI 🌟
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  BellOff,
  TrendingUp,
  DollarSign,
  CheckCircle,
  MessageCircle,
  Clock,
  Filter,
  Search,
  Trash2,
  CheckCheck,
  X,
  ChevronDown,
  Sparkles
} from 'lucide-react';
import { NotificationData, NotificationType, notificationService } from '@/utils/firebase/notificationService';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [filteredNotifications, setFilteredNotifications] = useState<NotificationData[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<NotificationType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
      checkBrowserNotificationPermission();
    }

    // Subscribe to new notifications
    const unsubscribe = notificationService.subscribe(() => {
      loadNotifications();
    });

    return unsubscribe;
  }, [isOpen]);

  useEffect(() => {
    filterNotifications();
  }, [notifications, selectedFilter, searchQuery]);

  const checkBrowserNotificationPermission = () => {
    if ('Notification' in window) {
      setBrowserNotificationsEnabled(Notification.permission === 'granted');
    }
  };

  const enableBrowserNotifications = async () => {
    const granted = await notificationService.requestPermission();
    setBrowserNotificationsEnabled(granted);
    if (granted) {
      alert('✅ Browser notifications enabled! You will now receive push notifications.');
    } else {
      alert('❌ Browser notifications blocked. Please enable them in your browser settings.');
    }
  };

  const loadNotifications = async () => {
    console.log('📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📬 LOADING NOTIFICATIONS IN NOTIFICATION CENTER');
    console.log('📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    try {
      // Step 1: Sync from backend first (this fetches admin notifications)
      console.log('🔄 Step 1: Syncing from backend...');
      await notificationService.syncNotificationsFromBackend();
      console.log('✅ Backend sync completed');
      
      // Step 2: Load all notifications from localStorage (now includes synced ones)
      console.log('💾 Step 2: Loading all notifications from localStorage...');
      const allNotifications = notificationService.getAllNotifications();
      console.log(`📊 Total notifications loaded: ${allNotifications.length}`);
      
      if (allNotifications.length > 0) {
        console.log('📋 First notification:', allNotifications[0]);
        console.log('📋 Notification types:', [...new Set(allNotifications.map(n => n.type))]);
      } else {
        console.warn('⚠️ No notifications found after sync!');
      }
      
      // Step 3: Update state to trigger UI refresh
      console.log('🎨 Step 3: Updating UI...');
      setNotifications(allNotifications);
      const unread = allNotifications.filter(n => !n.read).length;
      setUnreadCount(unread);
      console.log(`✅ UI updated: ${allNotifications.length} total, ${unread} unread`);
      
    } catch (error) {
      console.error('❌ Error loading notifications:', error);
    }
    
    console.log('📬 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  };

  const filterNotifications = () => {
    let filtered = [...notifications];

    // Filter by type - FIXED LOGIC
    if (selectedFilter !== 'ALL') {
      if (selectedFilter === 'MARKET_OPEN') {
        // Market filter includes both MARKET_OPEN and MARKET_CLOSED
        filtered = filtered.filter(n => n.type === 'MARKET_OPEN' || n.type === 'MARKET_CLOSED');
      } else {
        // All other filters match exact type
        filtered = filtered.filter(n => n.type === selectedFilter);
      }
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query) ||
        n.data?.symbol?.toLowerCase().includes(query) ||
        n.data?.index?.toLowerCase().includes(query)
      );
    }

    setFilteredNotifications(filtered);
    console.log('🔍 FILTER DEBUG:', {
      selectedFilter,
      totalNotifications: notifications.length,
      filteredCount: filtered.length,
      searchQuery
    });
  };

  const handleMarkAllRead = () => {
    notificationService.markAllAsRead();
    loadNotifications();
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all notifications?')) {
      notificationService.clearAll();
      loadNotifications();
    }
  };

  const handleNotificationClick = (notification: NotificationData) => {
    if (!notification.read) {
      notificationService.markAsRead(notification.id);
      loadNotifications();
    }
    setExpandedId(expandedId === notification.id ? null : notification.id);
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'SIGNAL_DETECTED': return <TrendingUp className="w-4 h-4" />;
      case 'ORDER_PLACED': return <DollarSign className="w-4 h-4" />;
      case 'POSITION_CLOSED': return <CheckCircle className="w-4 h-4" />;
      case 'SUPPORT_REPLY': return <MessageCircle className="w-4 h-4" />;
      case 'MARKET_OPEN':
      case 'MARKET_CLOSED': return <Clock className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: NotificationType) => {
    switch (type) {
      case 'SIGNAL_DETECTED': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'ORDER_PLACED': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'POSITION_CLOSED': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'SUPPORT_REPLY': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'MARKET_OPEN': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'MARKET_CLOSED': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  const filters: { label: string; value: NotificationType | 'ALL'; count: number }[] = [
    { label: 'All', value: 'ALL', count: notifications.length },
    { label: 'Signals', value: 'SIGNAL_DETECTED', count: notifications.filter(n => n.type === 'SIGNAL_DETECTED').length },
    { label: 'Orders', value: 'ORDER_PLACED', count: notifications.filter(n => n.type === 'ORDER_PLACED').length },
    { label: 'Exits', value: 'POSITION_CLOSED', count: notifications.filter(n => n.type === 'POSITION_CLOSED').length },
    { label: 'Support', value: 'SUPPORT_REPLY', count: notifications.filter(n => n.type === 'SUPPORT_REPLY').length },
    { label: 'Market', value: 'MARKET_OPEN', count: notifications.filter(n => n.type === 'MARKET_OPEN' || n.type === 'MARKET_CLOSED').length },
  ];

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 🌑 DARK BLURRED BACKDROP */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md z-[9998]"
            style={{ backdropFilter: 'blur(8px)' }}
          />

          {/* 🎯 ABSOLUTELY CENTERED MODAL - GUARANTEED CENTER! */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[9999] bg-gradient-to-br from-zinc-950 via-zinc-900 to-black rounded-3xl shadow-2xl border border-zinc-700/50 flex flex-col overflow-hidden"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'calc(100% - 2rem)',
              maxWidth: '680px',
              maxHeight: '80vh',
              boxShadow: '0 20px 80px rgba(0, 0, 0, 0.9), 0 0 60px rgba(59, 130, 246, 0.3), 0 0 100px rgba(168, 85, 247, 0.2)'
            }}
          >
            {/* 📌 HEADER WITH CLOSE BUTTON */}
            <div className="border-b border-zinc-800 bg-gradient-to-r from-zinc-900/95 via-zinc-800/95 to-zinc-900/95 backdrop-blur-xl flex-shrink-0">
              <div className="p-4 sm:p-5 md:p-6">
                {/* Title Row with Close Button */}
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/50">
                        <Bell className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                      </div>
                      {unreadCount > 0 && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2 min-w-[22px] h-5 sm:min-w-[24px] sm:h-6 px-1.5 sm:px-2 bg-gradient-to-r from-red-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-red-500/50"
                        >
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </motion.div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                        Notifications
                        <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400 animate-pulse" />
                      </h2>
                      <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">{notifications.length} total • {unreadCount} unread</p>
                    </div>
                  </div>
                  
                  {/* ❌ CLOSE BUTTON - TOP RIGHT */}
                  <button
                    onClick={onClose}
                    className="flex-shrink-0 text-zinc-400 hover:text-white transition-all p-2 sm:p-2.5 rounded-xl hover:bg-white/10 hover:scale-110"
                    aria-label="Close notifications"
                  >
                    <X className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                </div>

                {/* 🔍 Search Bar */}
                <div className="relative mb-3 sm:mb-4">
                  <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search by symbol, index, or message..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-2.5 sm:py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>

                {/* 🏷️ Filter Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3 sm:mb-4">
                  {filters.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setSelectedFilter(filter.value)}
                      className={`
                        flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap
                        ${selectedFilter === filter.value
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg shadow-blue-500/50'
                          : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700/50 hover:text-white border border-zinc-700/50'
                        }
                      `}
                    >
                      {filter.label}
                      {filter.count > 0 && (
                        <span className={`
                          px-1.5 sm:px-2 py-0.5 rounded-full text-xs font-bold
                          ${selectedFilter === filter.value ? 'bg-white/20 text-white' : 'bg-zinc-700 text-zinc-300'}
                        `}>
                          {filter.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* 🔔 Browser Notification Banner */}
                {!browserNotificationsEnabled && (
                  <div className="mb-3 sm:mb-4 p-3 bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-xl">
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <BellOff className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-orange-400">Push Notifications Disabled</p>
                          <p className="text-xs text-orange-300/70 hidden sm:block">Enable to receive real-time trading alerts</p>
                        </div>
                      </div>
                      <Button
                        onClick={enableBrowserNotifications}
                        variant="outline"
                        size="sm"
                        className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10 text-xs whitespace-nowrap px-3 sm:px-4 flex-shrink-0"
                      >
                        Enable
                      </Button>
                    </div>
                  </div>
                )}

                {browserNotificationsEnabled && (
                  <div className="mb-3 sm:mb-4 p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-green-400">Push Notifications Active ✓</p>
                        <p className="text-xs text-green-300/70 hidden sm:block">You'll receive real-time alerts for all trading events</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ⚡ Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleMarkAllRead}
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-white text-xs h-8 sm:h-9 hover:bg-white/5"
                    disabled={unreadCount === 0}
                  >
                    <CheckCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">Mark All Read</span>
                    <span className="sm:hidden">Mark Read</span>
                  </Button>
                  <Button
                    onClick={handleClearAll}
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs h-8 sm:h-9"
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    Clear All
                  </Button>
                </div>
              </div>
            </div>

            {/* 📜 SCROLLABLE NOTIFICATION LIST */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar min-h-0">
              {filteredNotifications.length === 0 ? (
                // Empty State
                <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-16">
                  <div className="w-24 h-24 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-3xl flex items-center justify-center mb-6 shadow-2xl">
                    <BellOff className="w-12 h-12 opacity-50" />
                  </div>
                  <p className="text-base font-semibold text-zinc-400">No notifications yet</p>
                  <p className="text-sm mt-2 text-zinc-600">You're all caught up!</p>
                  {notifications.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedFilter('ALL');
                        setSearchQuery('');
                      }}
                      className="mt-4 px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold transition-all"
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              ) : (
                // Notification Cards
                <AnimatePresence mode="popLayout">
                  {filteredNotifications.map((notification, index) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      transition={{ delay: index * 0.04 }}
                      onClick={() => handleNotificationClick(notification)}
                      className={`
                        relative p-4 rounded-2xl border cursor-pointer
                        transition-all duration-300 hover:scale-[1.02]
                        ${notification.read
                          ? 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800/50 hover:border-zinc-700'
                          : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30 hover:border-blue-500/50 shadow-lg shadow-blue-500/10'
                        }
                      `}
                    >
                      {/* Unread Indicator */}
                      {!notification.read && (
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-blue-500 via-purple-500 to-pink-500 rounded-l-2xl" />
                      )}

                      <div className="flex gap-4">
                        {/* Icon */}
                        <div className={`
                          flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border shadow-lg
                          ${getTypeColor(notification.type)}
                        `}>
                          {getTypeIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1 flex items-center gap-2">
                              <h4 className="text-white font-bold text-sm leading-tight">
                                {notification.title}
                              </h4>
                              {!notification.read && (
                                <span className="px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full shadow-lg shadow-blue-500/50">
                                  NEW
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-zinc-500 whitespace-nowrap font-medium">
                              {formatTime(notification.timestamp)}
                            </span>
                          </div>

                          <p className="text-zinc-400 text-sm leading-relaxed mb-2">
                            {notification.message}
                          </p>

                          {/* Admin Notification Image (if exists) */}
                          {notification.data?.imageUrl && (
                            <div className="mt-3 mb-3 rounded-xl overflow-hidden border border-zinc-700/50">
                              <img 
                                src={notification.data.imageUrl} 
                                alt={notification.title}
                                className="w-full h-auto max-h-64 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}

                          {/* Admin Notification Target URL (if exists) */}
                          {notification.data?.targetUrl && (
                            <a
                              href={notification.data.targetUrl}
                              className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
                            >
                              <span>View Details</span>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                              </svg>
                            </a>
                          )}

                          {/* Expandable Details */}
                          <AnimatePresence>
                            {expandedId === notification.id && notification.data && (() => {
                              // Filter out imageUrl, targetUrl, and fromAdmin from expandable details
                              const detailsData = Object.entries(notification.data).filter(
                                ([key]) => key !== 'imageUrl' && key !== 'targetUrl' && key !== 'fromAdmin'
                              );
                              return detailsData.length > 0;
                            })() && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="mt-3 pt-3 border-t border-zinc-700/50"
                              >
                                <div className="grid grid-cols-2 gap-2">
                                  {Object.entries(notification.data)
                                    .filter(([key]) => key !== 'imageUrl' && key !== 'targetUrl' && key !== 'fromAdmin')
                                    .map(([key, value]) => (
                                      value !== undefined && value !== null && (
                                        <div key={key} className="bg-zinc-800/80 rounded-xl p-3 border border-zinc-700/50">
                                          <span className="text-zinc-500 text-xs font-medium capitalize block mb-1">
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                          </span>
                                          <p className="text-white text-sm font-bold">
                                            {typeof value === 'number' && key === 'pnl'
                                              ? `${value >= 0 ? '+' : ''}₹${value.toFixed(2)}`
                                              : typeof value === 'number' && key === 'price'
                                              ? `₹${value.toFixed(2)}`
                                              : String(value)}
                                          </p>
                                        </div>
                                      )
                                    ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Expand Button - Only show if there are expandable details (excluding imageUrl, targetUrl, fromAdmin) */}
                          {notification.data && (() => {
                            const detailsData = Object.entries(notification.data).filter(
                              ([key]) => key !== 'imageUrl' && key !== 'targetUrl' && key !== 'fromAdmin'
                            );
                            return detailsData.length > 0;
                          })() && (
                            <button className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 mt-3 transition-colors">
                              <span>{expandedId === notification.id ? 'Hide Details' : 'View Details'}</span>
                              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${expandedId === notification.id ? 'rotate-180' : ''}`} />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}