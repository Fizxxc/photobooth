export default function BoothLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
      <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.04] px-10 py-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white text-black">
          <span className="text-lg font-black tracking-tight">KG</span>
        </div>

        <p className="text-[10px] font-semibold uppercase tracking-[0.42em] text-white/45">
          KoGraph Studio
        </p>

        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Preparing booth</h2>

        <div className="mx-auto mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
          <div className="booth-loading-bar h-full w-1/2 rounded-full bg-white" />
        </div>

        <p className="mt-2 text-sm text-white/50">
          Menyiapkan kamera, overlay, dan runtime sesi.
        </p>

        <div className="mx-auto mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-white" />
        </div>
      </div>
    </main>
  );
}