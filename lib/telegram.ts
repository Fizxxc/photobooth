import 'server-only';
import { requireServerEnv } from '@/lib/env.server';

export function buildTelegramDeepLink(code: string) {
  const serverEnv = requireServerEnv(['TELEGRAM_BOT_USERNAME']);
  return `https://t.me/${serverEnv.TELEGRAM_BOT_USERNAME}?start=${code}`;
}

export async function sendTelegramDocument(chatId: string | number, fileUrl: string, caption?: string) {
  const serverEnv = requireServerEnv(['TELEGRAM_BOT_TOKEN']);
  const response = await fetch(`https://api.telegram.org/bot${serverEnv.TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, document: fileUrl, caption })
  });
  if (!response.ok) throw new Error(`Telegram sendDocument failed: ${response.status}`);
  return await response.json();
}
