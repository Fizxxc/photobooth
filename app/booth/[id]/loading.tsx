export default function BoothLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#041125] text-white">
      <div className="rounded-[24px] border border-white/10 bg-white/5 px-8 py-6 text-center backdrop-blur">
        <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">KoGraph Studio</p>
        <h2 className="mt-3 text-2xl font-bold">Preparing booth…</h2>
        <p className="mt-2 text-sm text-slate-300">Loading camera runtime and overlay session.</p>
      </div>
    </main>
  );
}