'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { MIN_WITHDRAWAL_IDR } from '@/lib/constants';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureUserBucket } from '@/lib/storage';

const registerOverlaySchema = z.object({
  label: z.string().min(3),
  storagePath: z.string().min(1)
});

export async function registerOverlay(input: z.infer<typeof registerOverlaySchema>) {
  const user = await requireUser();
  const payload = registerOverlaySchema.parse(input);
  const supabase = createSupabaseServerClient();
  const bucketId = await ensureUserBucket(user.id);

  const { error } = await supabase.from('overlays').insert({
    user_id: user.id,
    label: payload.label,
    bucket_id: bucketId,
    storage_path: payload.storagePath,
    width: 1200,
    height: 3600,
    is_active: true
  });

  if (error) throw error;
  revalidatePath('/dashboard');
}

export async function createBooth(name: string) {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const { error } = await supabase.from('booths').insert({ user_id: user.id, name, slug });
  if (error) throw error;
  revalidatePath('/dashboard');
}

export async function requestWithdrawal(amount: number) {
  const user = await requireUser();
  if (amount < MIN_WITHDRAWAL_IDR) {
    throw new Error(`Minimum withdrawal is Rp ${MIN_WITHDRAWAL_IDR.toLocaleString('id-ID')}`);
  }

  const supabase = createSupabaseServerClient();
  const { data: wallet } = await supabase.from('wallets').select('balance').eq('user_id', user.id).single();
  if (!wallet || wallet.balance < amount) throw new Error('Insufficient wallet balance');

  const { error } = await supabase.from('withdrawals').insert({
    user_id: user.id,
    amount,
    status: 'pending'
  });
  if (error) throw error;

  revalidatePath('/dashboard');
}
