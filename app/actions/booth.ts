'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { SESSION_PRICE_IDR } from '@/lib/constants';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureUserBucket } from '@/lib/storage';

const draftSchema = z.object({
  boothId: z.string().uuid(),
  overlayId: z.string().uuid()
});

export async function createSessionDraft(input: z.infer<typeof draftSchema>) {
  const user = await requireUser();
  const payload = draftSchema.parse(input);
  const supabase = createSupabaseServerClient();
  const bucketId = await ensureUserBucket(user.id);
  const sessionCode = `KGS-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const finalStoragePath = `sessions/${sessionCode}/final-strip.png`;

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      booth_id: payload.boothId,
      user_id: user.id,
      overlay_id: payload.overlayId,
      session_code: sessionCode,
      final_bucket_id: bucketId,
      final_storage_path: finalStoragePath,
      total_amount: SESSION_PRICE_IDR,
      platform_fee: 1000,
      net_amount: 9000,
      status: 'draft'
    })
    .select('id, session_code, final_bucket_id, final_storage_path')
    .single();

  if (error || !data) throw error ?? new Error('Session draft creation failed');
  revalidatePath(`/booth/${payload.boothId}`);
  return data;
}

export async function markSessionUploaded(sessionId: string, rawFrames: string[]) {
  const user = await requireUser();
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from('sessions')
    .update({ raw_frames: rawFrames, status: 'pending_payment' })
    .eq('id', sessionId)
    .eq('user_id', user.id);

  if (error) throw error;
}
