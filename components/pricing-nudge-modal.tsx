'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

const THREE_DAYS = 1000 * 60 * 60 * 24 * 3;

export function PricingNudgeModal({ limitedMode }: { limitedMode: boolean }) {
  const [open, setOpen] = useState(false);
  const storageKey = useMemo(() => 'kograph-pricing-nudge-at', []);

  useEffect(() => {
    if (!limitedMode) return;
    const last = Number(localStorage.getItem(storageKey) ?? '0');
    const now = Date.now();
    if (!last || now - last >= THREE_DAYS) {
      setOpen(true);
      localStorage.setItem(storageKey, String(now));
    }
  }, [limitedMode, storageKey]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-w-lg rounded-[2rem] bg-white p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Upgrade Moment</p>
        <h3 className="mt-3 text-3xl font-black text-slate-950">Unlock the full KoGraph Studio experience</h3>
        <p className="mt-4 text-slate-600">
          Your account is currently in limited mode. Upgrade to remove booth limits, activate premium overlays, advanced analytics,
          and operator monetization tools.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/pricing" className="rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white">View Pricing</Link>
          <button onClick={() => setOpen(false)} className="rounded-2xl border border-slate-300 px-5 py-3 font-semibold text-slate-900">Maybe Later</button>
        </div>
      </div>
    </div>
  );
}
