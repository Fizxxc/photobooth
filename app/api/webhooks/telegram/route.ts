import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getServerEnv, requireServerEnv } from '@/lib/env.server';
import { sendTelegramDocument } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  const serverEnv = getServerEnv();
  const secret = request.headers.get('x-telegram-bot-api-secret-token');
  if (!serverEnv.TELEGRAM_WEBHOOK_SECRET || secret !== serverEnv.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
  }

  requireServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN']);
  const payload = await request.json();
  const messageText = String(payload?.message?.text ?? '');
  const chatId = payload?.message?.chat?.id;
  if (!messageText.startsWith('/start ') || !chatId) return NextResponse.json({ ok: true });

  const code = messageText.replace('/start ', '').trim();
  const admin = createSupabaseAdminClient();
  const { data: session } = await admin.from('sessions').select('session_code, final_bucket_id, final_storage_path').eq('session_code', code).maybeSingle();
  if (!session) return NextResponse.json({ ok: true, message: 'Code not found' });

  const { data: signed } = await admin.storage.from(session.final_bucket_id).createSignedUrl(session.final_storage_path, 60 * 5);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Signed URL generation failed' }, { status: 500 });

  await sendTelegramDocument(chatId, signed.signedUrl, `KoGraph Studio session ${session.session_code}`);
  return NextResponse.json({ ok: true });
}
