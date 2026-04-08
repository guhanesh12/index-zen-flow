// Static file content for serving through React Router
// These files need to be served through React because Figma Make routes all requests through the app

export const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
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

export const ROBOTS_TXT = `# IndexpilotAI - Robots.txt
# Last updated: 2026-03-11

# Allow all search engines
User-agent: *
Allow: /

# Disallow admin and sensitive areas
Disallow: /admin/

# Sitemap location - PRIMARY URL
Sitemap: https://www.indexpilotai.com/sitemap.xml

# Crawl delay (optional - adjust if needed)
# Crawl-delay: 1

# Allow specific bots
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Slurp
Allow: /

# Block AI scrapers (optional - uncomment if needed)
# User-agent: GPTBot
# Disallow: /
#
# User-agent: ChatGPT-User
# Disallow: /
#
# User-agent: CCBot
# Disallow: /`;

export const SITEMAP_DIAGNOSTIC_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sitemap Diagnostic - IndexpilotAI</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            min-height: 100vh;
            padding: 2rem;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: rgba(30, 41, 59, 0.8);
            border-radius: 1rem;
            padding: 2rem;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        
        h1 {
            color: #06b6d4;
            margin-bottom: 1rem;
            font-size: 2.5rem;
            text-align: center;
        }
        
        .status {
            text-align: center;
            padding: 1rem;
            border-radius: 0.5rem;
            margin: 2rem 0;
            font-size: 1.2rem;
            font-weight: bold;
        }
        
        .status.success {
            background: rgba(34, 197, 94, 0.2);
            color: #4ade80;
            border: 2px solid #22c55e;
        }
        
        .status.error {
            background: rgba(239, 68, 68, 0.2);
            color: #f87171;
            border: 2px solid #ef4444;
        }
        
        .test-section {
            background: rgba(15, 23, 42, 0.6);
            border-radius: 0.5rem;
            padding: 1.5rem;
            margin: 1rem 0;
            border-left: 4px solid #06b6d4;
        }
        
        .test-section h2 {
            color: #06b6d4;
            margin-bottom: 1rem;
        }
        
        .test-item {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem;
            margin: 0.5rem 0;
            background: rgba(30, 41, 59, 0.5);
            border-radius: 0.375rem;
        }
        
        .test-item .icon {
            font-size: 1.5rem;
        }
        
        .test-item .icon.success {
            color: #4ade80;
        }
        
        .test-item .icon.error {
            color: #f87171;
        }
        
        .test-item .icon.pending {
            color: #fbbf24;
        }
        
        .test-item .label {
            flex: 1;
            color: #cbd5e1;
        }
        
        .test-item .value {
            font-family: 'Courier New', monospace;
            color: #06b6d4;
        }
        
        .code-block {
            background: #0f172a;
            padding: 1rem;
            border-radius: 0.375rem;
            overflow-x: auto;
            margin: 1rem 0;
            border: 1px solid #334155;
        }
        
        .code-block pre {
            color: #e2e8f0;
            font-family: 'Courier New', monospace;
            font-size: 0.875rem;
            line-height: 1.5;
        }
        
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            text-decoration: none;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            border: none;
            cursor: pointer;
            margin: 0.5rem;
        }
        
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(6, 182, 212, 0.3);
        }
        
        .btn-group {
            text-align: center;
            margin: 2rem 0;
        }
        
        .loading {
            text-align: center;
            padding: 3rem;
        }
        
        .spinner {
            border: 4px solid rgba(6, 182, 212, 0.1);
            border-top: 4px solid #06b6d4;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .timestamp {
            text-align: center;
            color: #64748b;
            font-size: 0.875rem;
            margin-top: 2rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Sitemap Diagnostic Tool</h1>
        <div class="status" id="mainStatus">
            <div class="spinner"></div>
            Running diagnostics...
        </div>
        
        <div class="test-section">
            <h2>📡 File Accessibility Tests</h2>
            <div id="fileTests">
                <div class="test-item">
                    <div class="icon pending">⏳</div>
                    <div class="label">Testing sitemap.xml...</div>
                    <div class="value" id="sitemap-status">Pending</div>
                </div>
                <div class="test-item">
                    <div class="icon pending">⏳</div>
                    <div class="label">Testing robots.txt...</div>
                    <div class="value" id="robots-status">Pending</div>
                </div>
            </div>
        </div>
        
        <div class="test-section">
            <h2>📊 Test Results</h2>
            <div id="results"></div>
        </div>
        
        <div class="btn-group">
            <a href="/sitemap.xml" class="btn" target="_blank">View Sitemap.xml</a>
            <a href="/robots.txt" class="btn" target="_blank">View Robots.txt</a>
            <button class="btn" onclick="location.reload()">🔄 Run Tests Again</button>
        </div>
        
        <div class="timestamp">
            Last updated: <span id="timestamp"></span>
        </div>
    </div>
    
    <script>
        async function testFile(url, name, statusId) {
            try {
                const response = await fetch(url);
                const text = await response.text();
                const status = response.ok ? 'success' : 'error';
                
                document.getElementById(statusId).textContent = response.ok ? '✅ Accessible' : '❌ Failed';
                document.getElementById(statusId).previousElementSibling.previousElementSibling.classList.remove('pending');
                document.getElementById(statusId).previousElementSibling.previousElementSibling.classList.add(status);
                document.getElementById(statusId).previousElementSibling.previousElementSibling.textContent = response.ok ? '✅' : '❌';
                
                return { name, url, status, statusCode: response.status, size: text.length, content: text.substring(0, 500) };
            } catch (error) {
                document.getElementById(statusId).textContent = '❌ Error: ' + error.message;
                document.getElementById(statusId).previousElementSibling.previousElementSibling.classList.remove('pending');
                document.getElementById(statusId).previousElementSibling.previousElementSibling.classList.add('error');
                document.getElementById(statusId).previousElementSibling.previousElementSibling.textContent = '❌';
                
                return { name, url, status: 'error', error: error.message };
            }
        }
        
        async function runDiagnostics() {
            const sitemapResult = await testFile('/sitemap.xml', 'sitemap.xml', 'sitemap-status');
            const robotsResult = await testFile('/robots.txt', 'robots.txt', 'robots-status');
            
            const allPassed = sitemapResult.status === 'success' && robotsResult.status === 'success';
            
            const mainStatus = document.getElementById('mainStatus');
            mainStatus.className = 'status ' + (allPassed ? 'success' : 'error');
            mainStatus.innerHTML = allPassed ? '✅ All tests passed!' : '❌ Some tests failed';
            
            const resultsDiv = document.getElementById('results');
            resultsDiv.innerHTML = \`
                <div class="test-item">
                    <div class="icon \${sitemapResult.status}">\${sitemapResult.status === 'success' ? '✅' : '❌'}</div>
                    <div class="label">Sitemap.xml</div>
                    <div class="value">Status: \${sitemapResult.statusCode || 'Error'} | Size: \${sitemapResult.size || 0} bytes</div>
                </div>
                <div class="test-item">
                    <div class="icon \${robotsResult.status}">\${robotsResult.status === 'success' ? '✅' : '❌'}</div>
                    <div class="label">Robots.txt</div>
                    <div class="value">Status: \${robotsResult.statusCode || 'Error'} | Size: \${robotsResult.size || 0} bytes</div>
                </div>
            \`;
            
            if (sitemapResult.content) {
                resultsDiv.innerHTML += \`
                    <div class="code-block">
                        <strong>Sitemap.xml Preview (first 500 chars):</strong>
                        <pre>\${sitemapResult.content}</pre>
                    </div>
                \`;
            }
            
            if (robotsResult.content) {
                resultsDiv.innerHTML += \`
                    <div class="code-block">
                        <strong>Robots.txt Preview:</strong>
                        <pre>\${robotsResult.content}</pre>
                    </div>
                \`;
            }
        }
        
        document.getElementById('timestamp').textContent = new Date().toLocaleString();
        runDiagnostics();
    </script>
</body>
</html>`;
