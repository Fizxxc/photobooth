'use client';

import Link from 'next/link';
import { useState } from 'react';

export function ProfileMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-panel"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{name}</p>
          <p className="text-xs uppercase tracking-wide text-slate-500">{role}</p>
        </div>
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-3 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-panel">
          <Link href="/profile" className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Profile</Link>
          <Link href="/settings" className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Settings</Link>
          <Link href="/pricing" className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">Pricing</Link>
        </div>
      ) : null}
    </div>
  );
}
