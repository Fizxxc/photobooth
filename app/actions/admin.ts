'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getServerEnv } from '@/lib/env.server';
import { deleteTelegramWebhook, sendTelegramMessage, sendTelegramPhoto, setTelegramWebhook } from '@/lib/telegram';

export async function setKillSwitch(enabled: boolean) {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('app_settings').update({ booth_kill_switch: enabled }).eq('singleton', true);
  if (error) throw error;
  revalidatePath('/admin');
}

export async function syncTelegramWebhook(formData: FormData) {
  await requireAdmin();
  const env = getServerEnv();
  const fallbackAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const manualUrl = String(formData.get('webhookUrl') ?? '').trim();
  const webhookUrl = manualUrl || `${fallbackAppUrl ?? 'http://localhost:3000'}/api/webhooks/telegram`;
  await setTelegramWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
  revalidatePath('/admin');
}

export async function clearTelegramWebhook() {
  await requireAdmin();
  await deleteTelegramWebhook();
  revalidatePath('/admin');
}

export async function sendTelegramBroadcast(formData: FormData): Promise<void> {
  await requireAdmin();

  const message = String(formData.get('message') ?? '').trim();
  const image = formData.get('image');

  if (!message) {
    throw new Error('Pesan broadcast wajib diisi.');
  }

  const supabase = createSupabaseAdminClient();

  const { data: rows, error } = await supabase
    .from('sessions')
    .select('telegram_claim_chat_id')
    .not('telegram_claim_chat_id', 'is', null);

  if (error) {
    throw new Error(error.message);
  }

  const chatIds = Array.from(
    new Set(
      (rows ?? [])
        .map((row) => String(row.telegram_claim_chat_id ?? '').trim())
        .filter(Boolean)
    )
  );

  for (const chatId of chatIds) {
    if (image instanceof File && image.size > 0) {
      const bytes = await image.arrayBuffer();
      const blob = new Blob([bytes], { type: image.type || 'image/png' });

      await sendTelegramPhoto({
        chatId,
        photo: blob,
        caption: message
      });
    } else {
      await sendTelegramMessage(chatId, message);
    }
  }

  revalidatePath('/admin');
}
