// @ts-nocheck
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserPlus, Zap, Target, TrendingUp, Shield, Clock,
  Brain, BarChart3, Rocket, CheckCircle2, ArrowRight,
  DollarSign, Activity, Lock, Bell, Sparkles, Award,
  LineChart, PieChart, TrendingDown, AlertCircle
} from 'lucide-react';

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [hoveredBenefit, setHoveredBenefit] = useState<number | null>(null);

  const steps = [
    {
      number: 1,
      icon: UserPlus,
      title: 'Sign Up & Connect',
      description: 'Create your account and connect your Dhan broker account in under 2 minutes',
      color: 'from-cyan-500 to-blue-600',
      bgColor: 'from-cyan-500/10 to-blue-600/10',
      features: ['Quick KYC', 'Secure API', 'Instant Setup']
    },
    {
      number: 2,
      icon: Brain,
      title: 'AI Analyzes Markets',
      description: 'Our advanced AI continuously scans NIFTY, BANKNIFTY, and SENSEX for opportunities',
      color: 'from-purple-500 to-pink-600',
      bgColor: 'from-purple-500/10 to-pink-600/10',
      features: ['Real-time Data', 'Smart Algorithms', '95%+ Accuracy']
    },
    {
      number: 3,
      icon: Zap,
      title: 'Receive Signals',
      description: 'Get instant notifications with entry, target, stop-loss, and confidence scores',
      color: 'from-yellow-500 to-orange-600',
      bgColor: 'from-yellow-500/10 to-orange-600/10',
      features: ['Live Alerts', 'High Confidence', 'Risk Managed']
    },
    {
      number: 4,
      icon: TrendingUp,
      title: 'Execute & Profit',
      description: 'Auto-execute trades or review before placement. Watch your portfolio grow in real-time',
      color: 'from-green-500 to-emerald-600',
      bgColor: 'from-green-500/10 to-emerald-600/10',
      features: ['Auto Trading', 'Live Tracking', 'Easy Withdrawals']
    }
  ];

  const benefits = [
    {
      icon: Brain,
      title: 'AI-Powered Intelligence',
      description: 'Advanced algorithms analyze millions of data points in real-time',
      stat: '95%',
      statLabel: 'Accuracy',
      color: 'purple'
    },
    {
      icon: Zap,
      title: 'Lightning Fast Execution',
      description: 'Trades execute in milliseconds via Dhan\'s ultra-fast API',
      stat: '<50ms',
      statLabel: 'Latency',
      color: 'yellow'
    },
    {
      icon: Shield,
      title: 'Risk Management',
      description: 'Built-in stop-loss, position sizing, and risk controls',
      stat: '24/7',
      statLabel: 'Protection',
      color: 'blue'
    },
    {
      icon: BarChart3,
      title: 'Real-Time Analytics',
      description: 'Comprehensive dashboards with live P&L and performance metrics',
      stat: 'Live',
      statLabel: 'Updates',
      color: 'cyan'
    },
    {
      icon: Award,
      title: 'Proven Track Record',
      description: '5,000+ traders trust us with consistent profitable results',
      stat: '5K+',
      statLabel: 'Users',
      color: 'green'
    },
    {
      icon: Lock,
      title: 'Bank-Grade Security',
      description: 'Military-grade encryption and secure API connections',
      stat: '256-bit',
      statLabel: 'Encryption',
      color: 'red'
    }
  ];

  // Auto-cycle through steps
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-black via-slate-950 to-black overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 opacity-20">
        <motion.div
          className="absolute top-1/3 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            x: [0, 100, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 12, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-cyan-500 rounded-full blur-3xl"
          animate={{
            scale: [1.3, 1, 1.3],
            x: [0, -100, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 15, repeat: Infinity }}
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* How It Works Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <motion.div
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/30 mb-6"
            animate={{
              boxShadow: [
                '0 0 0px rgba(168, 85, 247, 0)',
                '0 0 30px rgba(168, 85, 247, 0.4)',
                '0 0 0px rgba(168, 85, 247, 0)'
              ]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Rocket className="w-5 h-5 text-purple-400" />
            <span className="text-sm text-purple-400 font-semibold">Simple, Fast, Profitable</span>
          </motion.div>

          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            How{' '}
            <span className="bg-gradient-to-r from-purple-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
              IndexpilotAI
            </span>
            {' '}Works
          </h2>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto">
            From sign-up to profit in 4 simple steps. Our AI does the heavy lifting while you watch your portfolio grow.
          </p>
        </motion.div>

        {/* Steps Timeline */}
        <div className="relative mb-24">
          {/* Connection Line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-1 bg-slate-800 -translate-y-1/2" />
          <motion.div
            className="hidden md:block absolute top-1/2 left-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-green-500 -translate-y-1/2"
            initial={{ width: '0%' }}
            whileInView={{ width: '100%' }}
            viewport={{ once: true }}
            transition={{ duration: 2, ease: 'easeInOut' }}
          />

          {/* Steps */}
          <div className="grid md:grid-cols-4 gap-8 md:gap-4 relative">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2, duration: 0.6 }}
                className="relative"
              >
                <motion.div
                  className={`relative bg-slate-900/50 backdrop-blur-xl border-2 rounded-2xl p-6 cursor-pointer transition-all ${
                    activeStep === index
                      ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                  whileHover={{ scale: 1.05, y: -5 }}
                  onClick={() => setActiveStep(index)}
                >
                  {/* Step Number Badge */}
                  <motion.div
                    className={`absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center font-bold text-white text-xl shadow-lg z-10`}
                    animate={activeStep === index ? {
                      scale: [1, 1.2, 1],
                      boxShadow: [
                        '0 0 0px rgba(6, 182, 212, 0)',
                        '0 0 30px rgba(6, 182, 212, 0.6)',
                        '0 0 0px rgba(6, 182, 212, 0)'
                      ]
                    } : {}}
                    transition={{ duration: 1.5, repeat: activeStep === index ? Infinity : 0 }}
                  >
                    {step.number}
                  </motion.div>

                  {/* Background Glow */}
                  <AnimatePresence>
                    {activeStep === index && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`absolute inset-0 bg-gradient-to-br ${step.bgColor} rounded-2xl`}
                      />
                    )}
                  </AnimatePresence>

                  <div className="relative z-10 pt-6">
                    {/* Icon */}
                    <motion.div
                      className={`w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center`}
                      animate={activeStep === index ? { rotate: 360 } : {}}
                      transition={{ duration: 1, ease: 'easeInOut' }}
                    >
                      <step.icon className="w-8 h-8 text-white" />
                    </motion.div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-white mb-3 text-center">{step.title}</h3>

                    {/* Description */}
                    <p className="text-slate-400 text-sm text-center mb-4 leading-relaxed">
                      {step.description}
                    </p>

                    {/* Features */}
                    <div className="space-y-2">
                      {step.features.map((feature, fIndex) => (
                        <motion.div
                          key={fIndex}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: activeStep === index ? fIndex * 0.1 : 0 }}
                          className="flex items-center gap-2 text-xs"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                          <span className="text-slate-300">{feature}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                {/* Arrow Connector (Desktop) */}
                {index < steps.length - 1 && (
                  <motion.div
                    className="hidden md:block absolute top-1/2 -right-4 z-20"
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <ArrowRight className="w-8 h-8 text-cyan-400" />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Why Choose IndexpilotAI */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <motion.div
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 mb-6"
            animate={{
              boxShadow: [
                '0 0 0px rgba(6, 182, 212, 0)',
                '0 0 30px rgba(6, 182, 212, 0.4)',
                '0 0 0px rgba(6, 182, 212, 0)'
              ]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Award className="w-5 h-5 text-cyan-400" />
            <span className="text-sm text-cyan-400 font-semibold">Why Choose Us</span>
          </motion.div>

          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            What Makes Us{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
              Different
            </span>
          </h2>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto">
            We combine cutting-edge AI technology with professional-grade tools to give you the edge in options trading.
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {benefits.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              onHoverStart={() => setHoveredBenefit(index)}
              onHoverEnd={() => setHoveredBenefit(null)}
              className="relative group"
            >
              <motion.div
                className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 h-full overflow-hidden"
                whileHover={{ scale: 1.05, y: -5, borderColor: 'rgba(6, 182, 212, 0.5)' }}
              >
                {/* Background Glow on Hover */}
                <AnimatePresence>
                  {hoveredBenefit === index && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className={`absolute inset-0 bg-gradient-to-br ${
                        benefit.color === 'purple' ? 'from-purple-500/10 to-purple-600/5' :
                        benefit.color === 'yellow' ? 'from-yellow-500/10 to-yellow-600/5' :
                        benefit.color === 'blue' ? 'from-blue-500/10 to-blue-600/5' :
                        benefit.color === 'cyan' ? 'from-cyan-500/10 to-cyan-600/5' :
                        benefit.color === 'green' ? 'from-green-500/10 to-green-600/5' :
                        'from-red-500/10 to-red-600/5'
                      }`}
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10">
                  {/* Icon & Stat Badge */}
                  <div className="flex items-start justify-between mb-4">
                    <motion.div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                        benefit.color === 'purple' ? 'bg-purple-500/20' :
                        benefit.color === 'yellow' ? 'bg-yellow-500/20' :
                        benefit.color === 'blue' ? 'bg-blue-500/20' :
                        benefit.color === 'cyan' ? 'bg-cyan-500/20' :
                        benefit.color === 'green' ? 'bg-green-500/20' :
                        'bg-red-500/20'
                      }`}
                      animate={hoveredBenefit === index ? { rotate: 360 } : {}}
                      transition={{ duration: 0.6 }}
                    >
                      <benefit.icon className={`w-7 h-7 ${
                        benefit.color === 'purple' ? 'text-purple-400' :
                        benefit.color === 'yellow' ? 'text-yellow-400' :
                        benefit.color === 'blue' ? 'text-blue-400' :
                        benefit.color === 'cyan' ? 'text-cyan-400' :
                        benefit.color === 'green' ? 'text-green-400' :
                        'text-red-400'
                      }`} />
                    </motion.div>

                    <motion.div
                      className={`px-3 py-1.5 rounded-lg ${
                        benefit.color === 'purple' ? 'bg-purple-500/20 border border-purple-500/30' :
                        benefit.color === 'yellow' ? 'bg-yellow-500/20 border border-yellow-500/30' :
                        benefit.color === 'blue' ? 'bg-blue-500/20 border border-blue-500/30' :
                        benefit.color === 'cyan' ? 'bg-cyan-500/20 border border-cyan-500/30' :
                        benefit.color === 'green' ? 'bg-green-500/20 border border-green-500/30' :
                        'bg-red-500/20 border border-red-500/30'
                      }`}
                      animate={hoveredBenefit === index ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      <div className={`text-xs font-bold ${
                        benefit.color === 'purple' ? 'text-purple-400' :
                        benefit.color === 'yellow' ? 'text-yellow-400' :
                        benefit.color === 'blue' ? 'text-blue-400' :
                        benefit.color === 'cyan' ? 'text-cyan-400' :
                        benefit.color === 'green' ? 'text-green-400' :
                        'text-red-400'
                      }`}>{benefit.stat}</div>
                      <div className="text-[10px] text-slate-400">{benefit.statLabel}</div>
                    </motion.div>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-bold text-white mb-3">{benefit.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{benefit.description}</p>
                </div>

                {/* Hover Indicator */}
                <motion.div
                  className={`absolute bottom-0 left-0 right-0 h-1 ${
                    benefit.color === 'purple' ? 'bg-gradient-to-r from-purple-500 to-purple-600' :
                    benefit.color === 'yellow' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                    benefit.color === 'blue' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                    benefit.color === 'cyan' ? 'bg-gradient-to-r from-cyan-500 to-cyan-600' :
                    benefit.color === 'green' ? 'bg-gradient-to-r from-green-500 to-green-600' :
                    'bg-gradient-to-r from-red-500 to-red-600'
                  }`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: hoveredBenefit === index ? 1 : 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ transformOrigin: 'left' }}
                />
              </motion.div>
            </motion.div>
          ))}
        </div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center mt-16"
        >
          <motion.div
            className="inline-flex flex-col sm:flex-row gap-4"
            whileHover={{ scale: 1.02 }}
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg shadow-cyan-500/30 flex items-center gap-2 justify-center"
            >
              <Rocket className="w-5 h-5" />
              Start Trading Now
              <ArrowRight className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl border border-slate-700 flex items-center gap-2 justify-center"
            >
              <Activity className="w-5 h-5" />
              View Live Demo
            </motion.button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
