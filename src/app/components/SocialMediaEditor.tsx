import { useState, useEffect } from 'react';
import { getBaseUrl } from '../utils/apiService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Instagram, Youtube, Linkedin, Facebook, Twitter,
  Send, Save, RefreshCw, Check, AlertCircle, ExternalLink
} from 'lucide-react';
import { Button } from './ui/button';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface SocialLinks {
  instagram: string;
  youtube: string;
  linkedin: string;
  facebook: string;
  twitter: string; // X (formerly Twitter)
  telegram: string;
  lastUpdated?: string;
}

interface SocialMediaEditorProps {
  accessToken: string;
}

export default function SocialMediaEditor({ accessToken }: SocialMediaEditorProps) {
  const [links, setLinks] = useState<SocialLinks>({
    instagram: '',
    youtube: '',
    linkedin: '',
    facebook: '',
    twitter: '',
    telegram: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const serverUrl = getBaseUrl();

  useEffect(() => {
    loadSocialLinks();
  }, []);

  const loadSocialLinks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${serverUrl}/landing/social-links`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      
      if (data.success && data.links) {
        setLinks(data.links);
      }
    } catch (error: any) {
      console.error('Error loading social links:', error);
      showMessage('error', 'Failed to load social links');
    } finally {
      setLoading(false);
    }
  };

  const saveSocialLinks = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${serverUrl}/landing/social-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(links)
      });

      const data = await response.json();
      
      if (data.success) {
        setLinks(data.links);
        showMessage('success', 'Social media links saved successfully!');
      } else {
        showMessage('error', data.error || 'Failed to save social links');
      }
    } catch (error: any) {
      console.error('Error saving social links:', error);
      showMessage('error', 'Failed to save social links');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const updateLink = (platform: keyof SocialLinks, value: string) => {
    setLinks(prev => ({ ...prev, [platform]: value }));
  };

  const socialPlatforms = [
    { 
      key: 'instagram' as keyof SocialLinks, 
      label: 'Instagram', 
      icon: Instagram, 
      color: 'from-pink-500 to-purple-500',
      placeholder: 'https://instagram.com/indexpilotai'
    },
    { 
      key: 'youtube' as keyof SocialLinks, 
      label: 'YouTube', 
      icon: Youtube, 
      color: 'from-red-500 to-red-600',
      placeholder: 'https://youtube.com/@indexpilotai'
    },
    { 
      key: 'linkedin' as keyof SocialLinks, 
      label: 'LinkedIn', 
      icon: Linkedin, 
      color: 'from-blue-600 to-blue-700',
      placeholder: 'https://linkedin.com/company/indexpilotai'
    },
    { 
      key: 'facebook' as keyof SocialLinks, 
      label: 'Facebook', 
      icon: Facebook, 
      color: 'from-blue-500 to-blue-600',
      placeholder: 'https://facebook.com/indexpilotai'
    },
    { 
      key: 'twitter' as keyof SocialLinks, 
      label: 'X (Twitter)', 
      icon: Twitter, 
      color: 'from-slate-700 to-slate-900',
      placeholder: 'https://twitter.com/indexpilotai'
    },
    { 
      key: 'telegram' as keyof SocialLinks, 
      label: 'Telegram', 
      icon: Send, 
      color: 'from-blue-400 to-blue-500',
      placeholder: 'https://t.me/indexpilotai'
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Loading social media links...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Social Media Links</h2>
          <p className="text-sm text-slate-400 mt-1">
            Configure social media links displayed in the footer
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={loadSocialLinks}
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={saveSocialLinks}
            disabled={saving}
            className="bg-cyan-500 hover:bg-cyan-600"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Message Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="font-medium">{message.text}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last Updated */}
      {links.lastUpdated && (
        <div className="text-xs text-slate-500">
          Last updated: {links.lastUpdated}
        </div>
      )}

      {/* Social Links Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {socialPlatforms.map(({ key, label, icon: Icon, color, placeholder }) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/50 rounded-xl border border-slate-800 p-6 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center`}>
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-white">{label}</h3>
                {links[key] && (
                  <a 
                    href={links[key]} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 mt-1"
                  >
                    Visit Page
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-slate-400">
                Profile URL
              </label>
              <input
                type="url"
                value={links[key] || ''}
                onChange={(e) => updateLink(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
              {links[key] && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Check className="w-3 h-3 text-green-400" />
                  Link configured
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Preview Section */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Footer Preview</h3>
        <p className="text-sm text-slate-400 mb-4">
          These icons will appear in the footer of your landing page:
        </p>
        <div className="flex items-center gap-3">
          {socialPlatforms.map(({ key, icon: Icon, color }) => {
            if (!links[key]) return null;
            return (
              <a
                key={key}
                href={links[key]}
                target="_blank"
                rel="noopener noreferrer"
                className="w-12 h-12 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors group relative"
              >
                <Icon className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors" />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {socialPlatforms.find(p => p.key === key)?.label}
                </div>
              </a>
            );
          })}
          {Object.values(links).filter(Boolean).length === 0 && (
            <p className="text-sm text-slate-500 italic">No links configured yet</p>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-400 mb-2">💡 Tips</h4>
        <ul className="text-sm text-slate-300 space-y-1">
          <li>• Enter complete URLs including https://</li>
          <li>• Only configured links will appear in the footer</li>
          <li>• Changes take effect immediately after saving</li>
          <li>• Test links to ensure they work correctly</li>
        </ul>
      </div>
    </div>
  );
}
