'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function setKillSwitch(enabled: boolean) {
  await requireAdmin();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from('app_settings').update({ booth_kill_switch: enabled }).eq('singleton', true);
  if (error) throw error;
  revalidatePath('/admin');
}
