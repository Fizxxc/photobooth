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
  TimerReset
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
  /**
   * Hidden source video (dipakai untuk capture oleh useCamera hook)
   */
  const sourceVideoRef = useRef<HTMLVideoElement>(null);

  /**
   * Visible preview videos (3 panel live)
   */
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

  const safeOverlays = Array.isArray(overlays) ? overlays : [];
  const validOverlays = useMemo(
    () => safeOverlays.filter((overlay) => overlay?.id && isUuid(overlay.id)),
    [safeOverlays]
  );

  const [selectedOverlayId, setSelectedOverlayId] = useState<string>(validOverlays[0]?.id ?? '');
  const [frames, setFrames] = useState<Blob[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [finalPreview, setFinalPreview] = useState<string | null>(null);
  const [status, setStatus] = useState('Pilih overlay yang cocok, atur timer, lalu mulai sesi foto.');
  const [countdownPreset, setCountdownPreset] = useState<3 | 5>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeShot, setActiveShot] = useState<number>(0);
  const [isCapturingSequence, setIsCapturingSequence] = useState(false);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [telegramQrUrl, setTelegramQrUrl] = useState<string | null>(null);
  const [donationAmount, setDonationAmount] = useState<string>('1000');
  const [donationModal, setDonationModal] = useState<BillingModalData | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Shutter / sensor animation
   */
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

      if (finalPreviewRef.current) {
        URL.revokeObjectURL(finalPreviewRef.current);
      }

      if (shutterTimeoutRef.current) {
        clearTimeout(shutterTimeoutRef.current);
      }
    };
  }, [start, stop]);

  /**
   * Sinkronkan stream dari source video ke 3 panel preview
   */
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
    setFrames([]);
    setPreviews([]);
    setFinalPreview(null);
    setSessionCode(null);
    setCountdown(null);
    setActiveShot(0);
    setIsCapturingSequence(false);
    setStatus('Sesi direset. Silakan pilih overlay dan mulai lagi.');
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
          setStatus('Menyusun hasil photostrip final...');

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

          setStatus(
            (draft as any).is_free_capture
              ? 'Photostrip siap. Silakan download, print, atau scan QR Telegram.'
              : 'Photostrip siap. Lanjutkan pembayaran atau ambil hasil lewat Telegram.'
          );
        } catch (caught) {
          console.error(caught);
          setStatus(caught instanceof Error ? caught.message : 'Terjadi kesalahan saat menyelesaikan sesi.');
        }
      })();
    });
  }

  async function handleCaptureSequence() {
    try {
      if (!isReady) {
        setStatus('Kamera belum siap. Tunggu sebentar lalu coba lagi.');
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
      setIsCapturingSequence(true);
      setStatus('Sesi dimulai. Silakan bersiap.');

      const captured: Blob[] = [];
      const previewUrls: string[] = [];

      for (let shot = 1; shot <= 3; shot += 1) {
        setActiveShot(shot);

        for (let t = countdownPreset; t >= 1; t -= 1) {
          setCountdown(t);
          setStatus(`Foto ${shot}/3 akan diambil dalam ${t} detik...`);
          await sleep(1000);
        }

        setCountdown(null);

        triggerShutterEffect();
        await sleep(130);

        const blob = await captureFrame();
        const previewUrl = URL.createObjectURL(blob);

        captured.push(blob);
        previewUrls.push(previewUrl);

        setFrames([...captured]);
        setPreviews([...previewUrls]);
        setStatus(`Foto ${shot}/3 berhasil diambil.`);

        await sleep(450);
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

  const shutterBusy = isCapturingSequence || isPending;

  return (
    <>
      {/* hidden source video */}
      <video ref={sourceVideoRef} autoPlay muted playsInline className="hidden" />

      <div className="min-h-screen bg-[#041125] text-white">
        <div className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* MAIN STAGE */}
            <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(11,24,46,0.94),rgba(5,10,20,0.98))] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.4)] lg:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-cyan-300">
                    KoGraph Studio
                  </p>
                  <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
                    {boothName}
                  </h1>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-300">
                    Pilih overlay, atur timer, lalu sekali tekan untuk sesi tiga foto otomatis dengan preview yang rapi dan natural.
                  </p>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
                  <CheckCircle2 className={`h-4 w-4 ${isReady ? 'text-emerald-400' : 'text-amber-400'}`} />
                  {isReady ? 'Camera Ready' : 'Menyalakan kamera...'}
                </div>
              </div>

              <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] xl:items-start">
                {/* STRIP LIVE PREVIEW */}
                <div className="mx-auto w-full max-w-[400px]">
                  <div className="relative mx-auto aspect-[105/297] w-full overflow-hidden rounded-[34px] border border-white/10 bg-[#f6e9eb] shadow-[0_24px_70px_rgba(0,0,0,0.45)]">
                    {/* soft paper body */}
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,#f4e1e4_0%,#f7ebed_100%)]" />

                    {/* live slots */}
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
                          className="absolute overflow-hidden rounded-[28px] bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
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
                            className="h-full w-full object-cover [filter:saturate(1.1)_brightness(1.05)]"
                          />
                        </div>
                      );
                    })}

                    {/* overlay png full strip */}
                    {selectedOverlay?.signed_url ? (
                      <img
                        src={selectedOverlay.signed_url}
                        alt={selectedOverlay.label}
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                      />
                    ) : null}

                    {/* subtle badge */}
                    <div className="absolute left-4 top-4 rounded-full border border-white/12 bg-black/45 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/90 backdrop-blur">
                      Live Preview
                    </div>

                    {/* shot indicator */}
                    {activeShot > 0 ? (
                      <div className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
                        Shot {activeShot}/3
                      </div>
                    ) : null}

                    {/* mirrorless shutter animation */}
                    {scanFlash ? <div className="sensor-scan absolute inset-0 z-[20]" /> : null}
                    {shutterFlash ? <div className="shutter-flash absolute inset-0 z-[21]" /> : null}
                    {shutterPulse ? (
                      <div className="absolute inset-0 z-[22] flex items-center justify-center">
                        <div className="shutter-ring h-[140px] w-[140px] rounded-full border border-white/40" />
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* CONTROL AREA */}
                <div className="flex min-h-full flex-col justify-between">
                  <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5 lg:p-6">
                    <div className="flex items-center gap-2 text-cyan-300">
                      <Sparkles className="h-4 w-4" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.34em]">
                        Session control
                      </p>
                    </div>

                    <div className="mt-4">
                      <p className="text-lg font-semibold text-white">Ambil 3 foto otomatis</p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        Preview dibuat vertikal seperti photostrip final agar framing lebih natural sejak awal.
                      </p>
                    </div>

                    <div className="mt-6 rounded-[20px] border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.26em] text-slate-400">
                        Status
                      </p>
                      <p className="mt-3 text-sm leading-7 text-slate-200">{status}</p>
                      {error ? (
                        <p className="mt-3 text-sm text-rose-300">{error}</p>
                      ) : null}
                    </div>

                    <div className="mt-8 flex flex-col items-center justify-center">
                      <div className="mb-4 text-center">
                        <p className="text-[11px] uppercase tracking-[0.32em] text-slate-400">
                          Countdown
                        </p>

                        <div className="mt-2 h-14 min-w-[90px] rounded-full border border-white/10 bg-white/5 px-6 flex items-center justify-center">
                          <span className="text-2xl font-semibold tracking-tight text-white">
                            {countdown !== null ? countdown : countdownPreset}
                          </span>
                          <span className="ml-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                            sec
                          </span>
                        </div>
                      </div>

                      <div className="mb-5 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 p-1.5">
                        <button
                          type="button"
                          onClick={() => setCountdownPreset(3)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                            countdownPreset === 3
                              ? 'bg-white text-slate-950'
                              : 'text-white hover:bg-white/10'
                          }`}
                        >
                          3 sec
                        </button>
                        <button
                          type="button"
                          onClick={() => setCountdownPreset(5)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                            countdownPreset === 5
                              ? 'bg-white text-slate-950'
                              : 'text-white hover:bg-white/10'
                          }`}
                        >
                          5 sec
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleCaptureSequence()}
                        disabled={!isReady || !selectedOverlay || shutterBusy}
                        className="group relative h-[114px] w-[114px] rounded-full border border-white/15 bg-[radial-gradient(circle_at_30%_30%,#ffffff_0%,#f5f7fb_30%,#dce2ea_60%,#b8c2cf_100%)] shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition duration-200 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Mulai sesi 3 foto"
                      >
                        <span className="absolute inset-[10px] rounded-full border border-slate-400/40 bg-[radial-gradient(circle_at_35%_35%,#ffffff_0%,#eef2f7_50%,#d6dde6_100%)]" />
                        <span className="absolute inset-[26px] rounded-full border border-slate-300/40 bg-white shadow-inner" />

                        <span className="relative z-10 flex h-full w-full items-center justify-center">
                          {shutterBusy ? (
                            <Loader2 className="h-7 w-7 animate-spin text-slate-700" />
                          ) : (
                            <Camera className="h-7 w-7 text-slate-700 transition group-hover:scale-105" />
                          )}
                        </span>
                      </button>

                      <p className="mt-4 text-sm font-medium text-slate-200">
                        {shutterBusy ? 'Memproses sesi...' : 'Tekan shutter untuk mulai'}
                      </p>

                      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={handleReset}
                          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Reset
                        </button>
                      </div>
                    </div>
                  </div>

                  {finalPreview ? (
                    <div className="mt-6 rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">
                        Final strip ready
                      </p>

                      <div className="mt-4 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-start">
                        <div className="flex justify-center">
                          <img
                            src={finalPreview}
                            alt="Final photostrip"
                            className="w-full max-w-[180px] rounded-[20px] border border-white/10 bg-white"
                          />
                        </div>

                        <div className="space-y-4">
                          {telegramQrUrl && telegramDeepLink ? (
                            <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
                              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                <QrCode className="h-4 w-4 text-cyan-300" />
                                Ambil foto via Telegram
                              </div>
                              <p className="mt-2 text-xs leading-6 text-slate-300">
                                Scan QR ini untuk mengirim hasil ke bot Telegram. Setiap sesi memakai kode unik agar hasil lebih aman.
                              </p>

                              <div className="mt-4 flex flex-wrap items-center gap-4">
                                <img
                                  src={telegramQrUrl}
                                  alt="Telegram QR delivery"
                                  className="h-28 w-28 rounded-2xl bg-white p-2"
                                />

                                <a
                                  href={telegramDeepLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-[16px] border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                                >
                                  Buka bot Telegram
                                </a>
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <a
                              href={finalPreview}
                              download="kograph-strip.png"
                              className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95"
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </a>

                            <button
                              onClick={() => printPhotoStrip(finalPreview)}
                              className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                            >
                              <Printer className="h-4 w-4" />
                              Print 10.5 × 29.7
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {/* SIDEBAR */}
            <aside className="space-y-5">
              <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,25,46,0.92),rgba(8,15,28,0.98))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.34)]">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.34em]">
                    Overlay live
                  </p>
                </div>

                <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
                  Pilih overlay yang paling cocok
                </h2>

                <div className="mt-5 space-y-3">
                  {validOverlays.length > 0 ? (
                    validOverlays.map((overlay) => {
                      const active = overlay.id === selectedOverlayId;

                      return (
                        <button
                          key={overlay.id}
                          type="button"
                          onClick={() => setSelectedOverlayId(overlay.id)}
                          className={`w-full rounded-[22px] border p-3 text-left transition ${
                            active
                              ? 'border-cyan-300 bg-cyan-400/10'
                              : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-16 w-12 overflow-hidden rounded-xl border border-white/10 bg-white">
                              {overlay.signed_url ? (
                                <img
                                  src={overlay.signed_url}
                                  alt={overlay.label}
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-lg font-semibold text-white">
                                {overlay.label}
                              </p>
                              <p className="mt-1 text-sm leading-6 text-slate-400">
                                Preview akan langsung menyesuaikan di strip live.
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-7 text-slate-300">
                      Belum ada overlay aktif. Upload overlay PNG terlebih dahulu dari dashboard.
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,25,46,0.92),rgba(8,15,28,0.98))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.34)]">
                <div className="flex items-center gap-2 text-cyan-300">
                  <TimerReset className="h-4 w-4" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.34em]">
                    Capture progress
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-[20px] border border-white/10 bg-black/25"
                    >
                      {previews[index] ? (
                        <img
                          src={previews[index]}
                          alt={`Capture ${index + 1}`}
                          className="aspect-[3/4] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[3/4] items-center justify-center text-sm text-slate-500">
                          {index + 1}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {isAdmin ? (
                <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,25,46,0.92),rgba(8,15,28,0.98))] p-5 shadow-[0_18px_70px_rgba(0,0,0,0.34)]">
                  <div className="flex items-center gap-2 text-pink-300">
                    <Heart className="h-4 w-4" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.34em]">
                      Support booth
                    </p>
                  </div>

                  <h3 className="mt-3 text-2xl font-bold tracking-tight text-white">
                    Donasi booth via QRIS
                  </h3>

                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    Booth ini gratis untuk admin. Jika ingin mendukung operasional, masukkan nominal donasi minimal Rp 1.000.
                  </p>

                  <div className="mt-5 flex gap-3">
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={donationAmount}
                      onChange={(event) => setDonationAmount(event.target.value)}
                      className="w-full rounded-[18px] border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                      placeholder="1000"
                    />

                    <button
                      type="button"
                      onClick={() => void handleDonation()}
                      className="rounded-[18px] bg-pink-500 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Donasi
                    </button>
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
      </div>

      {donationModal ? (
        <QRISPaymentModal data={donationModal} onClose={() => setDonationModal(null)} />
      ) : null}

      <style jsx global>{`
        .sensor-scan {
          background:
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0.06) 20%,
              rgba(255, 255, 255, 0.22) 45%,
              rgba(255, 255, 255, 0.06) 70%,
              rgba(255, 255, 255, 0) 100%
            );
          animation: sensorScan 360ms ease-out forwards;
        }

        .shutter-flash {
          background: rgba(255, 255, 255, 0.7);
          mix-blend-mode: screen;
          animation: shutterFlash 280ms ease-out forwards;
        }

        .shutter-ring {
          animation: shutterPulse 320ms ease-out forwards;
          box-shadow:
            0 0 0 8px rgba(255, 255, 255, 0.08),
            0 0 80px rgba(255, 255, 255, 0.18);
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
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        @keyframes shutterPulse {
          0% {
            opacity: 0.85;
            transform: scale(0.72);
          }
          100% {
            opacity: 0;
            transform: scale(1.3);
          }
        }
      `}</style>
    </>
  );
}