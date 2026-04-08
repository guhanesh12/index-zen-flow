// @ts-nocheck
import { useEffect } from 'react';

interface RawFileDisplayProps {
  content: string;
  contentType: 'application/xml' | 'text/plain';
}

/**
 * Component that displays raw content by replacing the entire page
 * This is needed because React Router wraps everything in HTML,
 * but we need pure XML/TXT for Google/crawlers
 */
export default function RawFileDisplay({ content, contentType }: RawFileDisplayProps) {
  useEffect(() => {
    // Replace the entire document with raw content
    document.open();
    document.write(content);
    document.close();
    
    // Set the content type (this won't work in browser but helps with intent)
    console.log(`📄 Displaying raw ${contentType} (${content.length} bytes)`);
  }, [content, contentType]);

  // Return the content in a pre tag as fallback
  // (in case document.write doesn't work)
  return (
    <pre style={{
      fontFamily: 'monospace',
      fontSize: '14px',
      lineHeight: '1.5',
      padding: '20px',
      margin: 0,
      background: contentType === 'application/xml' ? '#fff' : '#f5f5f5',
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
