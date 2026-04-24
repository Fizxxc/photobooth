import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <AppShell currentPath="/auth/login" title="Login" description="Secure operator sign-in for KoGraph Studio" role="guest" profileName="Guest">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Premium Operator Access</p>
          <h3 className="mt-4 text-4xl font-black text-slate-950">Run your photobooth business with a polished login experience.</h3>
          <p className="mt-4 text-slate-600">Access dashboard analytics, booth runtime, overlays, subscription details, and branded delivery tools.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/register" className="rounded-2xl bg-brand-600 px-5 py-3 font-semibold text-white">Create account</Link>
            <Link href="/pricing" className="rounded-2xl border border-slate-300 px-5 py-3 font-semibold text-slate-900">View pricing</Link>
          </div>
        </div>
        <LoginForm />
      </div>
    </AppShell>
  );
}
