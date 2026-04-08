import { useState, useEffect } from 'react';
import { Download, Upload, Sparkles, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { generatePWAIcons, generateIconsFromImage, downloadIcon, downloadAllIcons } from '../utils/iconGenerator';

export function PWAIconGenerator() {
  const [icons, setIcons] = useState<{ size: number; blob: Blob; url: string }[]>([]);
  const [logoText, setLogoText] = useState('IP');
  const [baseColor, setBaseColor] = useState('#3b82f6');
  const [generating, setGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  // Auto-generate on mount
  useEffect(() => {
    handleGenerate();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const generatedIcons = await generatePWAIcons(logoText, baseColor);
      setIcons(generatedIcons);
    } catch (error) {
      console.error('Failed to generate icons:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setGenerating(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageUrl = event.target?.result as string;
        setUploadedImage(imageUrl);
        
        const generatedIcons = await generateIconsFromImage(file);
        setIcons(generatedIcons);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to process image:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadAll = () => {
    downloadAllIcons(icons);
  };

  return (
    <Card className="border-blue-500/30 bg-gradient-to-br from-slate-950 to-blue-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Sparkles className="w-5 h-5 text-blue-400" />
          Automatic PWA Icon Generator
        </CardTitle>
        <p className="text-slate-400 text-sm">
          Generate all 8 required icon sizes instantly - no external tools needed!
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Upload or Generate Options */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Option 1: Upload Image */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Upload className="w-4 h-4 text-blue-400" />
              Upload Your Logo
            </h3>
            <p className="text-slate-400 text-sm mb-3">
              Upload a square image (PNG/JPG, 512x512px+)
            </p>
            <label className="cursor-pointer">
              <div className="border-2 border-dashed border-blue-500/50 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                <ImageIcon className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-slate-300 text-sm">Click to upload</p>
                <p className="text-slate-500 text-xs mt-1">PNG, JPG, or SVG</p>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Option 2: Generate from Text */}
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              Generate from Text
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-slate-300 text-sm mb-1 block">Logo Text</label>
                <Input
                  value={logoText}
                  onChange={(e) => setLogoText(e.target.value.slice(0, 3))}
                  placeholder="IP"
                  maxLength={3}
                  className="bg-slate-950 border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-1 block">Color</label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={baseColor}
                    onChange={(e) => setBaseColor(e.target.value)}
                    className="w-16 h-10 bg-slate-950 border-slate-700"
                  />
                  <Input
                    value={baseColor}
                    onChange={(e) => setBaseColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="flex-1 bg-slate-950 border-slate-700 text-white"
                  />
                </div>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {generating ? 'Generating...' : 'Generate Icons'}
              </Button>
            </div>
          </div>
        </div>

        {/* Preview Original Image */}
        {uploadedImage && (
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700">
            <h3 className="text-white font-semibold mb-3">Original Image</h3>
            <img
              src={uploadedImage}
              alt="Uploaded"
              className="w-32 h-32 rounded-lg border-2 border-blue-500/50"
            />
          </div>
        )}

        {/* Generated Icons Preview */}
        {icons.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                Generated Icons ({icons.length})
              </h3>
              <Button
                onClick={handleDownloadAll}
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Download All
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {icons.map((icon) => (
                <div
                  key={icon.size}
                  className="p-4 rounded-xl bg-slate-900/50 border border-slate-700 text-center"
                >
                  <img
                    src={icon.url}
                    alt={`${icon.size}x${icon.size}`}
                    className="w-full h-auto rounded-lg mb-2 border border-slate-600"
                  />
                  <p className="text-slate-300 text-sm font-medium mb-2">
                    {icon.size}×{icon.size}
                  </p>
                  <Button
                    onClick={() => downloadIcon(icon.blob, icon.size)}
                    size="sm"
                    variant="outline"
                    className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <h3 className="text-white font-semibold mb-2">📝 Next Steps</h3>
          <ol className="text-slate-300 text-sm space-y-1 ml-4 list-decimal">
            <li>Download all icons using the button above</li>
            <li>Create a folder: <code className="bg-slate-900 px-1 rounded">/public/icons/</code></li>
            <li>Place all downloaded icons in that folder</li>
            <li>Deploy your app - icons will appear automatically!</li>
          </ol>
        </div>

        {/* File Names Reference */}
        <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700">
          <h3 className="text-white font-semibold mb-2">📁 Expected File Names</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {icons.map((icon) => (
              <code key={icon.size} className="text-slate-400 bg-slate-950 px-2 py-1 rounded">
                icon-{icon.size}x{icon.size}.png
              </code>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
