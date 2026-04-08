// @ts-nocheck
import { SITEMAP_XML, ROBOTS_TXT } from '../data/staticFiles';

interface XMLFileServerProps {
  filePath: string;
  contentType: 'application/xml' | 'text/plain';
}

export default function XMLFileServer({ filePath, contentType }: XMLFileServerProps) {
  // Get content based on file path
  let content = '';
  
  if (filePath === '/sitemap.xml') {
    content = SITEMAP_XML;
  } else if (filePath === '/robots.txt') {
    content = ROBOTS_TXT;
  }
  
  console.log(`📄 Serving ${filePath} (${content.length} bytes)`);
  
  // For XML files, render as preformatted text with proper styling
  if (contentType === 'application/xml') {
    return (
      <pre style={{
        fontFamily: 'monospace',
        fontSize: '14px',
        lineHeight: '1.5',
        padding: '20px',
        margin: 0,
        background: '#fff',
        color: '#000',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        overflow: 'auto',
        minHeight: '100vh'
      }}>
        {content}
      </pre>
    );
  }

  // For text files (robots.txt), render as plain text
  return (
    <pre style={{
      fontFamily: 'monospace',
      fontSize: '14px',
      lineHeight: '1.5',
      padding: '20px',
      margin: 0,
      background: '#f5f5f5',
      color: '#000',
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      overflow: 'auto',
      minHeight: '100vh'
    }}>
      {content}
    </pre>
  );
}
