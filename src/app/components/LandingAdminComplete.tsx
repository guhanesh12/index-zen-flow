import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Save, RefreshCw, Plus, Trash2, Edit2, Check, X,
  Home, DollarSign, Users, Star, FileText, Shield, Settings,
  Zap, BarChart3, MessageSquare, Link as LinkIcon, FileEdit
} from 'lucide-react';
import { Button } from './ui/button';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { getBaseUrl } from '../utils/apiService';
import PagesManager from './PagesManager';
import { HeroEditorEnhanced } from './HeroEditorEnhanced';
import SocialMediaEditor from './SocialMediaEditor';

interface LandingAdminCompleteProps {
  accessToken: string;
  onClose: () => void;
}

export default function LandingAdminComplete({ accessToken, onClose }: LandingAdminCompleteProps) {
  const [content, setContent] = useState<any>(null);
  const [termsContent, setTermsContent] = useState<any>(null);
  const [privacyContent, setPrivacyContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const serverUrl = getBaseUrl();

  useEffect(() => {
    loadAllContent();
  }, []);

  const loadAllContent = async () => {
    try {
      setLoading(true);
      const [landingRes, termsRes, privacyRes] = await Promise.all([
        fetch(`${serverUrl}/landing/content`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${serverUrl}/landing/terms`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${serverUrl}/landing/privacy`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      const [landingData, termsData, privacyData] = await Promise.all([
        landingRes.json(),
        termsRes.json(),
        privacyRes.json()
      ]);

      if (landingData.success) setContent(landingData.content);
      if (termsData.success) setTermsContent(termsData.content);
      if (privacyData.success) setPrivacyContent(privacyData.content);

    } catch (error: any) {
      console.error('Error loading content:', error);
      showMessage('error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveSection = async (section: string, data: any) => {
    try {
      setSaving(true);
      const response = await fetch(`${serverUrl}/landing/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ section, data })
      });

      const result = await response.json();
      
      if (result.success) {
        setContent(result.content);
        showMessage('success', `${section} section updated successfully!`);
      } else {
        showMessage('error', result.error || 'Failed to save');
      }
    } catch (error: any) {
      console.error('Error saving content:', error);
      showMessage('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveTerms = async (data: any) => {
    try {
      setSaving(true);
      const response = await fetch(`${serverUrl}/landing/terms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        setTermsContent(result.content);
        showMessage('success', 'Terms & Conditions updated successfully!');
      } else {
        showMessage('error', result.error || 'Failed to save');
      }
    } catch (error: any) {
      showMessage('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const savePrivacy = async (data: any) => {
    try {
      setSaving(true);
      const response = await fetch(`${serverUrl}/landing/privacy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      
      if (result.success) {
        setPrivacyContent(result.content);
        showMessage('success', 'Privacy Policy updated successfully!');
      } else {
        showMessage('error', result.error || 'Failed to save');
      }
    } catch (error: any) {
      showMessage('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const updateField = (path: string[], value: any) => {
    const newContent = { ...content };
    let current = newContent;
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    setContent(newContent);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  const sections = [
    { id: 'hero', label: 'Hero Section', icon: Home },
    { id: 'stats', label: 'Stats', icon: BarChart3 },
    { id: 'dhan', label: 'Dhan Integration', icon: Zap },
    { id: 'features', label: 'Features', icon: Star },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'trailingStopLoss', label: 'Trailing Stop-Loss', icon: Shield },
    { id: 'testimonials', label: 'Testimonials', icon: MessageSquare },
    { id: 'cta', label: 'CTA Section', icon: Star },
    { id: 'pages', label: 'Pages Manager', icon: FileEdit },
    { id: 'social', label: 'Social Media', icon: LinkIcon },
    { id: 'footer', label: 'Footer', icon: FileText },
    { id: 'terms', label: 'Terms & Conditions', icon: Shield },
    { id: 'privacy', label: 'Privacy Policy', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-600 z-[100]" />

      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Settings className="w-6 h-6 text-cyan-400" />
                Landing Page Admin
              </h1>
              <p className="text-sm text-slate-400 mt-1">Manage all landing page content & legal pages</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={loadAllContent}
                disabled={loading}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Reload
              </Button>
              <Button
                onClick={onClose}
                className="bg-slate-800 hover:bg-slate-700 text-white"
              >
                <X className="w-4 h-4 mr-2" />
                Close Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Message Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-20 right-6 z-[60]"
          >
            <div className={`px-6 py-3 rounded-lg shadow-2xl backdrop-blur-xl border ${
              message.type === 'success' 
                ? 'bg-green-500/90 border-green-400 text-white' 
                : 'bg-red-500/90 border-red-400 text-white'
            }`}>
              <div className="flex items-center gap-2">
                {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                <span className="font-medium">{message.text}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sticky top-24">
              <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Sections</h3>
              <div className="space-y-1">
                {sections.map((section) => (
                  <motion.button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      activeSection === section.id
                        ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/10'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <section.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{section.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* Content Editor */}
          <div className="lg:col-span-3">
            <motion.div 
              className="bg-slate-900 rounded-xl border border-slate-800 p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {activeSection === 'hero' && content?.hero && (
                <HeroEditorEnhanced 
                  data={content.hero} 
                  onChange={(data) => updateField(['hero'], data)}
                  onSave={() => saveSection('hero', content.hero)}
                  saving={saving}
                />
              )}

              {activeSection === 'stats' && content?.stats && (
                <StatsEditor 
                  data={content.stats} 
                  onChange={(data) => updateField(['stats'], data)}
                  onSave={() => saveSection('stats', content.stats)}
                  saving={saving}
                />
              )}

              {activeSection === 'dhan' && content?.dhan && (
                <DhanEditor 
                  data={content.dhan} 
                  onChange={(data) => updateField(['dhan'], data)}
                  onSave={() => saveSection('dhan', content.dhan)}
                  saving={saving}
                />
              )}

              {activeSection === 'features' && content?.features && (
                <FeaturesEditor 
                  data={content.features} 
                  onChange={(data) => updateField(['features'], data)}
                  onSave={() => saveSection('features', content.features)}
                  saving={saving}
                />
              )}

              {activeSection === 'pricing' && content?.pricing && (
                <PricingEditor 
                  data={content.pricing} 
                  onChange={(data) => updateField(['pricing'], data)}
                  onSave={() => saveSection('pricing', content.pricing)}
                  saving={saving}
                />
              )}

              {activeSection === 'trailingStopLoss' && content?.trailingStopLoss && (
                <TrailingStopLossEditor 
                  data={content.trailingStopLoss} 
                  onChange={(data) => updateField(['trailingStopLoss'], data)}
                  onSave={() => saveSection('trailingStopLoss', content.trailingStopLoss)}
                  saving={saving}
                />
              )}

              {activeSection === 'testimonials' && content?.testimonials && (
                <TestimonialsEditor 
                  data={content.testimonials} 
                  onChange={(data) => updateField(['testimonials'], data)}
                  onSave={() => saveSection('testimonials', content.testimonials)}
                  saving={saving}
                />
              )}

              {activeSection === 'cta' && content?.cta && (
                <CTAEditor 
                  data={content.cta} 
                  onChange={(data) => updateField(['cta'], data)}
                  onSave={() => saveSection('cta', content.cta)}
                  saving={saving}
                />
              )}

              {activeSection === 'pages' && (
                <PagesManager accessToken={accessToken} />
              )}

              {activeSection === 'social' && (
                <SocialMediaEditor accessToken={accessToken} />
              )}

              {activeSection === 'footer' && content?.footer && (
                <FooterEditor 
                  data={content.footer} 
                  onChange={(data) => updateField(['footer'], data)}
                  onSave={() => saveSection('footer', content.footer)}
                  saving={saving}
                />
              )}

              {activeSection === 'terms' && termsContent && (
                <SimpleTextEditor 
                  title="Terms & Conditions"
                  data={termsContent}
                  onChange={setTermsContent}
                  onSave={() => saveTerms(termsContent)}
                  saving={saving}
                />
              )}

              {activeSection === 'privacy' && privacyContent && (
                <SimpleTextEditor 
                  title="Privacy Policy"
                  data={privacyContent}
                  onChange={setPrivacyContent}
                  onSave={() => savePrivacy(privacyContent)}
                  saving={saving}
                />
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Individual Section Editors
function StatsEditor({ data, onChange, onSave, saving }: any) {
  const updateStat = (index: number, field: string, value: any) => {
    const newStats = [...data];
    newStats[index] = { ...newStats[index], [field]: value };
    onChange(newStats);
  };

  return (
    <div className="space-y-6">
      <EditorHeader title="Stats Section" onSave={onSave} saving={saving} />

      <div className="grid md:grid-cols-2 gap-4">
        {data.map((stat: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <div className="text-xs font-semibold text-slate-400 mb-3">STAT #{index + 1}</div>
            <div className="space-y-3">
              <InputField
                label="Value"
                value={stat.value}
                onChange={(value) => updateStat(index, 'value', value)}
              />
              <InputField
                label="Label"
                value={stat.label}
                onChange={(value) => updateStat(index, 'label', value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DhanEditor({ data, onChange, onSave, saving }: any) {
  const updateFeature = (index: number, field: string, value: any) => {
    const newFeatures = [...data.features];
    newFeatures[index] = { ...newFeatures[index], [field]: value };
    onChange({ ...data, features: newFeatures });
  };

  return (
    <div className="space-y-6">
      <EditorHeader title="Dhan Integration Section" onSave={onSave} saving={saving} />

      <InputField
        label="Badge Text"
        value={data.badge}
        onChange={(value) => onChange({ ...data, badge: value })}
      />

      <InputField
        label="Title"
        value={data.title}
        onChange={(value) => onChange({ ...data, title: value })}
      />

      <TextAreaField
        label="Description"
        value={data.description}
        onChange={(value) => onChange({ ...data, description: value })}
        rows={2}
      />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Features</h3>
        {data.features.map((feature: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
            <div className="text-xs font-semibold text-slate-400">FEATURE #{index + 1}</div>
            <InputField
              label="Title"
              value={feature.title}
              onChange={(value) => updateFeature(index, 'title', value)}
            />
            <TextAreaField
              label="Description"
              value={feature.description}
              onChange={(value) => updateFeature(index, 'description', value)}
              rows={2}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function FeaturesEditor({ data, onChange, onSave, saving }: any) {
  const updateFeature = (index: number, field: string, value: any) => {
    const newFeatures = [...data];
    newFeatures[index] = { ...newFeatures[index], [field]: value };
    onChange(newFeatures);
  };

  const addFeature = () => {
    onChange([...data, { title: '', description: '', icon: 'Star' }]);
  };

  const removeFeature = (index: number) => {
    onChange(data.filter((_: any, i: number) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Features Section</h2>
        <div className="flex gap-2">
          <Button onClick={addFeature} variant="outline" className="border-slate-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add Feature
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {data.map((feature: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">FEATURE #{index + 1}</span>
              <button onClick={() => removeFeature(index)} className="text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <InputField
              label="Title"
              value={feature.title}
              onChange={(value) => updateFeature(index, 'title', value)}
            />
            <TextAreaField
              label="Description"
              value={feature.description}
              onChange={(value) => updateFeature(index, 'description', value)}
              rows={2}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PricingEditor({ data, onChange, onSave, saving }: any) {
  const updateTier = (index: number, field: string, value: any) => {
    const newTiers = [...data.tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    onChange({ ...data, tiers: newTiers });
  };

  return (
    <div className="space-y-6">
      <EditorHeader title="Pricing Section" onSave={onSave} saving={saving} />

      <InputField
        label="Title"
        value={data.title}
        onChange={(value) => onChange({ ...data, title: value })}
      />

      <TextAreaField
        label="Description"
        value={data.description}
        onChange={(value) => onChange({ ...data, description: value })}
        rows={2}
      />

      <TextAreaField
        label="Auto Debit Message"
        value={data.autoDebit}
        onChange={(value) => onChange({ ...data, autoDebit: value })}
        rows={3}
      />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Pricing Tiers</h3>
        {data.tiers.map((tier: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-400">TIER #{index + 1}</span>
              {tier.popular && <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-full">POPULAR</span>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <InputField
                label="Range"
                value={tier.range}
                onChange={(value) => updateTier(index, 'range', value)}
              />
              <InputField
                label="Price"
                value={tier.price}
                onChange={(value) => updateTier(index, 'price', value)}
              />
              <InputField
                label="Description"
                value={tier.description}
                onChange={(value) => updateTier(index, 'description', value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrailingStopLossEditor({ data, onChange, onSave, saving }: any) {
  const updateStep = (section: 'howItWorks' | 'liveExample', index: number, field: string, value: any) => {
    const newSteps = [...data[section].steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    onChange({ ...data, [section]: { ...data[section], steps: newSteps } });
  };

  const updateBenefit = (index: number, field: string, value: any) => {
    const newBenefits = [...data.benefits];
    newBenefits[index] = { ...newBenefits[index], [field]: value };
    onChange({ ...data, benefits: newBenefits });
  };

  const addStep = (section: 'howItWorks' | 'liveExample') => {
    const newStep = section === 'howItWorks' 
      ? { number: '1', title: '', description: '', color: 'blue' }
      : { profit: '₹0', target: '₹0', sl: '₹0', description: '', locked: false };
    onChange({ ...data, [section]: { ...data[section], steps: [...data[section].steps, newStep] } });
  };

  const removeStep = (section: 'howItWorks' | 'liveExample', index: number) => {
    onChange({ 
      ...data, 
      [section]: { 
        ...data[section], 
        steps: data[section].steps.filter((_: any, i: number) => i !== index) 
      } 
    });
  };

  const addBenefit = () => {
    onChange({ ...data, benefits: [...data.benefits, { title: '', description: '', icon: 'Shield' }] });
  };

  const removeBenefit = (index: number) => {
    onChange({ ...data, benefits: data.benefits.filter((_: any, i: number) => i !== index) });
  };

  return (
    <div className="space-y-8">
      <EditorHeader title="Trailing Stop-Loss Section" onSave={onSave} saving={saving} />

      {/* Header Section */}
      <div className="space-y-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Header Content</h3>
        
        <InputField
          label="Badge Text"
          value={data.badge}
          onChange={(value) => onChange({ ...data, badge: value })}
          placeholder="ADVANCED FEATURE"
        />

        <div className="grid grid-cols-3 gap-3">
          <InputField
            label="Title Part 1"
            value={data.title.part1}
            onChange={(value) => onChange({ ...data, title: { ...data.title, part1: value } })}
            placeholder="Unlimited"
          />
          <InputField
            label="Title Part 2 (Highlighted)"
            value={data.title.part2}
            onChange={(value) => onChange({ ...data, title: { ...data.title, part2: value } })}
            placeholder="Profit Locking"
          />
          <InputField
            label="Title Part 3"
            value={data.title.part3}
            onChange={(value) => onChange({ ...data, title: { ...data.title, part3: value } })}
            placeholder="with Trailing Stop-Loss"
          />
        </div>

        <TextAreaField
          label="Subtitle"
          value={data.subtitle}
          onChange={(value) => onChange({ ...data, subtitle: value })}
          rows={3}
        />
      </div>

      {/* How It Works Section */}
      <div className="space-y-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">How It Works Steps</h3>
          <Button onClick={() => addStep('howItWorks')} variant="outline" size="sm" className="border-slate-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Step
          </Button>
        </div>

        <InputField
          label="Section Title"
          value={data.howItWorks.title}
          onChange={(value) => onChange({ ...data, howItWorks: { ...data.howItWorks, title: value } })}
        />

        <div className="space-y-3">
          {data.howItWorks.steps.map((step: any, index: number) => (
            <div key={index} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">STEP #{index + 1}</span>
                <Button 
                  onClick={() => removeStep('howItWorks', index)} 
                  variant="ghost" 
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <InputField
                  label="Number"
                  value={step.number}
                  onChange={(value) => updateStep('howItWorks', index, 'number', value)}
                />
                <div className="col-span-3">
                  <InputField
                    label="Title"
                    value={step.title}
                    onChange={(value) => updateStep('howItWorks', index, 'title', value)}
                  />
                </div>
              </div>
              <TextAreaField
                label="Description"
                value={step.description}
                onChange={(value) => updateStep('howItWorks', index, 'description', value)}
                rows={2}
              />
              <div className="flex gap-2">
                <label className="text-sm text-slate-400">Color:</label>
                {['blue', 'cyan', 'green'].map((color) => (
                  <button
                    key={color}
                    onClick={() => updateStep('howItWorks', index, 'color', color)}
                    className={`px-3 py-1 rounded-md text-sm ${
                      step.color === color 
                        ? `bg-${color}-500/20 text-${color}-400 border border-${color}-500` 
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Example Section */}
      <div className="space-y-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Live Example Steps</h3>
          <Button onClick={() => addStep('liveExample')} variant="outline" size="sm" className="border-slate-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Step
          </Button>
        </div>

        <InputField
          label="Section Title"
          value={data.liveExample.title}
          onChange={(value) => onChange({ ...data, liveExample: { ...data.liveExample, title: value } })}
        />

        <div className="space-y-3">
          {data.liveExample.steps.map((step: any, index: number) => (
            <div key={index} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">EXAMPLE #{index + 1}</span>
                <Button 
                  onClick={() => removeStep('liveExample', index)} 
                  variant="ghost" 
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <InputField
                  label="Profit"
                  value={step.profit}
                  onChange={(value) => updateStep('liveExample', index, 'profit', value)}
                  placeholder="₹1,000"
                />
                <InputField
                  label="Target"
                  value={step.target}
                  onChange={(value) => updateStep('liveExample', index, 'target', value)}
                  placeholder="₹3,500"
                />
                <InputField
                  label="Stop Loss"
                  value={step.sl}
                  onChange={(value) => updateStep('liveExample', index, 'sl', value)}
                  placeholder="₹1,500"
                />
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={step.locked || false}
                      onChange={(e) => updateStep('liveExample', index, 'locked', e.target.checked)}
                      className="w-4 h-4"
                    />
                    Locked
                  </label>
                </div>
              </div>
              <InputField
                label="Description"
                value={step.description}
                onChange={(value) => updateStep('liveExample', index, 'description', value)}
                placeholder="Trailing activated"
              />
            </div>
          ))}
        </div>

        <TextAreaField
          label="Footer Message"
          value={data.liveExample.footer}
          onChange={(value) => onChange({ ...data, liveExample: { ...data.liveExample, footer: value } })}
          rows={2}
        />
      </div>

      {/* Benefits Section */}
      <div className="space-y-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Key Benefits</h3>
          <Button onClick={addBenefit} variant="outline" size="sm" className="border-slate-600">
            <Plus className="w-4 h-4 mr-2" />
            Add Benefit
          </Button>
        </div>

        <div className="space-y-3">
          {data.benefits.map((benefit: any, index: number) => (
            <div key={index} className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">BENEFIT #{index + 1}</span>
                <Button 
                  onClick={() => removeBenefit(index)} 
                  variant="ghost" 
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <InputField
                  label="Title"
                  value={benefit.title}
                  onChange={(value) => updateBenefit(index, 'title', value)}
                />
                <div className="col-span-2">
                  <label className="text-sm text-slate-400 mb-2 block">Icon</label>
                  <select
                    value={benefit.icon}
                    onChange={(e) => updateBenefit(index, 'icon', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="Shield">Shield</option>
                    <option value="TrendingUp">Trending Up</option>
                    <option value="Zap">Zap</option>
                  </select>
                </div>
              </div>
              <TextAreaField
                label="Description"
                value={benefit.description}
                onChange={(value) => updateBenefit(index, 'description', value)}
                rows={3}
              />
            </div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="space-y-4 p-6 bg-slate-800/30 rounded-xl border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Call-to-Action</h3>

        <InputField
          label="CTA Title"
          value={data.cta.title}
          onChange={(value) => onChange({ ...data, cta: { ...data.cta, title: value } })}
        />

        <TextAreaField
          label="CTA Description"
          value={data.cta.description}
          onChange={(value) => onChange({ ...data, cta: { ...data.cta, description: value } })}
          rows={2}
        />

        <InputField
          label="Button Text"
          value={data.cta.button}
          onChange={(value) => onChange({ ...data, cta: { ...data.cta, button: value } })}
        />

        <div className="space-y-2">
          <label className="text-sm text-slate-400">Features (comma-separated)</label>
          <input
            type="text"
            value={data.cta.features.join(', ')}
            onChange={(e) => onChange({ ...data, cta: { ...data.cta, features: e.target.value.split(',').map((f: string) => f.trim()) } })}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            placeholder="No credit card required, Setup in 2 minutes, Works with Dhan"
          />
        </div>
      </div>
    </div>
  );
}

function TestimonialsEditor({ data, onChange, onSave, saving }: any) {
  const updateTestimonial = (index: number, field: string, value: any) => {
    const newTestimonials = [...data];
    newTestimonials[index] = { ...newTestimonials[index], [field]: value };
    onChange(newTestimonials);
  };

  const addTestimonial = () => {
    onChange([...data, { name: '', role: '', rating: 5, text: '', avatar: '' }]);
  };

  const removeTestimonial = (index: number) => {
    onChange(data.filter((_: any, i: number) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Testimonials</h2>
        <div className="flex gap-2">
          <Button onClick={addTestimonial} variant="outline" className="border-slate-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add Testimonial
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {data.map((testimonial: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">TESTIMONIAL #{index + 1}</span>
              <button onClick={() => removeTestimonial(index)} className="text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <InputField
                label="Name"
                value={testimonial.name}
                onChange={(value) => updateTestimonial(index, 'name', value)}
              />
              <InputField
                label="Role"
                value={testimonial.role}
                onChange={(value) => updateTestimonial(index, 'role', value)}
              />
            </div>

            <TextAreaField
              label="Testimonial Text"
              value={testimonial.text}
              onChange={(value) => updateTestimonial(index, 'text', value)}
              rows={3}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CTAEditor({ data, onChange, onSave, saving }: any) {
  return (
    <div className="space-y-6">
      <EditorHeader title="CTA Section" onSave={onSave} saving={saving} />

      <InputField
        label="Title"
        value={data.title}
        onChange={(value) => onChange({ ...data, title: value })}
      />

      <TextAreaField
        label="Description"
        value={data.description}
        onChange={(value) => onChange({ ...data, description: value })}
        rows={2}
      />

      <InputField
        label="Button Text"
        value={data.button}
        onChange={(value) => onChange({ ...data, button: value })}
      />
    </div>
  );
}

function FooterEditor({ data, onChange, onSave, saving }: any) {
  return (
    <div className="space-y-6">
      <EditorHeader title="Footer" onSave={onSave} saving={saving} />

      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Brand Name"
          value={data.brand}
          onChange={(value) => onChange({ ...data, brand: value })}
        />
        <InputField
          label="Tagline"
          value={data.tagline}
          onChange={(value) => onChange({ ...data, tagline: value })}
        />
      </div>

      <TextAreaField
        label="Description"
        value={data.description}
        onChange={(value) => onChange({ ...data, description: value })}
        rows={2}
      />

      <InputField
        label="Copyright Text"
        value={data.copyright}
        onChange={(value) => onChange({ ...data, copyright: value })}
      />

      <TextAreaField
        label="Disclaimer"
        value={data.disclaimer}
        onChange={(value) => onChange({ ...data, disclaimer: value })}
        rows={2}
      />
    </div>
  );
}

function SimpleTextEditor({ title, data, onChange, onSave, saving }: any) {
  return (
    <div className="space-y-6">
      <EditorHeader title={title} onSave={onSave} saving={saving} />

      <InputField
        label="Title"
        value={data.title}
        onChange={(value) => onChange({ ...data, title: value })}
      />

      <InputField
        label="Last Updated"
        value={data.lastUpdated}
        onChange={(value) => onChange({ ...data, lastUpdated: value })}
      />

      <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
        <p className="text-sm text-slate-400">
          Content sections can be managed through the existing Terms & Privacy pages. 
          This editor allows you to update the title and date.
        </p>
      </div>
    </div>
  );
}

// Utility Components
function EditorHeader({ title, onSave, saving }: any) {
  return (
    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
        <Save className="w-4 h-4 mr-2" />
        {saving ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, rows = 3, placeholder }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
      />
    </div>
  );
}