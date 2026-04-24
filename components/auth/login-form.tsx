'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('Login with your KoGraph Studio operator account.');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Login success. Redirecting to dashboard...');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <h3 className="text-2xl font-bold text-slate-950">Welcome Back</h3>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <button disabled={loading} className="rounded-2xl bg-brand-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? 'Signing in...' : 'Login'}</button>
      <p className="text-sm text-slate-500">{message}</p>
    </form>
  );
}
