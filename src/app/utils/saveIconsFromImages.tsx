// @ts-nocheck
/**
 * PWA ICON SAVER
 * 
 * This component helps save the icons to proper PWA icon files
 * Run this once to generate all PWA icons from your uploaded images
 */

export const PWA_ICONS: Record<string, string> = {
  '72': '/icons/icon-72x72.png',
  '96': '/icons/icon-96x96.png',
  '128': '/icons/icon-128x128.png',
  '144': '/icons/icon-144x144.png',
  '152': '/icons/icon-152x152.png',
  '192': '/icons/icon-192x192.png',
  '384': '/icons/icon-384x384.png',
  '512': '/icons/icon-512x512.png',
};

export function IconPreviewPanel() {
  const handleDownload = (size: string, url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `icon-${size}x${size}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    Object.entries(PWA_ICONS).forEach(([size, url], index) => {
      setTimeout(() => {
        handleDownload(size, url);
      }, index * 500);
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(10, 14, 26, 0.98)',
      border: '2px solid #3b82f6',
      borderRadius: '16px',
      padding: '30px',
      maxWidth: '800px',
      maxHeight: '90vh',
      overflow: 'auto',
      zIndex: 9999,
      boxShadow: '0 20px 60px rgba(59, 130, 246, 0.3)',
    }}>
      <h2 style={{ 
        color: '#3b82f6', 
        fontSize: '24px', 
        marginBottom: '20px',
        textAlign: 'center' 
      }}>
        PWA Icon Generator - IndexpilotAI
      </h2>
      
      <p style={{ 
        color: '#94a3b8', 
        textAlign: 'center', 
        marginBottom: '20px' 
      }}>
        Click "Download All" to save all icons, then upload them to your hosting provider's <code>/public/icons/</code> folder.
      </p>

      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <button
          onClick={handleDownloadAll}
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: 'white',
            border: 'none',
            padding: '12px 30px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
          }}
        >
          Download All Icons
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
        gap: '20px',
        marginTop: '20px',
      }}>
        {Object.entries(PWA_ICONS).map(([size, url]) => (
          <div key={size} style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '8px',
            padding: '15px',
            textAlign: 'center',
          }}>
            <img 
              src={url} 
              alt={`Icon ${size}x${size}`}
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'contain',
                marginBottom: '10px',
                borderRadius: '8px',
              }}
            />
            <div style={{ color: '#cbd5e1', fontSize: '12px', marginBottom: '5px' }}>
              {size}x{size}px
            </div>
            <button
              onClick={() => handleDownload(size, url)}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default IconPreviewPanel;
