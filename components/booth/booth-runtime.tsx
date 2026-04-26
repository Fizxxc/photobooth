'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CheckCircle2,
  Download,
  Heart,
  Loader2,
  Printer,
  QrCode,
  RotateCcw,
  Sparkles,
  Wand2
} from 'lucide-react';

import { createSessionDraft, markSessionUploaded } from '@/app/actions/booth';
import { buildPhotoStrip } from '@/lib/booth/canvas';
import { printPhotoStrip } from '@/lib/booth/print';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { useCamera } from '@/hooks/useCamera';
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

const SLOT_LAYOUT: SlotPercent[] = [
  { top: 7.2, left: 5.62, width: 88.94, height: 22.96 },
  { top: 32.82, left: 5.62, width: 88.94, height: 22.96 },
  { top: 58.42, left: 5.62, width: 88.94, height: 22.96 }
];

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
  const shutterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isReady, error, start, stop, captureFrame } = useCamera(sourceVideoRef, {
    width: 1920,
    height: 1080,
    frameRate: 60
  });

  const validOverlays = useMemo(
    () => overlays.filter((overlay) => overlay?.id && isUuid(overlay.id)),
    [overlays]
  );

  const [selectedOverlayId, setSelectedOverlayId] = useState<string>(
    validOverlays[0]?.id ?? ''
  );

  const [previews, setPreviews] = useState<string[]>([]);
  const [finalPreview, setFinalPreview] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready untuk sesi foto.');
  const [countdownPreset, setCountdownPreset] = useState<3 | 5>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeShot, setActiveShot] = useState<number>(0);
  const [isCapturingSequence, setIsCapturingSequence] = useState(false);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [telegramQrUrl, setTelegramQrUrl] = useState<string | null>(null);
  const [donationAmount, setDonationAmount] = useState<string>('1000');
  const [donationModal, setDonationModal] = useState<BillingModalData | null>(null);
  const [isPending, startTransition] = useTransition();

  const [shutterFlash, setShutterFlash] = useState(false);
  const [shutterPulse, setShutterPulse] = useState(false);
  const [scanFlash, setScanFlash] = useState(false);

  const selectedOverlay = useMemo(() => {
    return validOverlays.find((item) => item.id === selectedOverlayId) ?? validOverlays[0] ?? null;
  }, [selectedOverlayId, validOverlays]);

  const isResultMode = Boolean(finalPreview);
  const shutterBusy = isCapturingSequence || isPending;

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

      if (shutterTimeoutRef.current) {
        clearTimeout(shutterTimeoutRef.current);
      }
    };
  }, [start, stop]);

  useEffect(() => {
    const sourceEl = sourceVideoRef.current;
    const stream = (sourceEl?.srcObject as MediaStream | null) ?? null;

    if (!stream) return;

    const targets = [
      previewTopRef.current,
      previewMiddleRef.current,
      previewBottomRef.current
    ];

    targets.forEach((target) => {
      if (!target) return;

      if (target.srcObject !== stream) {
        target.srcObject = stream;
      }

      void target.play().catch(() => undefined);
    });
  }, [isReady, selectedOverlayId]);

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
          width: 320,
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
    if (shutterTimeoutRef.current) {
      clearTimeout(shutterTimeoutRef.current);
    }

    setShutterFlash(true);
    setShutterPulse(true);
    setScanFlash(true);

    shutterTimeoutRef.current = setTimeout(() => {
      setShutterFlash(false);
      setShutterPulse(false);
      setScanFlash(false);
    }, 420);
  }

  function clearTransientAssets() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];

    if (finalPreviewRef.current) {
      URL.revokeObjectURL(finalPreviewRef.current);
      finalPreviewRef.current = null;
    }
  }

  function handleReset() {
    clearTransientAssets();

    setPreviews([]);
    setFinalPreview(null);
    setSessionCode(null);
    setCountdown(null);
    setActiveShot(0);
    setIsCapturingSequence(false);
    setStatus('Ready untuk sesi baru.');
  }

  async function finalizeSequence(capturedFrames: Blob[]) {
    if (!boothId) {
      setStatus('Booth ID tidak valid. Silakan buka ulang booth.');
      return;
    }

    if (!selectedOverlay) {
      setStatus('Belum ada overlay aktif.');
      return;
    }

    if (!selectedOverlay.signed_url) {
      setStatus('URL overlay belum tersedia. Coba refresh booth.');
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

          setStatus('Mengunggah hasil akhir...');

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

          if (finalPreviewRef.current) {
            URL.revokeObjectURL(finalPreviewRef.current);
          }

          const nextPreviewUrl = URL.createObjectURL(finalStripBlob);

          finalPreviewRef.current = nextPreviewUrl;
          setFinalPreview(nextPreviewUrl);
          setSessionCode(draft.session_code);
          setStatus('Photostrip siap.');
        } catch (caught) {
          console.error(caught);
          setStatus(
            caught instanceof Error
              ? caught.message
              : 'Terjadi kesalahan saat menyelesaikan sesi.'
          );
        }
      })();
    });
  }

  async function handleCaptureSequence() {
    try {
      if (!isReady) {
        setStatus('Kamera belum siap.');
        return;
      }

      if (!selectedOverlay) {
        setStatus('Pilih overlay terlebih dahulu.');
        return;
      }

      if (shutterBusy) return;

      clearTransientAssets();

      setPreviews([]);
      setFinalPreview(null);
      setSessionCode(null);
      setIsCapturingSequence(true);
      setStatus('Sesi dimulai.');

      const captured: Blob[] = [];
      const previewUrls: string[] = [];

      for (let shot = 1; shot <= 3; shot += 1) {
        setActiveShot(shot);

        for (let t = countdownPreset; t >= 1; t -= 1) {
          setCountdown(t);
          setStatus(`Foto ${shot}/3`);
          await sleep(1000);
        }

        setCountdown(null);

        triggerShutterEffect();
        await sleep(130);

        const blob = await captureFrame();
        const previewUrl = URL.createObjectURL(blob);

        captured.push(blob);
        previewUrls.push(previewUrl);

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

  return (
    <>
      <video ref={sourceVideoRef} autoPlay muted playsInline className="hidden" />

      <section className="relative h-screen w-screen overflow-hidden bg-[#0b0708] text-white">
        <BoothIllustration />

        <header className="absolute left-0 right-0 top-0 z-40 flex h-16 items-center justify-between px-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl border border-white/15 bg-white/10 text-xs font-black tracking-tight shadow-[0_0_40px_rgba(255,255,255,0.08)] backdrop-blur">
              KG
            </div>

            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-wide text-white">{boothName}</p>
              <p className="text-[10px] uppercase tracking-[0.28em] text-white/40">
                Premium Photobooth
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-1.5 text-xs text-white/70 backdrop-blur-md">
            <span
              className={[
                'h-2 w-2 rounded-full',
                isReady ? 'bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]' : 'bg-amber-400'
              ].join(' ')}
            />
            {isReady ? 'Camera Ready' : 'Preparing Camera'}
          </div>
        </header>

        {!isResultMode ? (
          <div className="relative z-10 flex h-full w-full items-center justify-center px-4 pb-28 pt-20">
            <div className="grid w-full max-w-7xl grid-cols-1 items-center gap-8 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
              <aside className="hidden lg:block">
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-2xl">
                  <div className="flex items-center gap-2 text-rose-100">
                    <Wand2 className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                      Choose Style
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
                            className={[
                              'flex w-full items-center gap-3 rounded-3xl border p-2.5 text-left transition',
                              active
                                ? 'border-rose-200/60 bg-white/18 shadow-[0_0_40px_rgba(251,207,232,0.12)]'
                                : 'border-white/10 bg-black/15 hover:bg-white/10'
                            ].join(' ')}
                          >
                            <div className="h-16 w-11 overflow-hidden rounded-2xl bg-white shadow-inner">
                              {overlay.signed_url ? (
                                <img
                                  src={overlay.signed_url}
                                  alt={overlay.label}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-white">
                                {overlay.label}
                              </p>
                              <p className="text-xs text-white/40">
                                Strip overlay
                              </p>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/50">
                        Belum ada overlay aktif.
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              <main className="flex justify-center">
                <div className="relative">
                  <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle,rgba(251,207,232,0.22),transparent_68%)] blur-2xl" />

                  <div className="relative rounded-[2.7rem] border border-white/15 bg-white/[0.08] p-3 shadow-[0_40px_120px_rgba(0,0,0,0.72)] backdrop-blur-xl">
                    <div className="relative aspect-[105/297] h-[min(76vh,760px)] overflow-hidden rounded-[2rem] border border-white/20 bg-[#f9e7eb]">
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffe9ef_0%,#fff8f9_48%,#f7dce4_100%)]" />

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
                            className="absolute overflow-hidden rounded-[24px] bg-black shadow-[0_16px_32px_rgba(0,0,0,0.2),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                            style={{
                              top: `${slot.top}%`,
                              left: `${slot.left}%`,
                              width: `${slot.width}%`,
                              height: `${slot.height}%`
                            }}
                          >
                            {previews[index] ? (
                              <img
                                src={previews[index]}
                                alt={`Capture ${index + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <video
                                ref={ref}
                                autoPlay
                                muted
                                playsInline
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                        );
                      })}

                      {selectedOverlay?.signed_url ? (
                        <img
                          src={selectedOverlay.signed_url}
                          alt={selectedOverlay.label}
                          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                        />
                      ) : null}

                      <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.26em] text-white/85 backdrop-blur">
                        {activeShot > 0 ? `Shot ${activeShot}/3` : 'Live Preview'}
                      </div>

                      {countdown !== null ? (
                        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[1.5px]">
                          <div className="animate-booth-countdown text-[9rem] font-black leading-none tracking-[-0.1em] text-white drop-shadow-2xl">
                            {countdown}
                          </div>
                        </div>
                      ) : null}

                      {scanFlash ? <div className="sensor-scan absolute inset-0 z-[40]" /> : null}
                      {shutterFlash ? <div className="shutter-flash absolute inset-0 z-[41]" /> : null}

                      {shutterPulse ? (
                        <div className="absolute inset-0 z-[42] flex items-center justify-center">
                          <div className="shutter-ring h-[150px] w-[150px] rounded-full border border-white/40" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </main>

              <aside className="hidden lg:block">
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur-2xl">
                  <div className="flex items-center gap-2 text-rose-100">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                      Session
                    </p>
                  </div>

                  <p className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white">
                    3 Photo Strip
                  </p>

                  <p className="mt-3 text-sm leading-6 text-white/45">{status}</p>

                  {error ? (
                    <p className="mt-3 text-sm leading-6 text-rose-300">{error}</p>
                  ) : null}

                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((index) => (
                      <div
                        key={index}
                        className={[
                          'grid aspect-square place-items-center rounded-2xl border text-sm',
                          previews[index]
                            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                            : activeShot === index + 1
                              ? 'border-white/35 bg-white/18 text-white'
                              : 'border-white/10 bg-black/20 text-white/35'
                        ].join(' ')}
                      >
                        {previews[index] ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </div>
                    ))}
                  </div>
                </div>

                {isAdmin ? (
                  <div className="mt-4 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-2xl">
                    <div className="flex items-center gap-2 text-pink-200">
                      <Heart className="h-4 w-4" />
                      <p className="text-sm font-medium">Support QRIS</p>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={donationAmount}
                        onChange={(event) => setDonationAmount(event.target.value)}
                        className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none"
                      />

                      <button
                        type="button"
                        onClick={() => void handleDonation()}
                        className="rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Donasi
                      </button>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </div>
        ) : finalPreview ? (
          <ResultScreen
            boothName={boothName}
            finalPreview={finalPreview}
            telegramQrUrl={telegramQrUrl}
            telegramDeepLink={telegramDeepLink}
            onPrint={() => printPhotoStrip(finalPreview)}
            onNewSession={handleReset}
          />
        ) : null}

        {!isResultMode ? (
          <footer className="absolute bottom-0 left-0 right-0 z-50 flex justify-center px-4 pb-5">
            <div className="flex w-full max-w-4xl items-center justify-between gap-3 rounded-full border border-white/12 bg-black/55 px-4 py-3 shadow-[0_18px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
              <select
                value={selectedOverlayId}
                onChange={(event) => setSelectedOverlayId(event.target.value)}
                className="h-11 max-w-[170px] rounded-full border border-white/10 bg-white/10 px-4 text-sm text-white outline-none lg:hidden"
              >
                {validOverlays.map((overlay) => (
                  <option key={overlay.id} value={overlay.id} className="text-black">
                    {overlay.label}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 p-1">
                {[3, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCountdownPreset(value as 3 | 5)}
                    className={[
                      'rounded-full px-4 py-2 text-sm font-semibold transition',
                      countdownPreset === value
                        ? 'bg-white text-black'
                        : 'text-white/70 hover:bg-white/10'
                    ].join(' ')}
                  >
                    {value}s
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleCaptureSequence()}
                disabled={!isReady || !selectedOverlay || shutterBusy}
                className="group relative grid h-20 w-20 shrink-0 place-items-center rounded-full border-[6px] border-white/25 bg-white text-black shadow-[0_16px_50px_rgba(255,255,255,0.16)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Mulai sesi foto"
              >
                {shutterBusy ? (
                  <Loader2 className="h-7 w-7 animate-spin text-black" />
                ) : (
                  <Camera className="h-7 w-7 text-black transition group-hover:scale-105" />
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-medium text-white/75 transition hover:bg-white/15"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </footer>
        ) : null}
      </section>

      {donationModal ? (
        <QRISPaymentModal data={donationModal} onClose={() => setDonationModal(null)} />
      ) : null}
    </>
  );
}

function BoothIllustration() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,220,230,0.16),transparent_34%),radial-gradient(circle_at_10%_20%,rgba(251,113,133,0.16),transparent_28%),radial-gradient(circle_at_90%_28%,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,#160b10_0%,#080607_58%,#030303_100%)]" />

      <div className="absolute left-[7%] top-[15%] h-28 w-28 rounded-full border border-white/10 bg-white/[0.03] blur-[1px]" />
      <div className="absolute right-[8%] top-[18%] h-36 w-36 rounded-full border border-rose-200/15 bg-rose-200/[0.04] blur-[1px]" />

      <div className="absolute left-[4%] bottom-[12%] h-48 w-32 rotate-[-12deg] rounded-[2.2rem] border border-white/10 bg-white/[0.035] shadow-[0_30px_80px_rgba(0,0,0,0.25)] backdrop-blur">
        <div className="mx-auto mt-5 h-10 w-10 rounded-full border border-white/15 bg-white/10" />
        <div className="mx-auto mt-5 h-20 w-20 rounded-3xl border border-white/10 bg-black/20" />
        <div className="mx-auto mt-4 h-3 w-16 rounded-full bg-white/10" />
      </div>

      <div className="absolute right-[4%] bottom-[10%] h-56 w-36 rotate-[10deg] rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-[0_30px_80px_rgba(0,0,0,0.25)] backdrop-blur">
        <div className="mx-auto mt-5 h-8 w-24 rounded-full bg-white/10" />
        <div className="mx-auto mt-5 grid h-28 w-24 grid-cols-2 gap-2 rounded-2xl">
          <div className="rounded-xl bg-white/10" />
          <div className="rounded-xl bg-white/10" />
          <div className="rounded-xl bg-white/10" />
          <div className="rounded-xl bg-white/10" />
        </div>
        <div className="mx-auto mt-4 h-3 w-20 rounded-full bg-white/10" />
      </div>

      <div className="absolute left-1/2 top-16 h-px w-[70vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="absolute bottom-24 left-1/2 h-px w-[78vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-rose-100/16 to-transparent" />

      <div className="booth-orb absolute left-[16%] top-[34%] h-2 w-2 rounded-full bg-rose-200/70" />
      <div className="booth-orb booth-orb-delay absolute right-[18%] top-[42%] h-2 w-2 rounded-full bg-amber-100/70" />
      <div className="booth-orb absolute right-[28%] bottom-[26%] h-1.5 w-1.5 rounded-full bg-white/70" />
    </div>
  );
}

function ResultScreen({
  boothName,
  finalPreview,
  telegramQrUrl,
  telegramDeepLink,
  onPrint,
  onNewSession
}: {
  boothName: string;
  finalPreview: string;
  telegramQrUrl: string | null;
  telegramDeepLink: string | null;
  onPrint: () => void;
  onNewSession: () => void;
}) {
  return (
    <section className="relative z-10 flex h-full w-full items-center justify-center px-5 py-20">
      <div className="grid w-full max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-[minmax(250px,380px)_1fr]">
        <div className="relative mx-auto">
          <div className="absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle,rgba(251,207,232,0.28),transparent_70%)] blur-2xl" />

          <div className="relative rotate-[-2deg] rounded-[2.4rem] bg-white p-3 shadow-[0_40px_120px_rgba(0,0,0,0.75)]">
            <img
              src={finalPreview}
              alt="Final photostrip"
              className="max-h-[74vh] rounded-[1.6rem] object-contain"
            />
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[0.36em] text-rose-100/45">
            Session Complete
          </p>

          <h1 className="mt-4 max-w-xl text-5xl font-black leading-tight tracking-[-0.06em] text-white md:text-6xl">
            Your strip is ready.
          </h1>

          <p className="mt-5 max-w-md text-sm leading-7 text-white/50">
            Hasil photostrip sudah selesai. Scan QR untuk ambil lewat Telegram, print di booth,
            atau mulai sesi baru.
          </p>

          {telegramQrUrl && telegramDeepLink ? (
            <div className="mt-8 flex max-w-md items-center gap-5 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
              <img
                src={telegramQrUrl}
                alt="Telegram QR"
                className="h-32 w-32 rounded-3xl bg-white p-2"
              />

              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <QrCode className="h-4 w-4" />
                  Telegram Pickup
                </div>

                <a
                  href={telegramDeepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/15"
                >
                  Buka Bot
                </a>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onPrint}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-black transition active:scale-95"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>

            <a
              href={finalPreview}
              download={`${boothName || 'kograph'}-photostrip.png`}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 text-sm font-bold text-white transition hover:bg-white/15 active:scale-95"
            >
              <Download className="h-4 w-4" />
              Download
            </a>

            <button
              type="button"
              onClick={onNewSession}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-6 text-sm font-bold text-white transition hover:bg-white/15 active:scale-95"
            >
              <RotateCcw className="h-4 w-4" />
              New Session
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}