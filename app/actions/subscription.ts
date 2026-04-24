'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function checkSubscriptionStatus() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('check_current_subscription_status');
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    isActive: Boolean(row?.is_active),
    serverNowWib: String(row?.server_now_wib ?? ''),
    subscriptionEnd: row?.subscription_end ?? null
  };
}
