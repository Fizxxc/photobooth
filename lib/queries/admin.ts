import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getAdminOverview() {
  const supabase = createSupabaseServerClient();
  const [{ count: operators }, { count: sessions }, { count: overlays }, { data: settings }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'operator'),
    supabase.from('sessions').select('*', { count: 'exact', head: true }),
    supabase.from('overlays').select('*', { count: 'exact', head: true }),
    supabase.from('app_settings').select('*').single()
  ]);

  return { operators: operators ?? 0, sessions: sessions ?? 0, overlays: overlays ?? 0, settings };
}
