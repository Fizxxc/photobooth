'use client';

import { useState, useTransition } from 'react';
import { createBooth } from '@/app/actions/dashboard';

export function BoothCreator() {
  const [name, setName] = useState('Booth 01');
  const [message, setMessage] = useState('Create operator booth.');
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <h3 className="text-lg font-semibold text-slate-950">Create Booth</h3>
      <div className="mt-4 grid gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-2xl border border-slate-300 px-4 py-3" />
        <button
          className="rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
          onClick={() => startTransition(async () => {
            try {
              await createBooth(name);
              setMessage('Booth created.');
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unexpected error');
            }
          })}
        >
          {pending ? 'Creating...' : 'Create Booth'}
        </button>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}
