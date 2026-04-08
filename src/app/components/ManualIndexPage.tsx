import { useState } from 'react';
import { SEO, SEO_CONFIGS } from '../utils/seo';

interface URLItem {
  url: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityClass: string;
}

export default function ManualIndexPage() {
  const [toast, setToast] = useState({ show: false, message: '' });
  
  // Get SEO config for this page
  const seoConfig = SEO_CONFIGS.manualIndex;

  const urls: URLItem[] = [
    { url: 'https://www.indexpilotai.com/', priority: 'HIGH', priorityClass: 'high' },
    { url: 'https://www.indexpilotai.com/dashboard', priority: 'HIGH', priorityClass: 'high' },
    { url: 'https://www.indexpilotai.com/login', priority: 'MEDIUM', priorityClass: 'medium' },
    { url: 'https://www.indexpilotai.com/register', priority: 'MEDIUM', priorityClass: 'medium' },
    { url: 'https://www.indexpilotai.com/pwa-setup', priority: 'LOW', priorityClass: 'low' },
  ];

  const highPriorityUrls = urls.filter(u => u.priority === 'HIGH');
  const mediumPriorityUrls = urls.filter(u => u.priority === 'MEDIUM');
  const lowPriorityUrls = urls.filter(u => u.priority === 'LOW');

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast(`URL copied: ${url}`);
    });
  };

  const copyAllUrls = () => {
    const urlList = urls.map(u => u.url).join('\n');
    navigator.clipboard.writeText(urlList).then(() => {
      showToast(`All ${urls.length} URLs copied!`);
    });
  };

  const showToast = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 3000);
  };

  return (
    <>
      <SEO {...seoConfig} />

      <div style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        color: '#e5e5e5',
        padding: '40px 20px',
        minHeight: '100vh',
      }}>
        <div style={{
          maxWidth: '900px',
          margin: '0 auto',
          background: 'rgba(30, 30, 30, 0.8)',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '40px',
          backdropFilter: 'blur(10px)',
        }}>
          {/* Header */}
          <h1 style={{
            color: '#10b981',
            fontSize: '32px',
            marginBottom: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: 0,
          }}>
            🔍 IndexpilotAI - Manual Index URLs
          </h1>
          <p style={{ color: '#888', marginBottom: '30px', fontSize: '14px' }}>
            All URLs ready for manual submission to Google Search Console
          </p>

          {/* Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            margin: '20px 0',
          }}>
            <StatCard value={urls.length} label="Total URLs" />
            <StatCard value={highPriorityUrls.length} label="High Priority" />
            <StatCard value={mediumPriorityUrls.length} label="Medium Priority" />
            <StatCard value={lowPriorityUrls.length} label="Low Priority" />
          </div>

          {/* Instructions */}
          <div style={{
            background: '#1e3a5f',
            borderLeft: '4px solid #60a5fa',
            padding: '20px',
            borderRadius: '8px',
            margin: '30px 0',
          }}>
            <h3 style={{ color: '#60a5fa', marginTop: 0, marginBottom: '15px' }}>
              📋 How to Manually Index in Google Search Console
            </h3>
            <ol style={{ marginLeft: '20px', lineHeight: '1.8', marginBottom: 0 }}>
              <li>Go to <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', textDecoration: 'none' }}>Google Search Console</a></li>
              <li>Select your property: <strong>www.indexpilotai.com</strong></li>
              <li>Use the search bar at the top and paste each URL below</li>
              <li>Click "Request Indexing" for each URL</li>
              <li>Start with <span style={{ color: '#10b981' }}>HIGH PRIORITY</span> pages first</li>
              <li>Wait 1-2 days between batch submissions (avoid rate limits)</li>
            </ol>
          </div>

          {/* High Priority */}
          <URLSection
            title="🔥 High Priority Pages (Index These First)"
            urls={highPriorityUrls}
            onCopyUrl={copyUrl}
          />

          {/* Medium Priority */}
          <URLSection
            title="⚡ Medium Priority Pages"
            urls={mediumPriorityUrls}
            onCopyUrl={copyUrl}
          />

          {/* Low Priority */}
          <URLSection
            title="📱 Low Priority Pages (Optional)"
            urls={lowPriorityUrls}
            onCopyUrl={copyUrl}
          />

          {/* Copy All Button */}
          <button
            onClick={copyAllUrls}
            style={{
              background: '#f59e0b',
              color: '#000',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              width: '100%',
              marginTop: '20px',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#d97706'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#f59e0b'}
          >
            📋 Copy All URLs (One Per Line)
          </button>

          {/* After Indexing Instructions */}
          <div style={{
            marginTop: '40px',
            background: '#1e2a1f',
            borderLeft: '4px solid #10b981',
            padding: '20px',
            borderRadius: '8px',
          }}>
            <h3 style={{ color: '#10b981', marginTop: 0, marginBottom: '15px' }}>
              ✅ After Manual Indexing
            </h3>
            <ol style={{ marginLeft: '20px', lineHeight: '1.8', marginBottom: 0 }}>
              <li>Check indexing status in 3-7 days via Google Search Console</li>
              <li>Monitor search appearance: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>site:www.indexpilotai.com</code> in Google</li>
              <li>Each page now has unique titles and descriptions (thanks to react-helmet-async)</li>
              <li>Once indexed, pages will show different titles/descriptions in Google</li>
            </ol>
          </div>
        </div>

        {/* Toast Notification */}
        {toast.show && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#10b981',
            color: '#000',
            padding: '12px 20px',
            borderRadius: '6px',
            fontWeight: 'bold',
            zIndex: 1000,
            animation: 'slideIn 0.3s ease-out',
          }}>
            {toast.message}
          </div>
        )}

        <style>
          {`
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateY(-20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}
        </style>
      </div>
    </>
  );
}

// Stat Card Component
function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div style={{
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '8px',
      padding: '15px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981' }}>
        {value}
      </div>
      <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', marginTop: '5px' }}>
        {label}
      </div>
    </div>
  );
}

// URL Section Component
function URLSection({ title, urls, onCopyUrl }: { title: string; urls: URLItem[]; onCopyUrl: (url: string) => void }) {
  return (
    <div style={{ margin: '30px 0' }}>
      <div style={{
        color: '#60a5fa',
        fontSize: '20px',
        marginBottom: '15px',
        paddingBottom: '10px',
        borderBottom: '2px solid #333',
      }}>
        {title}
      </div>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '8px',
        padding: '20px',
      }}>
        {urls.map((item, index) => (
          <URLItem key={index} item={item} onCopyUrl={onCopyUrl} />
        ))}
      </div>
    </div>
  );
}

// URL Item Component
function URLItem({ item, onCopyUrl }: { item: URLItem; onCopyUrl: (url: string) => void }) {
  const [isHovered, setIsHovered] = useState(false);

  const priorityColors = {
    high: { bg: '#10b981', color: '#000' },
    medium: { bg: '#f59e0b', color: '#000' },
    low: { bg: '#6b7280', color: '#fff' },
  };

  const colors = priorityColors[item.priorityClass as keyof typeof priorityColors];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px',
        marginBottom: '8px',
        background: isHovered ? '#2a2a2a' : '#222',
        border: `1px solid ${isHovered ? '#10b981' : '#333'}`,
        borderRadius: '6px',
        transition: 'all 0.2s',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{
        fontSize: '12px',
        padding: '4px 8px',
        borderRadius: '4px',
        fontWeight: 'bold',
        minWidth: '80px',
        textAlign: 'center',
        background: colors.bg,
        color: colors.color,
      }}>
        {item.priority}
      </span>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          flex: 1,
          color: '#60a5fa',
          textDecoration: 'none',
          fontFamily: '"Courier New", monospace',
          fontSize: '14px',
        }}
      >
        {item.url}
      </a>
      <button
        onClick={() => onCopyUrl(item.url)}
        style={{
          background: '#10b981',
          color: '#000',
          border: 'none',
          padding: '6px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 'bold',
          transition: 'background 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
      >
        Copy
      </button>
    </div>
  );
}