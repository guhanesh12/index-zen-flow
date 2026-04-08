import { useEffect } from 'react';

export default function SitemapXML() {
  useEffect(() => {
    document.title = 'Sitemap';
  }, []);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.indexpilotai.com/</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/login</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/register</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/dashboard</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/pwa-setup</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/icon-generator</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/sitemap</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/page/about</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/page/features</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/page/pricing</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/page/contact</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/page/terms</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://www.indexpilotai.com/page/privacy</loc>
    <lastmod>2026-03-11</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;

  return (
    <div style={{ 
      fontFamily: 'monospace', 
      fontSize: '12px',
      whiteSpace: 'pre',
      padding: '20px',
      backgroundColor: '#fff',
      color: '#000',
      minHeight: '100vh'
    }}>
      {xml}
    </div>
  );
}
