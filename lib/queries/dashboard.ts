import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getDashboardData(userId: string) {
  const supabase = createSupabaseServerClient();
  const [wallet, overlays, booths, subscription] = await Promise.all([
    supabase.from('wallets').select('*').eq('user_id', userId).single(),
    supabase.from('overlays').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('booths').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('subscriptions').select('*').eq('user_id', userId).order('subscription_end', { ascending: false }).limit(1).maybeSingle()
  ]);

  return {
    wallet: wallet.data,
    overlays: overlays.data ?? [],
    booths: booths.data ?? [],
    subscription: subscription.data
  };
}
