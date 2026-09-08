// @ts-nocheck
import React, { useState } from 'react';
import { Zap, Shield, TrendingUp, DollarSign, Users, CheckCircle, ArrowRight, Lock, Smartphone } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export default function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const [activeTab, setActiveTab] = useState<'features' | 'pricing' | 'how-it-works'>('features');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-lg border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">IndexpilotAI</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={onSignIn}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={onGetStarted}
                className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/30"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full mb-6">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-blue-300">AI-Powered Options Trading Platform</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6">
              Trade Smarter with
              <span className="block bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Advanced AI
              </span>
            </h1>
            
            <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
              Professional AI trading engine with 15+ indicators, pattern recognition, and automated execution. 
              Tiered pricing from FREE to ₹89 based on daily profit - truly fair pricing!
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <button
                onClick={onGetStarted}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-xl shadow-blue-500/30 flex items-center space-x-2 text-lg font-semibold"
              >
                <span>Start Trading Now</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              
              <button
                onClick={onSignIn}
                className="px-8 py-4 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-all border border-slate-600 text-lg font-semibold"
              >
                Sign In
              </button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-8 text-slate-400">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-green-400" />
                <span>Bank-Grade Security</span>
              </div>
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-yellow-400" />
                <span>Millisecond Execution</span>
              </div>
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-blue-400" />
                <span>500+ Active Traders</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-slate-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { label: 'Win Rate', value: '68%', icon: TrendingUp, color: 'text-green-400' },
              { label: 'Avg Profit', value: '₹450', icon: DollarSign, color: 'text-blue-400' },
              { label: 'Active Users', value: '500+', icon: Users, color: 'text-purple-400' },
              { label: 'Trades/Day', value: '1000+', icon: Zap, color: 'text-yellow-400' },
            ].map((stat, index) => (
              <div key={index} className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
                <stat.icon className={`w-8 h-8 ${stat.color} mb-3`} />
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center space-x-4 mb-12">
            {(['features', 'pricing', 'how-it-works'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {tab === 'features' && 'Features'}
                {tab === 'pricing' && 'Pricing'}
                {tab === 'how-it-works' && 'How It Works'}
              </button>
            ))}
          </div>

          {/* Features Tab */}
          {activeTab === 'features' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  icon: Zap,
                  title: 'AI-Powered Signals',
                  description: '15+ technical indicators with advanced pattern recognition for high-probability trades.',
                  color: 'text-yellow-400',
                },
                {
                  icon: Shield,
                  title: 'Risk Management',
                  description: 'Automated stop loss, target calculation, and daily risk limits to protect your capital.',
                  color: 'text-green-400',
                },
                {
                  icon: TrendingUp,
                  title: 'Pattern Detection',
                  description: '9 candlestick patterns detected automatically with 80-90% confidence scores.',
                  color: 'text-blue-400',
                },
                {
                  icon: DollarSign,
                  title: 'Tiered Profit-Based Pricing',
                  description: 'FREE up to ₹100 profit, then ₹29-₹89 based on tiers. No profit? No payment!',
                  color: 'text-purple-400',
                },
                {
                  icon: Lock,
                  title: 'Secure Trading',
                  description: 'Bank-grade encryption, secure API integration, and real-time position monitoring.',
                  color: 'text-red-400',
                },
                {
                  icon: Smartphone,
                  title: 'Real-Time Execution',
                  description: 'Millisecond-speed order execution with live P&L tracking and instant notifications.',
                  color: 'text-cyan-400',
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 hover:border-slate-600 transition-all"
                >
                  <feature.icon className={`w-10 h-10 ${feature.color} mb-4`} />
                  <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-slate-400">{feature.description}</p>
                </div>
              ))}
            </div>
          )}

          {/* Pricing Tab */}
          {activeTab === 'pricing' && (
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <div className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-500/10 border border-blue-500/30 rounded-full mb-4">
                  <CheckCircle className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-blue-300">Tiered Success-Based Pricing</span>
                </div>
                <h2 className="text-4xl font-bold text-white mb-2">No Profit, No Pay</h2>
                <p className="text-slate-400">Pay only what's fair based on your daily profit</p>
              </div>

              {/* Pricing Tiers */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
                {[
                  { range: '₹0 – ₹100', fee: 'FREE', color: 'from-green-600 to-emerald-600', textColor: 'text-green-400' },
                  { range: '₹101 – ₹500', fee: '₹29', color: 'from-blue-600 to-cyan-600', textColor: 'text-blue-400' },
                  { range: '₹501 – ₹1,000', fee: '₹49', color: 'from-purple-600 to-indigo-600', textColor: 'text-purple-400' },
                  { range: '₹1,001 – ₹2,000', fee: '₹69', color: 'from-orange-600 to-amber-600', textColor: 'text-orange-400' },
                  { range: '₹2,001+', fee: '₹89', color: 'from-red-600 to-pink-600', textColor: 'text-red-400' },
                ].map((tier, index) => (
                  <div
                    key={index}
                    className="bg-slate-800/50 p-5 rounded-xl border border-slate-700 hover:border-slate-600 transition-all"
                  >
                    <div className={`text-2xl font-bold mb-2 ${tier.textColor}`}>{tier.fee}</div>
                    <div className="text-sm text-slate-400">Daily Profit</div>
                    <div className="text-xs text-slate-500 mt-1">{tier.range}</div>
                  </div>
                ))}
              </div>

              {/* How It Works */}
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-2xl border-2 border-blue-500 shadow-2xl shadow-blue-500/20 mb-8">
                <h3 className="text-2xl font-bold text-white mb-4">How Tiered Pricing Works</h3>
                <div className="space-y-3 text-slate-300">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Pay Only on Profit</div>
                      <div className="text-sm text-slate-400">Fees are calculated based on your daily net profit</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Automatic Deduction</div>
                      <div className="text-sm text-slate-400">Charges are auto-deducted from your wallet when you reach a new tier</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Pay Only the Difference</div>
                      <div className="text-sm text-slate-400">When moving to higher tiers, you only pay the additional amount</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">Daily Reset</div>
                      <div className="text-sm text-slate-400">All fees reset daily - fresh start every trading day!</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Example */}
              <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 mb-8">
                <h4 className="text-lg font-semibold text-white mb-3">💡 Example Scenario</h4>
                <div className="text-sm text-slate-300 space-y-2">
                  <div>• Profit reaches ₹300 → Pay ₹29 (Tier 2)</div>
                  <div>• Profit reaches ₹800 → Pay additional ₹20 (₹49 - ₹29)</div>
                  <div>• Profit reaches ₹1,500 → Pay additional ₹20 (₹69 - ₹49)</div>
                  <div>• Profit reaches ₹2,500 → Pay additional ₹20 (₹89 - ₹69)</div>
                  <div className="pt-2 border-t border-slate-700 text-green-400 font-semibold">
                    Total paid: ₹89 for ₹2,500 profit = 3.56% fee
                  </div>
                </div>
              </div>

              {/* What's Included */}
              <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700 mb-6">
                <h4 className="text-lg font-semibold text-white mb-4">✨ What's Included</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    'Unlimited AI signals during trading hours',
                    'Real-time P&L tracking',
                    'Automated order execution',
                    'Risk management system',
                    'Daily trade logs and reports',
                    'Advanced analytics dashboard'
                  ].map((feature, i) => (
                    <div key={i} className="flex items-center space-x-2 text-sm text-slate-300">
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onGetStarted}
                className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-xl shadow-blue-500/30 flex items-center justify-center space-x-2 text-lg font-semibold"
              >
                <span>Start Trading with Fair Pricing</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* How It Works Tab */}
          {activeTab === 'how-it-works' && (
            <div className="max-w-4xl mx-auto">
              <div className="space-y-6">
                {[
                  {
                    step: '1',
                    title: 'Sign Up & Load Wallet',
                    description: 'Create your account with mobile OTP verification. Load your wallet with any amount using Razorpay (UPI, Cards, Net Banking).',
                    icon: Smartphone,
                  },
                  {
                    step: '2',
                    title: 'Configure Trading Settings',
                    description: 'Set up your Dhan API credentials, add trading symbols (NIFTY/BANKNIFTY options), and configure risk limits.',
                    icon: Shield,
                  },
                  {
                    step: '3',
                    title: 'Start AI Engine',
                    description: 'Click "Start Engine" during market hours (9:15 AM - 3:30 PM). AI analyzes market every second with 15+ indicators.',
                    icon: Zap,
                  },
                  {
                    step: '4',
                    title: 'Auto-Execute Trades',
                    description: 'When AI detects high-confidence signals (85%+), orders are placed automatically. Real-time P&L tracking every second.',
                    icon: TrendingUp,
                  },
                  {
                    step: '5',
                    title: 'Pay Only On Profit',
                    description: 'When your TOTAL profit crosses ₹200, ₹89 is automatically deducted from wallet. Below ₹200 or loss? No charge!',
                    icon: DollarSign,
                  },
                ].map((step, index) => (
                  <div
                    key={index}
                    className="flex items-start space-x-4 bg-slate-800/50 p-6 rounded-xl border border-slate-700 hover:border-slate-600 transition-all"
                  >
                    <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                      {step.step}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <step.icon className="w-6 h-6 text-blue-400" />
                        <h3 className="text-xl font-semibold text-white">{step.title}</h3>
                      </div>
                      <p className="text-slate-400">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-700">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">
            Ready to Start Trading Smarter?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join 500+ traders already profiting with AI-powered trading. Pay only when you profit!
          </p>
          <button
            onClick={onGetStarted}
            className="px-8 py-4 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-all shadow-xl font-semibold text-lg flex items-center space-x-2 mx-auto"
          >
            <span>Start Trading Now</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-900 border-t border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">AI Trade Pro</span>
              </div>
              <p className="text-slate-400 text-sm">
                Professional AI-powered options trading platform for NIFTY & BANKNIFTY.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li>Features</li>
                <li>Pricing</li>
                <li>How It Works</li>
                <li>API Integration</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-3">Support</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li>Documentation</li>
                <li>Help Center</li>
                <li>Contact Us</li>
                <li>FAQ</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-3">Legal</h4>
              <ul className="space-y-2 text-slate-400 text-sm">
                <li>Terms of Service</li>
                <li>Privacy Policy</li>
                <li>Risk Disclosure</li>
                <li>Disclaimer</li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800 text-center text-slate-500 text-sm">
            <p>© 2024 AI Trade Pro. All rights reserved.</p>
            <p className="mt-2">
              <strong>Risk Disclosure:</strong> Trading in derivatives carries substantial risk. Only trade with capital you can afford to lose.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}