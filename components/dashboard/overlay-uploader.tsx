'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { registerOverlay } from '@/app/actions/dashboard';

const REQUIRED_WIDTH = 1240;
const REQUIRED_HEIGHT = 3508;
const REQUIRED_RATIO = REQUIRED_WIDTH / REQUIRED_HEIGHT;

type OverlayUploaderProps = {
  bucketId: string;
};

async function getImageSize(file: File): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      URL.revokeObjectURL(url);
      resolve({ width, height });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image size.'));
    };

    image.src = url;
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function OverlayUploader({ bucketId }: OverlayUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('Premium Overlay');
  const [message, setMessage] = useState(
    'Upload PNG transparan ukuran 1240 x 3508 px (rasio 10.5 x 29.7 cm).'
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<{
    name: string;
    size: number;
    width: number;
    height: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const ratioText = useMemo(() => `${REQUIRED_WIDTH} x ${REQUIRED_HEIGHT}`, []);

  async function handleFileChange(file: File | null) {
    if (!file) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setFileMeta(null);
      setMessage('Upload PNG transparan ukuran 1240 x 3508 px (rasio 10.5 x 29.7 cm).');
      return;
    }

    if (file.type !== 'image/png') {
      setMessage('File harus PNG transparan.');
      if (inputRef.current) inputRef.current.value = '';
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setFileMeta(null);
      return;
    }

    try {
      const size = await getImageSize(file);
      const nextPreviewUrl = URL.createObjectURL(file);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(nextPreviewUrl);

      setFileMeta({
        name: file.name,
        size: file.size,
        width: size.width,
        height: size.height
      });

      if (size.width !== REQUIRED_WIDTH || size.height !== REQUIRED_HEIGHT) {
        setMessage(
          `Ukuran overlay harus ${REQUIRED_WIDTH} x ${REQUIRED_HEIGHT}px. File kamu ${size.width} x ${size.height}px.`
        );
        return;
      }

      const currentRatio = size.width / size.height;
      const ratioDiff = Math.abs(currentRatio - REQUIRED_RATIO);

      if (ratioDiff > 0.0001) {
        setMessage('Rasio overlay tidak sesuai standard 10.5 x 29.7 cm.');
        return;
      }

      setMessage('Overlay valid. Siap diupload.');
    } catch (error) {
      console.error(error);
      setMessage('Gagal membaca ukuran file overlay.');
    }
  }

  async function onUpload() {
    const file = inputRef.current?.files?.[0];

    if (!file) {
      setMessage('Pilih file PNG terlebih dahulu.');
      return;
    }

    if (!label.trim()) {
      setMessage('Nama overlay wajib diisi.');
      return;
    }

    if (file.type !== 'image/png') {
      setMessage('File harus PNG transparan.');
      return;
    }

    let imageSize: { width: number; height: number };
    try {
      imageSize = await getImageSize(file);
    } catch {
      setMessage('Gagal membaca ukuran overlay.');
      return;
    }

    if (imageSize.width !== REQUIRED_WIDTH || imageSize.height !== REQUIRED_HEIGHT) {
      setMessage(
        `Ukuran overlay harus ${REQUIRED_WIDTH} x ${REQUIRED_HEIGHT}px. File kamu ${imageSize.width} x ${imageSize.height}px.`
      );
      return;
    }

    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/\s+/g, '-').toLowerCase();
    const storagePath = `overlays/${timestamp}-${sanitizedFileName}`;

    const supabase = createSupabaseBrowserClient();

    setMessage('Uploading overlay to storage...');

    const { error: uploadError } = await supabase.storage.from(bucketId).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/png'
    });

    if (uploadError) {
      console.error('Overlay upload error:', uploadError);
      setMessage(uploadError.message || 'Upload overlay gagal.');
      return;
    }

    startTransition(async () => {
      try {
        await registerOverlay({
          label: label.trim(),
          storagePath
        });

        setMessage('Overlay berhasil diupload dan diregistrasikan.');

        if (inputRef.current) {
          inputRef.current.value = '';
        }

        setLabel('Premium Overlay');

        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }

        setPreviewUrl(null);
        setFileMeta(null);
      } catch (error) {
        console.error('Register overlay error:', error);
        setMessage(error instanceof Error ? error.message : 'Gagal menyimpan metadata overlay.');
      }
    });
  }

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Overlay Management</h3>
          <p className="mt-2 text-sm text-slate-500">
            Standard overlay: PNG transparan {ratioText}px, portrait, rasio 10.5 x 29.7 cm.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
          Bucket: {bucketId}
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700">Overlay Name</label>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Premium Overlay"
            className="rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700">Overlay PNG File</label>
          <input
            ref={inputRef}
            type="file"
            accept="image/png"
            onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
            className="rounded-2xl border border-slate-300 px-4 py-3 outline-none transition file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
          />
        </div>

        {fileMeta ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p>
              <span className="font-semibold text-slate-800">File:</span> {fileMeta.name}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-slate-800">Size:</span> {formatBytes(fileMeta.size)}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-slate-800">Dimension:</span> {fileMeta.width} x {fileMeta.height}px
            </p>
          </div>
        ) : null}

        {previewUrl ? (
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Preview Overlay</p>
            <div className="flex justify-center">
              <div className="w-[180px] overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white p-2">
                <img
                  src={previewUrl}
                  alt="Overlay preview"
                  className="h-auto w-full rounded-[1rem] object-contain"
                />
              </div>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void onUpload()}
          disabled={isPending}
          className="rounded-2xl bg-brand-600 px-4 py-3 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Registering Overlay...' : 'Upload Overlay'}
        </button>

        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          {message}
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Pastikan file overlay kamu memiliki area transparan untuk 3 frame foto dan export sebagai PNG
          transparan ukuran {REQUIRED_WIDTH} x {REQUIRED_HEIGHT}px.
        </div>
      </div>
    </div>
  );
}