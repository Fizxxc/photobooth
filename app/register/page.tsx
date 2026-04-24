import { AppShell } from '@/components/app-shell';
import { RegisterForm } from '@/components/auth/register-form';

export default function RegisterPage() {
  return (
    <AppShell currentPath="/register" title="Join KoGraph Studio" description="Register as operator and start in limited access mode" role="guest" profileName="Guest">
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Brand Promise</p>
          <h3 className="mt-4 text-4xl font-black text-slate-950">Create premium booth moments with a platform that feels cinematic.</h3>
          <p className="mt-4 text-lg text-slate-600">Every registered user gets immediate limited access, three-day trial discovery, and guided upgrade prompts.</p>
        </div>
        <RegisterForm />
      </div>
    </AppShell>
  );
}
