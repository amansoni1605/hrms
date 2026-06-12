'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';

export interface FileUploadProps {
  accept?:        string;             // e.g. ".pdf,.jpg,.png"
  maxSizeMB?:     number;             // default 10
  multiple?:      boolean;            // default false
  onFilesChange:  (files: File[]) => void;
  uploadEndpoint?: string;            // optional — if provided, posts via FormData
}

export function FileUpload({
  accept,
  maxSizeMB = 10,
  multiple  = false,
  onFilesChange,
  uploadEndpoint,
}: FileUploadProps) {
  const [files,   setFiles]   = useState<File[]>([]);
  const [dragOver, setDrag]   = useState(false);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const inputRef              = useRef<HTMLInputElement>(null);

  const handle = async (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);

    // Size validation
    const tooBig = arr.find((f) => f.size > maxSizeMB * 1024 * 1024);
    if (tooBig) {
      setError(`"${tooBig.name}" exceeds ${maxSizeMB} MB limit.`);
      return;
    }

    setError('');
    const next = multiple ? [...files, ...arr] : arr.slice(0, 1);
    setFiles(next);
    onFilesChange(next);

    // Optional remote upload
    if (uploadEndpoint) {
      setBusy(true);
      try {
        const fd = new FormData();
        for (const f of arr) fd.append('files', f, f.name);
        const res = await fetch(uploadEndpoint, { method: 'POST', body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? 'Upload failed');
        }
      } finally {
        setBusy(false);
      }
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDrag(false);
    handle(e.dataTransfer.files);
  };
  const onChange = (e: ChangeEvent<HTMLInputElement>) => handle(e.target.files);

  const remove = (idx: number) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    onFilesChange(next);
  };

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '0.6rem',
          padding: '2rem 1.6rem',
          borderRadius: '0.8rem',
          border: `2px dashed ${dragOver ? 'var(--color-vr-blue-5)' : 'var(--color-stroke)'}`,
          background: dragOver ? 'var(--color-vr-blue-1)' : 'var(--color-neutral-2)',
          cursor: 'pointer',
          transition: 'background 120ms ease, border-color 120ms ease',
          color: 'var(--color-neutral-7)',
          textAlign: 'center',
        }}
      >
        {busy
          ? <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
          : <Upload size={20} style={{ color: 'var(--color-vr-blue-6)' }} />}
        <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, color: 'var(--color-neutral-10)', fontSize: 'var(--text-fs-12)' }}>
          {dragOver ? 'Drop files to upload' : 'Click or drag files here'}
        </p>
        <p style={{ margin: 0, fontSize: 10 }}>
          {accept ?? 'Any file'} · max {maxSizeMB} MB{multiple ? ' each' : ''}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <p style={{
          margin: '0.6rem 0 0 0',
          color: 'var(--color-semantics-red-6)',
          fontSize: 'var(--text-fs-12)',
        }}>
          {error}
        </p>
      )}

      {files.length > 0 && (
        <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {files.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.6rem 0.8rem', borderRadius: '0.6rem',
                background: 'var(--color-neutral-2)',
                border: '1px solid var(--color-stroke)',
              }}
            >
              <FileText size={14} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, color: 'var(--color-neutral-10)',
                  fontSize: 'var(--text-fs-12)', fontFamily: 'var(--font-in-sb)', fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {f.name}
                </p>
                <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 10 }}>
                  {(f.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={() => remove(i)}
                aria-label="Remove"
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: 'var(--color-neutral-7)', padding: 2,
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
