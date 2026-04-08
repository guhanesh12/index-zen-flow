import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  FileText,
  Save,
  Eye,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion } from 'motion/react';
// import { toast } from 'sonner';

interface AdminLegalEditorProps {
  serverUrl: string;
  accessToken: string;
}

interface LegalPage {
  page: 'terms' | 'privacy' | 'refund' | 'about';
  content: string;
  lastUpdated: string;
  version: number;
}

export function AdminLegalEditor({ serverUrl, accessToken }: AdminLegalEditorProps) {
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'refund' | 'about'>('terms');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pages, setPages] = useState<Record<string, LegalPage>>({
    terms: { page: 'terms', content: '', lastUpdated: '', version: 1 },
    privacy: { page: 'privacy', content: '', lastUpdated: '', version: 1 },
    refund: { page: 'refund', content: '', lastUpdated: '', version: 1 },
    about: { page: 'about', content: '', lastUpdated: '', version: 1 },
  });

  useEffect(() => {
    loadLegalPage(activeTab);
  }, [activeTab]);

  const loadLegalPage = async (page: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/admin/legal/get?page=${page}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setPages(prev => ({
            ...prev,
            [page]: {
              page: page as any,
              content: data.content || '',
              lastUpdated: data.lastUpdated || new Date().toISOString(),
              version: data.version || 1,
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error loading legal page:', error);
      // toast.error('Failed to load legal page');
    } finally {
      setLoading(false);
    }
  };

  const saveLegalPage = async () => {
    setSaving(true);
    try {
      const currentPage = pages[activeTab];
      const response = await fetch(`${serverUrl}/admin/legal/update`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          page: activeTab,
          content: currentPage.content,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // toast.success('Legal page updated successfully!');
          setPages(prev => ({
            ...prev,
            [activeTab]: {
              ...prev[activeTab],
              lastUpdated: new Date().toISOString(),
              version: data.version || prev[activeTab].version + 1,
            }
          }));
        } else {
          // toast.error(data.message || 'Failed to update legal page');
        }
      } else {
        // toast.error('Failed to update legal page');
      }
    } catch (error) {
      console.error('Error saving legal page:', error);
      // toast.error('Error saving legal page');
    } finally {
      setSaving(false);
    }
  };

  const updateContent = (content: string) => {
    setPages(prev => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        content,
      }
    }));
  };

  const currentPage = pages[activeTab];

  const getPageTitle = (page: string) => {
    switch(page) {
      case 'terms': return 'Terms & Conditions';
      case 'privacy': return 'Privacy Policy';
      case 'refund': return 'Refund Policy';
      case 'about': return 'About Us';
      default: return page;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <FileText className="size-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Legal Page Editor</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Edit legal pages - changes reflect in app immediately
                  </p>
                </div>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Main Editor */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-slate-800/50 border border-blue-500/20">
          <TabsTrigger value="terms" className="data-[state=active]:bg-blue-600">
            Terms & Conditions
          </TabsTrigger>
          <TabsTrigger value="privacy" className="data-[state=active]:bg-blue-600">
            Privacy Policy
          </TabsTrigger>
          <TabsTrigger value="refund" className="data-[state=active]:bg-blue-600">
            Refund Policy
          </TabsTrigger>
          <TabsTrigger value="about" className="data-[state=active]:bg-blue-600">
            About Us
          </TabsTrigger>
        </TabsList>

        {(['terms', 'privacy', 'refund', 'about'] as const).map((page) => (
          <TabsContent key={page} value={page}>
            <Card className="bg-slate-800/50 border-blue-500/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white">{getPageTitle(page)}</CardTitle>
                    <div className="flex items-center gap-4 mt-2">
                      {currentPage.lastUpdated && (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Clock className="size-4" />
                          Last updated: {new Date(currentPage.lastUpdated).toLocaleString()}
                        </div>
                      )}
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-400">
                        Version {currentPage.version}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setPreview(!preview)}
                      variant="outline"
                      className="bg-slate-700/50 border-slate-600"
                    >
                      <Eye className="size-4 mr-2" />
                      {preview ? 'Edit' : 'Preview'}
                    </Button>
                    <Button
                      onClick={() => loadLegalPage(page)}
                      variant="outline"
                      className="bg-slate-700/50 border-slate-600"
                      disabled={loading}
                    >
                      <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                      Reload
                    </Button>
                    <Button
                      onClick={saveLegalPage}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={saving}
                    >
                      <Save className="size-4 mr-2" />
                      {saving ? 'Saving...' : 'Save & Publish'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-96">
                    <RefreshCw className="size-8 animate-spin text-blue-400" />
                  </div>
                ) : preview ? (
                  <div 
                    className="prose prose-invert max-w-none bg-slate-900/50 p-6 rounded-lg border border-slate-700 min-h-96 overflow-auto"
                    dangerouslySetInnerHTML={{ __html: currentPage.content }}
                  />
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-slate-300 mb-2 block">
                        Content (HTML supported)
                      </Label>
                      <Textarea
                        value={currentPage.content}
                        onChange={(e) => updateContent(e.target.value)}
                        className="min-h-96 font-mono text-sm bg-slate-900/50 border-slate-700 text-slate-100"
                        placeholder={`Enter ${getPageTitle(page)} content here...

You can use HTML formatting:
<h1>Main Heading</h1>
<h2>Section Heading</h2>
<p>Paragraph text</p>
<ul>
  <li>List item</li>
</ul>
<strong>Bold text</strong>
<em>Italic text</em>`}
                      />
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="size-5 text-blue-400 mt-0.5" />
                        <div className="text-sm text-slate-300">
                          <p className="font-semibold mb-1">Important Notes:</p>
                          <ul className="list-disc list-inside space-y-1 text-slate-400">
                            <li>Changes will be reflected in the mobile app immediately after saving</li>
                            <li>Use HTML tags for formatting (headings, paragraphs, lists, etc.)</li>
                            <li>Preview your changes before publishing</li>
                            <li>Version number will increment automatically</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Terms & Conditions</p>
                <p className="text-2xl font-bold text-white">V{pages.terms.version}</p>
              </div>
              <CheckCircle2 className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Privacy Policy</p>
                <p className="text-2xl font-bold text-white">V{pages.privacy.version}</p>
              </div>
              <CheckCircle2 className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Refund Policy</p>
                <p className="text-2xl font-bold text-white">V{pages.refund.version}</p>
              </div>
              <CheckCircle2 className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">About Us</p>
                <p className="text-2xl font-bold text-white">V{pages.about.version}</p>
              </div>
              <CheckCircle2 className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}