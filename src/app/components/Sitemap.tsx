import { useEffect, useState } from 'react';
import { SEO, SEO_CONFIGS } from '../utils/seo';

/**
 * SITEMAP COMPONENT - Works in Both Preview and Production
 * 
 * Preview Mode: Displays XML directly
 * Production: Fetches from server endpoint with proper headers
 * 
 * Access via: /sitemap or /sitemap.xml
 */

export default function Sitemap() {
  const [sitemapXML, setSitemapXML] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    generateSitemap();
  }, []);

  const generateSitemap = () => {
    try {
      console.log('📋 Sitemap: Generating XML...');

      // Get base URL from current location
      const baseUrl = window.location.origin;
      const today = new Date().toISOString().split('T')[0];

      // Define all URLs
      const urls = [
        { loc: `${baseUrl}/`, lastmod: today, changefreq: 'daily', priority: 1.0 },
        { loc: `${baseUrl}/login`, lastmod: today, changefreq: 'monthly', priority: 0.8 },
        { loc: `${baseUrl}/register`, lastmod: today, changefreq: 'monthly', priority: 0.8 },
        { loc: `${baseUrl}/dashboard`, lastmod: today, changefreq: 'weekly', priority: 0.9 },
        { loc: `${baseUrl}/pwa-setup`, lastmod: today, changefreq: 'monthly', priority: 0.6 },
        { loc: `${baseUrl}/icon-generator`, lastmod: today, changefreq: 'monthly', priority: 0.6 },
        { loc: `${baseUrl}/page/about`, lastmod: today, changefreq: 'monthly', priority: 0.7 },
        { loc: `${baseUrl}/page/features`, lastmod: today, changefreq: 'monthly', priority: 0.7 },
        { loc: `${baseUrl}/page/pricing`, lastmod: today, changefreq: 'weekly', priority: 0.8 },
        { loc: `${baseUrl}/page/contact`, lastmod: today, changefreq: 'monthly', priority: 0.7 },
        { loc: `${baseUrl}/page/terms`, lastmod: today, changefreq: 'yearly', priority: 0.5 },
        { loc: `${baseUrl}/page/privacy`, lastmod: today, changefreq: 'yearly', priority: 0.5 },
      ];

      // Generate XML
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

      console.log(`✅ Sitemap generated with ${urls.length} URLs`);
      setSitemapXML(xml);
      setLoading(false);
    } catch (err) {
      console.error('❌ Error generating sitemap:', err);
      setError('Failed to generate sitemap');
      setLoading(false);
    }
  };

  const downloadSitemap = () => {
    const blob = new Blob([sitemapXML], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySitemap = () => {
    navigator.clipboard.writeText(sitemapXML);
    alert('Sitemap XML copied to clipboard!');
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#333', marginBottom: '10px' }}>Generating Sitemap...</h2>
          <p style={{ color: '#666' }}>Please wait</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: '10px' }}>Error</h2>
          <p style={{ color: '#666' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO {...SEO_CONFIGS.sitemap} />
      
      <div style={{
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#f5f5f5',
        padding: '20px',
      }}>
        {/* Header */}
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h1 style={{ 
            color: '#333', 
            margin: '0 0 10px 0',
            fontSize: '24px',
            fontWeight: '600',
          }}>
            🗺️ Sitemap.xml
          </h1>
          <p style={{ color: '#666', margin: '0 0 15px 0' }}>
            This is your website's sitemap containing all public URLs for search engines.
          </p>
          
          {/* Manual Index Banner */}
          <div style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #fbbf24',
            borderRadius: '8px',
            padding: '15px',
            marginBottom: '15px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '24px' }}>🔍</span>
              <strong style={{ color: '#92400e', fontSize: '16px' }}>Manual Indexing Tool Available</strong>
            </div>
            <p style={{ color: '#78350f', margin: '0 0 10px 0', fontSize: '14px' }}>
              For immediate Google indexing without sitemap submission, use our manual indexing helper:
            </p>
            <a 
              href="/manual-index" 
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                backgroundColor: '#f59e0b',
                color: '#000',
                textDecoration: 'none',
                borderRadius: '6px',
                fontWeight: '600',
                fontSize: '14px',
              }}
            >
              📋 Open Manual Index Helper
            </a>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={downloadSitemap}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              📥 Download sitemap.xml
            </button>
            <button
              onClick={copySitemap}
              style={{
                padding: '10px 20px',
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
              }}
            >
              📋 Copy to Clipboard
            </button>
          </div>
        </div>

        {/* XML Preview */}
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h2 style={{
            color: '#333',
            fontSize: '18px',
            fontWeight: '600',
            marginTop: '0',
            marginBottom: '15px',
          }}>
            XML Content:
          </h2>
          <pre style={{
            backgroundColor: '#1e293b',
            color: '#e2e8f0',
            padding: '20px',
            borderRadius: '6px',
            overflow: 'auto',
            fontSize: '13px',
            lineHeight: '1.6',
            margin: '0',
          }}>
            {sitemapXML}
          </pre>
        </div>

        {/* Instructions */}
        <div style={{
          maxWidth: '1200px',
          margin: '20px auto',
          backgroundColor: '#fff',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <h3 style={{
            color: '#333',
            fontSize: '16px',
            fontWeight: '600',
            marginTop: '0',
            marginBottom: '10px',
          }}>
            📤 Submit to Google Search Console:
          </h3>
          <ol style={{ color: '#666', lineHeight: '1.8', paddingLeft: '20px' }}>
            <li>Copy the sitemap URL: <code style={{ 
              backgroundColor: '#f1f5f9', 
              padding: '2px 6px', 
              borderRadius: '4px',
              color: '#3b82f6',
            }}>
              {window.location.origin}/sitemap.xml
            </code></li>
            <li>Go to <a href="https://search.google.com/search-console" target="_blank" style={{ color: '#3b82f6' }}>Google Search Console</a></li>
            <li>Navigate to <strong>Indexing → Sitemaps</strong></li>
            <li>Paste the sitemap URL and click <strong>Submit</strong></li>
            <li>Wait for Google to process (may take 24 hours)</li>
          </ol>
          <div style={{
            marginTop: '15px',
            padding: '12px',
            backgroundColor: '#dbeafe',
            border: '1px solid #3b82f6',
            borderRadius: '6px',
          }}>
            <p style={{ margin: '0', color: '#1e40af', fontSize: '14px' }}>
              💡 <strong>Note:</strong> For production, also use the static file at <code>/sitemap.xml</code> which is automatically updated on publish.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}