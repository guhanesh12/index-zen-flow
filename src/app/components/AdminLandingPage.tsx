import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Globe,
  Save,
  RefreshCw,
  FileText,
  DollarSign,
  MessageSquare,
  Shield,
  Eye,
  Monitor,
  Smartphone,
  Star,
  TrendingUp,
  Zap,
  Image as ImageIcon,
  Youtube,
  Link as LinkIcon,
  Plus,
  Trash2,
  AlertCircle,
  Sparkles,
  Activity,
  BarChart3,
  Users,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { SEO, SEO_CONFIGS } from '../utils/seo';

interface AdminLandingPageProps {
  serverUrl: string;
  accessToken: string;
}

export function AdminLandingPage({ serverUrl, accessToken }: AdminLandingPageProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  
  const [content, setContent] = useState<any>({
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
      heroImage: "" // URL for hero image
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
      ],
      desktopPreviewImage: "",
      mobilePreviewImage: ""
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
    howItWorks: [
      { 
        step: '01', 
        title: 'Create Your Account', 
        description: 'Sign up with your email and mobile number. Verify your identity and connect your Dhan trading account securely.',
        icon: 'Users'
      },
      { 
        step: '02', 
        title: 'Configure Your Strategy', 
        description: 'Set your trading preferences, risk limits, and let our AI analyze your trading style. Choose from pre-built strategies or customize your own.',
        icon: 'Target'
      },
      { 
        step: '03', 
        title: 'Start Trading', 
        description: 'Activate automated trading and watch our AI execute high-probability trades. Monitor your portfolio in real-time and withdraw profits anytime.',
        icon: 'Zap'
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
    demo: {
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      title: "See IndexpilotAI in Action",
      description: "Watch this 5-minute demo to see how our AI-powered platform can transform your trading"
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
        linkedin: "https://linkedin.com/company/indexpilotai",
        instagram: "",
        youtube: ""
      },
      copyright: "© 2026 IndexpilotAI. All rights reserved.",
      disclaimer: "Trading in options involves risk. Past performance does not guarantee future results."
    }
  });

  const [customPages, setCustomPages] = useState<any[]>([]);
  const [editingPage, setEditingPage] = useState<any>(null);
  const [showPageEditor, setShowPageEditor] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadContent();
    loadPages();
  }, []);

  // Track changes
  useEffect(() => {
    if (!loading) {
      setHasChanges(true);
    }
  }, [content]);

  const loadContent = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/landing/content`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.content) {
          setContent(data.content);
          setHasChanges(false); // Reset changes flag after loading
        }
      }
    } catch (error) {
      console.error('Error loading landing page content:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPages = async () => {
    try {
      const response = await fetch(`${serverUrl}/landing/pages`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCustomPages(data.pages || []);
        }
      }
    } catch (error) {
      console.error('Error loading custom pages:', error);
    }
  };

  const saveContent = async () => {
    setSaving(true);
    console.log('💾 Saving landing page content...', content);
    try {
      const response = await fetch(`${serverUrl}/landing/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();
      console.log('📥 Save response:', data);

      if (response.ok && data.success) {
        toast.success('Landing page content saved successfully! ✅');
        console.log('✅ Content saved successfully');
        setHasChanges(false);
      } else {
        toast.error(data.message || 'Failed to save content');
        console.error('❌ Save failed:', data);
      }
    } catch (error) {
      console.error('❌ Error saving landing page content:', error);
      toast.error('Error saving content');
    } finally {
      setSaving(false);
    }
  };

  // Update functions
  const updateHero = (field: string, value: any) => {
    setContent((prev: any) => {
      const updated = {
        ...prev,
        hero: { ...(prev?.hero || {}), [field]: value }
      };
      console.log('Updated hero:', updated.hero);
      return updated;
    });
  };

  const updateHeroTitle = (part: 'part1' | 'part2' | 'part3', value: string) => {
    setContent((prev: any) => {
      const updated = {
        ...prev,
        hero: {
          ...(prev?.hero || {}),
          title: { ...(prev?.hero?.title || {}), [part]: value }
        }
      };
      console.log('Updated hero title:', updated.hero.title);
      return updated;
    });
  };

  const updateHeroButtons = (button: 'primary' | 'secondary', value: string) => {
    setContent((prev: any) => ({
      ...prev,
      hero: {
        ...prev.hero,
        buttons: { ...prev.hero.buttons, [button]: value }
      }
    }));
  };

  const updateStat = (index: number, field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      stats: (prev?.stats || []).map((s: any, i: number) => i === index ? { ...s, [field]: value } : s)
    }));
  };

  const updateDhan = (field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      dhan: { ...(prev?.dhan || {}), [field]: value }
    }));
  };

  const updateDhanFeature = (index: number, field: string, value: string) => {
    setContent((prev: any) => ({
      ...prev,
      dhan: {
        ...(prev?.dhan || {}),
        features: (prev?.dhan?.features || []).map((f: any, i: number) => i === index ? { ...f, [field]: value } : f)
      }
    }));
  };

  const updateFeature = (index: number, field: string, value: string) => {
    setContent((prev: any) => ({
      ...prev,
      features: (prev?.features || []).map((f: any, i: number) => i === index ? { ...f, [field]: value } : f)
    }));
  };

  const addFeature = () => {
    setContent((prev: any) => ({
      ...prev,
      features: [...(prev?.features || []), { title: 'New Feature', description: 'Description', icon: 'Sparkles' }]
    }));
  };

  const removeFeature = (index: number) => {
    setContent((prev: any) => ({
      ...prev,
      features: (prev?.features || []).filter((_: any, i: number) => i !== index)
    }));
  };

  const updateHowItWorks = (index: number, field: string, value: string) => {
    setContent((prev: any) => ({
      ...prev,
      howItWorks: (prev?.howItWorks || []).map((h: any, i: number) => i === index ? { ...h, [field]: value } : h)
    }));
  };

  const updatePricingTier = (index: number, field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      pricing: {
        ...(prev?.pricing || {}),
        tiers: (prev?.pricing?.tiers || []).map((t: any, i: number) => i === index ? { ...t, [field]: value } : t)
      }
    }));
  };

  const updateTestimonial = (index: number, field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      testimonials: (prev?.testimonials || []).map((t: any, i: number) => i === index ? { ...t, [field]: value } : t)
    }));
  };

  const addTestimonial = () => {
    setContent((prev: any) => ({
      ...prev,
      testimonials: [...prev.testimonials, { name: 'Customer Name', role: 'Role', rating: 5, text: 'Testimonial', avatar: 'C' }]
    }));
  };

  const removeTestimonial = (index: number) => {
    setContent((prev: any) => ({
      ...prev,
      testimonials: prev.testimonials.filter((_: any, i: number) => i !== index)
    }));
  };

  const updateFooter = (field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      footer: { ...prev.footer, [field]: value }
    }));
  };

  const updateFooterSection = (index: number, field: string, value: any) => {
    setContent((prev: any) => ({
      ...prev,
      footer: {
        ...prev.footer,
        sections: prev.footer.sections.map((s: any, i: number) => i === index ? { ...s, [field]: value } : s)
      }
    }));
  };

  const addFooterSection = () => {
    setContent((prev: any) => ({
      ...prev,
      footer: {
        ...prev.footer,
        sections: [...prev.footer.sections, { title: 'New Section', links: [] }]
      }
    }));
  };

  const removeFooterSection = (index: number) => {
    setContent((prev: any) => ({
      ...prev,
      footer: {
        ...prev.footer,
        sections: prev.footer.sections.filter((_: any, i: number) => i !== index)
      }
    }));
  };

  const updateSocial = (platform: string, value: string) => {
    setContent((prev: any) => ({
      ...prev,
      footer: {
        ...(prev?.footer || {}),
        social: { ...(prev?.footer?.social || {}), [platform]: value }
      }
    }));
  };

  // Page Management Functions
  const addNewPage = () => {
    setEditingPage({
      title: '',
      slug: '',
      content: '',
      enabled: true
    });
    setShowPageEditor(true);
  };

  const editPage = (page: any) => {
    setEditingPage({ ...page });
    setShowPageEditor(true);
  };

  const savePage = async () => {
    if (!editingPage?.title || !editingPage?.slug) {
      toast.error('Page title and slug are required');
      return;
    }

    try {
      const response = await fetch(`${serverUrl}/landing/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ page: editingPage }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Page saved successfully!');
        setShowPageEditor(false);
        setEditingPage(null);
        loadPages();
      } else {
        toast.error(data.message || 'Failed to save page');
      }
    } catch (error) {
      console.error('Error saving page:', error);
      toast.error('Error saving page');
    }
  };

  const deletePage = async (slug: string) => {
    if (!confirm('Are you sure you want to delete this page?')) return;

    try {
      const response = await fetch(`${serverUrl}/landing/pages/${slug}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Page deleted successfully!');
        loadPages();
      } else {
        toast.error(data.message || 'Failed to delete page');
      }
    } catch (error) {
      console.error('Error deleting page:', error);
      toast.error('Error deleting page');
    }
  };

  const togglePageEnabled = async (slug: string, enabled: boolean) => {
    try {
      const response = await fetch(`${serverUrl}/landing/pages/${slug}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ enabled }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success(`Page ${enabled ? 'enabled' : 'disabled'} successfully!`);
        loadPages();
      } else {
        toast.error(data.message || 'Failed to toggle page');
      }
    } catch (error) {
      console.error('Error toggling page:', error);
      toast.error('Error toggling page');
    }
  };

  return (
    <>
      <SEO {...SEO_CONFIGS.adminDashboard} />
      
      <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-blue-500/30 backdrop-blur-sm shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div 
                  className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl shadow-lg"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <Globe className="size-7 text-blue-400" />
                </motion.div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Landing Page Administration
                  </h2>
                  <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                    <Sparkles className="size-3" />
                    Complete landing page customization - hero, features, pricing, footer & more
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={loadContent}
                  variant="outline"
                  className="bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                  disabled={loading}
                >
                  <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  onClick={saveContent}
                  className={`${hasChanges ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/30' : 'bg-gradient-to-r from-slate-600 to-slate-700'}`}
                  disabled={saving}
                >
                  <Save className="size-4 mr-2" />
                  {saving ? 'Saving...' : hasChanges ? 'Save All Changes' : 'All Saved ✓'}
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-900/30 to-slate-900/30 border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Hero Section</p>
                <p className="text-xl font-bold text-white mt-2">Active</p>
              </div>
              <FileText className="size-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/30 border-purple-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Features</p>
                <p className="text-xl font-bold text-white mt-2">{content?.features?.length || 0}</p>
              </div>
              <Sparkles className="size-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-900/30 to-slate-900/30 border-green-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Pricing Tiers</p>
                <p className="text-xl font-bold text-white mt-2">{content?.pricing?.tiers?.length || 0}</p>
              </div>
              <DollarSign className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-yellow-900/30 to-slate-900/30 border-yellow-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Testimonials</p>
                <p className="text-xl font-bold text-white mt-2">{content?.testimonials?.length || 0}</p>
              </div>
              <MessageSquare className="size-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cyan-900/30 to-slate-900/30 border-cyan-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Custom Pages</p>
                <p className="text-xl font-bold text-white mt-2">{customPages.length}</p>
              </div>
              <FileText className="size-8 text-cyan-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Editor */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardContent className="p-6">
          <Tabs value={activeSection} onValueChange={setActiveSection}>
            <TabsList className="bg-slate-900/50 border border-slate-700 mb-6 grid grid-cols-7 gap-2">
              <TabsTrigger value="hero" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <FileText className="size-4" />
                <span className="hidden lg:inline">Hero</span>
              </TabsTrigger>
              <TabsTrigger value="stats-dhan" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <Activity className="size-4" />
                <span className="hidden lg:inline">Stats & Dhan</span>
              </TabsTrigger>
              <TabsTrigger value="features" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <Sparkles className="size-4" />
                <span className="hidden lg:inline">Features</span>
              </TabsTrigger>
              <TabsTrigger value="pricing" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <DollarSign className="size-4" />
                <span className="hidden lg:inline">Pricing</span>
              </TabsTrigger>
              <TabsTrigger value="social" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <MessageSquare className="size-4" />
                <span className="hidden lg:inline">Social</span>
              </TabsTrigger>
              <TabsTrigger value="footer" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <Globe className="size-4" />
                <span className="hidden lg:inline">Footer</span>
              </TabsTrigger>
              <TabsTrigger value="pages" className="data-[state=active]:bg-blue-600 flex items-center gap-2">
                <FileText className="size-4" />
                <span className="hidden lg:inline">Pages</span>
              </TabsTrigger>
            </TabsList>

            {/* HERO SECTION */}
            <TabsContent value="hero" className="space-y-6">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <FileText className="size-6 text-blue-400" />
                  Hero Section Configuration
                </h3>

                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Hero Badge & Title</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">Top Badge Text</Label>
                      <Input
                        value={content?.hero?.badge || ''}
                        onChange={(e) => updateHero('badge', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white"
                        placeholder="AI-Powered Trading Platform"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-slate-300">Title Part 1</Label>
                        <Input
                          value={content?.hero?.title?.part1 || ''}
                          onChange={(e) => updateHeroTitle('part1', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="Trade"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Title Part 2 (Gradient)</Label>
                        <Input
                          value={content?.hero?.title?.part2 || ''}
                          onChange={(e) => updateHeroTitle('part2', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="NIFTY Options"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Title Part 3</Label>
                        <Input
                          value={content?.hero?.title?.part3 || ''}
                          onChange={(e) => updateHeroTitle('part3', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="with AI"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-slate-300">Hero Description</Label>
                      <Textarea
                        value={content?.hero?.description || ''}
                        onChange={(e) => updateHero('description', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white min-h-24"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-300">Primary Button Text</Label>
                        <Input
                          value={content?.hero?.buttons?.primary || ''}
                          onChange={(e) => updateHeroButtons('primary', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Secondary Button Text</Label>
                        <Input
                          value={content?.hero?.buttons?.secondary || ''}
                          onChange={(e) => updateHeroButtons('secondary', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-slate-300">Trust Badge (Below buttons)</Label>
                      <Input
                        value={content?.hero?.trustBadge || ''}
                        onChange={(e) => updateHero('trustBadge', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white"
                        placeholder="5,000+ Active Traders"
                      />
                    </div>

                    <div>
                      <Label className="text-slate-300 flex items-center gap-2">
                        <ImageIcon className="size-4" />
                        Hero Image URL (Optional)
                      </Label>
                      <Input
                        value={content?.hero?.heroImage || ''}
                        onChange={(e) => updateHero('heroImage', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white"
                        placeholder="https://example.com/hero-image.png"
                      />
                      <p className="text-xs text-slate-500 mt-1">Upload to image hosting service and paste URL here</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* STATS & DHAN SECTION */}
            <TabsContent value="stats-dhan" className="space-y-6">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Activity className="size-6 text-purple-400" />
                  Stats & Dhan Integration Section
                </h3>

                {/* Stats */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Statistics Cards (4 Stats)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(content?.stats || []).map((stat: any, index: number) => (
                      <Card key={index} className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4">
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <Label className="text-slate-300 text-sm">Value</Label>
                              <Input
                                value={stat?.value || ''}
                                onChange={(e) => updateStat(index, 'value', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Label</Label>
                              <Input
                                value={stat?.label || ''}
                                onChange={(e) => updateStat(index, 'label', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Icon</Label>
                              <Input
                                value={stat?.icon || ''}
                                onChange={(e) => updateStat(index, 'icon', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="TrendingUp"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Color</Label>
                              <Input
                                value={stat?.color || ''}
                                onChange={(e) => updateStat(index, 'color', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="green"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>

                {/* Dhan Section */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Dhan API Integration Section</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">Dhan Badge</Label>
                      <Input
                        value={content?.dhan?.badge || ''}
                        onChange={(e) => updateDhan('badge', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Dhan Section Title</Label>
                      <Input
                        value={content?.dhan?.title || ''}
                        onChange={(e) => updateDhan('title', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Dhan Description</Label>
                      <Textarea
                        value={content?.dhan?.description || ''}
                        onChange={(e) => updateDhan('description', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white min-h-20"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="text-slate-300 text-lg">Dhan Features (3 items)</Label>
                      {(content?.dhan?.features || []).map((feature: any, index: number) => (
                        <Card key={index} className="bg-slate-800 border-slate-700">
                          <CardContent className="p-4 space-y-3">
                            <div className="grid grid-cols-3 gap-3">
                              <div className="col-span-1">
                                <Label className="text-slate-300 text-sm">Icon</Label>
                                <Input
                                  value={feature?.icon || ''}
                                  onChange={(e) => updateDhanFeature(index, 'icon', e.target.value)}
                                  className="bg-slate-900 border-slate-600 text-white"
                                  placeholder="Activity"
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-slate-300 text-sm">Title</Label>
                                <Input
                                  value={feature?.title || ''}
                                  onChange={(e) => updateDhanFeature(index, 'title', e.target.value)}
                                  className="bg-slate-900 border-slate-600 text-white"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Description</Label>
                              <Textarea
                                value={feature?.description || ''}
                                onChange={(e) => updateDhanFeature(index, 'description', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white min-h-16"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-300 flex items-center gap-2">
                          <Monitor className="size-4" />
                          Desktop Preview Image URL
                        </Label>
                        <Input
                          value={content?.dhan?.desktopPreviewImage || ''}
                          onChange={(e) => updateDhan('desktopPreviewImage', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="https://example.com/desktop-preview.png"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300 flex items-center gap-2">
                          <Smartphone className="size-4" />
                          Mobile Preview Image URL
                        </Label>
                        <Input
                          value={content?.dhan?.mobilePreviewImage || ''}
                          onChange={(e) => updateDhan('mobilePreviewImage', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="https://example.com/mobile-preview.png"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* FEATURES SECTION */}
            <TabsContent value="features" className="space-y-6">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Sparkles className="size-6 text-purple-400" />
                    Features & How It Works
                  </h3>
                  <Button onClick={addFeature} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="size-4 mr-2" />
                    Add Feature
                  </Button>
                </div>

                {/* Main Features */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Main Features List</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(content?.features || []).map((feature: any, index: number) => (
                      <Card key={index} className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <Label className="text-slate-300">Feature #{index + 1}</Label>
                            <Button
                              onClick={() => removeFeature(index)}
                              variant="outline"
                              size="sm"
                              className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-4 gap-3">
                            <div className="col-span-1">
                              <Label className="text-slate-300 text-sm">Icon</Label>
                              <Input
                                value={feature?.icon || ''}
                                onChange={(e) => updateFeature(index, 'icon', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="Zap"
                              />
                            </div>
                            <div className="col-span-3">
                              <Label className="text-slate-300 text-sm">Title</Label>
                              <Input
                                value={feature?.title || ''}
                                onChange={(e) => updateFeature(index, 'title', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Description</Label>
                            <Textarea
                              value={feature?.description || ''}
                              onChange={(e) => updateFeature(index, 'description', e.target.value)}
                              className="bg-slate-900 border-slate-600 text-white min-h-20"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>

                {/* How It Works */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">How It Works (3 Steps)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(content?.howItWorks || []).map((step: any, index: number) => (
                      <Card key={index} className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4 space-y-3">
                          <Label className="text-slate-300">Step {step?.step || index + 1}</Label>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-slate-300 text-sm">Icon</Label>
                              <Input
                                value={step?.icon || ''}
                                onChange={(e) => updateHowItWorks(index, 'icon', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="Users"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Title</Label>
                              <Input
                                value={step?.title || ''}
                                onChange={(e) => updateHowItWorks(index, 'title', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Description</Label>
                            <Textarea
                              value={step?.description || ''}
                              onChange={(e) => updateHowItWorks(index, 'description', e.target.value)}
                              className="bg-slate-900 border-slate-600 text-white min-h-20"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* PRICING SECTION */}
            <TabsContent value="pricing" className="space-y-6">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <DollarSign className="size-6 text-green-400" />
                  Pricing Configuration
                </h3>

                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Pricing Header</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">Pricing Section Title</Label>
                      <Input
                        value={content?.pricing?.title || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, pricing: { ...prev.pricing, title: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Pricing Description</Label>
                      <Textarea
                        value={content?.pricing?.description || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, pricing: { ...prev.pricing, description: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white min-h-16"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Pricing Tiers ({content?.pricing?.tiers?.length || 0} tiers)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(content?.pricing?.tiers || []).map((tier: any, index: number) => (
                      <Card key={index} className={`${tier?.popular ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-800 border-slate-700'}`}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <Label className="text-slate-300">Tier #{index + 1} {tier?.popular && '(POPULAR)'}</Label>
                            <Button
                              onClick={() => updatePricingTier(index, 'popular', !tier?.popular)}
                              variant="outline"
                              size="sm"
                              className="bg-blue-500/10 text-blue-400 border-blue-500 hover:bg-blue-500/20"
                            >
                              <Star className="size-4 mr-1" />
                              {tier?.popular ? 'Remove Popular' : 'Mark Popular'}
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-slate-300 text-sm">Profit Range</Label>
                              <Input
                                value={tier?.range || ''}
                                onChange={(e) => updatePricingTier(index, 'range', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="₹0 – ₹100"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Price</Label>
                              <Input
                                value={tier?.price || ''}
                                onChange={(e) => updatePricingTier(index, 'price', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="₹0"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Description</Label>
                              <Input
                                value={tier?.description || ''}
                                onChange={(e) => updatePricingTier(index, 'description', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                placeholder="Completely free"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Features (one per line)</Label>
                            <Textarea
                              value={(tier?.features || []).join('\n')}
                              onChange={(e) => updatePricingTier(index, 'features', e.target.value.split('\n').filter((f: string) => f.trim()))}
                              className="bg-slate-900 border-slate-600 text-white min-h-24"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Pricing Explanation & Auto-Debit</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">Pricing Explanation Text</Label>
                      <Textarea
                        value={content?.pricing?.explanation || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, pricing: { ...prev.pricing, explanation: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white min-h-24"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Auto-Debit Information</Label>
                      <Textarea
                        value={content?.pricing?.autoDebit || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, pricing: { ...prev.pricing, autoDebit: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white min-h-20"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* SOCIAL SECTION */}
            <TabsContent value="social" className="space-y-6">
              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <MessageSquare className="size-6 text-yellow-400" />
                  Testimonials & Demo Video
                </h3>

                {/* Testimonials */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Customer Testimonials</CardTitle>
                    <Button onClick={addTestimonial} className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="size-4 mr-2" />
                      Add Testimonial
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(content?.testimonials || []).map((testimonial: any, index: number) => (
                      <Card key={index} className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <Label className="text-slate-300">Testimonial #{index + 1}</Label>
                            <Button
                              onClick={() => removeTestimonial(index)}
                              variant="outline"
                              size="sm"
                              className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <Label className="text-slate-300 text-sm">Name</Label>
                              <Input
                                value={testimonial?.name || ''}
                                onChange={(e) => updateTestimonial(index, 'name', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Role</Label>
                              <Input
                                value={testimonial?.role || ''}
                                onChange={(e) => updateTestimonial(index, 'role', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-slate-300 text-sm">Avatar (1 letter)</Label>
                              <Input
                                value={testimonial?.avatar || ''}
                                onChange={(e) => updateTestimonial(index, 'avatar', e.target.value)}
                                className="bg-slate-900 border-slate-600 text-white"
                                maxLength={1}
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Rating (1-5)</Label>
                            <Input
                              type="number"
                              min="1"
                              max="5"
                              value={testimonial?.rating || 5}
                              onChange={(e) => updateTestimonial(index, 'rating', parseInt(e.target.value))}
                              className="bg-slate-900 border-slate-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Testimonial Text</Label>
                            <Textarea
                              value={testimonial?.text || ''}
                              onChange={(e) => updateTestimonial(index, 'text', e.target.value)}
                              className="bg-slate-900 border-slate-600 text-white min-h-24"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>

                {/* Demo Video */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Youtube className="size-5 text-red-500" />
                      Demo Video Section
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">YouTube Video URL</Label>
                      <Input
                        value={content?.demo?.youtubeUrl || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, demo: { ...prev.demo, youtubeUrl: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white"
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Demo Section Title</Label>
                      <Input
                        value={content?.demo?.title || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, demo: { ...prev.demo, title: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">Demo Description</Label>
                      <Textarea
                        value={content?.demo?.description || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, demo: { ...prev.demo, description: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white min-h-20"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* CTA Section */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Final CTA Section</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">CTA Title</Label>
                      <Input
                        value={content?.cta?.title || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, cta: { ...prev.cta, title: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">CTA Description</Label>
                      <Textarea
                        value={content?.cta?.description || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, cta: { ...prev.cta, description: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white min-h-16"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300">CTA Button Text</Label>
                      <Input
                        value={content?.cta?.button || ''}
                        onChange={(e) => setContent((prev: any) => ({ ...prev, cta: { ...prev.cta, button: e.target.value } }))}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* FOOTER SECTION */}
            <TabsContent value="footer" className="space-y-6">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Globe className="size-6 text-cyan-400" />
                    Footer Configuration
                  </h3>
                  <Button onClick={addFooterSection} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="size-4 mr-2" />
                    Add Footer Section
                  </Button>
                </div>

                {/* Brand Info */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Brand Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-300">Brand Name</Label>
                        <Input
                          value={content?.footer?.brand || ''}
                          onChange={(e) => updateFooter('brand', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Tagline</Label>
                        <Input
                          value={content?.footer?.tagline || ''}
                          onChange={(e) => updateFooter('tagline', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-300">Brand Description</Label>
                      <Textarea
                        value={content?.footer?.description || ''}
                        onChange={(e) => updateFooter('description', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white min-h-16"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Footer Sections */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Footer Link Sections</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(content?.footer?.sections || []).map((section: any, index: number) => (
                      <Card key={index} className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <Label className="text-slate-300">Section #{index + 1}</Label>
                            <Button
                              onClick={() => removeFooterSection(index)}
                              variant="outline"
                              size="sm"
                              className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Section Title</Label>
                            <Input
                              value={section?.title || ''}
                              onChange={(e) => updateFooterSection(index, 'title', e.target.value)}
                              className="bg-slate-900 border-slate-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-slate-300 text-sm">Links (JSON format)</Label>
                            <Textarea
                              value={JSON.stringify(section?.links || [], null, 2)}
                              onChange={(e) => {
                                try {
                                  const links = JSON.parse(e.target.value);
                                  updateFooterSection(index, 'links', links);
                                } catch (err) {
                                  // Invalid JSON, don't update
                                }
                              }}
                              className="bg-slate-900 border-slate-600 text-white min-h-32 font-mono text-xs"
                              placeholder='[{"label": "Features", "href": "#features"}]'
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </CardContent>
                </Card>

                {/* Social Media */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Social Media Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-slate-300">Twitter URL</Label>
                        <Input
                          value={content?.footer?.social?.twitter || ''}
                          onChange={(e) => updateSocial('twitter', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="https://twitter.com/..."
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">LinkedIn URL</Label>
                        <Input
                          value={content?.footer?.social?.linkedin || ''}
                          onChange={(e) => updateSocial('linkedin', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="https://linkedin.com/company/..."
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">Instagram URL</Label>
                        <Input
                          value={content?.footer?.social?.instagram || ''}
                          onChange={(e) => updateSocial('instagram', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="https://instagram.com/..."
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300">YouTube URL</Label>
                        <Input
                          value={content?.footer?.social?.youtube || ''}
                          onChange={(e) => updateSocial('youtube', e.target.value)}
                          className="bg-slate-800 border-slate-600 text-white"
                          placeholder="https://youtube.com/@..."
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Copyright & Disclaimer */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Copyright & Risk Disclaimer</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-slate-300">Copyright Text</Label>
                      <Input
                        value={content?.footer?.copyright || ''}
                        onChange={(e) => updateFooter('copyright', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white"
                      />
                    </div>
                    <div>
                      <Label className="text-slate-300 flex items-center gap-2">
                        <AlertCircle className="size-4 text-yellow-400" />
                        Risk Disclaimer
                      </Label>
                      <Textarea
                        value={content?.footer?.disclaimer || ''}
                        onChange={(e) => updateFooter('disclaimer', e.target.value)}
                        className="bg-slate-800 border-slate-600 text-white min-h-20"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Custom Pages Info in Footer Tab */}
                <Card className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border-cyan-500/30">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <FileText className="size-5 text-cyan-400" />
                      Custom Pages Preview
                    </CardTitle>
                    <p className="text-sm text-slate-400">
                      Currently active pages: {customPages.length}. Switch to "Pages" tab to add/edit pages like Terms, Privacy, etc.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {customPages.map((page: any, index: number) => (
                        <Badge key={index} variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500">
                          {page.title} ({page.enabled ? 'Visible' : 'Hidden'})
                        </Badge>
                      ))}
                      {customPages.length === 0 && (
                        <p className="text-slate-500 text-sm">No custom pages yet. Go to "Pages" tab to create them.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* PAGES TAB - Custom Pages Manager */}
            <TabsContent value="pages" className="space-y-6">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                    <FileText className="size-6 text-cyan-400" />
                    Custom Pages Management
                  </h3>
                  <Button onClick={addNewPage} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 shadow-lg">
                    <Plus className="size-4 mr-2" />
                    Add New Page
                  </Button>
                </div>

                {/* Page Editor Modal */}
                {showPageEditor && (
                  <Card className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 border-blue-500/50 shadow-2xl">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FileText className="size-5 text-blue-400" />
                          {editingPage?.slug ? 'Edit Page' : 'Create New Page'}
                        </span>
                        <Button 
                          onClick={() => {
                            setShowPageEditor(false);
                            setEditingPage(null);
                          }}
                          variant="outline"
                          size="sm"
                          className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
                        >
                          <X className="size-4" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-slate-300">Page Title</Label>
                          <Input
                            value={editingPage?.title || ''}
                            onChange={(e) => setEditingPage((prev: any) => ({ ...prev, title: e.target.value }))}
                            className="bg-slate-800 border-slate-600 text-white"
                            placeholder="Privacy Policy"
                          />
                        </div>
                        <div>
                          <Label className="text-slate-300">Page Slug (URL)</Label>
                          <Input
                            value={editingPage?.slug || ''}
                            onChange={(e) => setEditingPage((prev: any) => ({ ...prev, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                            className="bg-slate-800 border-slate-600 text-white font-mono"
                            placeholder="privacy-policy"
                          />
                          <p className="text-xs text-slate-500 mt-1">URL will be: /page/{editingPage?.slug || 'slug'}</p>
                        </div>
                      </div>

                      <div>
                        <Label className="text-slate-300">Page Content (Markdown/HTML supported)</Label>
                        <Textarea
                          value={editingPage?.content || ''}
                          onChange={(e) => setEditingPage((prev: any) => ({ ...prev, content: e.target.value }))}
                          className="bg-slate-800 border-slate-600 text-white font-mono min-h-96"
                          placeholder="# Privacy Policy&#10;&#10;Your content here...&#10;&#10;You can use **markdown** or HTML."
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={editingPage?.enabled ?? true}
                          onChange={(e) => setEditingPage((prev: any) => ({ ...prev, enabled: e.target.checked }))}
                          className="w-4 h-4"
                        />
                        <Label className="text-slate-300">Enable this page (visible in footer)</Label>
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={savePage}
                          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 flex-1"
                        >
                          <Save className="size-4 mr-2" />
                          Save Page
                        </Button>
                        <Button
                          onClick={() => {
                            setShowPageEditor(false);
                            setEditingPage(null);
                          }}
                          variant="outline"
                          className="bg-slate-700 border-slate-600 hover:bg-slate-600"
                        >
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Pages List */}
                <Card className="bg-slate-900/50 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Existing Pages ({customPages.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {customPages.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="size-16 text-slate-600 mx-auto mb-4" />
                        <p className="text-slate-400 text-lg mb-2">No custom pages yet</p>
                        <p className="text-slate-500 text-sm mb-4">
                          Create pages like Privacy Policy, Terms & Conditions, About Us, etc.
                        </p>
                        <Button onClick={addNewPage} className="bg-cyan-600 hover:bg-cyan-700">
                          <Plus className="size-4 mr-2" />
                          Create Your First Page
                        </Button>
                      </div>
                    ) : (
                      customPages.map((page: any, index: number) => (
                        <Card key={index} className={`${page.enabled ? 'bg-slate-800 border-slate-700' : 'bg-slate-800/50 border-slate-700/50'}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="text-lg font-semibold text-white">{page.title}</h4>
                                  <Badge variant={page.enabled ? 'default' : 'outline'} className={page.enabled ? 'bg-green-500' : 'bg-slate-600'}>
                                    {page.enabled ? 'Visible' : 'Hidden'}
                                  </Badge>
                                </div>
                                <p className="text-sm text-slate-400 mb-1">
                                  <span className="font-mono text-cyan-400">/page/{page.slug}</span>
                                </p>
                                <p className="text-xs text-slate-500">
                                  {page.content?.length || 0} characters
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  onClick={() => editPage(page)}
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <FileText className="size-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  onClick={() => togglePageEnabled(page.slug, !page.enabled)}
                                  size="sm"
                                  variant="outline"
                                  className={page.enabled ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500' : 'bg-green-500/10 text-green-400 border-green-500'}
                                >
                                  <Eye className="size-4 mr-1" />
                                  {page.enabled ? 'Hide' : 'Show'}
                                </Button>
                                <Button
                                  onClick={() => deletePage(page.slug)}
                                  size="sm"
                                  variant="outline"
                                  className="bg-red-500/10 text-red-400 border-red-500 hover:bg-red-500/20"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Save Button at Bottom */}
      <Card className={`${hasChanges ? 'bg-gradient-to-r from-orange-900/30 to-red-900/30 border-orange-500/30' : 'bg-gradient-to-r from-green-900/30 to-emerald-900/30 border-green-500/30'}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className={`size-6 ${hasChanges ? 'text-orange-400' : 'text-green-400'}`} />
              <div>
                <p className="text-white font-semibold">
                  {hasChanges ? '⚠️ You have unsaved changes!' : '✅ All changes saved'}
                </p>
                <p className="text-sm text-slate-400">
                  {hasChanges ? 'Click the button to publish changes to the live landing page' : 'Your landing page is up to date'}
                </p>
              </div>
            </div>
            <Button
              onClick={saveContent}
              size="lg"
              className={`${hasChanges ? 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 shadow-lg shadow-orange-500/30' : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-500/30'}`}
              disabled={saving}
            >
              <Save className="size-5 mr-2" />
              {saving ? 'Saving All Changes...' : hasChanges ? 'Save All Changes Now!' : 'All Saved ✓'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
