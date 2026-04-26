import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function BoothIndexPage() {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();

  const { data: booth, error } = await supabase
    .from('booths')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_enabled', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !booth) {
    redirect('/dashboard?error=no-booth');
  }

  redirect(`/booth/${booth.id}`);
}