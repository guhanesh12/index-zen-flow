// @ts-nocheck
// 🌟 WORLD'S MOST ADVANCED NOTIFICATION TOAST UI 🌟
// Unique glassmorphism design with animations
import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, DollarSign, CheckCircle, MessageCircle, Clock, Bell, AlertCircle } from 'lucide-react';
import { NotificationData, NotificationType } from '@/utils/firebase/notificationService';

interface NotificationToastProps {
  notification: NotificationData;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
}

export const NotificationToast = React.forwardRef<HTMLDivElement, NotificationToastProps>(
  ({ notification, onDismiss, onRead }, ref) => {
    const [progress, setProgress] = useState(100);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    
    const autoDismissTime = 7000; // 7 seconds

    useEffect(() => {
      const interval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev - (100 / (autoDismissTime / 100));
          if (newProgress <= 0) {
            onDismiss(notification.id);
            return 0;
          }
          return newProgress;
        });
      }, 100);

      return () => clearInterval(interval);
    }, [notification.id, onDismiss]);

    // Get color scheme based on notification type
    const getTypeConfig = (type: NotificationType) => {
      switch (type) {
        case 'SIGNAL_DETECTED':
          return {
            gradient: 'from-blue-500/20 via-cyan-500/20 to-blue-600/20',
            border: 'border-blue-500/50',
            glow: 'shadow-blue-500/50',
            icon: TrendingUp,
            iconColor: 'text-blue-400',
            bgColor: 'bg-blue-500/10',
            accentColor: 'bg-blue-500'
          };
        case 'ORDER_PLACED':
          return {
            gradient: 'from-green-500/20 via-emerald-500/20 to-green-600/20',
            border: 'border-green-500/50',
            glow: 'shadow-green-500/50',
            icon: DollarSign,
            iconColor: 'text-green-400',
            bgColor: 'bg-green-500/10',
            accentColor: 'bg-green-500'
          };
        case 'POSITION_CLOSED':
          const isProfitable = (notification.data?.pnl || 0) >= 0;
          return {
            gradient: isProfitable 
              ? 'from-emerald-500/20 via-green-500/20 to-emerald-600/20'
              : 'from-red-500/20 via-rose-500/20 to-red-600/20',
            border: isProfitable ? 'border-emerald-500/50' : 'border-red-500/50',
            glow: isProfitable ? 'shadow-emerald-500/50' : 'shadow-red-500/50',
            icon: CheckCircle,
            iconColor: isProfitable ? 'text-emerald-400' : 'text-red-400',
            bgColor: isProfitable ? 'bg-emerald-500/10' : 'bg-red-500/10',
            accentColor: isProfitable ? 'bg-emerald-500' : 'bg-red-500'
          };
        case 'SUPPORT_REPLY':
          return {
            gradient: 'from-purple-500/20 via-violet-500/20 to-purple-600/20',
            border: 'border-purple-500/50',
            glow: 'shadow-purple-500/50',
            icon: MessageCircle,
            iconColor: 'text-purple-400',
            bgColor: 'bg-purple-500/10',
            accentColor: 'bg-purple-500'
          };
        case 'MARKET_OPEN':
          return {
            gradient: 'from-cyan-500/20 via-teal-500/20 to-cyan-600/20',
            border: 'border-cyan-500/50',
            glow: 'shadow-cyan-500/50',
            icon: Bell,
            iconColor: 'text-cyan-400',
            bgColor: 'bg-cyan-500/10',
            accentColor: 'bg-cyan-500'
          };
        case 'MARKET_CLOSED':
          return {
            gradient: 'from-orange-500/20 via-amber-500/20 to-orange-600/20',
            border: 'border-orange-500/50',
            glow: 'shadow-orange-500/50',
            icon: Clock,
            iconColor: 'text-orange-400',
            bgColor: 'bg-orange-500/10',
            accentColor: 'bg-orange-500'
          };
        default:
          return {
            gradient: 'from-zinc-500/20 via-slate-500/20 to-zinc-600/20',
            border: 'border-zinc-500/50',
            glow: 'shadow-zinc-500/50',
            icon: AlertCircle,
            iconColor: 'text-zinc-400',
            bgColor: 'bg-zinc-500/10',
            accentColor: 'bg-zinc-500'
          };
      }
    };

    const config = getTypeConfig(notification.type);
    const Icon = config.icon;

    const formatTime = (timestamp: number) => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    };

    const handleClick = () => {
      if (!notification.read) {
        onRead(notification.id);
      }
      setIsExpanded(!isExpanded);
    };

    return (
      <motion.div
        initial={{ x: 400, opacity: 0, scale: 0.9 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ 
          x: isDragging ? 400 : -400, 
          opacity: 0, 
          scale: 0.8,
          transition: { duration: 0.3 }
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(e, info) => {
          setIsDragging(false);
          if (Math.abs(info.offset.x) > 100) {
            onDismiss(notification.id);
          }
        }}
        className={`
          relative w-full max-w-md mb-3 cursor-pointer
          backdrop-blur-2xl rounded-2xl border-2
          ${config.border} ${config.glow}
          bg-gradient-to-br ${config.gradient}
          shadow-2xl overflow-hidden
          transform transition-all duration-300
          hover:scale-105 hover:shadow-3xl
        `}
        onClick={handleClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        ref={ref}
      >
        {/* Animated Background Glow */}
        <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-50 animate-pulse`} />
        
        {/* Glassmorphism Overlay */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" />
        
        {/* Content */}
        <div className="relative p-4">
          <div className="flex items-start gap-3">
            {/* Animated Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className={`
                flex-shrink-0 w-12 h-12 rounded-xl
                ${config.bgColor} ${config.iconColor}
                flex items-center justify-center
                shadow-lg border border-white/10
                relative overflow-hidden
              `}
            >
              {/* Icon glow effect */}
              <div className={`absolute inset-0 ${config.accentColor} opacity-20 blur-xl animate-pulse`} />
              <Icon className="w-6 h-6 relative z-10" />
            </motion.div>

            {/* Text Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-white font-bold text-sm leading-tight">
                  {notification.title}
                </h4>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notification.id);
                  }}
                  className="flex-shrink-0 text-zinc-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-zinc-300 text-xs mt-1 leading-relaxed">
                {notification.message}
              </p>

              {/* Expandable Details */}
              <AnimatePresence>
                {isExpanded && notification.data && Object.keys(notification.data).length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-3 pt-3 border-t border-white/10"
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {notification.data.index && (
                        <div className="bg-white/5 rounded-lg p-2">
                          <span className="text-zinc-400">Index</span>
                          <p className="text-white font-semibold">{notification.data.index}</p>
                        </div>
                      )}
                      {notification.data.symbol && (
                        <div className="bg-white/5 rounded-lg p-2">
                          <span className="text-zinc-400">Symbol</span>
                          <p className="text-white font-semibold">{notification.data.symbol}</p>
                        </div>
                      )}
                      {notification.data.action && (
                        <div className="bg-white/5 rounded-lg p-2">
                          <span className="text-zinc-400">Action</span>
                          <p className={`font-bold ${
                            notification.data.action === 'BUY' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {notification.data.action}
                          </p>
                        </div>
                      )}
                      {notification.data.quantity && (
                        <div className="bg-white/5 rounded-lg p-2">
                          <span className="text-zinc-400">Quantity</span>
                          <p className="text-white font-semibold">{notification.data.quantity}</p>
                        </div>
                      )}
                      {notification.data.price !== undefined && (
                        <div className="bg-white/5 rounded-lg p-2">
                          <span className="text-zinc-400">Price</span>
                          <p className="text-white font-semibold">₹{notification.data.price}</p>
                        </div>
                      )}
                      {notification.data.pnl !== undefined && (
                        <div className="bg-white/5 rounded-lg p-2">
                          <span className="text-zinc-400">P&L</span>
                          <p className={`font-bold ${
                            notification.data.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {notification.data.pnl >= 0 ? '+' : ''}₹{notification.data.pnl.toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Timestamp */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-zinc-500 text-xs">
                  {formatTime(notification.timestamp)}
                </span>
                {!notification.read && (
                  <span className={`${config.accentColor} w-2 h-2 rounded-full animate-pulse`} />
                )}
              </div>
            </div>
          </div>

          {/* Auto-dismiss Progress Bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
            <motion.div
              className={`h-full ${config.accentColor} opacity-70`}
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        </div>

        {/* Shimmer Effect */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent transform -skew-x-12 animate-shimmer" />
        </div>
      </motion.div>
    );
  }
);

NotificationToast.displayName = 'NotificationToast';