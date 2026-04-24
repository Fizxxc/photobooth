'use client';

import { useState } from 'react';
import { QRISPaymentModal, type BillingModalData } from '@/components/pricing/qris-payment-modal';

const plans = [
  {
    code: 'starter',
    name: 'Starter',
    amount: 0,
    description: 'Mode terbatas untuk eksplorasi dan uji booth.',
    cta: 'Current Free Access',
    subscribe: false
  },
  {
    code: 'pro_monthly',
    name: 'Professional',
    amount: 149000,
    description: 'Full booth runtime, premium overlays, realtime dashboard, dan operator monetization.',
    cta: 'Subscribe QRIS',
    subscribe: true,
    featured: true
  },
  {
    code: 'session_fee',
    name: 'Session Billing',
    amount: 10000,
    description: 'Pembayaran per sesi untuk 1 session = 3 photos = 1 overlay strip.',
    cta: 'Pay Session QRIS',
    subscribe: true
  }
];

export function PricingPlans() {
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [modal, setModal] = useState<BillingModalData | null>(null);
  const [error, setError] = useState<string>('');

  async function startCheckout(code: string) {
    setLoadingCode(code);
    setError('');
    try {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: code })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Billing request failed');
      setModal(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create billing');
    } finally {
      setLoadingCode(null);
    }
  }

  return (
    <>
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.code} className={`rounded-[2rem] border bg-white p-6 shadow-panel transition hover:-translate-y-1 ${plan.featured ? 'border-brand-600 ring-2 ring-brand-100' : 'border-slate-200'}`}>
            <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${plan.featured ? 'text-brand-600' : 'text-slate-500'}`}>{plan.name}</p>
            <h3 className="mt-3 text-3xl font-black text-slate-950">Rp {plan.amount.toLocaleString('id-ID')}</h3>
            <p className="mt-3 min-h-[72px] text-slate-600">{plan.description}</p>
            <button
              disabled={!plan.subscribe || loadingCode === plan.code}
              onClick={() => plan.subscribe && startCheckout(plan.code)}
              className={`mt-6 w-full rounded-2xl px-5 py-3 font-semibold ${plan.subscribe ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              {loadingCode === plan.code ? 'Preparing realtime QRIS...' : plan.cta}
            </button>
          </div>
        ))}
      </div>
      {modal ? <QRISPaymentModal data={modal} onClose={() => setModal(null)} /> : null}
    </>
  );
}
