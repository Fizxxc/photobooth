import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';
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

function buildSessionKeyboard(boothId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: '💖 Support Developer', callback_data: `support_dev:${boothId}` },
        { text: '🎨 Lihat Overlay', callback_data: `show_overlays:${boothId}` }
      ],
      [
        { text: '📍 Lokasi Booth', callback_data: `show_location:${boothId}` },
        { text: '❓ Bantuan', callback_data: `show_help:${boothId}` }
      ]
    ]
  };
}

function parseStartCode(messageText: string) {
  const trimmed = messageText.trim();
  if (!trimmed.startsWith('/start')) return null;

  const parts = trimmed.split(' ');
  return parts[1]?.trim() || null;
}

function buildLoadingFrames() {
  return ['Loading', 'Loading.', 'Loading..', 'Loading...'];
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

  if (error) {
    throw new Error(error.message);
  }

  return data;
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
    'PAKASIR_PROJECT_SLUG',
    'PAKASIR_API_KEY'
  ]);

  const payload = await request.json();
  const admin = createSupabaseAdminClient();

  /**
   * CALLBACK QUERY
   */
  if (payload?.callback_query) {
    const callbackId = String(payload.callback_query.id ?? '');
    const callbackData = String(payload.callback_query.data ?? '');
    const chatId = payload.callback_query.message?.chat?.id;

    if (!callbackId || !callbackData || !chatId) {
      return NextResponse.json({ ok: true });
    }

    const [action, boothId] = callbackData.split(':');

    if (action === 'support_dev') {
      await answerCallbackQuery(callbackId, 'Menyiapkan QRIS support developer...');

      const template = await getActiveSupportTemplate();

      if (!template) {
        await sendTelegramMessage(chatId, 'Template QRIS support developer belum tersedia.');
        return NextResponse.json({ ok: true });
      }

      const amount = serverEnv.SUPPORT_DEVELOPER_DEFAULT_AMOUNT;
      const orderId = `KGS-SUPPORT-${Date.now()}-${String(chatId).slice(-6)}`;

      const pakasir = await createPakasirQrisTransaction({
        orderId,
        amount
      });

      const qrString = pakasir?.payment?.payment_number;
      if (!qrString) {
        await sendTelegramMessage(chatId, 'QRIS Pakasir tidak tersedia dari response billing.');
        return NextResponse.json({ ok: true });
      }

      const { data: templateBlob, error: downloadError } = await admin.storage
        .from(template.bucket_id)
        .download(template.storage_path);

      if (downloadError || !templateBlob) {
        await sendTelegramMessage(chatId, 'Gagal mengambil template QRIS support.');
        return NextResponse.json({ ok: true });
      }

      const templateBuffer = Buffer.from(await templateBlob.arrayBuffer());
      const posterBuffer = await buildSupportQrisPoster({
        templateBuffer,
        qrisString: qrString
      });

      await admin.from('pakasir_orders').insert({
        user_id: null,
        order_id: orderId,
        purpose: 'donation',
        amount,
        platform_fee: serverEnv.PAKASIR_PLATFORM_FEE,
        status: 'pending',
        raw_payload: {
          source: 'telegram_support_developer',
          pakasir_payment: pakasir.payment,
          booth_id: boothId
        }
      });

      const posterBytes = new Uint8Array(posterBuffer);
      const posterBlob = new Blob([posterBytes], { type: 'image/png' });

      await sendTelegramPhoto(
        {
          chatId,
          photo: posterBlob,
          caption:
            `💖 Support Developer\n\n` +
            `Scan QRIS Pakasir ini untuk mendukung pengembangan KoGraph Studio.\n` +
            `Nominal: Rp ${amount.toLocaleString('id-ID')}\n` +
            `Expired: ${pakasir.payment?.expired_at ?? '-'}`
        }
      );

      return NextResponse.json({ ok: true });
    }

    if (action === 'show_overlays') {
      await answerCallbackQuery(callbackId, 'Menampilkan overlay aktif...');

      const { data: booth } = await admin
        .from('booths')
        .select('id, user_id, name')
        .eq('id', boothId)
        .maybeSingle();

      if (!booth) {
        await sendTelegramMessage(chatId, 'Booth tidak ditemukan.');
        return NextResponse.json({ ok: true });
      }

      const { data: overlays } = await admin
        .from('overlays')
        .select('label')
        .eq('user_id', booth.user_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!overlays || overlays.length === 0) {
        await sendTelegramMessage(chatId, 'Belum ada overlay aktif di booth ini.');
        return NextResponse.json({ ok: true });
      }

      const text =
        `🎨 Overlay aktif di ${booth.name}\n\n` +
        overlays.map((item, index) => `${index + 1}. ${item.label ?? 'Overlay'}`).join('\n');

      await sendTelegramMessage(chatId, text);
      return NextResponse.json({ ok: true });
    }

    if (action === 'show_location') {
      await answerCallbackQuery(callbackId, 'Menampilkan lokasi booth...');

      const { data: booth } = await admin
        .from('booths')
        .select('name, location_name, location_address, location_lat, location_lng, location_notes')
        .eq('id', boothId)
        .maybeSingle();

      if (!booth) {
        await sendTelegramMessage(chatId, 'Data lokasi booth tidak ditemukan.');
        return NextResponse.json({ ok: true });
      }

      const lat = Number(booth.location_lat ?? 0);
      const lng = Number(booth.location_lng ?? 0);

      if (lat && lng) {
        await sendTelegramLocation(chatId, lat, lng);
      }

      const mapsUrl = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : '-';

      const locationText =
        `📍 Lokasi Booth\n\n` +
        `Booth: ${booth.name ?? '-'}\n` +
        `Nama lokasi: ${booth.location_name ?? '-'}\n` +
        `Alamat: ${booth.location_address ?? '-'}\n` +
        `Catatan: ${booth.location_notes ?? '-'}\n` +
        `Maps: ${mapsUrl}`;

      await sendTelegramMessage(chatId, locationText);
      return NextResponse.json({ ok: true });
    }

    if (action === 'show_help') {
      await answerCallbackQuery(callbackId, 'Membuka bantuan...');

      await sendTelegramMessage(
        chatId,
        `❓ Bantuan KoGraph Studio\n\n` +
        `• Gunakan /start KODE_UNIK untuk mengambil hasil sesi.\n` +
        `• Gunakan tombol Support Developer untuk membuka QRIS dukungan.\n` +
        `• Gunakan tombol Lihat Overlay untuk melihat overlay aktif.\n` +
        `• Gunakan tombol Lokasi Booth untuk melihat titik booth.\n`
      );

      return NextResponse.json({ ok: true });
    }

    await answerCallbackQuery(callbackId);
    return NextResponse.json({ ok: true });
  }

  /**
   * MESSAGE /START
   */
  const messageText = String(payload?.message?.text ?? '');
  const chatId = payload?.message?.chat?.id;

  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  const code = parseStartCode(messageText);

  if (!code) {
    await sendTelegramMessage(
      chatId,
      `Selamat datang di KoGraph Studio Bot.\n\n` +
      `Kirim /start KODE_UNIK untuk mengambil hasil fotomu dari booth.`
    );
    return NextResponse.json({ ok: true });
  }

  const { data: session } = await admin
    .from('sessions')
    .select('id, session_code, final_bucket_id, final_storage_path, telegram_claim_chat_id, booth_id')
    .eq('session_code', code)
    .maybeSingle();

  if (!session) {
    await sendTelegramMessage(chatId, 'Kode sesi tidak ditemukan atau sudah tidak aktif.');
    return NextResponse.json({ ok: true });
  }

  const claimedBy = session.telegram_claim_chat_id ? String(session.telegram_claim_chat_id) : null;
  const incomingChatId = String(chatId);

  if (claimedBy && claimedBy !== incomingChatId) {
    await sendTelegramMessage(
      chatId,
      'Maaf, sesi ini sudah diklaim oleh pengguna Telegram lain.'
    );
    return NextResponse.json({ ok: true });
  }

  if (!claimedBy) {
    await admin
      .from('sessions')
      .update({ telegram_claim_chat_id: incomingChatId })
      .eq('id', session.id);
  }

  const { data: booth } = await admin
    .from('booths')
    .select('id, name')
    .eq('id', session.booth_id)
    .maybeSingle();

  const loading = await sendTelegramMessage(chatId, 'Loading');
  const loadingMessageId = Number(loading?.result?.message_id);

  const frames = buildLoadingFrames();
  let frameIndex = 0;

  const timer = setInterval(async () => {
    try {
      frameIndex = (frameIndex + 1) % frames.length;
      await editTelegramMessage(chatId, loadingMessageId, frames[frameIndex]);
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

    await sendTelegramDocument(
      chatId,
      signed.signedUrl,
      `✨ Hasil fotomu dari KoGraph Studio sudah siap.\nSession: ${session.session_code}`,
      buildSessionKeyboard(String(booth?.id ?? session.booth_id ?? ''))
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    clearInterval(timer);

    try {
      await editTelegramMessage(
        chatId,
        loadingMessageId,
        'Maaf, hasil foto belum bisa dikirim saat ini. Coba lagi beberapa saat.'
      );
    } catch {
      // ignore
    }

    console.error('Telegram delivery error:', error);
    return NextResponse.json({ ok: true });
  }
}