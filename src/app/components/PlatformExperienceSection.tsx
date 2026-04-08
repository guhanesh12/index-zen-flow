import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Monitor, Smartphone, TrendingUp, TrendingDown, Zap, Target,
  Activity, DollarSign, BarChart3, Clock, CheckCircle2, AlertCircle,
  Bell, Play, Pause, ArrowRight, Sparkles, LineChart
} from 'lucide-react';

export function PlatformExperienceSection() {
  const [activeView, setActiveView] = useState<'desktop' | 'mobile'>('desktop');
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 via-black to-slate-950 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-30">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
            x: [0, 50, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.3, 0.2],
            x: [0, -50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <motion.div
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 mb-6"
            animate={{
              boxShadow: [
                '0 0 0px rgba(6, 182, 212, 0)',
                '0 0 30px rgba(6, 182, 212, 0.3)',
                '0 0 0px rgba(6, 182, 212, 0)'
              ]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <span className="text-sm text-cyan-400 font-semibold">Live Dashboard Experience</span>
          </motion.div>

          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Experience the{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Platform
            </span>
          </h2>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto">
            Powerful trading dashboard designed for desktop and mobile
          </p>
        </motion.div>

        {/* View Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-4 mb-12"
        >
          <div className="flex gap-2 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-2">
            <motion.button
              onClick={() => setActiveView('desktop')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-6 py-3 rounded-xl flex items-center gap-3 font-medium transition-all ${
                activeView === 'desktop'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Monitor className="w-5 h-5" />
              Desktop Experience
            </motion.button>
            <motion.button
              onClick={() => setActiveView('mobile')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-6 py-3 rounded-xl flex items-center gap-3 font-medium transition-all ${
                activeView === 'mobile'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Smartphone className="w-5 h-5" />
              Mobile Experience
            </motion.button>
          </div>
        </motion.div>

        {/* Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="relative"
        >
          <AnimatePresence mode="wait">
            {activeView === 'desktop' ? (
              <DesktopDashboardExperience key="desktop" />
            ) : (
              <MobileDashboardExperience key="mobile" />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="grid md:grid-cols-3 gap-6 mt-16"
        >
          {[
            {
              icon: Zap,
              title: 'Real-Time Signals',
              description: 'AI-powered signals with live updates and confidence scores'
            },
            {
              icon: Activity,
              title: 'Live Position Tracking',
              description: 'Monitor all your trades with real-time P&L updates'
            },
            {
              icon: BarChart3,
              title: 'Advanced Analytics',
              description: 'Detailed performance charts and risk analysis'
            }
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 + index * 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 group cursor-pointer"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:shadow-lg group-hover:shadow-cyan-500/30 transition-all">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Desktop Dashboard Experience with Real UI
function DesktopDashboardExperience() {
  const [profit, setProfit] = useState(67500);
  const [activeSignal, setActiveSignal] = useState(0);
  const [showOrderAlert, setShowOrderAlert] = useState(false);
  const [positions, setPositions] = useState([
    { id: 1, symbol: 'NIFTY 50 CE', entry: 23450, current: 23890, qty: 50, pnl: 22000, pnlPercent: 8.5 },
    { id: 2, symbol: 'BANKNIFTY PE', entry: 45230, current: 46120, qty: 25, pnl: 22250, pnlPercent: 7.8 },
    { id: 3, symbol: 'SENSEX CE', entry: 76890, current: 77540, qty: 15, pnl: 9750, pnlPercent: 4.2 }
  ]);

  const signals = [
    { type: 'BUY', symbol: 'NIFTY 50 CE', entry: '23,450', target: '24,200', sl: '23,100', confidence: 94 },
    { type: 'SELL', symbol: 'BANKNIFTY PE', entry: '45,230', target: '44,100', sl: '45,800', confidence: 91 },
    { type: 'BUY', symbol: 'SENSEX CE', entry: '76,890', target: '78,500', sl: '76,200', confidence: 96 }
  ];

  // Cycle through signals
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSignal((prev) => (prev + 1) % signals.length);
      setShowOrderAlert(true);
      setTimeout(() => setShowOrderAlert(false), 2000);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Animate profit
  useEffect(() => {
    const interval = setInterval(() => {
      setProfit((prev) => prev + Math.floor(Math.random() * 500) + 200);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Update positions
  useEffect(() => {
    const interval = setInterval(() => {
      setPositions((prev) =>
        prev.map((pos) => ({
          ...pos,
          current: pos.current + (Math.random() > 0.5 ? 10 : -5),
          pnl: pos.pnl + (Math.random() > 0.5 ? 50 : -20),
          pnlPercent: pos.pnlPercent + (Math.random() > 0.5 ? 0.1 : -0.05)
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: -10 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, rotateY: 10 }}
      transition={{ duration: 0.6 }}
      className="w-full bg-gradient-to-br from-slate-950 via-slate-900 to-black rounded-3xl border-2 border-slate-800 p-8 shadow-2xl relative overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <TrendingUp className="w-7 h-7 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">IndexpilotAI Dashboard</h3>
              <div className="flex items-center gap-2 mt-1">
                <motion.div
                  className="w-2 h-2 bg-green-400 rounded-full"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm text-green-400 font-medium">Live Trading</span>
              </div>
            </div>
          </div>
          <motion.div
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500/20 border border-green-500/30 rounded-xl"
            animate={{
              boxShadow: [
                '0 0 0px rgba(34, 197, 94, 0)',
                '0 0 20px rgba(34, 197, 94, 0.4)',
                '0 0 0px rgba(34, 197, 94, 0)'
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Bell className="w-4 h-4 text-green-400" />
            <span className="text-green-400 font-semibold">3 New Signals</span>
          </motion.div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatsCard
            label="Total Profit"
            value={`₹${profit.toLocaleString('en-IN')}`}
            change="+15.8%"
            icon={DollarSign}
            color="green"
            profit={profit}
          />
          <StatsCard label="Win Rate" value="72.5%" change="+2.3%" icon={Target} color="cyan" />
          <StatsCard label="Active Trades" value={positions.length.toString()} change="Live" icon={Activity} color="yellow" />
          <StatsCard label="Today's Signals" value="28" change="+5" icon={Zap} color="purple" />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* AI Signals Panel */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-yellow-400" />
              Live AI Signals
            </h4>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSignal}
                initial={{ opacity: 0, x: -30, rotateY: 90 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, x: 30, rotateY: -90 }}
                transition={{ duration: 0.5 }}
                className="bg-slate-800/70 backdrop-blur-xl border border-slate-700 rounded-2xl p-5 relative overflow-hidden"
              >
                <motion.div
                  className={`absolute inset-0 ${
                    signals[activeSignal].type === 'BUY'
                      ? 'bg-gradient-to-r from-green-500/10 to-green-600/10'
                      : 'bg-gradient-to-r from-red-500/10 to-red-600/10'
                  }`}
                  animate={{ opacity: [0.1, 0.2, 0.1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <motion.div
                      className={`px-4 py-1.5 rounded-lg font-bold text-white text-sm ${
                        signals[activeSignal].type === 'BUY' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      animate={{
                        boxShadow: [
                          '0 0 0px rgba(0,0,0,0)',
                          '0 0 15px rgba(6, 182, 212, 0.5)',
                          '0 0 0px rgba(0,0,0,0)'
                        ]
                      }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {signals[activeSignal].type}
                    </motion.div>
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                      <Zap className="w-5 h-5 text-yellow-400" />
                    </motion.div>
                  </div>
                  <div className="text-white font-bold text-xl mb-3">{signals[activeSignal].symbol}</div>
                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Entry</div>
                      <div className="text-white font-semibold">₹{signals[activeSignal].entry}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Target</div>
                      <div className="text-green-400 font-semibold">₹{signals[activeSignal].target}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs mb-1">Stop Loss</div>
                      <div className="text-red-400 font-semibold">₹{signals[activeSignal].sl}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">AI Confidence</span>
                    <span className="text-cyan-400 font-bold">{signals[activeSignal].confidence}%</span>
                  </div>
                  <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      initial={{ width: '0%' }}
                      animate={{ width: `${signals[activeSignal].confidence}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Order Execution Alert */}
            <AnimatePresence>
              {showOrderAlert && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -20, scale: 0.8 }}
                  className="bg-green-500/20 border border-green-500/50 rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <motion.div animate={{ scale: [1, 1.3, 1], rotate: [0, 360] }} transition={{ duration: 0.5 }}>
                      <CheckCircle2 className="w-6 h-6 text-green-400" />
                    </motion.div>
                    <div>
                      <div className="text-white font-semibold">Order Executed!</div>
                      <div className="text-green-400 text-sm">Position opened successfully</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Positions Panel */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Active Positions
            </h4>
            <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
              {positions.map((position, index) => (
                <motion.div
                  key={position.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-slate-800/70 backdrop-blur-xl border border-slate-700 rounded-xl p-4 hover:border-cyan-500/50 transition-all cursor-pointer"
                  whileHover={{ scale: 1.02, y: -2 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-white font-semibold">{position.symbol}</div>
                    <motion.div
                      animate={{ scale: [1, 1.15, 1] }}
                      transition={{ duration: 1, repeat: Infinity, delay: index * 0.3 }}
                      className={`flex items-center gap-1 ${
                        position.pnl > 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {position.pnl > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="font-bold">₹{position.pnl.toLocaleString('en-IN')}</span>
                    </motion.div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                    <div>
                      <div className="text-slate-400">Entry</div>
                      <div className="text-white font-medium">₹{position.entry.toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Current</div>
                      <div className="text-cyan-400 font-medium">₹{position.current.toLocaleString('en-IN')}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Qty</div>
                      <div className="text-white font-medium">{position.qty}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${
                          position.pnl > 0
                            ? 'bg-gradient-to-r from-green-500 to-cyan-500'
                            : 'bg-gradient-to-r from-red-500 to-orange-500'
                        }`}
                        initial={{ width: '0%' }}
                        animate={{ width: `${Math.min(Math.abs(position.pnlPercent) * 10, 100)}%` }}
                        transition={{ duration: 1, delay: index * 0.1 }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${position.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {position.pnl > 0 ? '+' : ''}
                      {position.pnlPercent.toFixed(1)}%
                    </span>
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

// Mobile Dashboard Experience
function MobileDashboardExperience() {
  const [profit, setProfit] = useState(42500);
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ['Signals', 'Positions', 'Analytics'];

  useEffect(() => {
    const interval = setInterval(() => {
      setProfit((prev) => prev + Math.floor(Math.random() * 300) + 100);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-md mx-auto bg-gradient-to-br from-slate-950 via-slate-900 to-black rounded-[3rem] border-8 border-slate-800 p-6 shadow-2xl relative overflow-hidden"
      style={{ aspectRatio: '9/19' }}
    >
      {/* Mobile Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-3xl z-20" />

      {/* Status Bar */}
      <div className="flex items-center justify-between text-white text-xs mb-4 px-2 relative z-10">
        <span>9:41</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-3 border border-white rounded-sm flex items-end p-0.5">
            <div className="w-full h-2/3 bg-white" />
          </div>
        </div>
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold">IndexpilotAI</h3>
              <div className="flex items-center gap-1.5">
                <motion.div
                  className="w-1.5 h-1.5 bg-green-400 rounded-full"
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-xs text-green-400 font-medium">Live</span>
              </div>
            </div>
          </div>
          <Bell className="w-5 h-5 text-slate-400" />
        </div>

        {/* Profit Card */}
        <motion.div
          className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-2xl p-5 mb-6 relative overflow-hidden"
          animate={{
            boxShadow: [
              '0 0 0px rgba(6, 182, 212, 0)',
              '0 0 30px rgba(6, 182, 212, 0.3)',
              '0 0 0px rgba(6, 182, 212, 0)'
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <div className="text-slate-300 text-sm mb-2">Today's Profit</div>
          <motion.div
            key={profit}
            initial={{ scale: 1.2, color: '#22c55e' }}
            animate={{ scale: 1, color: '#ffffff' }}
            className="text-4xl font-bold text-white mb-3"
          >
            ₹{profit.toLocaleString('en-IN')}
          </motion.div>
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <TrendingUp className="w-4 h-4" />
            <span>+18.5% from yesterday</span>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 bg-slate-800/50 rounded-xl p-1">
          {tabs.map((tab, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === index
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="space-y-3 max-h-[350px] overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 0 && (
              <motion.div
                key="signals"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-3"
              >
                {[
                  { type: 'BUY', symbol: 'NIFTY CE', price: '23,450', confidence: 94, color: 'green' },
                  { type: 'SELL', symbol: 'BANKNIFTY PE', price: '45,230', confidence: 91, color: 'red' },
                  { type: 'BUY', symbol: 'SENSEX CE', price: '76,890', confidence: 96, color: 'green' }
                ].map((signal, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-slate-800/70 border border-slate-700 rounded-xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-bold text-white ${
                          signal.color === 'green' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      >
                        {signal.type}
                      </span>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                        <Zap className="w-4 h-4 text-yellow-400" />
                      </motion.div>
                    </div>
                    <div className="text-white font-semibold mb-1">{signal.symbol}</div>
                    <div className="text-slate-400 text-sm mb-2">Entry: ₹{signal.price}</div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Confidence</span>
                      <span className="text-cyan-400 font-bold">{signal.confidence}%</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                        initial={{ width: '0%' }}
                        animate={{ width: `${signal.confidence}%` }}
                        transition={{ duration: 1, delay: index * 0.1 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Stats Card Component
function StatsCard({ label, value, change, icon: Icon, color, profit }: any) {
  return (
    <motion.div
      className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-5"
      whileHover={{ scale: 1.05, y: -3, borderColor: 'rgba(6, 182, 212, 0.5)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm">{label}</span>
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center ${
            color === 'green'
              ? 'bg-green-500/20'
              : color === 'cyan'
              ? 'bg-cyan-500/20'
              : color === 'yellow'
              ? 'bg-yellow-500/20'
              : 'bg-purple-500/20'
          }`}
        >
          <Icon
            className={`w-5 h-5 ${
              color === 'green'
                ? 'text-green-400'
                : color === 'cyan'
                ? 'text-cyan-400'
                : color === 'yellow'
                ? 'text-yellow-400'
                : 'text-purple-400'
            }`}
          />
        </div>
      </div>
      <motion.div
        key={profit}
        initial={{ scale: 1.2, color: color === 'green' ? '#22c55e' : '#ffffff' }}
        animate={{ scale: 1, color: '#ffffff' }}
        className="text-2xl font-bold text-white mb-1"
      >
        {value}
      </motion.div>
      <div className={`text-xs flex items-center gap-1 ${color === 'green' ? 'text-green-400' : 'text-cyan-400'}`}>
        {color === 'green' && <TrendingUp className="w-3 h-3" />}
        <span>{change}</span>
      </div>
    </motion.div>
  );
}
