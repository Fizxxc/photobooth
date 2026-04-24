import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getViewer() {
  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { user: null, profile: null };
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
  return { user: auth.user, profile };
}
