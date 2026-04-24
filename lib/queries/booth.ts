import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function getBoothRuntimeData(boothId: string, userId: string) {
  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  const isAdmin = profile?.role === 'admin';

  const boothQuery = supabase.from('booths').select('*').eq('id', boothId);
  if (!isAdmin) boothQuery.eq('user_id', userId);
  const { data: booth } = await boothQuery.single();

  const ownerId = booth?.user_id ?? userId;
  const { data: overlays } = await supabase
    .from('overlays')
    .select('*')
    .eq('user_id', ownerId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', ownerId).maybeSingle();

  const signedOverlays = await Promise.all(
    (overlays ?? []).map(async (overlay) => {
      const { data } = await admin.storage.from(overlay.bucket_id).createSignedUrl(overlay.storage_path, 60 * 15);
      return { ...overlay, signed_url: data?.signedUrl ?? '' };
    })
  );

  return { booth, overlays: signedOverlays, wallet };
}
