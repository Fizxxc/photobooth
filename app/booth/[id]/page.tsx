import { AppShell } from '@/components/app-shell';
import { BoothRuntime } from '@/components/booth/booth-runtime';
import { getBoothRuntimeData } from '@/lib/queries/booth';
import { getViewer } from '@/lib/viewer';

export default async function BoothPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const role = viewer.profile?.role ?? 'guest';
  const name = viewer.profile?.full_name ?? viewer.user?.email ?? 'Guest';

  let boothId = params.id;
  let boothName = 'KoGraph Booth';
  let overlays: Array<{
    id: string;
    label: string;
    bucket_id: string;
    storage_path: string;
    signed_url: string;
  }> = [];

  try {
    if (viewer.user) {
      const data = await getBoothRuntimeData(params.id, viewer.user.id);

      if (data?.booth?.id) {
        boothId = data.booth.id;
        boothName = data.booth.name ?? 'KoGraph Booth';
      }

      if (Array.isArray(data?.overlays) && data.overlays.length > 0) {
        overlays = data.overlays.map((item) => ({
          id: item.id,
          label: item.label ?? 'Overlay',
          bucket_id: item.bucket_id,
          storage_path: item.storage_path,
          signed_url: item.signed_url ?? ''
        }));
      }
    }
  } catch (error) {
    console.error('Failed to load booth runtime data:', error);
  }

  return (
    <AppShell
      currentPath="/booth"
      title="Booth Runtime"
      description="Cinematic Sony A6400 booth runtime with browser-side 3-photo strip composition."
      role={role}
      profileName={name}
    >
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">Live Booth</p>
              <h2 className="text-2xl font-bold text-slate-950">{boothName}</h2>
              <p className="text-sm text-slate-500">1 session = 3 photos = 1 overlay strip.</p>
            </div>
          </div>
        </div>

        <BoothRuntime boothId={boothId} overlays={overlays} />
      </div>
    </AppShell>
  );
}