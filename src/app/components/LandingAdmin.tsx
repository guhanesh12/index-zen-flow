import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Save, RefreshCw, Plus, Trash2, Edit2, Check, X,
  Home, DollarSign, Users, Star, FileText, Shield, Settings
} from 'lucide-react';
import { Button } from './ui/button';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { getBaseUrl } from '../utils/apiService';

interface LandingAdminProps {
  accessToken: string;
  onClose: () => void;
}

export default function LandingAdmin({ accessToken, onClose }: LandingAdminProps) {
  const [content, setContent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const serverUrl = getBaseUrl();

  // Load landing page content
  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${serverUrl}/landing/content`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setContent(data.content);
      } else {
        showMessage('error', 'Failed to load content');
      }
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
    { id: 'stats', label: 'Stats', icon: Users },
    { id: 'dhan', label: 'Dhan Integration', icon: Settings },
    { id: 'features', label: 'Features', icon: Star },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'testimonials', label: 'Testimonials', icon: Users },
    { id: 'footer', label: 'Footer', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Landing Page Admin</h1>
              <p className="text-sm text-slate-400 mt-1">Manage all landing page content</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={loadContent}
                disabled={loading}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Reload
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="border-slate-700 text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4 mr-2" />
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed top-20 right-6 z-50"
        >
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            message.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}>
            <div className="flex items-center gap-2">
              {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
              <span className="font-medium">{message.text}</span>
            </div>
          </div>
        </motion.div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sticky top-24">
              <h3 className="text-sm font-semibold text-slate-400 mb-4 uppercase">Sections</h3>
              <div className="space-y-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      activeSection === section.id
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <section.icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{section.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content Editor */}
          <div className="lg:col-span-3">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              {activeSection === 'hero' && content?.hero && (
                <HeroEditor 
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

              {activeSection === 'pricing' && content?.pricing && (
                <PricingEditor 
                  data={content.pricing} 
                  onChange={(data) => updateField(['pricing'], data)}
                  onSave={() => saveSection('pricing', content.pricing)}
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

              {/* Add more editors for other sections */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hero Section Editor
function HeroEditor({ data, onChange, onSave, saving }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Hero Section</h2>
        <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Badge Text</label>
          <input
            type="text"
            value={data.badge}
            onChange={(e) => onChange({ ...data, badge: e.target.value })}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Title Part 1</label>
          <input
            type="text"
            value={data.title.part1}
            onChange={(e) => onChange({ ...data, title: { ...data.title, part1: e.target.value } })}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Title Part 2 (Highlighted)</label>
          <input
            type="text"
            value={data.title.part2}
            onChange={(e) => onChange({ ...data, title: { ...data.title, part2: e.target.value } })}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Title Part 3</label>
          <input
            type="text"
            value={data.title.part3}
            onChange={(e) => onChange({ ...data, title: { ...data.title, part3: e.target.value } })}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
          <textarea
            value={data.description}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Primary Button</label>
            <input
              type="text"
              value={data.buttons.primary}
              onChange={(e) => onChange({ ...data, buttons: { ...data.buttons, primary: e.target.value } })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Secondary Button</label>
            <input
              type="text"
              value={data.buttons.secondary}
              onChange={(e) => onChange({ ...data, buttons: { ...data.buttons, secondary: e.target.value } })}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Trust Badge</label>
          <input
            type="text"
            value={data.trustBadge}
            onChange={(e) => onChange({ ...data, trustBadge: e.target.value })}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
    </div>
  );
}

// Stats Editor
function StatsEditor({ data, onChange, onSave, saving }: any) {
  const updateStat = (index: number, field: string, value: any) => {
    const newStats = [...data];
    newStats[index] = { ...newStats[index], [field]: value };
    onChange(newStats);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Stats Section</h2>
        <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="space-y-4">
        {data.map((stat: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Value</label>
                <input
                  type="text"
                  value={stat.value}
                  onChange={(e) => updateStat(index, 'value', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Label</label>
                <input
                  type="text"
                  value={stat.label}
                  onChange={(e) => updateStat(index, 'label', e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Pricing Editor
function PricingEditor({ data, onChange, onSave, saving }: any) {
  const updateTier = (index: number, field: string, value: any) => {
    const newTiers = [...data.tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    onChange({ ...data, tiers: newTiers });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Pricing Section</h2>
        <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Title</label>
          <input
            type="text"
            value={data.title}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
          <textarea
            value={data.description}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            rows={2}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Auto Debit Message</label>
          <textarea
            value={data.autoDebit}
            onChange={(e) => onChange({ ...data, autoDebit: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white mt-6">Pricing Tiers</h3>
          {data.tiers.map((tier: any, index: number) => (
            <div key={index} className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Range</label>
                  <input
                    type="text"
                    value={tier.range}
                    onChange={(e) => updateTier(index, 'range', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Price</label>
                  <input
                    type="text"
                    value={tier.price}
                    onChange={(e) => updateTier(index, 'price', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={tier.description}
                    onChange={(e) => updateTier(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Testimonials Editor
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
    const newTestimonials = data.filter((_: any, i: number) => i !== index);
    onChange(newTestimonials);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Testimonials</h2>
        <div className="flex gap-2">
          <Button onClick={addTestimonial} variant="outline" className="border-slate-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Add New
          </Button>
          <Button onClick={onSave} disabled={saving} className="bg-cyan-500 hover:bg-cyan-600">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {data.map((testimonial: any, index: number) => (
          <div key={index} className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-400">Testimonial #{index + 1}</span>
              <button
                onClick={() => removeTestimonial(index)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={testimonial.name}
                  onChange={(e) => updateTestimonial(index, 'name', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
                <input
                  type="text"
                  value={testimonial.role}
                  onChange={(e) => updateTestimonial(index, 'role', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Testimonial Text</label>
              <textarea
                value={testimonial.text}
                onChange={(e) => updateTestimonial(index, 'text', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
