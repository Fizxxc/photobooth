'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import QRCode from 'qrcode';
import {
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  Printer,
  QrCode,
  RotateCcw,
  Sparkles,
  TimerReset,
  Heart,
  BadgeDollarSign
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function BoothRuntime({
  boothId,
  boothName = 'KoGraph Studio',
  overlays = [],
  isAdmin = false,
  telegramBotUsername = null
}: BoothRuntimeProps) {
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
  const [status, setStatus] = useState('Pilih overlay favorit lalu mulai sesi 3 foto.');
  const [countdownPreset, setCountdownPreset] = useState<3 | 5>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [activeShot, setActiveShot] = useState<number>(0);
  const [isCapturingSequence, setIsCapturingSequence] = useState(false);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [telegramQrUrl, setTelegramQrUrl] = useState<string | null>(null);
  const [donationAmount, setDonationAmount] = useState<string>('1000');
  const [donationModal, setDonationModal] = useState<BillingModalData | null>(null);
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
      if (finalPreviewRef.current) URL.revokeObjectURL(finalPreviewRef.current);
    };
  }, [start, stop]);

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
        if (!cancelled) setTelegramQrUrl(dataUrl);
      } catch {
        if (!cancelled) setTelegramQrUrl(null);
      }
    }

    void generateQr();
    return () => {
      cancelled = true;
    };
  }, [telegramDeepLink]);

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
    setStatus('Sesi direset. Pilih overlay lalu mulai lagi.');
  }

  async function finalizeSequence(capturedFrames: Blob[]) {
    if (!boothId) {
      setStatus('Booth ID tidak valid. Silakan buka ulang booth.');
      return;
    }
    if (!selectedOverlay) {
      setStatus('Belum ada overlay aktif. Upload overlay dari dashboard terlebih dahulu.');
      return;
    }
    if (!selectedOverlay.signed_url) {
      setStatus('URL overlay tidak tersedia. Coba refresh overlay.');
      return;
    }

    startTransition(async () => {
      try {
        setStatus('Menyusun photostrip final...');
        const finalStripBlob = await buildPhotoStrip({
          frames: capturedFrames,
          overlayUrl: selectedOverlay.signed_url
        });

        const draft = await createSessionDraft({ boothId, overlayId: selectedOverlay.id });
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

        if (finalPreviewRef.current) URL.revokeObjectURL(finalPreviewRef.current);
        const nextPreviewUrl = URL.createObjectURL(finalStripBlob);
        finalPreviewRef.current = nextPreviewUrl;
        setFinalPreview(nextPreviewUrl);
        setSessionCode(draft.session_code);
        setStatus(
          (draft as any).is_free_capture
            ? 'Photostrip siap. Silakan download, print, atau scan QR Telegram.'
            : 'Photostrip siap. Lanjutkan pembayaran atau kirim hasil lewat Telegram.'
        );
      } catch (caught) {
        console.error(caught);
        setStatus(caught instanceof Error ? caught.message : 'Terjadi kesalahan saat menyelesaikan sesi.');
      }
    });
  }

  async function handleCaptureSequence() {
    try {
      if (!isReady) {
        setStatus('Kamera belum siap. Tunggu sebentar atau restart kamera.');
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
      setStatus('Sesi dimulai. Ambil pose terbaikmu.');

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
        throw new Error(payload?.error ?? 'Gagal membuat donasi QRIS.');
      }
      setDonationModal(payload);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : 'Gagal membuat donasi QRIS.');
    }
  }

  return (
    <>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#12335d_0%,#071224_45%,#030812_100%)] text-white">
        <div className="mx-auto grid min-h-screen max-w-[1800px] gap-6 p-4 lg:grid-cols-[1.45fr_0.55fr] lg:p-6">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/25 p-4 shadow-2xl backdrop-blur xl:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.45em] text-cyan-300">KoGraph Studio</p>
                <h1 className="mt-2 text-2xl font-bold text-white lg:text-3xl">{boothName}</h1>
                <p className="mt-2 text-sm text-slate-300">Pilih overlay, atur timer, lalu satu klik untuk sesi 3 foto otomatis.</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                <CheckCircle2 className={`h-4 w-4 ${isReady ? 'text-emerald-400' : 'text-amber-400'}`} />
                {isReady ? 'Camera Ready' : 'Menyalakan kamera...'}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black">
              <video
                ref={videoRef}
                className="aspect-[16/9] h-full w-full object-cover [filter:saturate(1.08)_brightness(1.05)]"
                autoPlay
                muted
                playsInline
              />

              {selectedOverlay?.signed_url ? (
                <img
                  src={selectedOverlay.signed_url}
                  alt="Selected overlay"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                />
              ) : null}

              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
                <div className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-xs uppercase tracking-[0.25em] text-slate-200 backdrop-blur">
                  Live preview
                </div>
                {activeShot > 0 ? (
                  <div className="rounded-full bg-black/55 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                    Foto {activeShot}/3
                  </div>
                ) : null}
              </div>

              {countdown !== null ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/30 backdrop-blur-[1px]">
                  <div className="flex h-36 w-36 items-center justify-center rounded-full border border-white/15 bg-black/60 text-6xl font-black text-white shadow-2xl">
                    {countdown}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_auto_auto]">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                {status}
                {error ? <p className="mt-2 text-rose-300">{error}</p> : null}
              </div>

              <div className="flex items-center gap-2 rounded-[1.5rem] border border-white/10 bg-white/5 p-2">
                <button
                  type="button"
                  onClick={() => setCountdownPreset(3)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${countdownPreset === 3 ? 'bg-white text-slate-950' : 'text-white hover:bg-white/10'}`}
                >
                  3 sec
                </button>
                <button
                  type="button"
                  onClick={() => setCountdownPreset(5)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${countdownPreset === 5 ? 'bg-white text-slate-950' : 'text-white hover:bg-white/10'}`}
                >
                  5 sec
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <RotateCcw className="mr-2 inline h-4 w-4" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => void handleCaptureSequence()}
                  disabled={!isReady || !selectedOverlay || isCapturingSequence || isPending}
                  className="rounded-[1.4rem] bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCapturingSequence || isPending ? (
                    <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Memproses...</>
                  ) : (
                    <><Camera className="mr-2 inline h-4 w-4" />Mulai 3 Foto</>
                  )}
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2 text-cyan-300">
                <Sparkles className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.35em]">Overlay live</p>
              </div>
              <h2 className="mt-3 text-xl font-bold text-white">Pilih overlay yang paling cocok</h2>
              <div className="mt-4 grid max-h-[340px] gap-3 overflow-y-auto pr-1">
                {validOverlays.length > 0 ? validOverlays.map((overlay) => {
                  const active = overlay.id === selectedOverlayId;
                  return (
                    <button
                      key={overlay.id}
                      type="button"
                      onClick={() => setSelectedOverlayId(overlay.id)}
                      className={`flex items-center gap-3 rounded-[1.4rem] border p-3 text-left transition ${active ? 'border-cyan-300 bg-cyan-400/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                    >
                      <div className="h-16 w-12 overflow-hidden rounded-xl border border-white/10 bg-white">
                        {overlay.signed_url ? <img src={overlay.signed_url} alt={overlay.label} className="h-full w-full object-cover" /> : null}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{overlay.label}</p>
                        <p className="mt-1 text-xs text-slate-400">Preview live akan langsung muncul di layar.</p>
                      </div>
                    </button>
                  );
                }) : (
                  <div className="rounded-[1.4rem] border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-300">
                    Belum ada overlay aktif. Upload overlay PNG dari dashboard terlebih dahulu.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2 text-cyan-300">
                <TimerReset className="h-4 w-4" />
                <p className="text-xs font-semibold uppercase tracking-[0.35em]">Capture progress</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/25">
                    {previews[index] ? (
                      <img src={previews[index]} alt={`Capture ${index + 1}`} className="aspect-[3/4] w-full object-cover" />
                    ) : (
                      <div className="flex aspect-[3/4] items-center justify-center text-sm text-slate-500">{index + 1}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {finalPreview ? (
              <section className="rounded-[2rem] border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-2xl backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Final strip ready</p>
                <div className="mt-4 grid gap-4">
                  <div className="flex justify-center">
                    <img src={finalPreview} alt="Final photostrip" className="w-full max-w-[240px] rounded-[1.5rem] border border-white/10 bg-white" />
                  </div>

                  {telegramQrUrl && telegramDeepLink ? (
                    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <QrCode className="h-4 w-4 text-cyan-300" />
                        Ambil foto via Telegram
                      </div>
                      <p className="mt-2 text-xs leading-6 text-slate-300">
                        Scan QR ini untuk mengirim hasil ke bot Telegram. Kode unik untuk sesi ini dan diklaim oleh chat pertama yang memindainya.
                      </p>
                      <div className="mt-4 flex items-center gap-4">
                        <img src={telegramQrUrl} alt="Telegram QR delivery" className="h-28 w-28 rounded-2xl bg-white p-2" />
                        <a href={telegramDeepLink} target="_blank" rel="noreferrer" className="rounded-[1rem] border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                          Buka bot Telegram
                        </a>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <a href={finalPreview} download="kograph-strip.png" className="flex items-center justify-center gap-2 rounded-[1.2rem] bg-white px-4 py-3 text-sm font-semibold text-slate-950">
                      <Download className="h-4 w-4" />
                      Download strip
                    </a>
                    <button onClick={() => printPhotoStrip(finalPreview)} className="flex items-center justify-center gap-2 rounded-[1.2rem] border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                      <Printer className="h-4 w-4" />
                      Print 10.5 × 29.7 cm
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {isAdmin ? (
              <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur">
                <div className="flex items-center gap-2 text-pink-300">
                  <Heart className="h-4 w-4" />
                  <p className="text-xs font-semibold uppercase tracking-[0.35em]">Support booth</p>
                </div>
                <h3 className="mt-3 text-xl font-bold text-white">Donasi booth via QRIS</h3>
                <p className="mt-2 text-sm text-slate-300">Booth ini gratis untuk admin. Jika ingin mendukung operasional, masukkan nominal donasi minimal Rp 1.000.</p>
                <div className="mt-4 flex gap-3">
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={donationAmount}
                    onChange={(event) => setDonationAmount(event.target.value)}
                    className="w-full rounded-[1.2rem] border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"
                    placeholder="1000"
                  />
                  <button onClick={() => void handleDonation()} className="rounded-[1.2rem] bg-pink-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90">
                    <BadgeDollarSign className="mr-2 inline h-4 w-4" />Donasi
                  </button>
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {donationModal ? <QRISPaymentModal data={donationModal} onClose={() => setDonationModal(null)} /> : null}
    </>
  );
}
