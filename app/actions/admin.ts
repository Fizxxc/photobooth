'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getServerEnv } from '@/lib/env.server';
import {
  deleteTelegramWebhook,
  sendTelegramMessage,
  sendTelegramPhoto,
  setTelegramWebhook
} from '@/lib/telegram';

const PAYMENT_TEMPLATE_BUCKET = 'payment-templates';

async function ensurePaymentTemplateBucket() {
  const supabase = createSupabaseAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();

  const exists = (buckets ?? []).some((bucket) => bucket.name === PAYMENT_TEMPLATE_BUCKET);
  if (exists) return;

  await supabase.storage.createBucket(PAYMENT_TEMPLATE_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024
  });
}

export async function setKillSwitch(enabled: boolean): Promise<void> {
  await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from('app_settings')
    .update({ booth_kill_switch: enabled })
    .eq('singleton', true);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin');
}

export async function syncTelegramWebhook(formData: FormData): Promise<void> {
  await requireAdmin();

  const env = getServerEnv();
  const fallbackAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const manualUrl = String(formData.get('webhookUrl') ?? '').trim();
  const webhookUrl = manualUrl || `${fallbackAppUrl ?? 'http://localhost:3000'}/api/webhooks/telegram`;

  await setTelegramWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);
  revalidatePath('/admin');
}

export async function clearTelegramWebhook(): Promise<void> {
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

export async function uploadSupportQrisTemplate(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const supabase = createSupabaseAdminClient();

  const label = String(formData.get('label') ?? '').trim();
  const file = formData.get('file');

  if (!label) {
    throw new Error('Label template wajib diisi.');
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error('File template wajib diupload.');
  }

  await ensurePaymentTemplateBucket();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
  const storagePath = `support-qris/${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from(PAYMENT_TEMPLATE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || 'image/png',
      upsert: false
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: insertError } = await supabase.from('payment_templates').insert({
    type: 'support_qris',
    label,
    bucket_id: PAYMENT_TEMPLATE_BUCKET,
    storage_path: storagePath,
    is_active: false,
    created_by: user.id
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  revalidatePath('/admin');
}

export async function setActivePaymentTemplate(formData: FormData): Promise<void> {
  await requireAdmin();

  const templateId = String(formData.get('templateId') ?? '').trim();
  if (!templateId) {
    throw new Error('Template ID wajib ada.');
  }

  const supabase = createSupabaseAdminClient();

  const { error: clearError } = await supabase
    .from('payment_templates')
    .update({ is_active: false })
    .eq('type', 'support_qris');

  if (clearError) {
    throw new Error(clearError.message);
  }

  const { error: activateError } = await supabase
    .from('payment_templates')
    .update({ is_active: true })
    .eq('id', templateId);

  if (activateError) {
    throw new Error(activateError.message);
  }

  revalidatePath('/admin');
}

export async function updateBoothLocation(formData: FormData): Promise<void> {
  await requireAdmin();

  const boothId = String(formData.get('boothId') ?? '').trim();
  const locationName = String(formData.get('locationName') ?? '').trim();
  const locationAddress = String(formData.get('locationAddress') ?? '').trim();
  const locationNotes = String(formData.get('locationNotes') ?? '').trim();

  const latRaw = String(formData.get('locationLat') ?? '').trim();
  const lngRaw = String(formData.get('locationLng') ?? '').trim();

  const locationLat = latRaw ? Number(latRaw) : null;
  const locationLng = lngRaw ? Number(lngRaw) : null;

  if (!boothId) {
    throw new Error('Booth ID wajib ada.');
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase
    .from('booths')
    .update({
      location_name: locationName || null,
      location_address: locationAddress || null,
      location_notes: locationNotes || null,
      location_lat: Number.isFinite(locationLat as number) ? locationLat : null,
      location_lng: Number.isFinite(locationLng as number) ? locationLng : null
    })
    .eq('id', boothId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/admin');
}