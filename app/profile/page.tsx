import { AppShell } from '@/components/app-shell';
import { getViewer } from '@/lib/viewer';

export default async function ProfilePage() {
  const viewer = await getViewer();
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';

  return (
    <AppShell currentPath="/profile" title="Profile" description="Brand identity, account snapshot, and operator credentials" role={role} profileName={name}>
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="Logo" className="h-20 w-20 rounded-3xl" />
          <div>
            <h3 className="text-2xl font-bold text-slate-950">{name}</h3>
            <p className="text-slate-500">Role: {role}</p>
            <p className="text-slate-500">Email: {viewer.user?.email ?? 'Not signed in'}</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
