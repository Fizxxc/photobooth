'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import {
  Aperture,
  Camera,
  CheckCircle2,
  ChevronRight,
  Download,
  Heart,
  Loader2,
  Mic,
  Printer,
  QrCode,
  RefreshCcw,
  RotateCcw,
  Sparkles,
  Wand2
} from 'lucide-react';

import { createSessionDraft, markSessionUploaded } from '@/app/actions/booth';
import { buildPhotoStrip } from '@/lib/booth/canvas';
import { printPhotoStrip } from '@/lib/booth/print';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useCamera } from '@/hooks/useCamera';
import { clientEnv } from '@/lib/env.client';
import { QRISPaymentModal, type BillingModalData } from '@/components/pricing/qris-payment-modal';

type OverlayOption = {
  id: string;
  label: string;
  bucket_id: string;
  storage_path: string;
  signed_url: string;
};

type BoothRuntimeProps = {
  boothId: string;
  boothName?: string;
  overlays?: OverlayOption[];
  isAdmin?: boolean;
  telegramBotUsername?: string | null;
};

type SlotPercent = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type AiAction = 'upscale' | 'clean' | 'vintage' | 'bw' | 'anime' | 'background-pantai' | 'background-kota' | 'face';

type AiProgress = {
  active: boolean;
  label: string;
  percent: number;
  message: string;
};

const SLOT_LAYOUT: SlotPercent[] = [
  { top: 7.2, left: 5.62, width: 88.94, height: 22.96 },
  { top: 32.82, left: 5.62, width: 88.94, height: 22.96 },
  { top: 58.42, left: 5.62, width: 88.94, height: 22.96 }
];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isObjectUrl(value: string | null) {
  return Boolean(value?.startsWith('blob:'));
}

function getApiBaseUrl() {
  return clientEnv.NEXT_PUBLIC_BOOTH_API_BASE_URL.replace(/\/$/, '');
}

async function postBoothApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload?.detail ?? payload?.error ?? payload?.message ?? 'Booth Python API gagal diproses.';

    throw new Error(message);
  }

  return payload as T;
}

async function imageSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source;

  const response = await fetch(source, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Gagal membaca gambar hasil.');
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal mengubah gambar menjadi data URL.'));
      }
    };

    reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
    reader.readAsDataURL(blob);
  });
}

function aiActionLabel(action: AiAction) {
  switch (action) {
    case 'upscale':
      return 'HD Foto';
    case 'clean':
      return 'Clean Filter';
    case 'vintage':
      return 'Vintage Filter';
    case 'bw':
      return 'B&W Filter';
    case 'anime':
      return 'Anime Style';
    case 'background-pantai':
      return 'Background Pantai';
    case 'background-kota':
      return 'Background Kota';
    case 'face':
      return 'Hias Wajah';
    default:
      return 'AI Edit';
  }
}

function aiActionEndpoint(action: AiAction) {
  switch (action) {
    case 'upscale':
      return '/api/booth/ai/upscale';
    case 'clean':
    case 'vintage':
    case 'bw':
      return '/api/booth/ai/filter';
    case 'anime':
      return '/api/booth/ai/anime';
    case 'background-pantai':
    case 'background-kota':
      return '/api/booth/ai/background';
    case 'face':
      return '/api/booth/ai/face-accessory';
    default:
      return '/api/booth/ai/upscale';
  }
}

function aiActionBody(action: AiAction, imageDataUrl: string) {
  if (action === 'clean') {
    return { imageDataUrl, filter: 'clean' };
  }

  if (action === 'vintage') {
    return { imageDataUrl, filter: 'vintage' };
  }

  if (action === 'bw') {
    return { imageDataUrl, filter: 'bw' };
  }

  if (action === 'background-pantai') {
    return { imageDataUrl, background: 'pantai' };
  }

  if (action === 'background-kota') {
    return { imageDataUrl, background: 'kota' };
  }

  return { imageDataUrl };
}

export function BoothRuntime({
  boothId,
  boothName = 'KoGraph Studio Booth',
  overlays = [],
  isAdmin = false,
  telegramBotUsername = null
}: BoothRuntimeProps) {
  const sourceVideoRef = useRef<HTMLVideoElement>(null);
  const previewTopRef = useRef<HTMLVideoElement>(null);
  const previewMiddleRef = useRef<HTMLVideoElement>(null);
  const previewBottomRef = useRef<HTMLVideoElement>(null);

  const previewUrlsRef = useRef<string[]>([]);
  const finalPreviewRef = useRef<string | null>(null);
  const shutterTimeoutRef = useRef<number | null>(null);

  const { isReady, error, start, stop, captureFrame } = useCamera(sourceVideoRef, {
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
  const [status, setStatus] = useState('Pilih overlay, atur timer, lalu tekan shutter.');
  const [countdownPreset, setCountdownPreset] = useState<3 | 5>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeShot, setActiveShot] = useState<number>(0);
  const [isCapturingSequence, setIsCapturingSequence] = useState(false);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [telegramQrUrl, setTelegramQrUrl] = useState<string | null>(null);
  const [donationAmount, setDonationAmount] = useState<string>('1000');
  const [donationModal, setDonationModal] = useState<BillingModalData | null>(null);
  const [aiProgress, setAiProgress] = useState<AiProgress>({
    active: false,
    label: '',
    percent: 0,
    message: ''
  });
  const [isPending, startTransition] = useTransition();

  const [shutterFlash, setShutterFlash] = useState(false);
  const [shutterPulse, setShutterPulse] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);

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

      if (isObjectUrl(finalPreviewRef.current)) {
        URL.revokeObjectURL(finalPreviewRef.current as string);
      }

      if (shutterTimeoutRef.current !== null) {
        window.clearTimeout(shutterTimeoutRef.current);
      }
    };
  }, [start, stop]);

  useEffect(() => {
    const sourceEl = sourceVideoRef.current;
    const stream = (sourceEl?.srcObject as MediaStream | null) ?? null;
    if (!stream) return;

    const targets = [previewTopRef.current, previewMiddleRef.current, previewBottomRef.current];

    targets.forEach((target) => {
      if (!target) return;

      if (target.srcObject !== stream) {
        target.srcObject = stream;
      }

      void target.play().catch(() => undefined);
    });
  }, [isReady, selectedOverlayId]);

  const selectedOverlay = useMemo(() => {
    return validOverlays.find((item) => item.id === selectedOverlayId) ?? validOverlays[0] ?? null;
  }, [selectedOverlayId, validOverlays]);

  const telegramDeepLink = useMemo(() => {
    if (!sessionCode || !telegramBotUsername) return null;

    return `https://t.me/${telegramBotUsername}?start=${sessionCode}`;
  }, [sessionCode, telegramBotUsername]);

  useEffect(() => {
    let cancelled = false;

    async function generateQr() {
      if (!telegramDeepLink) {
        setTelegramQrUrl(null);
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(telegramDeepLink, {
          width: 360,
          margin: 1,
          errorCorrectionLevel: 'M'
        });

        if (!cancelled) {
          setTelegramQrUrl(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setTelegramQrUrl(null);
        }
      }
    }

    void generateQr();

    return () => {
      cancelled = true;
    };
  }, [telegramDeepLink]);

  function triggerShutterEffect() {
    if (shutterTimeoutRef.current !== null) {
      window.clearTimeout(shutterTimeoutRef.current);
    }

    setShutterFlash(true);
    setShutterPulse(true);
    setScanFlash(true);

    shutterTimeoutRef.current = window.setTimeout(() => {
      setShutterFlash(false);
      setShutterPulse(false);
      setScanFlash(false);
    }, 460);
  }

  function clearTransientAssets() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];

    if (isObjectUrl(finalPreviewRef.current)) {
      URL.revokeObjectURL(finalPreviewRef.current as string);
    }

    finalPreviewRef.current = null;
  }

  function handleReset() {
    clearTransientAssets();
    setFrames([]);
    setPreviews([]);
    setFinalPreview(null);
    setSessionCode(null);
    setTelegramQrUrl(null);
    setCountdown(null);
    setActiveShot(0);
    setIsCapturingSequence(false);
    setAiProgress({
      active: false,
      label: '',
      percent: 0,
      message: ''
    });
    setStatus('Sesi baru siap. Silakan mulai lagi.');
  }

  async function finalizeSequence(capturedFrames: Blob[]) {
    if (!boothId) {
      setStatus('Booth ID tidak valid. Silakan buka ulang booth.');
      return;
    }

    if (!selectedOverlay) {
      setStatus('Belum ada overlay aktif. Upload overlay terlebih dahulu.');
      return;
    }

    if (!selectedOverlay.signed_url) {
      setStatus('URL overlay belum tersedia. Coba refresh data overlay.');
      return;
    }

    startTransition(() => {
      void (async () => {
        try {
          setStatus('Menyusun photostrip final...');

          const finalStripBlob = await buildPhotoStrip({
            frames: capturedFrames,
            overlayUrl: selectedOverlay.signed_url
          });

          const draft = await createSessionDraft({
            boothId,
            overlayId: selectedOverlay.id
          });

          const supabase = createSupabaseBrowserClient();

          setStatus('Menyimpan hasil sesi...');

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

          await markSessionUploaded(draft.id, rawFrames, Boolean((draft as any).is_free_capture));

          if (isObjectUrl(finalPreviewRef.current)) {
            URL.revokeObjectURL(finalPreviewRef.current as string);
          }

          const nextPreviewUrl = URL.createObjectURL(finalStripBlob);
          finalPreviewRef.current = nextPreviewUrl;

          setFinalPreview(nextPreviewUrl);
          setSessionCode(draft.session_code);

          setStatus('Hasil sudah siap. Silakan print, download, scan QR, atau edit dengan AI.');
        } catch (caught) {
          console.error(caught);
          setStatus(caught instanceof Error ? caught.message : 'Gagal menyelesaikan sesi.');
        }
      })();
    });
  }

  async function handleCaptureSequence() {
    try {
      if (!isReady) {
        setStatus('Kamera belum siap. Tunggu sebentar.');
        return;
      }

      if (!selectedOverlay) {
        setStatus('Pilih overlay terlebih dahulu.');
        return;
      }

      if (isCapturingSequence || isPending) return;

      clearTransientAssets();
      setFrames([]);
      setPreviews([]);
      setFinalPreview(null);
      setSessionCode(null);
      setTelegramQrUrl(null);
      setIsCapturingSequence(true);
      setStatus('Sesi dimulai. Lihat kamera dan bersiap.');

      const captured: Blob[] = [];
      const previewUrls: string[] = [];

      for (let shot = 1; shot <= 3; shot += 1) {
        setActiveShot(shot);

        for (let t = countdownPreset; t >= 1; t -= 1) {
          setCountdown(t);
          setStatus(`Foto ${shot}/3 dalam ${t} detik.`);
          await sleep(1000);
        }

        setCountdown(null);
        setStatus('Capture.');

        triggerShutterEffect();
        await sleep(130);

        const blob = await captureFrame();
        const previewUrl = URL.createObjectURL(blob);

        captured.push(blob);
        previewUrls.push(previewUrl);

        setFrames([...captured]);
        setPreviews([...previewUrls]);
        setStatus(`Foto ${shot}/3 berhasil.`);

        await sleep(520);
      }

      setActiveShot(0);
      setIsCapturingSequence(false);

      await finalizeSequence(captured);
    } catch (caught) {
      console.error(caught);
      setIsCapturingSequence(false);
      setCountdown(null);
      setActiveShot(0);
      setStatus(caught instanceof Error ? caught.message : 'Gagal mengambil foto.');
    }
  }

  async function handleDonation() {
    try {
      const amount = Number(donationAmount);

      if (!Number.isFinite(amount) || amount < 1000) {
        setStatus('Minimal donasi Rp 1.000.');
        return;
      }

      const response = await fetch('/api/billing/donation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Gagal membuat QRIS donasi.');
      }

      setDonationModal(payload);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Gagal membuat QRIS donasi.');
    }
  }

  async function handleAiAction(action: AiAction) {
    try {
      if (!finalPreview) {
        setStatus('Ambil foto dulu sebelum memakai AI.');
        return;
      }

      const label = aiActionLabel(action);

      setAiProgress({
        active: true,
        label,
        percent: 8,
        message: `${label} dimulai...`
      });

      setStatus(`${label} sedang diproses.`);

      const progressTimer = window.setInterval(() => {
        setAiProgress((current) => {
          if (!current.active) return current;

          const nextPercent = Math.min(current.percent + Math.ceil(Math.random() * 8), 91);

          return {
            ...current,
            percent: nextPercent,
            message:
              nextPercent < 35
                ? 'Membaca gambar...'
                : nextPercent < 70
                  ? 'Memproses detail visual...'
                  : 'Menyelesaikan hasil...'
          };
        });
      }, 420);

      const imageDataUrl = await imageSourceToDataUrl(finalPreview);

      const payload = await postBoothApi<{
        ok: boolean;
        imageDataUrl: string;
        message?: string;
      }>(aiActionEndpoint(action), aiActionBody(action, imageDataUrl));

      window.clearInterval(progressTimer);

      if (!payload?.imageDataUrl) {
        throw new Error('API tidak mengembalikan hasil gambar.');
      }

      if (isObjectUrl(finalPreviewRef.current)) {
        URL.revokeObjectURL(finalPreviewRef.current as string);
      }

      finalPreviewRef.current = payload.imageDataUrl;
      setFinalPreview(payload.imageDataUrl);

      setAiProgress({
        active: true,
        label,
        percent: 100,
        message: payload.message ?? `${label} selesai.`
      });

      setStatus(payload.message ?? `${label} selesai. Hasil sudah diperbarui.`);

      window.setTimeout(() => {
        setAiProgress({
          active: false,
          label: '',
          percent: 0,
          message: ''
        });
      }, 1000);
    } catch (caught) {
      console.error(caught);

      setAiProgress({
        active: false,
        label: '',
        percent: 0,
        message: ''
      });

      setStatus(caught instanceof Error ? caught.message : 'AI gagal diproses.');
    }
  }

  const shutterBusy = isCapturingSequence || isPending;
  const resultReady = Boolean(finalPreview);

  return (
    <>
      <video ref={sourceVideoRef} autoPlay muted playsInline className="hidden" />

      <div className="min-h-screen bg-[#050505] text-white">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-white/[0.035] blur-3xl" />
          <div className="absolute -right-24 bottom-10 h-[30rem] w-[30rem] rounded-full bg-white/[0.035] blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04),transparent_45%)]" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-[1720px] flex-col px-4 py-4 lg:px-6">
          <header className="flex h-16 items-center justify-between rounded-[28px] border border-white/10 bg-white/[0.035] px-4 shadow-[0_18px_80px_rgba(0,0,0,0.35)] backdrop-blur-2xl lg:px-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black">
                <span className="text-sm font-black tracking-tight">KG</span>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-white/40">
                  KoGraph Studio
                </p>
                <h1 className="line-clamp-1 text-sm font-semibold tracking-tight text-white lg:text-base">
                  {boothName}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/70">
              <CheckCircle2 className={`h-4 w-4 ${isReady ? 'text-emerald-400' : 'text-amber-300'}`} />
              <span>{isReady ? 'Camera Ready' : 'Starting Camera'}</span>
            </div>
          </header>

          <div className="grid flex-1 gap-4 py-4 xl:grid-cols-[310px_minmax(0,1fr)_360px]">
            <aside className="order-2 space-y-4 xl:order-1">
              <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
                <div className="flex items-center gap-2">
                  <Aperture className="h-4 w-4 text-white/60" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                    Overlay
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {validOverlays.length > 0 ? (
                    validOverlays.map((overlay) => {
                      const active = overlay.id === selectedOverlayId;

                      return (
                        <button
                          key={overlay.id}
                          type="button"
                          onClick={() => setSelectedOverlayId(overlay.id)}
                          disabled={shutterBusy}
                          className={`w-full rounded-[24px] border p-3 text-left transition ${active
                              ? 'border-white/45 bg-white text-black'
                              : 'border-white/10 bg-black/25 text-white hover:bg-white/[0.08]'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`h-16 w-12 overflow-hidden rounded-2xl border ${active ? 'border-black/10 bg-black/5' : 'border-white/10 bg-white'
                                }`}
                            >
                              {overlay.signed_url ? (
                                <img
                                  src={overlay.signed_url}
                                  alt={overlay.label}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{overlay.label}</p>
                              <p className={`mt-1 text-xs ${active ? 'text-black/55' : 'text-white/40'}`}>
                                Live strip overlay
                              </p>
                            </div>

                            {active ? <ChevronRight className="h-4 w-4" /> : null}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/50">
                      Belum ada overlay aktif. Upload overlay dari dashboard.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-white/60" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                    Captured
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-[20px] border border-white/10 bg-black/35"
                    >
                      {previews[index] ? (
                        <img
                          src={previews[index]}
                          alt={`Capture ${index + 1}`}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center text-sm text-white/25">
                          {index + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {isAdmin ? (
                <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-2xl">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-white/60" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                      Support
                    </p>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-white/55">
                    Admin mode. Donasi QRIS opsional untuk support booth.
                  </p>

                  <div className="mt-4 flex gap-2">
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={donationAmount}
                      onChange={(event) => setDonationAmount(event.target.value)}
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none"
                    />

                    <button
                      type="button"
                      onClick={() => void handleDonation()}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
                    >
                      QRIS
                    </button>
                  </div>
                </section>
              ) : null}
            </aside>

            <main className="order-1 flex items-center justify-center xl:order-2">
              <section className="relative flex h-full w-full items-center justify-center rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl lg:p-6">
                <div className="absolute left-5 top-5 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-white/55 backdrop-blur">
                  {resultReady ? 'Result Preview' : 'Live Photostrip'}
                </div>

                {activeShot > 0 ? (
                  <div className="absolute right-5 top-5 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-2 text-xs font-semibold text-white/80 backdrop-blur">
                    Shot {activeShot}/3
                  </div>
                ) : null}

                <div className="relative mx-auto aspect-[105/297] h-[calc(100vh-160px)] max-h-[780px] min-h-[520px] overflow-hidden rounded-[34px] border border-white/15 bg-[#f7f3ef] shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
                  {!resultReady ? (
                    <>
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,#faf7f3_0%,#efe8e0_100%)]" />

                      {SLOT_LAYOUT.map((slot, index) => {
                        const ref =
                          index === 0
                            ? previewTopRef
                            : index === 1
                              ? previewMiddleRef
                              : previewBottomRef;

                        return (
                          <div
                            key={index}
                            className="absolute overflow-hidden rounded-[26px] bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                            style={{
                              top: `${slot.top}%`,
                              left: `${slot.left}%`,
                              width: `${slot.width}%`,
                              height: `${slot.height}%`
                            }}
                          >
                            <video
                              ref={ref}
                              autoPlay
                              muted
                              playsInline
                              className="h-full w-full object-cover [filter:saturate(1.05)_contrast(1.02)_brightness(1.03)]"
                            />
                          </div>
                        );
                      })}

                      {selectedOverlay?.signed_url ? (
                        <img
                          src={selectedOverlay.signed_url}
                          alt={selectedOverlay.label}
                          className="pointer-events-none absolute inset-0 z-10 h-full w-full object-contain"
                        />
                      ) : null}
                    </>
                  ) : (
                    <img
                      src={finalPreview as string}
                      alt="Final photostrip"
                      className="h-full w-full object-contain"
                    />
                  )}

                  {countdown !== null ? (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/15 backdrop-blur-[1px]">
                      <div className="countdown-pop flex h-40 w-40 items-center justify-center rounded-full border border-white/20 bg-black/55 text-7xl font-black tracking-tight text-white shadow-[0_0_80px_rgba(255,255,255,0.20)] backdrop-blur-xl">
                        {countdown}
                      </div>
                    </div>
                  ) : null}

                  {aiProgress.active ? (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 px-8 text-center backdrop-blur-xl">
                      <div className="w-full max-w-[260px]">
                        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white text-black">
                          <Wand2 className="h-7 w-7" />
                        </div>

                        <p className="text-[10px] font-semibold uppercase tracking-[0.36em] text-white/50">
                          {aiProgress.label}
                        </p>

                        <p className="mt-3 text-lg font-semibold">{aiProgress.percent}%</p>

                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
                          <div
                            className="h-full rounded-full bg-white transition-all duration-300"
                            style={{ width: `${aiProgress.percent}%` }}
                          />
                        </div>

                        <p className="mt-4 text-sm leading-6 text-white/65">{aiProgress.message}</p>
                      </div>
                    </div>
                  ) : null}

                  {scanFlash ? <div className="sensor-scan absolute inset-0 z-[50]" /> : null}
                  {shutterFlash ? <div className="shutter-flash absolute inset-0 z-[51]" /> : null}

                  {shutterPulse ? (
                    <div className="absolute inset-0 z-[52] flex items-center justify-center">
                      <div className="shutter-ring h-[150px] w-[150px] rounded-full border border-white/45" />
                    </div>
                  ) : null}
                </div>
              </section>
            </main>

            <aside className="order-3 space-y-4">
              {!resultReady ? (
                <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                    Session Control
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    3 foto otomatis
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/50">{status}</p>

                  {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

                  <div className="mt-7">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">
                      Timer
                    </p>

                    <div className="flex rounded-full border border-white/10 bg-black/30 p-1">
                      {[3, 5].map((value) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setCountdownPreset(value as 3 | 5)}
                          disabled={shutterBusy}
                          className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${countdownPreset === value
                              ? 'bg-white text-black'
                              : 'text-white/55 hover:bg-white/10'
                            } disabled:cursor-not-allowed`}
                        >
                          {value}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8 flex flex-col items-center">
                    <button
                      type="button"
                      onClick={() => void handleCaptureSequence()}
                      disabled={!isReady || !selectedOverlay || shutterBusy}
                      className="group relative h-32 w-32 rounded-full border border-white/15 bg-white text-black shadow-[0_25px_90px_rgba(255,255,255,0.18)] transition hover:scale-[1.025] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="Mulai sesi foto"
                    >
                      <span className="absolute inset-3 rounded-full border border-black/10" />
                      <span className="absolute inset-7 rounded-full bg-black text-white shadow-inner" />

                      <span className="relative z-10 flex h-full w-full items-center justify-center">
                        {shutterBusy ? (
                          <Loader2 className="h-7 w-7 animate-spin text-white" />
                        ) : (
                          <Camera className="h-7 w-7 text-white" />
                        )}
                      </span>
                    </button>

                    <p className="mt-4 text-sm font-medium text-white/60">
                      {shutterBusy ? 'Memproses sesi...' : 'Tekan shutter'}
                    </p>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-5 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                    Result
                  </p>

                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Photostrip siap
                  </h2>

                  <p className="mt-2 text-sm leading-6 text-white/50">{status}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <a
                      href={finalPreview ?? undefined}
                      download="kograph-strip.png"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>

                    <button
                      type="button"
                      onClick={() => printPhotoStrip(finalPreview as string)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </button>
                  </div>

                  {telegramQrUrl && telegramDeepLink ? (
                    <div className="mt-5 rounded-[26px] border border-white/10 bg-black/25 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <QrCode className="h-4 w-4" />
                        Telegram Delivery
                      </div>

                      <div className="mt-4 flex items-center gap-4">
                        <img
                          src={telegramQrUrl}
                          alt="Telegram QR"
                          className="h-28 w-28 rounded-2xl bg-white p-2"
                        />

                        <div className="min-w-0">
                          <p className="text-xs leading-5 text-white/45">
                            Scan untuk ambil hasil lewat bot Telegram.
                          </p>

                          <a
                            href={telegramDeepLink}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
                          >
                            Buka Bot
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-[26px] border border-white/10 bg-black/25 p-4">
                    <div className="flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-white/70" />
                      <p className="text-sm font-semibold">AI Enhancement</p>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleAiAction('upscale')}
                        disabled={aiProgress.active}
                        className="rounded-2xl bg-white px-3 py-3 text-sm font-semibold text-black disabled:opacity-50"
                      >
                        HD Foto
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('clean')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        Clean
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('vintage')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        Vintage
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('bw')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        B&W
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('anime')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        Anime
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('face')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        Hias
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('background-pantai')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        Pantai
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleAiAction('background-kota')}
                        disabled={aiProgress.active}
                        className="rounded-2xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 disabled:opacity-50"
                      >
                        Kota
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    New Session
                  </button>
                </section>
              )}

              <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-2xl">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-white/60" />
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/45">
                    Assistant
                  </p>
                </div>

                <p className="mt-3 text-sm leading-6 text-white/50">
                  Voice command dapat diarahkan ke Python API. Untuk Vercel mode, gunakan tombol AI
                  di result screen sebagai kontrol utama yang stabil.
                </p>
              </section>
            </aside>
          </div>
        </div>
      </div>

      {donationModal ? (
        <QRISPaymentModal data={donationModal} onClose={() => setDonationModal(null)} />
      ) : null}

      <style jsx global>{`
        .sensor-scan {
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.08) 20%,
            rgba(255, 255, 255, 0.25) 45%,
            rgba(255, 255, 255, 0.08) 70%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: sensorScan 380ms ease-out forwards;
        }

        .shutter-flash {
          background: rgba(255, 255, 255, 0.78);
          mix-blend-mode: screen;
          animation: shutterFlash 280ms ease-out forwards;
        }

        .shutter-ring {
          animation: shutterPulse 340ms ease-out forwards;
          box-shadow:
            0 0 0 10px rgba(255, 255, 255, 0.08),
            0 0 90px rgba(255, 255, 255, 0.22);
        }

        .countdown-pop {
          animation: countdownPop 820ms cubic-bezier(0.2, 0.9, 0.2, 1) forwards;
        }

        @keyframes sensorScan {
          0% {
            opacity: 0;
            transform: translateY(-100%);
          }

          12% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform: translateY(100%);
          }
        }

        @keyframes shutterFlash {
          0% {
            opacity: 0;
          }

          18% {
            opacity: 1;
          }

          100% {
            opacity: 0;
          }
        }

        @keyframes shutterPulse {
          0% {
            opacity: 0.9;
            transform: scale(0.68);
          }

          100% {
            opacity: 0;
            transform: scale(1.34);
          }
        }

        @keyframes countdownPop {
          0% {
            opacity: 0;
            transform: scale(0.72);
          }

          18% {
            opacity: 1;
            transform: scale(1);
          }

          100% {
            opacity: 0.92;
            transform: scale(0.94);
          }
        }
      `}</style>
    </>
  );
}