'use client';

import { useState, useTransition } from 'react';
import { setKillSwitch } from '@/app/actions/admin';

export function KillSwitchCard({ initialValue }: { initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <h3 className="text-lg font-semibold text-slate-950">Global Kill-Switch</h3>
      <p className="mt-2 text-sm text-slate-500">Disable all booth runtime access instantly.</p>
      <button
        className={`mt-4 rounded-2xl px-4 py-3 font-semibold text-white ${enabled ? 'bg-rose-600' : 'bg-emerald-600'}`}
        onClick={() => {
          const next = !enabled;
          startTransition(async () => {
            await setKillSwitch(next);
            setEnabled(next);
          });
        }}
      >
        {pending ? 'Updating...' : enabled ? 'Disable Kill-Switch' : 'Enable Kill-Switch'}
      </button>
    </div>
  );
}
