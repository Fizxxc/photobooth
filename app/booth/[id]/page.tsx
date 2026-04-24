import { BoothRuntime } from '@/components/booth/booth-runtime';
import { getBoothRuntimeData } from '@/lib/queries/booth';
import { getViewer } from '@/lib/viewer';
import { getServerEnv } from '@/lib/env.server';

export default async function BoothPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const env = getServerEnv();
  const isAdmin = viewer.profile?.role === 'admin';

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
    if (viewer.user) {
      const data = await getBoothRuntimeData(params.id, viewer.user.id);

      if (data?.booth?.id) {
        boothId = data.booth.id;
        boothName = data.booth.name ?? 'KoGraph Studio Booth';
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
    <BoothRuntime
      boothId={boothId}
      boothName={boothName}
      overlays={overlays}
      isAdmin={isAdmin}
      telegramBotUsername={env.TELEGRAM_BOT_USERNAME ?? null}
    />
  );
}
