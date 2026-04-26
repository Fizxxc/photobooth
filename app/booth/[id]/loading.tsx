export default function BoothLoading() {
  return (
    <main className="fixed inset-0 flex items-center justify-center overflow-hidden bg-[#070707] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_38%),linear-gradient(180deg,#111_0%,#050505_100%)]" />

      <div className="relative text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold">
          KG
        </div>

        <p className="mt-6 text-[11px] uppercase tracking-[0.36em] text-white/35">
          KoGraph Studio
        </p>

        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          Preparing booth
        </h2>

        <p className="mt-3 text-sm text-white/45">
          Loading camera runtime and overlay session.
        </p>
      </div>
    </main>
  );
}