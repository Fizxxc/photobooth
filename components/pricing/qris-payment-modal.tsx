'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type PaymentStatus = 'pending' | 'completed' | 'expired' | 'failed';

export interface BillingModalData {
  orderId: string;
  amount: number;
  netAmount: number;
  fee: number;
  qrString: string;
  expiresAt?: string;
  provider: string;
  mode: 'live' | 'sandbox';
}

export function QRISPaymentModal({ data, onClose }: { data: BillingModalData; onClose: () => void }) {
  const [qrImage, setQrImage] = useState('');
  const [status, setStatus] = useState<PaymentStatus>('pending');
  const [simulateLoading, setSimulateLoading] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(data.qrString, { margin: 1, width: 720 }).then(setQrImage).catch(console.error);
  }, [data.qrString]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const response = await fetch(`/api/billing/status?orderId=${encodeURIComponent(data.orderId)}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!alive) return;
        const nextStatus = String(payload?.status ?? 'pending') as PaymentStatus;
        setStatus(nextStatus);
      } catch {
        // no-op
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [data.orderId]);

  async function simulateSandboxPayment() {
    setSimulateLoading(true);
    try {
      await fetch('/api/billing/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId })
      });
    } finally {
      setSimulateLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-brand-600 via-sky-500 to-cyan-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Realtime QRIS Checkout</p>
              <h3 className="mt-1 text-2xl font-black">Scan QRIS and watch payment status update automatically</h3>
            </div>
            <img src="/payments/qris-logo.png" alt="QRIS" className="h-10 w-auto rounded-lg bg-white p-1" />
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="overflow-hidden rounded-[1.25rem] bg-white p-4 shadow-inner">
              {qrImage ? <img src={qrImage} alt="QRIS payment code" className="h-auto w-full rounded-xl" /> : <div className="aspect-square w-full animate-pulse rounded-xl bg-slate-100" />}
            </div>
            <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">
              <div className="flex justify-between gap-4"><span>Mode</span><span className="font-semibold uppercase">{data.mode}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span>Status</span><span className={`font-semibold ${status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{status}</span></div>
              <div className="mt-2 flex justify-between gap-4"><span>Expired</span><span>{data.expiresAt ?? '-'}</span></div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Order ID</p>
              <p className="mt-1 text-lg font-semibold text-slate-950">{data.orderId}</p>
              <div className="mt-4 grid gap-3 text-sm text-slate-600">
                <div className="flex justify-between gap-4"><span>Base Amount</span><span className="font-semibold text-slate-950">Rp {data.netAmount.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between gap-4"><span>Pakasir Fee</span><span>Rp {data.fee.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between gap-4"><span>Total Payment</span><span className="font-semibold text-slate-950">Rp {data.amount.toLocaleString('id-ID')}</span></div>
                <div className="flex justify-between gap-4"><span>Method</span><span>{data.provider}</span></div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Cara bayar</p>
              <ol className="mt-3 space-y-2">
                <li>1. Buka e-wallet atau mobile banking yang mendukung QRIS.</li>
                <li>2. Scan QR di popup ini.</li>
                <li>3. Selesaikan nominal sesuai total payment.</li>
                <li>4. Status akan berubah otomatis ketika transaksi Pakasir sudah completed.</li>
              </ol>
            </div>

            <div className="flex flex-wrap gap-3">
              {data.mode === 'sandbox' ? (
                <button onClick={simulateSandboxPayment} disabled={simulateLoading} className="rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
                  {simulateLoading ? 'Simulating...' : 'Simulate Sandbox Payment'}
                </button>
              ) : null}
              <button onClick={onClose} className="rounded-2xl border border-slate-300 px-5 py-3 font-semibold text-slate-900">Close</button>
            </div>

            {status === 'completed' ? (
              <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">
                Payment completed. Subscription or order settlement has been processed server-side.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
