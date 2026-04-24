import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_30%),radial-gradient(circle_at_bottom_right,#e9d5ff,transparent_30%)]" />
      <section className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-6 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-brand-600">KoGraph Studio</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black leading-tight tracking-tight text-slate-950 md:text-7xl">
              Professional photobooth SaaS that makes your booth feel premium, modern, and unforgettable.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-600">
              Built for operators who want powerful Sony A6400 capture, secure subscriptions, polished payments, and instant Telegram delivery in one branded platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-2xl bg-brand-600 px-6 py-3 font-semibold text-white shadow-lg shadow-sky-200">Start Free Limited Access</Link>
              <Link href="/auth/login" className="rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900">Login Operator</Link>
              <Link href="/pricing" className="rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900">See Pricing</Link>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/60 bg-white/80 p-6 shadow-2xl backdrop-blur floaty">
            <img src="/logo.png" alt="KoGraph Studio logo" className="h-20 w-20 rounded-3xl" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                'Sony A6400 1080p60 booth runtime',
                '3 photos + 1 overlay strip compositor',
                'Pakasir payment and wallet settlement',
                'Telegram high-resolution delivery'
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
