// @ts-nocheck
import { SITEMAP_DIAGNOSTIC_HTML } from '../data/staticFiles';

interface HTMLFileServerProps {
  filePath: string;
}

export default function HTMLFileServer({ filePath }: HTMLFileServerProps) {
  // Get content based on file path
  let content = '';
  
  if (filePath === '/sitemap-diagnostic.html') {
    content = SITEMAP_DIAGNOSTIC_HTML;
  }
  
  console.log(`📄 Serving HTML file ${filePath} (${content.length} bytes)`);
  
  // Render the HTML content using dangerouslySetInnerHTML
  // This allows the full HTML page to be displayed
  return (
    <div dangerouslySetInnerHTML={{ __html: content }} />
  );
}
