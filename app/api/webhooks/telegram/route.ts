import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  answerCallbackQuery,
  deleteTelegramMessage,
  editTelegramMessage,
  sendChatAction,
  sendTelegramDocument,
  sendTelegramLocation,
  sendTelegramMessage,
  sendTelegramPhoto,
  type TelegramReplyMarkup
} from '@/lib/telegram';
import { createPakasirQrisTransaction } from '@/lib/billing/pakasir';
import { buildSupportQrisPoster } from '@/lib/payments/support-qris-poster';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';

function parseStartCode(messageText: string) {
  const trimmed = messageText.trim();
  if (!trimmed.startsWith('/start')) return null;
  const parts = trimmed.split(' ');
  return parts[1]?.trim() || null;
}

function parseDonationAmount(messageText: string) {
  const trimmed = messageText.trim();
  if (!trimmed.startsWith('/donasi')) return null;

  const parts = trimmed.split(' ');
  const amount = Number(parts[1] ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function donationAmountKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: 'Rp 1.000', callback_data: 'donate_amount_1000' },
        { text: 'Rp 5.000', callback_data: 'donate_amount_5000' }
      ],
      [
        { text: 'Rp 10.000', callback_data: 'donate_amount_10000' },
        { text: 'Rp 25.000', callback_data: 'donate_amount_25000' }
      ],
      [
        { text: 'Rp 50.000', callback_data: 'donate_amount_50000' },
        { text: '💬 Nominal Bebas', callback_data: 'donate_custom' }
      ],
      [
        { text: '📈 Progress Donasi', callback_data: 'donation_progress' },
        { text: '📚 Dokumentasi Donasi', callback_data: 'donation_docs' }
      ]
    ]
  };
}

function mainMenuKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: '💖 Support Developer', callback_data: 'menu_support' },
        { text: '📈 Progress Donasi', callback_data: 'donation_progress' }
      ],
      [
        { text: '📚 Dokumentasi Donasi', callback_data: 'donation_docs' },
        { text: '❓ Bantuan', callback_data: 'show_help' }
      ]
    ]
  };
}

function sessionKeyboard(boothId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: '💖 Support Developer', callback_data: `support_dev:${boothId}` },
        { text: '🎨 Lihat Overlay', callback_data: `show_overlays:${boothId}` }
      ],
      [
        { text: '📍 Lokasi Booth', callback_data: `show_location:${boothId}` },
        { text: '📈 Progress Donasi', callback_data: 'donation_progress' }
      ],
      [
        { text: '📚 Dokumentasi Donasi', callback_data: 'donation_docs' },
        { text: '❓ Bantuan', callback_data: 'show_help' }
      ]
    ]
  };
}

function formatIdr(value: number) {
  return `Rp ${new Intl.NumberFormat('id-ID').format(value)}`;
}

function renderDonationProgressBar(current: number, target: number, size = 12) {
  const safeTarget = Math.max(target, 1);
  const ratio = Math.max(0, Math.min(current / safeTarget, 1));
  const filled = Math.round(ratio * size);
  const empty = size - filled;

  return `${'🟥'.repeat(filled)}${'⬜'.repeat(empty)} ${Math.round(ratio * 100)}%`;
}

async function getDonationSettings() {
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

async function getDonationDocumentsText() {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('donation_documents')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) {
    return '📚 Dokumentasi donasi belum tersedia.';
  }

  return [
    '📚 *Dokumentasi Donasi*',
    '',
    ...data.map((doc, index) => {
      const link = doc.external_url || doc.image_url || '-';
      return `${index + 1}. *${doc.title}*\n${doc.description ?? '-'}\n${link}`;
    })
  ].join('\n\n');
}

async function getActiveSupportTemplate() {
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from('payment_templates')
    .select('id, label, bucket_id, storage_path')
    .eq('type', 'support_qris')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createDonationOrder(input: {
  amount: number;
  chatId: string;
  telegramUserId?: string;
  username?: string;
}) {
  const admin = createSupabaseAdminClient();
  const settings = await getDonationSettings();

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
    purpose: 'donation',
    status: 'pending',
    kind: 'support_donation',
    source: 'telegram',
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

  return { orderId, pakasir, settings };
}

async function sendDonationPoster(input: {
  chatId: string;
  amount: number;
  orderId: string;
  qrisString: string;
  expiredAt?: string | null;
}) {
  const admin = createSupabaseAdminClient();
  const template = await getActiveSupportTemplate();

  if (!template) {
    throw new Error('Template QRIS support belum tersedia.');
  }

  const { data: fileBlob, error: downloadError } = await admin.storage
    .from(template.bucket_id)
    .download(template.storage_path);

  if (downloadError || !fileBlob) {
    throw new Error(downloadError?.message ?? 'Gagal mengambil template support.');
  }

  const templateBuffer = Buffer.from(await fileBlob.arrayBuffer());
  const posterBuffer = await buildSupportQrisPoster({
    templateBuffer,
    qrisString: input.qrisString
  });

  const posterBytes = new Uint8Array(posterBuffer);
  const posterBlob = new Blob([posterBytes], { type: 'image/png' });

  const sent = (await sendTelegramPhoto({
    chatId: input.chatId,
    photo: posterBlob,
    caption:
      `💖 *Support Developer*\n\n` +
      `Terima kasih sudah mendukung KoGraph Studio.\n` +
      `Nominal donasi: *${formatIdr(input.amount)}*\n` +
      `${input.expiredAt ? `Expired: ${input.expiredAt}\n` : ''}\n` +
      `Setelah pembayaran berhasil, pesan ini akan berubah menjadi ucapan terima kasih.`,
    parseMode: 'Markdown',
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '📈 Progress Donasi', callback_data: 'donation_progress' },
          { text: '📚 Dokumentasi Donasi', callback_data: 'donation_docs' }
        ],
        [{ text: '🏠 Menu', callback_data: 'menu_home' }]
      ]
    }
  })) as {
    result?: {
      message_id?: number;
    };
  };

  const messageId = Number(sent.result?.message_id ?? 0);
  if (messageId) {
    await admin
      .from('donation_contributions')
      .update({ payment_message_id: messageId })
      .eq('order_id', input.orderId);
  }
}

export async function POST(request: NextRequest) {
  const serverEnv = getServerEnv();
  const secret = request.headers.get('x-telegram-bot-api-secret-token');

  if (!serverEnv.TELEGRAM_WEBHOOK_SECRET || secret !== serverEnv.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
  }

  requireServerEnv([
    'SUPABASE_SERVICE_ROLE_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_BOT_USERNAME',
    'PAKASIR_PROJECT_SLUG',
    'PAKASIR_API_KEY'
  ]);

  const payload: any = await request.json();
  const admin = createSupabaseAdminClient();

  if (payload?.callback_query) {
    const callbackId = String(payload.callback_query.id ?? '');
    const callbackData = String(payload.callback_query.data ?? '');
    const chatId = String(payload.callback_query.message?.chat?.id ?? '');
    const from = payload.callback_query.from;

    if (!callbackId || !callbackData || !chatId) {
      return NextResponse.json({ ok: true });
    }

    if (callbackData === 'menu_home') {
      await answerCallbackQuery(callbackId, 'Membuka menu...');
      await sendTelegramMessage({
        chatId,
        text:
          `Selamat datang di KoGraph Studio Bot.\n\n` +
          `• Gunakan /start KODE_UNIK untuk mengambil hasil booth\n` +
          `• Gunakan /donasi 20000 untuk donasi nominal bebas\n` +
          `• Atau pilih menu di bawah`,
        replyMarkup: mainMenuKeyboard()
      });
      return NextResponse.json({ ok: true });
    }

    if (callbackData === 'menu_support') {
      await answerCallbackQuery(callbackId, 'Membuka menu donasi...');
      await sendTelegramMessage({
        chatId,
        text:
          `💖 *Support Developer*\n\n` +
          `Pilih nominal yang tersedia atau kirim manual:\n` +
          `contoh: \`/donasi 20000\`\n\n` +
          `Sebagian dana akan disumbangkan kepada yang membutuhkan.`,
        parseMode: 'Markdown',
        replyMarkup: donationAmountKeyboard()
      });
      return NextResponse.json({ ok: true });
    }

    if (callbackData === 'donation_progress') {
      await answerCallbackQuery(callbackId, 'Mengambil progress...');
      const settings = await getDonationSettings();

      if (!settings) {
        await sendTelegramMessage({
          chatId,
          text: 'Campaign donasi belum tersedia.'
        });
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage({
        chatId,
        text:
          `💖 *${settings.title}*\n\n` +
          `${renderDonationProgressBar(
            Number(settings.collected_amount || 0),
            Number(settings.target_amount || 0)
          )}\n` +
          `${formatIdr(Number(settings.collected_amount || 0))} / ${formatIdr(Number(settings.target_amount || 0))}\n\n` +
          `Sebagian dana (${Number(settings.charity_percent || 30)}%) akan disalurkan kepada yang membutuhkan.`,
        parseMode: 'Markdown'
      });

      return NextResponse.json({ ok: true });
    }

    if (callbackData === 'donation_docs') {
      await answerCallbackQuery(callbackId, 'Mengambil dokumentasi...');
      const text = await getDonationDocumentsText();

      await sendTelegramMessage({
        chatId,
        text,
        parseMode: 'Markdown'
      });

      return NextResponse.json({ ok: true });
    }

    if (callbackData === 'donate_custom') {
      await answerCallbackQuery(callbackId, 'Masukkan nominal bebas...');
      await sendTelegramMessage({
        chatId,
        text:
          `Silakan kirim nominal bebas dengan format:\n\n` +
          `\`/donasi 20000\`\n\n` +
          `Minimal donasi mengikuti pengaturan campaign aktif.`,
        parseMode: 'Markdown'
      });
      return NextResponse.json({ ok: true });
    }

    if (callbackData.startsWith('donate_amount_')) {
      await answerCallbackQuery(callbackId, 'Menyiapkan QRIS donasi...');

      const amount = Number(callbackData.replace('donate_amount_', ''));
      const donation = await createDonationOrder({
        amount,
        chatId,
        telegramUserId: String(from?.id ?? ''),
        username: from?.username ?? ''
      });

      const qrisString = donation.pakasir?.payment?.payment_number;
      if (!qrisString) {
        await sendTelegramMessage({
          chatId,
          text: 'QRIS Pakasir tidak tersedia dari response billing.'
        });
        return NextResponse.json({ ok: true });
      }

      await sendDonationPoster({
        chatId,
        amount,
        orderId: donation.orderId,
        qrisString,
        expiredAt: donation.pakasir?.payment?.expired_at ?? null
      });

      return NextResponse.json({ ok: true });
    }

    if (callbackData.startsWith('support_dev:')) {
      await answerCallbackQuery(callbackId, 'Membuka pilihan donasi...');
      await sendTelegramMessage({
        chatId,
        text:
          `💖 *Support Developer*\n\n` +
          `Pilih nominal yang tersedia atau kirim manual:\n` +
          `contoh: \`/donasi 20000\`\n\n` +
          `Sebagian dana akan disumbangkan kepada yang membutuhkan.`,
        parseMode: 'Markdown',
        replyMarkup: donationAmountKeyboard()
      });
      return NextResponse.json({ ok: true });
    }

    if (callbackData.startsWith('show_overlays:')) {
      await answerCallbackQuery(callbackId, 'Mengambil overlay aktif...');
      const boothId = callbackData.replace('show_overlays:', '');

      const { data: booth } = await admin
        .from('booths')
        .select('id, user_id, name')
        .eq('id', boothId)
        .maybeSingle();

      if (!booth) {
        await sendTelegramMessage({ chatId, text: 'Booth tidak ditemukan.' });
        return NextResponse.json({ ok: true });
      }

      const { data: overlays } = await admin
        .from('overlays')
        .select('label')
        .eq('user_id', booth.user_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      const text =
        overlays && overlays.length > 0
          ? `🎨 Overlay aktif di ${booth.name}\n\n${overlays
            .map((item, index) => `${index + 1}. ${item.label ?? 'Overlay'}`)
            .join('\n')}`
          : 'Belum ada overlay aktif di booth ini.';

      await sendTelegramMessage({ chatId, text });
      return NextResponse.json({ ok: true });
    }

    if (callbackData.startsWith('show_location:')) {
      await answerCallbackQuery(callbackId, 'Mengambil lokasi booth...');
      const boothId = callbackData.replace('show_location:', '');

      const { data: booth } = await admin
        .from('booths')
        .select('name, location_name, location_address, location_lat, location_lng, location_notes')
        .eq('id', boothId)
        .maybeSingle();

      if (!booth) {
        await sendTelegramMessage({ chatId, text: 'Data lokasi booth tidak ditemukan.' });
        return NextResponse.json({ ok: true });
      }

      const lat = Number(booth.location_lat ?? 0);
      const lng = Number(booth.location_lng ?? 0);

      if (lat && lng) {
        await sendTelegramLocation(chatId, lat, lng);
      }

      const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : '-';

      await sendTelegramMessage({
        chatId,
        text:
          `📍 Lokasi Booth\n\n` +
          `Booth: ${booth.name ?? '-'}\n` +
          `Nama lokasi: ${booth.location_name ?? '-'}\n` +
          `Alamat: ${booth.location_address ?? '-'}\n` +
          `Catatan: ${booth.location_notes ?? '-'}\n` +
          `Maps: ${mapsUrl}`
      });

      return NextResponse.json({ ok: true });
    }

    if (callbackData === 'show_help') {
      await answerCallbackQuery(callbackId, 'Membuka bantuan...');
      await sendTelegramMessage({
        chatId,
        text:
          `❓ *Bantuan KoGraph Studio*\n\n` +
          `• Gunakan /start KODE_UNIK untuk mengambil hasil booth\n` +
          `• Gunakan /donasi 20000 untuk donasi nominal bebas\n` +
          `• Gunakan menu untuk melihat overlay, lokasi, progress, dan dokumentasi`,
        parseMode: 'Markdown'
      });

      return NextResponse.json({ ok: true });
    }

    await answerCallbackQuery(callbackId);
    return NextResponse.json({ ok: true });
  }

  const messageText = String(payload?.message?.text ?? '');
  const chatId = String(payload?.message?.chat?.id ?? '');
  const from = payload?.message?.from;

  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  const donationAmount = parseDonationAmount(messageText);
  if (donationAmount) {
    try {
      const donation = await createDonationOrder({
        amount: donationAmount,
        chatId,
        telegramUserId: String(from?.id ?? ''),
        username: from?.username ?? ''
      });

      const qrisString = donation.pakasir?.payment?.payment_number;
      if (!qrisString) {
        await sendTelegramMessage({
          chatId,
          text: 'QRIS Pakasir tidak tersedia dari response billing.'
        });
        return NextResponse.json({ ok: true });
      }

      await sendDonationPoster({
        chatId,
        amount: donationAmount,
        orderId: donation.orderId,
        qrisString,
        expiredAt: donation.pakasir?.payment?.expired_at ?? null
      });
    } catch (error) {
      await sendTelegramMessage({
        chatId,
        text: error instanceof Error ? error.message : 'Gagal membuat donasi QRIS.'
      });
    }

    return NextResponse.json({ ok: true });
  }

  const code = parseStartCode(messageText);

  if (!code) {
    await sendTelegramMessage({
      chatId,
      text:
        `Selamat datang di KoGraph Studio Bot.\n\n` +
        `• Gunakan /start KODE_UNIK untuk mengambil hasil booth\n` +
        `• Gunakan /donasi 20000 untuk donasi nominal bebas\n` +
        `• Atau pilih menu di bawah`,
      replyMarkup: mainMenuKeyboard()
    });

    return NextResponse.json({ ok: true });
  }

  const { data: session } = await admin
    .from('sessions')
    .select('id, session_code, final_bucket_id, final_storage_path, telegram_claim_chat_id, booth_id')
    .eq('session_code', code)
    .maybeSingle();

  if (!session) {
    await sendTelegramMessage({
      chatId,
      text: 'Kode sesi tidak ditemukan atau sudah tidak aktif.'
    });
    return NextResponse.json({ ok: true });
  }

  const claimedBy = session.telegram_claim_chat_id ? String(session.telegram_claim_chat_id) : null;
  if (claimedBy && claimedBy !== chatId) {
    await sendTelegramMessage({
      chatId,
      text: 'Maaf, sesi ini sudah diklaim oleh pengguna Telegram lain.'
    });
    return NextResponse.json({ ok: true });
  }

  if (!claimedBy) {
    await admin
      .from('sessions')
      .update({ telegram_claim_chat_id: chatId })
      .eq('id', session.id);
  }

  const { data: booth } = await admin
    .from('booths')
    .select('id, name')
    .eq('id', session.booth_id)
    .maybeSingle();

  const loading = await sendTelegramMessage({
    chatId,
    text: 'Loading'
  });

  const loadingMessageId = Number(loading.result?.message_id ?? 0);
  const frames = ['Loading', 'Loading.', 'Loading..', 'Loading...'];
  let frameIndex = 0;

  const timer = setInterval(async () => {
    try {
      frameIndex = (frameIndex + 1) % frames.length;
      await editTelegramMessage({
        chatId,
        messageId: loadingMessageId,
        text: frames[frameIndex]
      });
      await sendChatAction(chatId, 'upload_document');
    } catch {
      // ignore
    }
  }, 650);

  try {
    const { data: signed } = await admin.storage
      .from(session.final_bucket_id)
      .createSignedUrl(session.final_storage_path, 60 * 5);

    if (!signed?.signedUrl) {
      throw new Error('Signed URL generation failed');
    }

    clearInterval(timer);

    try {
      await deleteTelegramMessage(chatId, loadingMessageId);
    } catch {
      // ignore
    }

    await sendTelegramDocument({
      chatId,
      fileUrl: signed.signedUrl,
      caption: `✨ Hasil fotomu dari KoGraph Studio sudah siap.\nSession: ${session.session_code}`,
      replyMarkup: sessionKeyboard(String(booth?.id ?? session.booth_id ?? ''))
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    clearInterval(timer);

    try {
      await editTelegramMessage({
        chatId,
        messageId: loadingMessageId,
        text: 'Maaf, hasil foto belum bisa dikirim saat ini. Coba lagi beberapa saat.'
      });
    } catch {
      // ignore
    }

    console.error('Telegram delivery error:', error);
    return NextResponse.json({ ok: true });
  }
}