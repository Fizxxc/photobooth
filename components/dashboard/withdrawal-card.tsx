'use client';

import { useState, useTransition } from 'react';
import { requestWithdrawal } from '@/app/actions/dashboard';

export function WithdrawalCard() {
  const [amount, setAmount] = useState(15000);
  const [message, setMessage] = useState('Minimum withdrawal Rp 15.000');
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <h3 className="text-lg font-semibold text-slate-950">Withdraw Wallet</h3>
      <div className="mt-4 grid gap-3">
        <input
          className="rounded-2xl border border-slate-300 px-4 py-3"
          type="number"
          min={15000}
          step={1000}
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
        />
        <button
          className="rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white"
          onClick={() => {
            startTransition(async () => {
              try {
                await requestWithdrawal(amount);
                setMessage('Withdrawal request created.');
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Unexpected error');
              }
            });
          }}
        >
          {pending ? 'Submitting...' : 'Request Withdrawal'}
        </button>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}
