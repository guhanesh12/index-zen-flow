// @ts-nocheck
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  TrendingUp, TrendingDown, Zap, Target, DollarSign, Activity,
  BarChart3, Bell, CheckCircle2, AlertCircle, Clock, Smartphone, Monitor
} from 'lucide-react';

// Desktop Dashboard Preview with Real Animations
export function DesktopDashboardPreview() {
  const [activeSignal, setActiveSignal] = useState(0);
  const [profit, setProfit] = useState(45000);
  const [showOrder, setShowOrder] = useState(false);
  const [positions, setPositions] = useState([
    { symbol: 'NIFTY 50 CE', profit: 12500, status: 'profit' },
    { symbol: 'BANKNIFTY PE', profit: 8750, status: 'profit' }
  ]);

  // Animate signals every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSignal((prev) => (prev + 1) % 3);
      setShowOrder(true);
      setTimeout(() => setShowOrder(false), 1500);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Animate profit counter
  useEffect(() => {
    const interval = setInterval(() => {
      setProfit((prev) => prev + Math.floor(Math.random() * 500) + 100);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const signals = [
    { type: 'BUY', symbol: 'NIFTY 50 CE', price: '23,450', confidence: '94%', color: 'from-green-500 to-green-600' },
    { type: 'SELL', symbol: 'BANKNIFTY PE', price: '45,230', confidence: '91%', color: 'from-red-500 to-red-600' },
    { type: 'BUY', symbol: 'SENSEX CE', price: '76,890', confidence: '96%', color: 'from-cyan-500 to-cyan-600' }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-lg p-6 relative overflow-hidden"
    >
      {/* Background Animation */}
      <div className="absolute inset-0 opacity-20">
        <motion.div
          className="absolute top-0 left-0 w-64 h-64 bg-cyan-500 rounded-full blur-3xl"
          animate={{ x: [0, 100, 0], y: [0, 50, 0] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500 rounded-full blur-3xl"
          animate={{ x: [0, -100, 0], y: [0, -50, 0] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg">IndexpilotAI</h3>
              <p className="text-slate-400 text-sm">Live Dashboard</p>
            </div>
          </div>
          <motion.div
            className="flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded-lg"
            animate={{ boxShadow: ['0 0 0px rgba(34, 197, 94, 0)', '0 0 20px rgba(34, 197, 94, 0.5)', '0 0 0px rgba(34, 197, 94, 0)'] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 font-semibold text-sm">LIVE</span>
          </motion.div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <motion.div
            className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl p-4"
            whileHover={{ scale: 1.02, y: -2 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Total Profit</span>
              <DollarSign className="w-4 h-4 text-green-400" />
            </div>
            <motion.div
              key={profit}
              initial={{ scale: 1.2, color: '#22c55e' }}
              animate={{ scale: 1, color: '#ffffff' }}
              className="text-2xl font-bold text-white"
            >
              ₹{profit.toLocaleString('en-IN')}
            </motion.div>
            <div className="text-xs text-green-400 flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" />
              +12.5%
            </div>
          </motion.div>

          <motion.div
            className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl p-4"
            whileHover={{ scale: 1.02, y: -2 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Win Rate</span>
              <Target className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-bold text-white">68.5%</div>
            <div className="text-xs text-cyan-400 flex items-center gap-1 mt-1">
              <Activity className="w-3 h-3" />
              High Accuracy
            </div>
          </motion.div>

          <motion.div
            className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl p-4"
            whileHover={{ scale: 1.02, y: -2 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">Active Trades</span>
              <Activity className="w-4 h-4 text-yellow-400" />
            </div>
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-2xl font-bold text-white"
            >
              {positions.length}
            </motion.div>
            <div className="text-xs text-yellow-400 flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" />
              Monitoring
            </div>
          </motion.div>

          <motion.div
            className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl p-4"
            whileHover={{ scale: 1.02, y: -2 }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 text-sm">AI Signals</span>
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-white">24</div>
            <div className="text-xs text-purple-400 flex items-center gap-1 mt-1">
              <Zap className="w-3 h-3" />
              Today
            </div>
          </motion.div>
        </div>

        {/* AI Signal Section */}
        <div className="grid grid-cols-2 gap-6">
          {/* Active Signal */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Live AI Signals
            </h4>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSignal}
                initial={{ opacity: 0, x: -50, rotateY: 90 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, x: 50, rotateY: -90 }}
                transition={{ duration: 0.5 }}
                className="bg-slate-800/70 backdrop-blur-xl border border-slate-700 rounded-xl p-5 relative overflow-hidden"
              >
                <motion.div
                  className={`absolute inset-0 bg-gradient-to-r ${signals[activeSignal].color} opacity-10`}
                  animate={{ opacity: [0.05, 0.15, 0.05] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-3">
                    <motion.div
                      className={`px-3 py-1 rounded-lg text-white font-bold text-sm bg-gradient-to-r ${signals[activeSignal].color}`}
                      animate={{ boxShadow: ['0 0 0px rgba(0,0,0,0)', '0 0 20px rgba(6, 182, 212, 0.6)', '0 0 0px rgba(0,0,0,0)'] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {signals[activeSignal].type}
                    </motion.div>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <Zap className="w-5 h-5 text-yellow-400" />
                    </motion.div>
                  </div>
                  <div className="text-white font-bold text-lg mb-1">{signals[activeSignal].symbol}</div>
                  <div className="text-slate-300 text-sm mb-2">Entry: ₹{signals[activeSignal].price}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Confidence</span>
                    <span className="text-green-400 font-bold">{signals[activeSignal].confidence}</span>
                  </div>
                  <motion.div
                    className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden"
                    initial={{ width: '0%' }}
                  >
                    <motion.div
                      className="h-full bg-gradient-to-r from-green-500 to-cyan-500"
                      initial={{ width: '0%' }}
                      animate={{ width: signals[activeSignal].confidence }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                  </motion.div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Order Execution Animation */}
            <AnimatePresence>
              {showOrder && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.8 }}
                  className="bg-green-500/20 border border-green-500/50 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1], rotate: [0, 360] }}
                      transition={{ duration: 0.5 }}
                    >
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                    </motion.div>
                    <div>
                      <div className="text-white font-semibold">Order Executed!</div>
                      <div className="text-green-400 text-sm">Trade placed successfully</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Active Positions */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Active Positions
            </h4>
            <div className="space-y-3">
              {positions.map((position, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="bg-slate-800/70 backdrop-blur-xl border border-slate-700 rounded-xl p-4"
                  whileHover={{ scale: 1.02, borderColor: 'rgba(6, 182, 212, 0.5)' }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white font-semibold text-sm">{position.symbol}</div>
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1, repeat: Infinity, delay: index * 0.3 }}
                      className="flex items-center gap-1"
                    >
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <span className="text-green-400 font-bold text-sm">
                        +₹{position.profit.toLocaleString('en-IN')}
                      </span>
                    </motion.div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-green-500 to-cyan-500"
                        initial={{ width: '0%' }}
                        animate={{ width: '70%' }}
                        transition={{ duration: 1.5, delay: index * 0.2 }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">70%</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Mobile Dashboard Preview
export function MobileDashboardPreview() {
  const [profit, setProfit] = useState(28500);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProfit((prev) => prev + Math.floor(Math.random() * 300) + 50);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const tabs = ['Signals', 'Positions', 'Analytics'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-sm mx-auto h-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-3xl p-4 relative overflow-hidden border-4 border-slate-800"
    >
      {/* Mobile Status Bar */}
      <div className="flex items-center justify-between text-white text-xs mb-4 px-2">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 border border-white rounded-sm">
            <div className="w-2 h-full bg-white" />
          </div>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm">IndexpilotAI</h3>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-400 text-xs">Live</span>
            </div>
          </div>
        </div>
        <Bell className="w-5 h-5 text-slate-400" />
      </div>

      {/* Profit Card */}
      <motion.div
        className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl p-4 mb-4"
        animate={{ boxShadow: ['0 0 0px rgba(6, 182, 212, 0)', '0 0 30px rgba(6, 182, 212, 0.3)', '0 0 0px rgba(6, 182, 212, 0)'] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <div className="text-slate-300 text-sm mb-1">Today's Profit</div>
        <motion.div
          key={profit}
          initial={{ scale: 1.2, color: '#22c55e' }}
          animate={{ scale: 1, color: '#ffffff' }}
          className="text-3xl font-bold text-white mb-2"
        >
          ₹{profit.toLocaleString('en-IN')}
        </motion.div>
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <TrendingUp className="w-4 h-4" />
          <span>+15.8% from yesterday</span>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 bg-slate-800/50 rounded-xl p-1">
        {tabs.map((tab, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === index
                ? 'bg-cyan-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="space-y-3">
        <AnimatePresence mode="wait">
          {activeTab === 0 && (
            <motion.div
              key="signals"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-2"
            >
              {[
                { type: 'BUY', symbol: 'NIFTY CE', price: '23,450', color: 'green' },
                { type: 'SELL', symbol: 'BANKNIFTY PE', price: '45,230', color: 'red' }
              ].map((signal, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-slate-800/70 border border-slate-700 rounded-xl p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      signal.color === 'green' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                      {signal.type}
                    </span>
                    <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />
                  </div>
                  <div className="text-white font-semibold text-sm mb-1">{signal.symbol}</div>
                  <div className="text-slate-400 text-xs">₹{signal.price}</div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
