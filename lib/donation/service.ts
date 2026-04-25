import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPakasirQrisTransaction } from '@/lib/billing/pakasir';
import {
  editTelegramMessageCaption,
  sendTelegramMessage,
  sendTelegramPhoto
} from '@/lib/telegram';

export function formatIdr(value: number) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
}

export function renderDonationProgressBar(current: number, target: number, size = 12) {
  const safeTarget = Math.max(target, 1);
  const ratio = Math.max(0, Math.min(current / safeTarget, 1));
  const filled = Math.round(ratio * size);
  const empty = size - filled;

  const filledBar = '🟥'.repeat(filled);
  const emptyBar = '⬜'.repeat(empty);
  const percent = Math.round(ratio * 100);

  return `${filledBar}${emptyBar} ${percent}%`;
}

export function buildDonationSummaryText(input: {
  title: string;
  current: number;
  target: number;
  charityPercent: number;
}) {
  const { title, current, target, charityPercent } = input;

  return [
    `💖 *${title}*`,
    '',
    renderDonationProgressBar(current, target),
    `${formatIdr(current)} / ${formatIdr(target)}`,
    '',
    `Sebagian dana (${charityPercent}%) akan disalurkan kepada yang membutuhkan.`
  ].join('\n');
}

export async function getActiveDonationSettings() {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('donation_settings')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createTelegramDonationOrder(input: {
  amount: number;
  chatId: string;
  telegramUserId?: string;
  username?: string;
}) {
  const admin = createSupabaseAdminClient();
  const settings = await getActiveDonationSettings();

  if (!settings?.is_active) {
    throw new Error('Campaign donasi sedang tidak aktif.');
  }

  const minimumAmount = Number(settings.minimum_amount || 1000);
  if (input.amount < minimumAmount) {
    throw new Error(`Minimum donasi adalah ${formatIdr(minimumAmount)}.`);
  }

  const orderId = `KGS-SUPPORT-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

  const pakasir = await createPakasirQrisTransaction({
    orderId,
    amount: input.amount
  });

  await admin.from('pakasir_orders').insert({
    order_id: orderId,
    amount: input.amount,
    kind: 'support_donation',
    source: 'telegram',
    status: 'pending',
    metadata: {
      chat_id: input.chatId,
      username: input.username ?? null,
      telegram_user_id: input.telegramUserId ?? null
    }
  });

  await admin.from('donation_contributions').insert({
    order_id: orderId,
    amount: input.amount,
    source: 'telegram',
    status: 'pending',
    telegram_chat_id: input.chatId,
    telegram_user_id: input.telegramUserId ?? null,
    telegram_username: input.username ?? null,
    pakasir_payment_number: pakasir?.payment?.payment_number ?? null,
    pakasir_expired_at: pakasir?.payment?.expired_at ?? null,
    raw_payload: pakasir
  });

  return {
    orderId,
    pakasir,
    settings
  };
}

export async function sendDonationQrisMessage(input: {
  chatId: string;
  amount: number;
  qrisImageUrl: string;
  orderId: string;
  expiredAt?: string | null;
}) {
  const caption = [
    `💖 *Support Developer*`,
    '',
    `Terima kasih sudah mendukung KoGraph Studio.`,
    `Nominal donasi: *${formatIdr(input.amount)}*`,
    '',
    `Silakan scan QRIS berikut untuk melanjutkan pembayaran.`,
    input.expiredAt ? `Expired: ${input.expiredAt}` : null,
    '',
    `Setelah pembayaran berhasil, pesan ini akan otomatis berubah menjadi ucapan terima kasih.`
  ]
    .filter(Boolean)
    .join('\n');

  return await sendTelegramPhoto({
    chatId: input.chatId,
    photoUrl: input.qrisImageUrl,
    caption,
    parseMode: 'Markdown',
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '📚 Dokumentasi Donasi', callback_data: 'donation_docs' },
          { text: '📈 Progress Donasi', callback_data: 'donation_progress' }
        ],
        [{ text: '🏠 Kembali ke Menu', callback_data: 'menu_home' }]
      ]
    }
  });
}

export async function finalizeDonationOrder(input: {
  orderId: string;
  amount: number;
  completedAt?: string | null;
  payload?: Record<string, unknown>;
}) {
  const admin = createSupabaseAdminClient();

  const { data: contribution, error: contributionError } = await admin
    .from('donation_contributions')
    .select('*')
    .eq('order_id', input.orderId)
    .maybeSingle();

  if (contributionError) throw contributionError;
  if (!contribution) {
    throw new Error('Donation contribution not found');
  }

  if (contribution.status === 'completed') {
    return;
  }

  await admin
    .from('donation_contributions')
    .update({
      status: 'completed',
      completed_at: input.completedAt ?? new Date().toISOString(),
      raw_payload: {
        ...(contribution.raw_payload ?? {}),
        webhook: input.payload ?? {}
      }
    })
    .eq('id', contribution.id);

  await admin
    .from('pakasir_orders')
    .update({
      status: 'completed'
    })
    .eq('order_id', input.orderId);

  const settings = await getActiveDonationSettings();

  if (settings) {
    const newCollected =
      Number(settings.collected_amount || 0) + Number(input.amount || 0);

    await admin
      .from('donation_settings')
      .update({
        collected_amount: newCollected,
        updated_at: new Date().toISOString()
      })
      .eq('id', settings.id);

    const thankYouText = [
      `✅ *Terima kasih sudah donasi*`,
      '',
      `Donasi sebesar *${formatIdr(input.amount)}* sudah kami terima.`,
      `Sebagian dana akan disalurkan kepada yang membutuhkan.`,
      '',
      buildDonationSummaryText({
        title: settings.title,
        current: newCollected,
        target: Number(settings.target_amount || 0),
        charityPercent: Number(settings.charity_percent || 30)
      })
    ].join('\n');

    if (contribution.telegram_chat_id && contribution.payment_message_id) {
      try {
        await editTelegramMessageCaption({
          chatId: contribution.telegram_chat_id,
          messageId: Number(contribution.payment_message_id),
          caption: thankYouText,
          parseMode: 'Markdown',
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '📚 Dokumentasi Donasi', callback_data: 'donation_docs' },
                { text: '📈 Lihat Progress', callback_data: 'donation_progress' }
              ],
              [{ text: '🏠 Kembali ke Menu', callback_data: 'menu_home' }]
            ]
          }
        });
      } catch {
        await sendTelegramMessage({
          chatId: contribution.telegram_chat_id,
          text: thankYouText,
          parseMode: 'Markdown'
        });
      }
    } else if (contribution.telegram_chat_id) {
      await sendTelegramMessage({
        chatId: contribution.telegram_chat_id,
        text: thankYouText,
        parseMode: 'Markdown'
      });
    }
  }
}

export async function getDonationDocumentsMessage() {
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from('donation_documents')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (!data || data.length === 0) {
    return '📚 Dokumentasi donasi belum tersedia.';
  }

  return [
    '📚 *Dokumentasi Donasi*',
    '',
    ...data.map((doc, index) => {
      const url = doc.external_url || doc.image_url || '-';
      return `${index + 1}. *${doc.title}*\n${doc.description ?? '-'}\n${url}`;
    })
  ].join('\n\n');
}