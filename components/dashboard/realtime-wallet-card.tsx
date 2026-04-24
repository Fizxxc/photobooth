'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { formatIDR } from '@/lib/utils';

export function RealtimeWalletCard({ userId, initialBalance }: { userId: string; initialBalance: number }) {
  const [balance, setBalance] = useState(initialBalance);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`wallet-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${userId}` }, (payload) => {
        const next = Number((payload.new as { balance?: number })?.balance ?? initialBalance);
        setBalance(next);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialBalance, userId]);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <p className="text-sm font-medium text-slate-500">Wallet Balance Realtime</p>
      <p className="mt-3 text-3xl font-bold text-slate-950">{formatIDR(balance)}</p>
      <p className="mt-2 text-xs text-slate-400">Auto refresh via Supabase Realtime</p>
    </div>
  );
}
