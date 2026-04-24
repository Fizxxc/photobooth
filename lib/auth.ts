import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function requireUser() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/auth/login');
  return data.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/dashboard');
  return user;
}
