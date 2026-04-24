import { AppShell } from '@/components/app-shell';
import { PricingPlans } from '@/components/pricing/pricing-plans';
import { getViewer } from '@/lib/viewer';

export default async function PricingPage() {
  const viewer = await getViewer();
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';

  return (
    <AppShell currentPath="/pricing" title="Pricing" description="Klik subscribe untuk membuka popup pembayaran QRIS dengan alur Pakasir-ready" role={role} profileName={name}>
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Flexible Monetization</p>
        <h3 className="mt-4 text-4xl font-black text-slate-950">Subscription and per-session checkout with modern QRIS presentation.</h3>
        <p className="mt-4 max-w-3xl text-slate-600">Professional plan and per-session billing now open a dedicated QRIS popup. When Pakasir credentials are configured, the popup is ready to consume a live QRIS image from the billing response.</p>
      </div>
      <PricingPlans />
    </AppShell>
  );
}
