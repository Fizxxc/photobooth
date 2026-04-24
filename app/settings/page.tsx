import { AppShell } from '@/components/app-shell';
import { getViewer } from '@/lib/viewer';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function SettingsPage() {
  const viewer = await getViewer();
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';
  let subscription: any = null;
  if (viewer.user) {
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.from('subscriptions').select('*').eq('user_id', viewer.user.id).order('subscription_end', { ascending: false }).limit(1).maybeSingle();
    subscription = data;
  }

  return (
    <AppShell currentPath="/settings" title="Settings" description="Subscription timeline, account state, and runtime preferences" role={role} profileName={name}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h3 className="text-xl font-semibold text-slate-950">Subscription Detail</h3>
          <dl className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="flex justify-between gap-4"><dt>Started at</dt><dd>{subscription?.started_at ?? viewer.profile?.trial_started_at ?? 'Not started'}</dd></div>
            <div className="flex justify-between gap-4"><dt>Expired at</dt><dd>{subscription?.subscription_end ?? viewer.profile?.trial_ends_at ?? 'Not available'}</dd></div>
            <div className="flex justify-between gap-4"><dt>Status</dt><dd>{subscription?.status ?? 'limited-access'}</dd></div>
          </dl>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <h3 className="text-xl font-semibold text-slate-950">Brand Preferences</h3>
          <p className="mt-3 text-slate-600">Place operator personalization, camera countdown, booth theme, and Telegram delivery options here.</p>
        </div>
      </div>
    </AppShell>
  );
}
