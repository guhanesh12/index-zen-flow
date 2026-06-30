// @ts-nocheck
import { FileText, ImageIcon, Video, Download } from 'lucide-react';

export interface SavedAttachment {
  name: string;
  type: string;
  size: number;
  path: string;
  signedUrl?: string | null;
}

interface Props {
  attachments?: SavedAttachment[] | null;
  label?: string;
}

function fmtSize(n: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function SupportAttachmentList({ attachments, label = 'Attachments' }: Props) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label} ({attachments.length})</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {attachments.map((a, i) => {
          const url = a.signedUrl || '';
          const isImage = a.type?.startsWith('image/');
          const isVideo = a.type?.startsWith('video/');

          if (isImage && url) {
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-900/50 border border-slate-700 rounded-md overflow-hidden hover:border-blue-500/50 transition"
              >
                <img src={url} alt={a.name} className="w-full h-32 object-cover" />
                <div className="px-2 py-1 text-xs text-slate-300 truncate">{a.name}</div>
              </a>
            );
          }
          if (isVideo && url) {
            return (
              <div key={i} className="bg-slate-900/50 border border-slate-700 rounded-md overflow-hidden">
                <video src={url} controls className="w-full h-32 object-cover bg-black" />
                <div className="px-2 py-1 text-xs text-slate-300 truncate">{a.name}</div>
              </div>
            );
          }
          return (
            <a
              key={i}
              href={url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-slate-900/50 border border-slate-700 rounded-md p-3 hover:border-blue-500/50 transition"
            >
              <FileText className="size-6 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{a.name}</div>
                <div className="text-xs text-slate-500">{fmtSize(a.size)}</div>
              </div>
              <Download className="size-4 text-blue-400" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
