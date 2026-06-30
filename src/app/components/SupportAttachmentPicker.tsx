// @ts-nocheck
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Paperclip, X, FileText, ImageIcon, Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export interface PendingAttachment {
  name: string;
  type: string;
  size: number;
  base64: string;
  previewUrl?: string;
}

interface Props {
  attachments: PendingAttachment[];
  onChange: (next: PendingAttachment[]) => void;
  disabled?: boolean;
  max?: number;
  maxBytes?: number;
}

const ALLOWED = /^(image\/(jpeg|jpg|png|webp|gif)|video\/(mp4|quicktime|webm)|application\/(pdf|zip|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet))|text\/plain)$/i;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function SupportAttachmentPicker({
  attachments,
  onChange,
  disabled,
  max = 5,
  maxBytes = 10 * 1024 * 1024,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handlePick = () => fileRef.current?.click();

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // reset so same file can be re-picked
    if (!files.length) return;

    if (attachments.length + files.length > max) {
      toast.error(`Max ${max} attachments allowed`);
      return;
    }

    setLoading(true);
    try {
      const next: PendingAttachment[] = [...attachments];
      for (const f of files) {
        if (!ALLOWED.test(f.type)) {
          toast.error(`File type not allowed: ${f.name}`);
          continue;
        }
        if (f.size > maxBytes) {
          toast.error(`"${f.name}" exceeds ${(maxBytes / 1024 / 1024).toFixed(0)} MB limit`);
          continue;
        }
        const base64 = await readAsBase64(f);
        next.push({
          name: f.name,
          type: f.type,
          size: f.size,
          base64,
          previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
        });
      }
      onChange(next);
    } catch (err) {
      console.error(err);
      toast.error('Failed to read file');
    } finally {
      setLoading(false);
    }
  };

  const remove = (idx: number) => {
    const next = attachments.slice();
    const [removed] = next.splice(idx, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    onChange(next);
  };

  const iconFor = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="size-4 text-blue-400" />;
    if (type.startsWith('video/')) return <Video className="size-4 text-purple-400" />;
    return <FileText className="size-4 text-slate-400" />;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePick}
          disabled={disabled || loading || attachments.length >= max}
          className="bg-slate-900/50 border-slate-700 hover:bg-slate-800"
        >
          {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Paperclip className="size-4 mr-2" />}
          Attach files
        </Button>
        <span className="text-xs text-slate-500">
          {attachments.length}/{max} • images, video, pdf, doc, xlsx, zip • max 10 MB each
        </span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,video/*,application/pdf,application/zip,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={handleFiles}
        />
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={`${a.name}-${i}`}
              className="flex items-center gap-2 bg-slate-900/70 border border-slate-700 rounded-md px-2 py-1.5 text-xs"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt={a.name} className="size-8 rounded object-cover" />
              ) : (
                iconFor(a.type)
              )}
              <div className="max-w-[160px]">
                <div className="text-white truncate">{a.name}</div>
                <div className="text-slate-500">{fmtSize(a.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                className="ml-1 p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
