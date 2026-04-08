import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Trash2, Edit2, Save, X, Eye, EyeOff, 
  FileText, Check, AlertCircle, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from './ui/button';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { getBaseUrl } from '../utils/apiService';

interface Page {
  id: string;
  title: string;
  slug: string;
  content: string;
  showInFooter: boolean;
  footerSection: string;
  order: number;
  lastUpdated: string;
}

interface PagesManagerProps {
  accessToken: string;
}

export default function PagesManager({ accessToken }: PagesManagerProps) {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingPage, setEditingPage] = useState<Page | null>(null);
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const serverUrl = getBaseUrl();

  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${serverUrl}/landing/pages`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        setPages(data.pages);
      }
    } catch (error: any) {
      console.error('Error loading pages:', error);
      showMessage('error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const savePage = async (page: Page) => {
    try {
      setSaving(true);
      const response = await fetch(`${serverUrl}/landing/pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(page)
      });

      const data = await response.json();
      
      if (data.success) {
        setPages(data.pages);
        setEditingPage(null);
        showMessage('success', 'Page saved successfully!');
      } else {
        showMessage('error', data.error || 'Failed to save page');
      }
    } catch (error: any) {
      console.error('Error saving page:', error);
      showMessage('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const deletePage = async (pageId: string) => {
    if (!confirm('Are you sure you want to delete this page?')) return;

    try {
      setSaving(true);
      const response = await fetch(`${serverUrl}/landing/pages/${pageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      
      if (data.success) {
        setPages(data.pages);
        showMessage('success', 'Page deleted successfully!');
      } else {
        showMessage('error', data.error || 'Failed to delete page');
      }
    } catch (error: any) {
      console.error('Error deleting page:', error);
      showMessage('error', error.message);
    } finally {
      setSaving(false);
    }
  };

  const createNewPage = () => {
    const newPage: Page = {
      id: `page_${Date.now()}`,
      title: 'New Page',
      slug: 'new-page',
      content: 'Page content goes here...',
      showInFooter: true,
      footerSection: 'Company',
      order: pages.length + 1,
      lastUpdated: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    };
    setEditingPage(newPage);
  };

  const toggleExpanded = (pageId: string) => {
    const newExpanded = new Set(expandedPages);
    if (newExpanded.has(pageId)) {
      newExpanded.delete(pageId);
    } else {
      newExpanded.add(pageId);
    }
    setExpandedPages(newExpanded);
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-400 text-sm">Loading pages...</p>
        </div>
      </div>
    );
  }

  // Group pages by footer section
  const pagesBySection = pages.reduce((acc, page) => {
    if (page.showInFooter) {
      if (!acc[page.footerSection]) {
        acc[page.footerSection] = [];
      }
      acc[page.footerSection].push(page);
    }
    return acc;
  }, {} as Record<string, Page[]>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Pages Manager</h2>
          <p className="text-sm text-slate-400 mt-1">Create and manage footer pages dynamically</p>
        </div>
        <Button
          onClick={createNewPage}
          className="bg-cyan-500 hover:bg-cyan-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create New Page
        </Button>
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

      {/* Footer Preview */}
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyan-400" />
          Footer Preview
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {Object.entries(pagesBySection).map(([section, sectionPages]) => (
            <div key={section}>
              <h4 className="font-semibold text-white mb-3">{section}</h4>
              <ul className="space-y-2">
                {sectionPages
                  .sort((a, b) => a.order - b.order)
                  .map((page) => (
                    <li key={page.id}>
                      <span className="text-slate-400 hover:text-cyan-400 cursor-pointer text-sm">
                        {page.title}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Pages List */}
      <div className="space-y-3">
        {pages.map((page) => (
          <motion.div
            key={page.id}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden"
          >
            {/* Page Header */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <FileText className="w-5 h-5 text-cyan-400" />
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-white">{page.title}</h3>
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-300">
                      /{page.slug}
                    </span>
                    {page.showInFooter && (
                      <span className="text-xs px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        {page.footerSection}
                      </span>
                    )}
                    {!page.showInFooter && (
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-400">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Last updated: {page.lastUpdated}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggleExpanded(page.id)}
                  className="border-slate-700 text-slate-300"
                >
                  {expandedPages.has(page.id) ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingPage(page)}
                  className="border-slate-700 text-cyan-400 hover:text-cyan-300"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deletePage(page.id)}
                  className="border-slate-700 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Expanded Content Preview */}
            <AnimatePresence>
              {expandedPages.has(page.id) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-slate-800 bg-slate-950/50 p-4"
                >
                  <div className="prose prose-invert prose-sm max-w-none">
                    <p className="text-slate-300 whitespace-pre-wrap">
                      {page.content.slice(0, 200)}
                      {page.content.length > 200 && '...'}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setEditingPage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 rounded-xl border border-slate-800 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  {pages.find(p => p.id === editingPage.id) ? 'Edit Page' : 'Create New Page'}
                </h3>
                <button
                  onClick={() => setEditingPage(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Page Title
                  </label>
                  <input
                    type="text"
                    value={editingPage.title}
                    onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    placeholder="e.g., About Us"
                  />
                </div>

                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    URL Slug
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">/</span>
                    <input
                      type="text"
                      value={editingPage.slug}
                      onChange={(e) => setEditingPage({ ...editingPage, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                      className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                      placeholder="e.g., about-us"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Only lowercase letters, numbers, and hyphens</p>
                </div>

                {/* Footer Settings */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Footer Section
                    </label>
                    <select
                      value={editingPage.footerSection}
                      onChange={(e) => setEditingPage({ ...editingPage, footerSection: e.target.value })}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Product">Product</option>
                      <option value="Company">Company</option>
                      <option value="Legal">Legal</option>
                      <option value="Resources">Resources</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Order
                    </label>
                    <input
                      type="number"
                      value={editingPage.order}
                      onChange={(e) => setEditingPage({ ...editingPage, order: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Show in Footer */}
                <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                  <input
                    type="checkbox"
                    id="showInFooter"
                    checked={editingPage.showInFooter}
                    onChange={(e) => setEditingPage({ ...editingPage, showInFooter: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <label htmlFor="showInFooter" className="text-sm text-slate-300 cursor-pointer flex-1">
                    Show in footer navigation
                  </label>
                  {editingPage.showInFooter ? (
                    <Eye className="w-4 h-4 text-cyan-400" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-slate-500" />
                  )}
                </div>

                {/* Content */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Page Content
                  </label>
                  <textarea
                    value={editingPage.content}
                    onChange={(e) => setEditingPage({ ...editingPage, content: e.target.value })}
                    rows={10}
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none font-mono text-sm"
                    placeholder="Enter page content here..."
                  />
                  <p className="text-xs text-slate-500 mt-1">Supports plain text and basic formatting</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => savePage(editingPage)}
                    disabled={saving}
                    className="flex-1 bg-cyan-500 hover:bg-cyan-600"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Page'}
                  </Button>
                  <Button
                    onClick={() => setEditingPage(null)}
                    variant="outline"
                    className="border-slate-700 text-slate-300"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
