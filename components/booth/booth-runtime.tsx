'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { CaptureStrip } from '@/components/booth/capture-strip';
import { OverlayPicker } from '@/components/booth/overlay-picker';
import { createSessionDraft, markSessionUploaded } from '@/app/actions/booth';
import { buildPhotoStrip } from '@/lib/booth/canvas';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useCamera } from '@/hooks/useCamera';

type OverlayOption = {
  id: string;
  label: string;
  bucket_id: string;
  storage_path: string;
  signed_url: string;
};

type BoothRuntimeProps = {
  boothId: string;
  overlays?: OverlayOption[];
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function BoothRuntime({ boothId, overlays = [] }: BoothRuntimeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const finalPreviewRef = useRef<string | null>(null);

  const { isReady, error, start, stop, captureFrame } = useCamera(videoRef, {
    width: 1920,
    height: 1080,
    frameRate: 60
  });

  const safeOverlays = Array.isArray(overlays) ? overlays : [];
  const validOverlays = useMemo(
    () => safeOverlays.filter((overlay) => overlay?.id && isUuid(overlay.id)),
    [safeOverlays]
  );

  const [selectedOverlayId, setSelectedOverlayId] = useState<string>(validOverlays[0]?.id ?? '');
  const [frames, setFrames] = useState<Blob[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [finalPreview, setFinalPreview] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready for a 3-photo photobooth session.');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    previewUrlsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    finalPreviewRef.current = finalPreview;
  }, [finalPreview]);

  useEffect(() => {
    if (!selectedOverlayId && validOverlays.length > 0) {
      setSelectedOverlayId(validOverlays[0].id);
    }
  }, [selectedOverlayId, validOverlays]);

  useEffect(() => {
    void start();

    return () => {
      stop();

      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (finalPreviewRef.current) {
        URL.revokeObjectURL(finalPreviewRef.current);
      }
    };
  }, [start, stop]);

  const selectedOverlay = useMemo(() => {
    return validOverlays.find((item) => item.id === selectedOverlayId) ?? validOverlays[0] ?? null;
  }, [selectedOverlayId, validOverlays]);

  async function handleCapture() {
    try {
      if (!isReady) {
        setStatus('Camera is not ready yet. Start the camera first.');
        return;
      }

      if (frames.length >= 3) {
        setStatus('You already captured 3 photos. Reset or finalize the session.');
        return;
      }

      const blob = await captureFrame();
      const previewUrl = URL.createObjectURL(blob);

      setFrames((prev) => [...prev, blob]);
      setPreviews((prev) => [...prev, previewUrl]);
      setStatus(`Captured frame ${frames.length + 1} of 3.`);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Failed to capture frame.');
    }
  }

  function handleReset() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];

    if (finalPreviewRef.current) {
      URL.revokeObjectURL(finalPreviewRef.current);
      finalPreviewRef.current = null;
    }

    setFrames([]);
    setPreviews([]);
    setFinalPreview(null);
    setStatus('Session reset. Ready for a fresh 3-photo capture.');
  }

  function handleOverlayChange(id: string) {
    setSelectedOverlayId(id);
    setStatus('Overlay updated.');
  }

  async function handleFinalize() {
    if (!isUuid(boothId)) {
      setStatus('Invalid booth ID. Please reopen the booth from dashboard.');
      return;
    }

    if (!selectedOverlay) {
      setStatus('No valid overlay available. Upload a real overlay from dashboard first.');
      return;
    }

    if (!isUuid(selectedOverlay.id)) {
      setStatus('Invalid overlay ID. Please choose a valid uploaded overlay.');
      return;
    }

    if (frames.length !== 3) {
      setStatus('You must capture exactly 3 photos before finalizing.');
      return;
    }

    if (!selectedOverlay.signed_url) {
      setStatus('Overlay image URL is missing. Please re-upload or refresh overlay data.');
      return;
    }

    startTransition(async () => {
      try {
        setStatus('Rendering final strip...');

        const finalStripBlob = await buildPhotoStrip({
          frames,
          overlayUrl: selectedOverlay.signed_url
        });

        setStatus('Creating session draft...');

        const draft = await createSessionDraft({
          boothId,
          overlayId: selectedOverlay.id
        });

        const supabase = createSupabaseBrowserClient();

        setStatus('Uploading final strip to storage...');

        const { error: uploadError } = await supabase.storage
          .from(draft.final_bucket_id)
          .upload(draft.final_storage_path, finalStripBlob, {
            contentType: 'image/png',
            upsert: false
          });

        if (uploadError) {
          throw uploadError;
        }

        const rawFrames = Array.from({ length: 3 }).map(
          (_, index) => `sessions/${draft.session_code}/raw-${index + 1}.jpg`
        );

        await markSessionUploaded(draft.id, rawFrames);

        if (finalPreviewRef.current) {
          URL.revokeObjectURL(finalPreviewRef.current);
        }

        const nextPreviewUrl = URL.createObjectURL(finalStripBlob);
        finalPreviewRef.current = nextPreviewUrl;
        setFinalPreview(nextPreviewUrl);

        setStatus(`Final strip uploaded successfully. Session code: ${draft.session_code}`);
      } catch (caught) {
        console.error('Finalize session error:', caught);
        setStatus(caught instanceof Error ? caught.message : 'Unexpected runtime error.');
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
      <section className="rounded-[2rem] border border-slate-200 bg-slate-950 p-4 shadow-panel">
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-800 bg-black">
          <video
            ref={videoRef}
            className="aspect-video w-full object-cover"
            style={{
              filter: 'saturate(1.1) brightness(1.05)',
              transform: 'scaleX(-1)'
            }}
            autoPlay
            muted
            playsInline
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void start()}
            className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {isReady ? 'Restart Camera' : 'Start Camera'}
          </button>

          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={!isReady || isPending}
            className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Capture Frame
          </button>

          <button
            type="button"
            onClick={() => void handleFinalize()}
            disabled={isPending || frames.length !== 3 || !selectedOverlay}
            className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? 'Processing...' : 'Finalize 3 Photos + Overlay'}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={() => stop()}
            className="rounded-2xl bg-slate-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-600"
          >
            Stop
          </button>
        </div>
      </section>

      <section className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Sony A6400 Runtime</h3>
          <p className="mt-2 text-sm text-slate-600">
            Set <span className="font-semibold">HDMI Info Display: OFF</span> and{' '}
            <span className="font-semibold">USB Connection: PC Remote</span>.
          </p>

          <div className="mt-4 space-y-4">
            <OverlayPicker
              overlays={validOverlays}
              selectedOverlayId={selectedOverlayId}
              onChange={handleOverlayChange}
            />

            <CaptureStrip previews={previews} />

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              {status}
            </div>

            {validOverlays.length === 0 ? (
              <p className="text-sm text-amber-600">
                No valid overlay found. Upload overlay PNG from dashboard before finalizing the strip.
              </p>
            ) : null}

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Final Preview</h3>

          {finalPreview ? (
            <img
              src={finalPreview}
              alt="Final strip preview"
              className="mt-4 w-full rounded-2xl border border-slate-200"
            />
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Final PNG strip preview will appear here after 3 photos are merged with the selected overlay.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}