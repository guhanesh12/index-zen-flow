// @ts-nocheck
import { useState, useEffect } from 'react';
import { getBaseUrl } from '../utils/apiService';
import { motion, useScroll, useTransform, useSpring } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  TrendingUp, Zap, Shield, BarChart3, Smartphone, Monitor,
  ArrowRight, CheckCircle2, Star, Users, DollarSign, Activity,
  Lock, Bell, TrendingDown, Gauge, LineChart, PieChart,
  Clock, Target, Award, Sparkles, ChevronRight, Menu, X,
  Twitter, Linkedin, Instagram, Mail, Phone, MapPin
} from 'lucide-react';
const logoWhite = "/logo-white.png";
const logoColor = "/logo-color.png";
import { Button } from './ui/button';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { AnimatedIndexTitle } from './AnimatedIndexTitle';
import { AnimatedIndexCard } from './AnimatedIndexCard';
import { HowItWorksSection } from './HowItWorksSection';
import { SEO, SEO_CONFIGS } from '../utils/seo';

// Floating animation keyframes
const floatingAnimation = {
  y: [0, -20, 0],
  transition: {
    duration: 3,
    repeat: Infinity,
    ease: "easeInOut"
  }
};

// Pulse animation
const pulseAnimation = {
  scale: [1, 1.05, 1],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut"
  }
};

// Stagger container
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

// Item variants
const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 10
    }
  }
};

interface ModernLandingPageProps {
  onSignInClick: () => void;
  onSignUpClick: () => void;
  onPageNavigate?: (slug: string) => void;
}

// Default content defined outside component for immediate access
const DEFAULT_CONTENT = {
  hero: {
    badge: "AI-Powered Trading Platform",
    title: {
      part1: "Trade",
      part2: "NIFTY Options",
      part3: "with AI"
    },
    description: "Automated trading powered by advanced AI algorithms. Real-time data from Dhan with lightning-fast execution and intelligent position monitoring.",
    buttons: {
      primary: "Start Free Trial",
      secondary: "Watch Demo"
    },
    trustBadge: "5,000+ Active Traders",
    dhanAccountLink: "https://login.dhan.co/?location=DH_WEB&refer=SMIL56887"
  },
  stats: [
    { value: '68%', label: 'Win Rate', icon: 'TrendingUp', color: 'green' },
    { value: '₹450', label: 'Avg Profit', icon: 'DollarSign', color: 'cyan' },
    { value: '500+', label: 'Active Users', icon: 'Users', color: 'purple' },
    { value: '1000+', label: 'Trades/Day', icon: 'Activity', color: 'yellow' }
  ],
  dhan: {
    badge: "Powered by Dhan",
    title: "Lightning-Fast Trading with Dhan API",
    description: "The only broker integration you need. Dhan delivers ultra-fast execution, real-time market data, and advanced position monitoring for professional traders.",
    features: [
      {
        title: "Real-time Market Data",
        description: "Live NIFTY & BANKNIFTY options chain with instant updates",
        icon: "Activity"
      },
      {
        title: "Lightning Execution",
        description: "Place orders in milliseconds with Dhan's powerful API",
        icon: "Zap"
      },
      {
        title: "Position Monitoring",
        description: "Track all your positions in real-time with P&L updates",
        icon: "BarChart3"
      }
    ]
  },
  features: [
    {
      title: "AI-Powered Signals",
      description: "Advanced machine learning algorithms analyze market patterns and generate high-probability trade signals in real-time.",
      icon: "Zap"
    },
    {
      title: "Risk Management",
      description: "Built-in stop-loss, position sizing, and risk controls to protect your capital.",
      icon: "Shield"
    },
    {
      title: "Real-time Analytics",
      description: "Live P&L tracking, win rate analysis, and comprehensive performance metrics.",
      icon: "BarChart3"
    }
  ],
  pricing: {
    title: "Pay Only When You Profit",
    description: "No fixed monthly fees. Pay a small daily fee only on profitable days.",
    tiers: [
      {
        range: '₹0 – ₹100',
        price: '₹0',
        description: 'Completely free',
        features: ['No charges', 'All AI signals', 'Basic support', 'Trade history']
      },
      {
        range: '₹101 – ₹500',
        price: '₹29',
        description: 'Getting started',
        features: ['Fixed daily fee', 'Advanced AI signals', 'Email support', 'Risk management']
      },
      {
        range: '₹501 – ₹1,000',
        price: '₹49',
        description: 'Most popular',
        features: ['Best value tier', 'Premium signals', 'Priority support', 'Custom strategies', 'Real-time alerts'],
        popular: true
      },
      {
        range: '₹1,001 – ₹2,000',
        price: '₹69',
        description: 'High performers',
        features: ['Dedicated support', 'Advanced analytics', 'Performance reports', 'API access']
      },
      {
        range: '₹2,001+',
        price: '₹89',
        description: 'Professional traders',
        features: ['VIP support', 'Custom strategies', 'Priority execution', 'Personal account manager']
      }
    ],
    explanation: "Your daily fee is calculated based on your net profit at the end of each trading day. If you make ₹750 profit in a day, you pay only ₹49. If you make no profit or a loss, you pay ₹0!",
    autoDebit: "No upfront payment required. Fees are automatically debited from your wallet only when you make profit."
  },
  testimonials: [
    {
      name: 'Rajesh Kumar',
      role: 'Day Trader',
      rating: 5,
      text: 'Increased my win rate from 45% to 68% in just 2 months. The AI signals are incredibly accurate!',
      avatar: 'R'
    },
    {
      name: 'Priya Sharma',
      role: 'Options Trader',
      rating: 5,
      text: 'Best platform for NIFTY options. The Dhan integration is seamless and execution is lightning fast.',
      avatar: 'P'
    },
    {
      name: 'Amit Patel',
      role: 'Professional Trader',
      rating: 5,
      text: 'Made ₹2.5L in profit last month. The risk management features saved me from several big losses.',
      avatar: 'A'
    }
  ],
  trailingStopLoss: {
    badge: "ADVANCED FEATURE",
    title: {
      part1: "Unlimited",
      part2: "Profit Locking",
      part3: "with Trailing Stop-Loss"
    },
    subtitle: "The most powerful risk management tool. Lock in profits automatically as your position grows—with NO LIMIT on how much you can secure!",
    howItWorks: {
      title: "How It Works",
      steps: [
        {
          number: "1",
          title: "Set Activation Profit",
          description: "Choose when trailing starts (e.g., after ₹1,000 profit)",
          color: "blue"
        },
        {
          number: "2",
          title: "Configure Jump Amounts",
          description: "Set how much targets and stop-losses move (e.g., ₹500 jumps)",
          color: "cyan"
        },
        {
          number: "3",
          title: "Profits Lock Automatically! 🔒",
          description: "Stop-loss moves into positive territory—securing guaranteed profits even if market crashes!",
          color: "green"
        }
      ]
    },
    liveExample: {
      title: "Live Example",
      steps: [
        { profit: '₹1,000', target: '₹3,500', sl: '₹1,500', description: 'Trailing activated' },
        { profit: '₹2,500', target: '₹5,000', sl: '₹500', description: 'Getting close...' },
        { profit: '₹3,000', target: '₹5,500', sl: '₹0', description: 'Break-even!' },
        { profit: '₹5,000', target: '₹7,000', sl: '-₹2,000', description: '+₹2,000 LOCKED 🔒', locked: true },
        { profit: '₹5,500', target: '₹7,500', sl: '-₹2,500', description: '+₹2,500 LOCKED 🔒', locked: true },
        { profit: '₹6,000', target: '₹8,000', sl: '-₹3,000', description: '+₹3,000 LOCKED 🔒', locked: true }
      ],
      footer: "⚡ Continues FOREVER! No limit on profit locking! 🚀"
    },
    benefits: [
      {
        title: "Guaranteed Profits",
        description: "Once stop-loss moves into positive territory, you CANNOT lose—even if the market crashes. Your profit is mathematically guaranteed.",
        icon: "Shield"
      },
      {
        title: "Unlimited Trailing",
        description: "No cap on profit locking! Whether you make ₹5,000 or ₹50,000, the system keeps trailing and locking in higher profits automatically.",
        icon: "TrendingUp"
      },
      {
        title: "Fully Automated",
        description: "Set it once and forget it. The AI monitors every second and adjusts targets/stop-losses automatically. No manual intervention needed!",
        icon: "Zap"
      }
    ],
    cta: {
      title: "Start Trading with Trailing Stop-Loss Today!",
      description: "Join 500+ traders who are already protecting and maximizing their profits with our advanced trailing stop-loss system",
      button: "Get Started Free",
      features: ["No credit card required", "Setup in 2 minutes", "Works with Dhan"]
    }
  },
  cta: {
    title: "Ready to Transform Your Trading?",
    description: "Join thousands of traders who are already using AI to make smarter trades.",
    button: "Start Trading Now"
  },
  footer: {
    brand: "IndexpilotAI",
    tagline: "AI-Powered Trading",
    description: "India's most advanced AI-powered options trading platform.",
    sections: [
      {
        title: "Product",
        links: [
          { label: "Features", href: "#features" },
          { label: "Pricing", href: "#pricing" },
          { label: "How It Works", href: "#how-it-works" }
        ]
      },
      {
        title: "Company",
        links: [
          { label: "About", href: "/about-us" },
          { label: "Contact", href: "/contact-us" }
        ]
      },
      {
        title: "Legal",
        links: [
          { label: "Terms & Conditions", href: "/terms" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Refund Policy", href: "/refund" },
          { label: "Disclaimer", href: "/disclaimer" }
        ]
      }
    ],
    social: {
      twitter: "https://twitter.com/indexpilotai",
      linkedin: "https://linkedin.com/company/indexpilotai"
    },
    copyright: "© 2026 IndexpilotAI. All rights reserved.",
    disclaimer: "Trading in options involves risk. Past performance does not guarantee future results."
  }
};

export default function ModernLandingPage({ onSignInClick, onSignUpClick, onPageNavigate }: ModernLandingPageProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'features' | 'pricing' | 'how-it-works'>('features');
  const [content, setContent] = useState<any>(DEFAULT_CONTENT);
  const [pages, setPages] = useState<any[]>([]);
  const [showLiveLanding, setShowLiveLanding] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !document.getElementById('instant-landing');
  });
  
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.2], [1, 0.95]);
  
  // Smooth scroll progress
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const serverUrl = getBaseUrl();

  // Scroll to section and update tab
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      
      // Update active tab if needed
      if (sectionId === 'features' || sectionId === 'pricing' || sectionId === 'how-it-works') {
        setActiveTab(sectionId as any);
      }
    }
    setMobileMenuOpen(false);
  };

  // Load content from backend in the background (no loading state blocking UI)
  useEffect(() => {
    const instantLanding = document.getElementById('instant-landing');
    if (instantLanding) {
      requestAnimationFrame(() => {
        setShowLiveLanding(true);
        setTimeout(() => instantLanding.remove(), 80);
      });
    } else {
      setShowLiveLanding(true);
    }

    const idle = (cb: () => void) => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(cb, { timeout: 3500 });
      } else {
        setTimeout(cb, 1500);
      }
    };

    idle(() => {
      loadContent();
      loadPages();
    });
  }, []);

  const loadContent = async () => {
    try {
      const response = await fetch(`${serverUrl}/landing/content`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });
      const data = await response.json();
      
      if (data.success && data.content) {
        // Merge backend content with DEFAULT_CONTENT (backend takes priority, but use defaults for missing sections)
        const mergedContent = {
          ...DEFAULT_CONTENT,
          ...data.content,
          // Deep merge hero to preserve all DB edits but always use latest dhanAccountLink from code
          hero: {
            ...DEFAULT_CONTENT.hero,
            ...(data.content.hero || {}),
            dhanAccountLink: DEFAULT_CONTENT.hero.dhanAccountLink
          },
          // Deep merge for nested objects to ensure trailingStopLoss section is always present
          trailingStopLoss: {
            ...DEFAULT_CONTENT.trailingStopLoss,
            ...(data.content.trailingStopLoss || {})
          },
          // Deep merge footer to ensure all legal links (Terms, Privacy, Refund, Disclaimer) are always present
          footer: {
            ...DEFAULT_CONTENT.footer,
            ...(data.content.footer || {}),
            sections: DEFAULT_CONTENT.footer.sections // Always use default sections with all 4 legal links
          }
        };
        setContent(mergedContent);
      }
      // If no custom content, keep DEFAULT_CONTENT already set in state
    } catch (error) {
      console.error('Error loading landing content:', error);
      // Keep DEFAULT_CONTENT already set in state
    }
  };

  const loadPages = async () => {
    try {
      const response = await fetch(`${serverUrl}/landing/pages`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        }
      });
      const data = await response.json();
      
      if (data.success && data.pages) {
        setPages(data.pages);
      }
    } catch (error) {
      console.error('Error loading pages:', error);
    }
  };

  return (
    <div className={`min-h-screen bg-black text-white overflow-x-hidden transition-opacity duration-150 ${showLiveLanding ? 'opacity-100' : 'opacity-0'}`}>
      <SEO {...SEO_CONFIGS.home} />
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src={logoWhite} alt="IndexpilotAI Logo" className="h-10 w-auto" />
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">IndexpilotAI</h1>
                <p className="text-xs text-slate-400 hidden sm:block">Indian Options Trading</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              <button onClick={() => scrollToSection('features')} className="text-slate-300 hover:text-white transition-colors">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-slate-300 hover:text-white transition-colors">Pricing</button>
              <button onClick={() => scrollToSection('how-it-works')} className="text-slate-300 hover:text-white transition-colors">How It Works</button>
              <button onClick={() => scrollToSection('about')} className="text-slate-300 hover:text-white transition-colors">About</button>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={onSignInClick}
                className="border-slate-700 bg-transparent text-white hover:bg-slate-800"
              >
                Sign In
              </Button>
              <Button 
                onClick={onSignUpClick}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
              >
                Get Started
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-slate-900 border-t border-slate-800"
          >
            <div className="px-4 py-4 space-y-3">
              <button onClick={() => scrollToSection('features')} className="block w-full text-left text-slate-300 hover:text-white transition-colors py-2">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="block w-full text-left text-slate-300 hover:text-white transition-colors py-2">Pricing</button>
              <button onClick={() => scrollToSection('how-it-works')} className="block w-full text-left text-slate-300 hover:text-white transition-colors py-2">How It Works</button>
              <button onClick={() => scrollToSection('about')} className="block w-full text-left text-slate-300 hover:text-white transition-colors py-2">About</button>
              <Button variant="outline" onClick={onSignInClick} className="w-full border-slate-700 bg-transparent text-white hover:bg-slate-800 mt-4">
                Sign In
              </Button>
              <Button onClick={onSignUpClick} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                Get Started
              </Button>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-950 to-black"></div>
        <motion.div 
          className="absolute top-20 left-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.3, 1], 
            opacity: [0.1, 0.2, 0.1],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 10, repeat: Infinity }}
        />
        <motion.div 
          className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
          animate={{ 
            scale: [1.3, 1, 1.3], 
            opacity: [0.1, 0.2, 0.1],
            x: [0, -50, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 12, repeat: Infinity }}
        />
        <motion.div 
          className="absolute top-1/2 left-1/2 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.2, 1], 
            opacity: [0.05, 0.15, 0.05]
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />

        <motion.div 
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="relative z-10 max-w-7xl mx-auto"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div 
              className="space-y-8"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemVariants}>
                <motion.div 
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6"
                  whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(6, 182, 212, 0.3)" }}
                  animate={pulseAnimation}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                  </motion.div>
                  <span className="text-sm text-cyan-400 font-semibold">{content.hero.badge}</span>
                </motion.div>
                
                <motion.h1 
                  className="text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6"
                  variants={itemVariants}
                >
                  <motion.span 
                    className="text-white inline-block"
                    whileHover={{ scale: 1.05 }}
                  >
                    Trade
                  </motion.span>
                  <br />
                  <AnimatedIndexTitle />{' '}
                  <motion.span 
                    className="bg-gradient-to-r from-blue-400 via-purple-500 to-purple-600 bg-clip-text text-transparent inline-block"
                    animate={{ 
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{ duration: 5, repeat: Infinity }}
                  >
                    Options
                  </motion.span>
                  <br />
                  <motion.span 
                    className="text-white inline-block"
                    whileHover={{ scale: 1.05 }}
                  >
                    with AI
                  </motion.span>
                </motion.h1>

                <motion.p 
                  className="text-xl text-slate-400 leading-relaxed mb-8"
                  variants={itemVariants}
                >
                  {content.hero.description}
                </motion.p>

                <motion.div 
                  className="flex flex-col sm:flex-row gap-4"
                  variants={itemVariants}
                >
                  <motion.div
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Button 
                      onClick={onSignUpClick}
                      size="lg"
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-lg px-8 py-6 shadow-2xl shadow-cyan-500/20 group"
                    >
                      {content.hero.buttons.primary}
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </motion.div>
                  <motion.div
                    whileHover={{ scale: 1.05, y: -5 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <Button 
                      variant="outline"
                      size="lg"
                      onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
                      className="border-slate-700 bg-transparent text-white hover:bg-slate-800 text-lg px-8 py-6"
                    >
                      {content.hero.buttons.secondary}
                    </Button>
                  </motion.div>
                </motion.div>

                {/* Dhan Account Opening CTA */}
                <motion.div 
                  className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-2 border-orange-500/30"
                  variants={itemVariants}
                  whileHover={{ scale: 1.02, borderColor: 'rgba(249, 115, 22, 0.5)' }}
                >
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-center sm:text-left">
                      <p className="text-sm text-orange-400 font-semibold mb-1">Don't have a Dhan account?</p>
                      <p className="text-xs text-slate-400">Open your trading account in minutes</p>
                    </div>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button 
                        onClick={() => window.open(content.hero.dhanAccountLink || 'https://login.dhan.co/', '_blank')}
                        size="lg"
                        className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-base px-8 py-5 shadow-2xl shadow-orange-500/30 font-semibold"
                      >
                        Open Dhan Account
                        <ArrowRight className="ml-2 w-5 h-5" />
                      </Button>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Trust Indicators */}
                <motion.div 
                  className="flex items-center gap-6 pt-8"
                  variants={itemVariants}
                >
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <motion.div 
                        key={i} 
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 border-2 border-black flex items-center justify-center text-xs font-bold"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.8 + i * 0.1, type: "spring", stiffness: 200 }}
                        whileHover={{ scale: 1.2, zIndex: 10 }}
                      >
                        {i === 4 ? '5K+' : ''}
                      </motion.div>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <motion.div
                          key={i}
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 1 + i * 0.1, type: "spring" }}
                          whileHover={{ scale: 1.3, rotate: 20 }}
                        >
                          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        </motion.div>
                      ))}
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{content.hero.trustBadge}</p>
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>

            {/* Right Animated Card */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="relative"
            >
              <AnimatedIndexCard />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-black to-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: TrendingUp, value: '68%', label: 'Win Rate', color: 'from-green-500 to-green-600', iconColor: 'text-green-400' },
              { icon: DollarSign, value: '₹450', label: 'Avg Profit', color: 'from-cyan-500 to-cyan-600', iconColor: 'text-cyan-400' },
              { icon: Users, value: '500+', label: 'Active Users', color: 'from-purple-500 to-purple-600', iconColor: 'text-purple-400' },
              { icon: Activity, value: '1000+', label: 'Trades/Day', color: 'from-yellow-500 to-yellow-600', iconColor: 'text-yellow-400' }
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all group"
              >
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color.replace('500', '500/20').replace('600', '600/10')} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <stat.icon className={`w-7 h-7 ${stat.iconColor}`} />
                </div>
                <div className="text-4xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-slate-400">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section - Fill the empty space */}
      <HowItWorksSection />

      {/* Dhan Integration Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-6">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-cyan-400 font-semibold">Powered by Dhan</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Lightning-Fast Trading with{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Dhan API
              </span>
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              The only broker integration you need. Dhan delivers ultra-fast execution, real-time market data, and advanced position monitoring for professional traders.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Gauge,
                title: 'Ultra-Fast Execution',
                description: 'Sub-millisecond order placement with Dhan\'s lightning-fast infrastructure. Never miss a market opportunity.',
                color: 'from-cyan-500 to-cyan-600'
              },
              {
                icon: LineChart,
                title: 'Real-Time Market Data',
                description: 'Live tick-by-tick data streaming directly from NSE. Get accurate quotes, depth, and historical data instantly.',
                color: 'from-blue-500 to-blue-600'
              },
              {
                icon: Shield,
                title: 'Advanced Position Monitoring',
                description: 'Real-time P&L tracking, margin monitoring, and automated risk management. Stay in complete control.',
                color: 'from-purple-500 to-purple-600'
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 rounded-3xl blur-xl group-hover:blur-2xl transition-all"></div>
                <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 hover:border-slate-700 transition-all">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.color.replace('500', '500/20').replace('600', '600/10')} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <feature.icon className={`w-8 h-8 ${feature.color.includes('cyan') ? 'text-cyan-400' : feature.color.includes('blue') ? 'text-blue-400' : 'text-purple-400'}`} />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-4">{feature.title}</h3>
                  <p className="text-slate-400 leading-relaxed">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Dhan Logo/Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <div className="inline-flex items-center gap-4 px-8 py-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700">
              <CheckCircle2 className="w-6 h-6 text-cyan-400" />
              <div className="text-left">
                <div className="text-sm text-slate-400">Official Integration Partner</div>
                <div className="text-lg font-bold text-white">Dhan - India's Fastest Trading Platform</div>
              </div>
            </div>
          </motion.div>

          {/* Open Dhan Account CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mt-12 text-center"
          >
            <div className="max-w-2xl mx-auto p-8 rounded-3xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-2 border-orange-500/30">
              <h3 className="text-2xl font-bold text-white mb-3">
                New to Dhan? Start Trading Today
              </h3>
              <p className="text-slate-400 mb-6">
                Open your Dhan trading account in minutes and start using IndexpilotAI with lightning-fast execution
              </p>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button 
                  onClick={() => window.open(content.hero.dhanAccountLink || 'https://login.dhan.co/', '_blank')}
                  size="lg"
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-lg px-12 py-6 shadow-2xl shadow-orange-500/30 font-bold"
                >
                  Open Dhan Account Free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>
              <p className="text-xs text-slate-500 mt-4">
                ✓ Free account opening  •  ✓ Zero brokerage on delivery  •  ✓ Fast KYC process
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ⚡⚡⚡ NEW: Trailing Stop-Loss Feature Section ⚡⚡⚡ */}
      <section className="relative py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 via-blue-950/20 to-black overflow-hidden">
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-green-500/5 blur-3xl"></div>
        
        <div className="max-w-7xl mx-auto relative z-10">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
              <Sparkles className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400 font-semibold">{content.trailingStopLoss?.badge || 'ADVANCED FEATURE'}</span>
            </div>
            <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
              {content.trailingStopLoss?.title?.part1 || 'Unlimited'}{' '}
              <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                {content.trailingStopLoss?.title?.part2 || 'Profit Locking'}
              </span>
              {' '}{content.trailingStopLoss?.title?.part3 || 'with Trailing Stop-Loss'}
            </h2>
            <p className="text-xl md:text-2xl text-slate-300 max-w-4xl mx-auto leading-relaxed">
              {content.trailingStopLoss?.subtitle || 'The most powerful risk management tool. Lock in profits automatically as your position grows—with NO LIMIT on how much you can secure!'}
            </p>
          </motion.div>

          {/* Visual Explainer Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mb-16"
          >
            <div className="bg-gradient-to-br from-slate-900/80 to-slate-950/80 backdrop-blur-2xl border-2 border-green-500/30 rounded-3xl p-8 md:p-12 shadow-2xl shadow-green-500/10">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                {/* Left: Explanation */}
                <div className="space-y-6">
                  <h3 className="text-3xl font-bold text-white flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-600/10 flex items-center justify-center">
                      <TrendingUp className="w-7 h-7 text-green-400" />
                    </div>
                    {content.trailingStopLoss?.howItWorks?.title || 'How It Works'}
                  </h3>
                  
                  <div className="space-y-4">
                    {(content.trailingStopLoss?.howItWorks?.steps || []).map((step: any, idx: number) => (
                      <div 
                        key={idx}
                        className={`flex items-start gap-4 p-4 rounded-xl ${
                          step.color === 'green' 
                            ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30' 
                            : 'bg-slate-800/50 border border-slate-700'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 ${
                          step.color === 'green' 
                            ? 'bg-green-500/30' 
                            : step.color === 'cyan' 
                            ? 'bg-cyan-500/20' 
                            : 'bg-blue-500/20'
                        }`}>
                          {step.color === 'green' ? (
                            <Lock className="w-5 h-5 text-green-400" />
                          ) : (
                            <span className={`font-bold ${
                              step.color === 'cyan' ? 'text-cyan-400' : 'text-blue-400'
                            }`}>{step.number}</span>
                          )}
                        </div>
                        <div>
                          <p className={`font-semibold mb-1 ${
                            step.color === 'green' ? 'text-green-300' : 'text-slate-300'
                          }`}>{step.title}</p>
                          <p className={`text-sm ${
                            step.color === 'green' ? 'text-green-100' : 'text-slate-400'
                          }`}>{step.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Live Example */}
                <div className="space-y-4">
                  <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    <Gauge className="w-6 h-6 text-cyan-400" />
                    {content.trailingStopLoss?.liveExample?.title || 'Live Example'}
                  </h4>
                  
                  <div className="bg-slate-900/90 rounded-2xl p-6 border border-slate-700 space-y-3">
                    {(content.trailingStopLoss?.liveExample?.steps || []).map((step: any, idx: number) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: 20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: idx * 0.1 }}
                        className={`p-3 rounded-xl border ${
                          step.locked 
                            ? 'bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/40' 
                            : 'bg-slate-800/50 border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-300">Profit: <span className="text-cyan-400">{step.profit}</span></span>
                          <span className="text-xs text-slate-500">{step.description}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-1">
                            <Target className="w-3 h-3 text-blue-400" />
                            <span className="text-slate-400">Target:</span>
                            <span className="text-blue-400 font-bold">{step.target}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Shield className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-400">SL:</span>
                            <span className={`font-bold ${step.locked ? 'text-green-400' : step.sl === '₹0' ? 'text-yellow-400' : step.sl.includes('-') ? 'text-red-400' : 'text-orange-400'}`}>
                              {step.sl} {step.locked && '🔒'}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/40 rounded-xl p-4">
                    <p className="text-green-300 font-bold text-center text-sm">
                      {content.trailingStopLoss?.liveExample?.footer || '⚡ Continues FOREVER! No limit on profit locking! 🚀'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Key Benefits Grid */}
          <div className="grid md:grid-cols-3 gap-8">
            {(content.trailingStopLoss?.benefits || []).map((benefit: any, index: number) => {
              const iconMap: any = { Shield, TrendingUp, Zap };
              const IconComponent = iconMap[benefit.icon] || Shield;
              const colorMap: any = {
                Shield: { gradient: 'from-green-500 to-green-600', icon: 'text-green-400' },
                TrendingUp: { gradient: 'from-cyan-500 to-cyan-600', icon: 'text-cyan-400' },
                Zap: { gradient: 'from-blue-500 to-blue-600', icon: 'text-blue-400' }
              };
              const colors = colorMap[benefit.icon] || colorMap.Shield;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className="relative group"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-blue-500/5 rounded-3xl blur-xl group-hover:blur-2xl transition-all"></div>
                  <div className="relative bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 hover:border-green-500/30 transition-all">
                    <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${colors.gradient.replace('500', '500/20').replace('600', '600/10')} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                      <IconComponent className={`w-8 h-8 ${colors.icon}`} />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-4">{benefit.title}</h3>
                    <p className="text-slate-400 leading-relaxed">{benefit.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Call-to-Action */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <div className="inline-flex flex-col items-center gap-4 p-8 rounded-3xl bg-gradient-to-r from-green-500/10 via-emerald-500/10 to-cyan-500/10 border-2 border-green-500/30">
              <Award className="w-16 h-16 text-green-400" />
              <h3 className="text-2xl md:text-3xl font-bold text-white">
                {content.trailingStopLoss?.cta?.title || 'Start Trading with Trailing Stop-Loss Today!'}
              </h3>
              <p className="text-slate-300 max-w-2xl">
                {content.trailingStopLoss?.cta?.description || 'Join 500+ traders who are already protecting and maximizing their profits with our advanced trailing stop-loss system'}
              </p>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  onClick={onSignUpClick}
                  size="lg"
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-lg px-12 py-6 shadow-2xl shadow-green-500/30 font-bold"
                >
                  {content.trailingStopLoss?.cta?.button || 'Get Started Free'}
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </motion.div>
              <p className="text-xs text-slate-400">
                {(content.trailingStopLoss?.cta?.features || []).map((feature: string, i: number) => (
                  <span key={i}>✓ {feature}{i < (content.trailingStopLoss?.cta?.features?.length || 0) - 1 ? '  •  ' : ''}</span>
                ))}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Tab Navigation for Features/Pricing/How It Works */}
      <section id="features" className="relative py-20 px-4 sm:px-6 lg:px-8 bg-black">
        <div className="max-w-7xl mx-auto">
          {/* Tab Buttons */}
          <div className="flex justify-center mb-16">
            <div className="inline-flex items-center gap-2 p-2 rounded-2xl bg-slate-900/50 border border-slate-800">
              {[
                { id: 'features', label: 'Features' },
                { id: 'pricing', label: 'Pricing' },
                { id: 'how-it-works', label: 'How It Works' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-8 py-3 rounded-xl font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Features Tab */}
          {activeTab === 'features' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="space-y-16"
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                  Powerful Features for{' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    Professional Traders
                  </span>
                </h2>
                <p className="text-xl text-slate-400 max-w-3xl mx-auto">
                  Everything you need to trade NIFTY and BANKNIFTY options like a pro
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { icon: Zap, title: 'AI-Powered Signals', description: 'Triple-layer AI analysis with EMA, VWAP, and pattern recognition for high-probability trades' },
                  { icon: Target, title: 'Automated Trading', description: 'Set it and forget it. Our AI executes trades based on your strategy 24/7' },
                  { icon: Shield, title: 'Risk Management', description: 'Automated stop-loss, daily loss limits, and position size management' },
                  { icon: LineChart, title: 'Real-Time Analytics', description: 'Live P&L tracking, win rate analysis, and detailed performance reports' },
                  { icon: Bell, title: 'Smart Alerts', description: 'Get notified instantly on trade entries, exits, and important market events' },
                  { icon: Lock, title: 'Secure & Reliable', description: 'Bank-grade security with 99.9% uptime. Your data is encrypted and safe' }
                ].map((feature, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <feature.icon className="w-6 h-6 text-cyan-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-400">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Pricing Tab */}
          <div id="pricing" className="absolute -top-20"></div>
          {activeTab === 'pricing' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                  Simple{' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    Daily Pricing
                  </span>
                </h2>
                <p className="text-xl text-slate-400 max-w-3xl mx-auto">
                  Fixed daily fees based on your profit. Transparent, predictable, no percentage cuts.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6 max-w-7xl mx-auto">
                {[
                  { 
                    range: '₹0 – ₹100', 
                    price: '₹0', 
                    description: 'Completely free',
                    features: ['No charges', 'All AI signals', 'Basic support', 'Trade history'],
                    popular: false,
                    color: 'from-green-500 to-green-600'
                  },
                  { 
                    range: '₹101 – ₹500', 
                    price: '₹29', 
                    description: 'Getting started',
                    features: ['Fixed daily fee', 'Advanced AI signals', 'Email support', 'Risk management'],
                    popular: false,
                    color: 'from-cyan-500 to-cyan-600'
                  },
                  { 
                    range: '₹501 – ₹1,000', 
                    price: '₹49', 
                    description: 'Most popular',
                    features: ['Best value tier', 'Premium signals', 'Priority support', 'Custom strategies', 'Real-time alerts'],
                    popular: true,
                    color: 'from-blue-500 to-blue-600'
                  },
                  { 
                    range: '₹1,001 – ₹2,000', 
                    price: '₹69', 
                    description: 'High performers',
                    features: ['Dedicated support', 'Advanced analytics', 'Performance reports', 'API access'],
                    popular: false,
                    color: 'from-purple-500 to-purple-600'
                  },
                  { 
                    range: '₹2,001+', 
                    price: '₹89', 
                    description: 'Elite traders',
                    features: ['Maximum profits', 'VIP support 24/7', 'Account manager', 'Custom integrations', 'Priority execution'],
                    popular: false,
                    color: 'from-yellow-500 to-yellow-600'
                  }
                ].map((plan, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className={`relative bg-slate-900/50 backdrop-blur-xl border rounded-2xl p-6 hover:border-slate-700 transition-all ${
                      plan.popular ? 'border-cyan-500 shadow-2xl shadow-cyan-500/20 lg:scale-105' : 'border-slate-800'
                    }`}
                  >
                    {plan.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-semibold">
                        Most Popular
                      </div>
                    )}
                    <div className="text-center mb-4">
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color.replace('500', '500/20').replace('600', '600/10')} mb-3`}>
                        <DollarSign className={`w-6 h-6 ${plan.color.includes('green') ? 'text-green-400' : plan.color.includes('cyan') ? 'text-cyan-400' : plan.color.includes('blue') ? 'text-blue-400' : plan.color.includes('purple') ? 'text-purple-400' : 'text-yellow-400'}`} />
                      </div>
                      <div className="text-sm font-semibold text-slate-400 mb-1">Daily Net Profit</div>
                      <div className="text-lg font-bold text-white mb-2">{plan.range}</div>
                      <div className="text-3xl font-bold text-cyan-400 mb-1">{plan.price}</div>
                      <div className="text-xs text-slate-500">per day</div>
                      <p className="text-xs text-slate-400 mt-2">{plan.description}</p>
                    </div>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-300 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>

              {/* Pricing Explanation */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mt-12 max-w-4xl mx-auto"
              >
                <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-6 h-6 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">How Pricing Works</h3>
                      <p className="text-slate-300 leading-relaxed mb-3">
                        Your daily fee is calculated based on your <strong className="text-white">net profit</strong> at the end of each trading day. 
                        If you make ₹750 profit in a day, you pay only ₹49. If you make no profit or a loss, you pay ₹0!
                      </p>
                      
                      {/* Auto Debit Message */}
                      <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-xl p-4 mb-4">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-yellow-400 text-sm font-bold">💳</span>
                          </div>
                          <div>
                            <h4 className="text-yellow-400 font-semibold text-sm mb-1">Automatic Wallet Debit</h4>
                            <p className="text-slate-300 text-sm leading-relaxed">
                              <strong className="text-white">No upfront payment required.</strong> Fees are automatically debited from your wallet <strong className="text-white">only when you make profit</strong>. 
                              Your wallet is charged at the end of each profitable trading day based on your profit tier.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <span className="text-sm text-slate-300">No profit = No charge</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <span className="text-sm text-slate-300">Auto-debit from wallet</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <span className="text-sm text-slate-300">No upfront payment</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-green-400" />
                          <span className="text-sm text-slate-300">Only charged on profit days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Example Calculation */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.8 }}
                className="mt-8 max-w-4xl mx-auto"
              >
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-white mb-4">💡 Example: Monthly Cost</h3>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-cyan-400 mb-1">₹800</div>
                      <div className="text-sm text-slate-400 mb-2">Daily Profit</div>
                      <div className="text-xs text-slate-500">₹49/day × 22 days</div>
                      <div className="text-lg font-semibold text-white mt-2">= ₹1,078/month</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-400 mb-1">₹17,600</div>
                      <div className="text-sm text-slate-400 mb-2">Total Monthly Profit</div>
                      <div className="text-xs text-slate-500">₹800 × 22 trading days</div>
                      <div className="text-lg font-semibold text-green-400 mt-2">You keep ₹16,522!</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-400 mb-1">6.1%</div>
                      <div className="text-sm text-slate-400 mb-2">Effective Rate</div>
                      <div className="text-xs text-slate-500">Much lower than % models</div>
                      <div className="text-lg font-semibold text-white mt-2">Best Value!</div>
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="text-center mt-8">
                <Button 
                  onClick={onSignUpClick}
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white px-12 py-6 text-lg"
                >
                  Start Trading Today
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* How It Works Tab */}
          <div id="how-it-works" className="absolute -top-20"></div>
          {activeTab === 'how-it-works' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-center mb-12">
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                  Get Started in{' '}
                  <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                    3 Simple Steps
                  </span>
                </h2>
                <p className="text-xl text-slate-400 max-w-3xl mx-auto">
                  From signup to your first profitable trade in minutes
                </p>
              </div>

              <div className="space-y-8 max-w-4xl mx-auto">
                {[
                  { 
                    step: '01', 
                    title: 'Create Your Account', 
                    description: 'Sign up with your email and mobile number. Verify your identity and connect your Dhan trading account securely.',
                    icon: Users
                  },
                  { 
                    step: '02', 
                    title: 'Configure Your Strategy', 
                    description: 'Set your trading preferences, risk limits, and let our AI analyze your trading style. Choose from pre-built strategies or customize your own.',
                    icon: Target
                  },
                  { 
                    step: '03', 
                    title: 'Start Trading', 
                    description: 'Activate automated trading and watch our AI execute high-probability trades. Monitor your portfolio in real-time and withdraw profits anytime.',
                    icon: Zap
                  }
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.2 }}
                    className="relative"
                  >
                    <div className="flex gap-6 items-start">
                      <div className="flex-shrink-0">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/10 border border-cyan-500/20 flex items-center justify-center">
                          <item.icon className="w-10 h-10 text-cyan-400" />
                        </div>
                      </div>
                      <div className="flex-1 bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6">
                        <div className="text-4xl font-bold text-cyan-400/20 mb-2">{item.step}</div>
                        <h3 className="text-2xl font-bold text-white mb-3">{item.title}</h3>
                        <p className="text-slate-400 leading-relaxed">{item.description}</p>
                      </div>
                    </div>
                    {index < 2 && (
                      <div className="absolute left-10 top-24 w-0.5 h-8 bg-gradient-to-b from-cyan-500/50 to-transparent"></div>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* Platform Preview Section */}
      <section id="demo" className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-black overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Watch{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Live Trading
              </span>
              {' '}in Action
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              See real-time AI signal detection, order execution, and profit generation
            </p>
          </motion.div>

          {/* Animated Trading Dashboard Demo */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-3xl blur-3xl"
              animate={{ opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            ></motion.div>
            
            <div className="relative bg-slate-900 border-2 border-cyan-500/20 rounded-3xl overflow-hidden shadow-2xl">
              {/* Browser Chrome */}
              <div className="bg-slate-800 px-4 py-3 flex items-center gap-2 border-b border-slate-700">
                <div className="flex gap-2">
                  <motion.div 
                    className="w-3 h-3 rounded-full bg-red-500"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  ></motion.div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="ml-4 flex-1 bg-slate-700 rounded px-3 py-1 text-xs text-slate-400 flex items-center gap-2">
                  <motion.div 
                    className="w-3 h-3 bg-green-500 rounded-full"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  ></motion.div>
                  indexpilotai.com/dashboard - Live Trading
                </div>
              </div>

              {/* Live Dashboard Content */}
              <div className="aspect-video bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
                
                {/* Status Bar - Engine Running */}
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="mb-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border-2 border-green-500/30"
                      animate={{ scale: [1, 1.02, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <motion.div
                        className="w-2 h-2 bg-green-500 rounded-full"
                        animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      ></motion.div>
                      <span className="text-green-400 text-sm font-semibold">Engine Running</span>
                    </motion.div>
                    
                    <motion.div
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, type: "spring" }}
                    >
                      <span className="text-blue-400 text-sm">15M Timeframe</span>
                    </motion.div>
                  </div>

                  <motion.div
                    className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <span className="text-emerald-400 text-sm font-bold">Total P&L: +₹12,450</span>
                  </motion.div>
                </motion.div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left Column - Market Data Cards */}
                  <div className="space-y-3">
                    {['NIFTY', 'BANKNIFTY', 'SENSEX'].map((index, i) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.2 }}
                        className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-semibold text-sm">{index}</span>
                          <motion.div
                            className="text-xs px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-400"
                            animate={{ opacity: [1, 0.5, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                          >
                            Analyzing...
                          </motion.div>
                        </div>
                        <motion.div
                          className="text-2xl font-bold text-green-400"
                          animate={{ y: [0, -2, 0] }}
                          transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
                        >
                          {index === 'NIFTY' ? '24,573.25' : index === 'BANKNIFTY' ? '52,847.50' : '81,234.75'}
                        </motion.div>
                        <div className="flex items-center gap-2 mt-1">
                          <TrendingUp className="w-3 h-3 text-green-400" />
                          <span className="text-xs text-green-400">+{(0.5 + i * 0.3).toFixed(2)}%</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Center Column - AI Signal Detection */}
                  <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700 relative overflow-hidden">
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-cyan-500/0"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    ></motion.div>
                    
                    <div className="relative">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-white font-semibold">AI Signal Detection</h3>
                        <motion.div
                          className="w-2 h-2 bg-cyan-400 rounded-full"
                          animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                        ></motion.div>
                      </div>

                      {/* Signal Animation Flow */}
                      <div className="space-y-3">
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1, duration: 0.5 }}
                          className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <motion.div
                              className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            >
                              <Activity className="w-4 h-4 text-white" />
                            </motion.div>
                            <span className="text-blue-400 text-sm font-semibold">Analyzing 42 indicators...</span>
                          </div>
                          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-blue-500"
                              initial={{ width: '0%' }}
                              animate={{ width: '100%' }}
                              transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
                            ></motion.div>
                          </div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 2, type: "spring" }}
                          className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-green-400 font-bold">BUY CALL Signal</span>
                            <span className="text-green-400 text-sm">95% Conf</span>
                          </div>
                          <div className="text-xs text-slate-400">NIFTY 24600 CE</div>
                        </motion.div>

                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 2.5, duration: 0.5 }}
                          className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <motion.div
                              animate={{ opacity: [1, 0.4, 1] }}
                              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                            >
                              <Zap className="w-4 h-4 text-yellow-400" />
                            </motion.div>
                            <span className="text-yellow-400 text-sm font-semibold">Executing Order...</span>
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Active Positions & Profit */}
                  <div className="space-y-3">
                    <div className="bg-slate-800/80 backdrop-blur-sm rounded-lg p-4 border border-slate-700">
                      <h3 className="text-white font-semibold mb-3">Active Positions</h3>
                      
                      <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 3 }}
                        className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg mb-2"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white text-sm font-semibold">NIFTY 24600 CE</span>
                          <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">HOLD</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Entry: ₹125.50</span>
                          <motion.span
                            className="text-sm font-bold text-green-400"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 1, repeat: Infinity }}
                          >
                            +₹4,250
                          </motion.span>
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 3.5 }}
                        className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white text-sm font-semibold">BANKNIFTY 52800 PE</span>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">HOLD</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">Entry: ₹342.75</span>
                          <motion.span
                            className="text-sm font-bold text-green-400"
                            animate={{ scale: [1, 1.1, 1] }}
                            transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                          >
                            +₹8,200
                          </motion.span>
                        </div>
                      </motion.div>
                    </div>

                    {/* Profit Animation */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 4, type: "spring" }}
                      className="bg-gradient-to-br from-emerald-500/20 to-green-500/20 backdrop-blur-sm rounded-lg p-4 border border-emerald-500/30 relative overflow-hidden"
                    >
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
                      ></motion.div>
                      
                      <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-emerald-400 text-sm font-semibold">Today's Profit</span>
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                        </div>
                        <motion.div
                          className="text-3xl font-bold text-emerald-400"
                          animate={{ scale: [1, 1.05, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          +₹12,450
                        </motion.div>
                        <div className="text-xs text-emerald-400/70 mt-1">+18.5% Return</div>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Live Activity Feed at Bottom */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 4.5 }}
                  className="mt-4 bg-slate-800/50 backdrop-blur-sm rounded-lg p-3 border border-slate-700"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <motion.div
                      className="w-2 h-2 bg-green-500 rounded-full"
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    ></motion.div>
                    <motion.span
                      className="text-slate-300"
                      animate={{ opacity: [1, 0.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      Live: 15M candle closing in 8:32 | AI analyzing market conditions | 3 positions monitored | Auto-exit enabled
                    </motion.span>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Feature Pills Below Demo */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="mt-8 flex flex-wrap justify-center gap-4"
            >
              {[
                { icon: Zap, text: 'Real-time AI Analysis', color: 'text-cyan-400' },
                { icon: Activity, text: '1-Second Updates', color: 'text-blue-400' },
                { icon: TrendingUp, text: 'Auto Entry/Exit', color: 'text-green-400' },
                { icon: DollarSign, text: 'Live P&L Tracking', color: 'text-emerald-400' }
              ].map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700"
                  >
                    <Icon className={`w-4 h-4 ${feature.color}`} />
                    <span className={`text-sm ${feature.color}`}>{feature.text}</span>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-black">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Trusted by{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Thousands
              </span>
            </h2>
            <p className="text-xl text-slate-400 max-w-3xl mx-auto">
              See what our traders are saying about IndexpilotAI
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { name: 'Rajesh Kumar', role: 'Day Trader', rating: 5, text: 'Increased my win rate from 45% to 68% in just 2 months. The AI signals are incredibly accurate!' },
              { name: 'Priya Sharma', role: 'Options Trader', rating: 5, text: 'Best platform for NIFTY options. The Dhan integration is seamless and execution is lightning fast.' },
              { name: 'Amit Patel', role: 'Professional Trader', rating: 5, text: 'Made ₹2.5L in profit last month. The risk management features saved me from several big losses.' }
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.2 }}
                className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-6"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-300 mb-6 leading-relaxed">"{testimonial.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold">
                    {testimonial.name[0]}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-slate-400">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 to-black">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Transform Your{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                Trading Journey?
              </span>
            </h2>
            <p className="text-xl text-slate-400 mb-8">
              Join 5,000+ traders already profiting with AI-powered trading
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                onClick={onSignUpClick}
                size="lg"
                className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-lg px-12 py-6 shadow-2xl shadow-cyan-500/20"
              >
                Start Free Trial
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                variant="outline"
                size="lg"
                onClick={onSignInClick}
                className="border-slate-700 bg-transparent text-white hover:bg-slate-800 text-lg px-12 py-6"
              >
                Sign In
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="relative bg-slate-950 border-t border-slate-800 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src={logoWhite} alt="IndexpilotAI Logo" className="h-10 w-auto" />
                <div>
                  <h3 className="text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">IndexpilotAI</h3>
                  <p className="text-xs text-slate-400">AI-Powered Trading</p>
                </div>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                India's most advanced AI-powered options trading platform.
              </p>
              
              {/* Dhan Account CTA in Footer */}
              <div className="mb-4">
                <a
                  href="https://login.dhan.co/?location=DH_WEB&refer=SMIL56887"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-sm font-semibold transition-all shadow-lg shadow-orange-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Open Dhan Account
                </a>
              </div>
              
              <div className="flex items-center gap-3">
                <a href="#" className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                  <Twitter className="w-5 h-5 text-slate-400" />
                </a>
                <a href="#" className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                  <Linkedin className="w-5 h-5 text-slate-400" />
                </a>
                <a href="#" className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors">
                  <Instagram className="w-5 h-5 text-slate-400" />
                </a>
              </div>
            </div>

            {/* Footer Sections - Only Static (Product, Company, Legal) */}
            {(content.footer?.sections || []).map((section: any) => (
              <div key={section.title}>
                <h4 className="text-white font-semibold mb-4">{section.title}</h4>
                <ul className="space-y-2">
                  {section.links.map((link: any, idx: number) => (
                    <li key={idx}>
                      {link.href.startsWith('/#') || link.href.startsWith('#') ? (
                        <a 
                          href={link.href}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          to={link.href}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-slate-400 text-sm">
                © 2026 IndexpilotAI. All rights reserved.
              </p>
              <div className="flex flex-col md:flex-row items-center gap-4">
                <p className="text-slate-500 text-xs">
                  Disclaimer: Trading in options involves risk. Past performance does not guarantee future results.
                </p>
                <a 
                  href="/manual-index" 
                  className="text-slate-500 hover:text-slate-400 text-xs transition-colors"
                  title="Manual Google indexing helper"
                >
                  🔍 SEO Tools
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
