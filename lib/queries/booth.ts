import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function getBoothRuntimeData(boothId: string, userId: string) {
  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const [{ data: booth }, { data: overlays }, { data: wallet }] = await Promise.all([
    supabase.from('booths').select('*').eq('id', boothId).eq('user_id', userId).single(),
    supabase.from('overlays').select('*').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('wallets').select('*').eq('user_id', userId).single()
  ]);

  const signedOverlays = await Promise.all((overlays ?? []).map(async (overlay) => {
    const { data } = await admin.storage.from(overlay.bucket_id).createSignedUrl(overlay.storage_path, 60 * 15);
    return { ...overlay, signed_url: data?.signedUrl ?? '' };
  }));

  return { booth, overlays: signedOverlays, wallet };
}
