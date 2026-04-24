import { AppShell } from '@/components/app-shell';
import { BoothCreator } from '@/components/dashboard/booth-creator';
import { MetricCard } from '@/components/dashboard/metric-card';
import { OverlayUploader } from '@/components/dashboard/overlay-uploader';
import { RealtimeWalletCard } from '@/components/dashboard/realtime-wallet-card';
import { WithdrawalCard } from '@/components/dashboard/withdrawal-card';
import { PricingNudgeModal } from '@/components/pricing-nudge-modal';
import { getDashboardData } from '@/lib/queries/dashboard';
import { buildUserBucketId, ensureUserBucket } from '@/lib/storage';
import { getViewer } from '@/lib/viewer';

export default async function DashboardPage() {
  const viewer = await getViewer();
  const userId = viewer.user?.id ?? 'demo-user';
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';

  let data = { wallet: { balance: 0 }, overlays: [], booths: [], subscription: null as any };
  try {
    data = await getDashboardData(userId);
  } catch {}

  let bucketId = buildUserBucketId(userId);

  if (viewer.user?.id) {
    try {
      bucketId = await ensureUserBucket(viewer.user.id);
    } catch (error) {
      console.error('Failed to ensure user bucket:', error);
    }
  }

  const limitedMode = !data.subscription && role !== 'admin';

  return (
    <AppShell
      currentPath="/dashboard"
      title="Operator Dashboard"
      description="Realtime wallet, overlay library, booth control, and upgrade prompts"
      role={role}
      profileName={name}
    >
      <PricingNudgeModal limitedMode={limitedMode} />

      <div className="grid gap-6 md:grid-cols-3">
        <RealtimeWalletCard userId={userId} initialBalance={Number(data.wallet?.balance ?? 0)} />
        <MetricCard label="Active Overlays" value={data.overlays.length} />
        <MetricCard label="Booths" value={data.booths.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <OverlayUploader bucketId={bucketId} />
        <BoothCreator />
        <WithdrawalCard />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Subscription Status</h3>
          <p className="mt-3 text-sm text-slate-600">
            Started: {data.subscription?.started_at ?? viewer.profile?.trial_started_at ?? 'Trial not initialized'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Ends: {data.subscription?.subscription_end ?? viewer.profile?.trial_ends_at ?? 'Trial not initialized'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Mode: {limitedMode ? 'Limited access' : 'Subscribed'}
          </p>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h3 className="text-lg font-semibold text-slate-950">Brand Story</h3>
          <p className="mt-3 text-slate-600">
            KoGraph Studio is designed to turn every capture into a polished brand moment—clean booth flow,
            premium visuals, and monetization that stays operator-friendly.
          </p>
        </div>
      </div>
    </AppShell>
  );
}