import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Save, Plus, Trash2, Check, RefreshCw, Monitor, Smartphone,
  Upload, Image as ImageIcon, X
} from 'lucide-react';
import { Button } from './ui/button';
import { DesktopDashboardPreview, MobileDashboardPreview } from './DashboardPreviewAnimations';

interface HeroEditorEnhancedProps {
  data: any;
  onChange: (data: any) => void;
  onSave: () => void;
  saving: boolean;
}

export function HeroEditorEnhanced({ data, onChange, onSave, saving }: HeroEditorEnhancedProps) {
  const [heroImage, setHeroImage] = useState<string | null>(data.heroImage || null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('Image size should be less than 5MB');
      return;
    }

    setUploadingImage(true);
    
    try {
      // Convert to base64 for now (in production, upload to storage)
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setHeroImage(base64);
        onChange({ ...data, heroImage: base64 });
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setHeroImage(null);
    onChange({ ...data, heroImage: null });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Hero Section Editor</h2>
          <p className="text-slate-400 text-sm">Customize your landing page hero section with images and preview</p>
        </div>
        <Button 
          onClick={onSave} 
          disabled={saving}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-lg shadow-cyan-500/20"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Image Upload Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Hero Background Image</h3>
            <p className="text-sm text-slate-400">Upload a high-quality image for your hero section</p>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Upload Area */}
          <div>
            <label className="block cursor-pointer">
              <motion.div 
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  heroImage 
                    ? 'border-green-500 bg-green-500/5' 
                    : 'border-slate-600 hover:border-cyan-500 bg-slate-800/50'
                }`}
                whileHover={{ scale: 1.02, borderColor: heroImage ? '#22c55e' : '#06b6d4' }}
                whileTap={{ scale: 0.98 }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                />
                <AnimatePresence mode="wait">
                  {uploadingImage ? (
                    <motion.div
                      key="uploading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-3" />
                      <p className="text-cyan-400 font-medium">Uploading...</p>
                    </motion.div>
                  ) : heroImage ? (
                    <motion.div
                      key="uploaded"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        <Check className="w-12 h-12 text-green-400 mx-auto mb-3" />
                      </motion.div>
                      <p className="text-green-400 font-medium mb-1">Image Uploaded!</p>
                      <p className="text-sm text-slate-400">Click to change</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <motion.div
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      </motion.div>
                      <p className="text-white font-medium mb-1">Upload Hero Image</p>
                      <p className="text-sm text-slate-400">PNG, JPG, WebP up to 5MB</p>
                      <p className="text-xs text-slate-500 mt-2">Recommended: 1920x1080px</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </label>
          </div>

          {/* Image Preview */}
          {heroImage && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="relative rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl"
            >
              <img 
                src={heroImage} 
                alt="Hero Preview" 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <motion.button
                onClick={removeImage}
                whileHover={{ scale: 1.1, backgroundColor: '#dc2626' }}
                whileTap={{ scale: 0.9 }}
                className="absolute top-4 right-4 p-3 bg-red-500/80 hover:bg-red-600 backdrop-blur-sm rounded-xl transition-colors shadow-lg"
              >
                <Trash2 className="w-5 h-5 text-white" />
              </motion.button>
              <div className="absolute bottom-4 left-4 right-4">
                <div className="text-white font-semibold mb-1">Preview</div>
                <div className="text-sm text-slate-300">Image looks great!</div>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Live Preview Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Monitor className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Live Dashboard Preview</h3>
              <p className="text-sm text-slate-400">See real-time animations of your trading dashboard</p>
            </div>
          </div>
          <div className="flex gap-2">
            <motion.button
              onClick={() => setPreviewMode('desktop')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-medium ${
                previewMode === 'desktop' 
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Monitor className="w-4 h-4" />
              Desktop
            </motion.button>
            <motion.button
              onClick={() => setPreviewMode('mobile')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all font-medium ${
                previewMode === 'mobile' 
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30' 
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              Mobile
            </motion.button>
          </div>
        </div>

        {/* Preview Container */}
        <motion.div 
          className="bg-black/50 rounded-xl border-2 border-slate-700 p-6 min-h-[700px] relative overflow-hidden"
          whileHover={{ borderColor: '#06b6d4' }}
        >
          {/* Animated Background */}
          <div className="absolute inset-0 opacity-10">
            <motion.div
              className="absolute top-0 left-0 w-64 h-64 bg-cyan-500 rounded-full blur-3xl"
              animate={{ 
                x: [0, 100, 0],
                y: [0, 50, 0],
                scale: [1, 1.2, 1]
              }}
              transition={{ duration: 10, repeat: Infinity }}
            />
            <motion.div
              className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500 rounded-full blur-3xl"
              animate={{ 
                x: [0, -100, 0],
                y: [0, -50, 0],
                scale: [1.2, 1, 1.2]
              }}
              transition={{ duration: 12, repeat: Infinity }}
            />
          </div>

          {/* Preview Content */}
          <div className="relative z-10 h-full">
            <AnimatePresence mode="wait">
              {previewMode === 'desktop' ? (
                <DesktopDashboardPreview key="desktop" />
              ) : (
                <MobileDashboardPreview key="mobile" />
              )}
            </AnimatePresence>
          </div>

          {/* Preview Label */}
          <motion.div
            className="absolute top-4 left-4 px-3 py-1.5 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-lg"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 bg-green-400 rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-xs text-slate-300 font-medium">Live Preview</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            >
              <Monitor className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            </motion.div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-1">Professional Grade UI</h4>
              <p className="text-slate-300 text-xs leading-relaxed">
                This preview shows your real dashboard with live animations including AI signal generation, 
                order execution, profit tracking, and position monitoring. Switch between desktop and mobile 
                views to see how your platform looks on all devices.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Form Fields */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700 p-6 backdrop-blur-xl space-y-6"
      >
        <h3 className="text-lg font-semibold text-white mb-4">Content Settings</h3>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Badge Text</label>
          <input
            type="text"
            value={data.badge}
            onChange={(e) => onChange({ ...data, badge: e.target.value })}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
            placeholder="AI-Powered Trading Platform"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Title Part 1</label>
            <input
              type="text"
              value={data.title.part1}
              onChange={(e) => onChange({ ...data, title: { ...data.title, part1: e.target.value } })}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              placeholder="Trade"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Title Part 2 (Highlighted)</label>
            <input
              type="text"
              value={data.title.part2}
              onChange={(e) => onChange({ ...data, title: { ...data.title, part2: e.target.value } })}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              placeholder="NIFTY Options"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Title Part 3</label>
            <input
              type="text"
              value={data.title.part3}
              onChange={(e) => onChange({ ...data, title: { ...data.title, part3: e.target.value } })}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              placeholder="with AI"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
          <textarea
            value={data.description}
            onChange={(e) => onChange({ ...data, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all resize-none"
            placeholder="Automated trading powered by advanced AI algorithms..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Primary Button Text</label>
            <input
              type="text"
              value={data.buttons.primary}
              onChange={(e) => onChange({ ...data, buttons: { ...data.buttons, primary: e.target.value } })}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              placeholder="Start Free Trial"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Secondary Button Text</label>
            <input
              type="text"
              value={data.buttons.secondary}
              onChange={(e) => onChange({ ...data, buttons: { ...data.buttons, secondary: e.target.value } })}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
              placeholder="Watch Demo"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Trust Badge</label>
          <input
            type="text"
            value={data.trustBadge}
            onChange={(e) => onChange({ ...data, trustBadge: e.target.value })}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
            placeholder="5,000+ Active Traders"
          />
        </div>

        {/* Dhan Account Link */}
        <div className="pt-6 border-t border-slate-700">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
            <h4 className="text-sm font-semibold text-orange-400 uppercase tracking-wider">Dhan Account Button</h4>
          </div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Dhan Account Opening Link
            <span className="text-slate-500 text-xs ml-2">(Opens in new tab)</span>
          </label>
          <input
            type="url"
            value={data.dhanAccountLink || 'https://login.dhan.co/'}
            onChange={(e) => onChange({ ...data, dhanAccountLink: e.target.value })}
            className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all"
            placeholder="https://login.dhan.co/"
          />
          <p className="text-xs text-slate-500 mt-2">
            💡 This link appears on the "Open Dhan Account" buttons in Hero and Dhan sections
          </p>
        </div>
      </motion.div>
    </div>
  );
}
