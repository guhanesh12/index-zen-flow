import { useEffect } from 'react';

interface StaticFileRedirectProps {
  targetUrl: string;
  fileName: string;
}

/**
 * Component that redirects to backend URL for static files
 * This is needed because Figma Make can't serve raw files from /public/
 */
export default function StaticFileRedirect({ targetUrl, fileName }: StaticFileRedirectProps) {
  useEffect(() => {
    console.log(`🔄 Redirecting ${fileName} to backend: ${targetUrl}`);
    // Redirect immediately
    window.location.replace(targetUrl);
  }, [targetUrl, fileName]);

  // Show loading state while redirecting
  return (
    <div style={{
      fontFamily: 'monospace',
      padding: '20px',
      background: '#000',
      color: '#0f0',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <div style={{ fontSize: '24px' }}>🔄 Redirecting to {fileName}...</div>
      <div style={{ fontSize: '14px', color: '#888' }}>
        If you are not redirected automatically, <a href={targetUrl} style={{ color: '#0f0' }}>click here</a>.
      </div>
    </div>
  );
}
