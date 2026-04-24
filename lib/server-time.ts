import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getServerTimeWib() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('current_server_time_wib');
  if (error) throw error;
  return String(data ?? '');
}
