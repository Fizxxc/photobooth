import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getTelegramWebhookInfo } from '@/lib/telegram';

export async function getAdminOverview() {
  const supabase = createSupabaseServerClient();
  const [
    { count: operators },
    { count: sessions },
    { count: overlays },
    { data: settings },
    { data: booths }
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'operator'),
    supabase.from('sessions').select('*', { count: 'exact', head: true }),
    supabase.from('overlays').select('*', { count: 'exact', head: true }),
    supabase.from('app_settings').select('*').maybeSingle(),
    supabase.from('booths').select('id, name, slug, is_enabled, user_id').order('created_at', { ascending: false }).limit(6)
  ]);

  let telegramWebhook: any = null;
  try {
    telegramWebhook = await getTelegramWebhookInfo();
  } catch {
    telegramWebhook = null;
  }

  return {
    operators: operators ?? 0,
    sessions: sessions ?? 0,
    overlays: overlays ?? 0,
    settings,
    booths: booths ?? [],
    telegramWebhook
  };
}
