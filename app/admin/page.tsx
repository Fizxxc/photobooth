import { AppShell } from '@/components/app-shell';
import { KillSwitchCard } from '@/components/admin/kill-switch-card';
import { MetricCard } from '@/components/dashboard/metric-card';
import { getAdminOverview } from '@/lib/queries/admin';
import { getViewer } from '@/lib/viewer';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AdminPage() {
  const viewer = await getViewer();
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';
  let overview = { operators: 0, sessions: 0, overlays: 0, settings: { booth_kill_switch: false } };
  let users: any[] = [];
  try {
    overview = await getAdminOverview();
    const supabase = createSupabaseServerClient();
    const { data } = await supabase.from('profiles').select('id, full_name, role, trial_started_at, trial_ends_at').order('created_at', { ascending: false }).limit(12);
    users = data ?? [];
  } catch {}

  return (
    <AppShell currentPath="/admin" title="Admin Console" description="Private operational control panel for KoGraph Studio administrators only" role={role} profileName={name}>
      <div className="grid gap-6 md:grid-cols-3">
        <MetricCard label="Operators" value={overview.operators} />
        <MetricCard label="Sessions" value={overview.sessions} />
        <MetricCard label="Overlays" value={overview.overlays} />
      </div>
      <KillSwitchCard initialValue={Boolean(overview.settings?.booth_kill_switch)} />
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
        <h3 className="text-lg font-semibold text-slate-950">Recent Users</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pb-3">Name</th>
                <th className="pb-3">Role</th>
                <th className="pb-3">Trial Start</th>
                <th className="pb-3">Trial End</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="py-3">{user.full_name ?? user.id}</td>
                  <td className="py-3">{user.role}</td>
                  <td className="py-3">{user.trial_started_at ?? '-'}</td>
                  <td className="py-3">{user.trial_ends_at ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
