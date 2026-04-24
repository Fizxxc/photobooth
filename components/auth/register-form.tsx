'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function RegisterForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('Create your operator account and get limited photobooth access instantly.');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          role: 'operator'
        }
      }
    });
    setMessage(error ? error.message : 'Registration success. Check your inbox for verification if email confirm is enabled.');
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
      <h3 className="text-2xl font-bold text-slate-950">Create Account</h3>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" className="rounded-2xl border border-slate-300 px-4 py-3" />
      <button className="rounded-2xl bg-brand-600 px-4 py-3 font-semibold text-white">Register</button>
      <p className="text-sm text-slate-500">{message}</p>
    </form>
  );
}
