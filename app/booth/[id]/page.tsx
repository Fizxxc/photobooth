import { notFound } from 'next/navigation';
import { BoothRuntime } from '@/components/booth/booth-runtime';
import { getBoothRuntimeData } from '@/lib/queries/booth';
import { getViewer } from '@/lib/viewer';
import { getServerEnv } from '@/lib/env.server';

export const dynamic = 'force-dynamic';

type BoothPageProps = {
  params: {
    id: string;
  };
  searchParams?: {
    monitor?: string;
  };
};

export default async function BoothPage({ params, searchParams }: BoothPageProps) {
  const viewer = await getViewer();
  const env = getServerEnv();

  if (!viewer.user) {
    notFound();
  }

  const isAdmin = viewer.profile?.role === 'admin';
  const isMonitorMode = searchParams?.monitor === '1';

  let boothId = params.id;
  let boothName = 'KoGraph Studio Booth';
  let overlays: Array<{
    id: string;
    label: string;
    bucket_id: string;
    storage_path: string;
    signed_url: string;
  }> = [];

  try {
    const data = await getBoothRuntimeData(params.id, viewer.user.id);

    if (!data?.booth?.id) {
      notFound();
    }

    boothId = data.booth.id;
    boothName = data.booth.name?.trim() || 'KoGraph Studio Booth';

    if (Array.isArray(data.overlays) && data.overlays.length > 0) {
      overlays = data.overlays.map((item) => ({
        id: item.id,
        label: item.label ?? 'Overlay',
        bucket_id: item.bucket_id,
        storage_path: item.storage_path,
        signed_url: item.signed_url ?? ''
      }));
    }
  } catch (error) {
    console.error('Booth page load error:', error);
    notFound();
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <BoothRuntime
        boothId={boothId}
        boothName={boothName}
        overlays={overlays}
        isAdmin={isAdmin}
        telegramBotUsername={env.TELEGRAM_BOT_USERNAME ?? null}
      />

      {isMonitorMode ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[200] -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-[10px] uppercase tracking-[0.28em] text-white/70 backdrop-blur-xl">
          Monitor Mode
        </div>
      ) : null}
    </main>
  );
}