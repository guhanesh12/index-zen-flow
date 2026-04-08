/**
 * ICON GENERATOR PAGE
 * Access at: /admin/generate-icons
 * Use this to download all PWA icons
 */

import { IconPreviewPanel } from '../utils/saveIconsFromImages';
import { SEO, SEO_CONFIGS } from '../utils/seo';

export default function IconGeneratorPage() {
  return (
    <>
      <SEO {...SEO_CONFIGS.iconGenerator} />
      
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}>
        <IconPreviewPanel />
      </div>
    </>
  );
}