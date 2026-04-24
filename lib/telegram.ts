import 'server-only';

import { getServerEnv, requireServerEnv } from '@/lib/env.server';

type TelegramPrimitive = string | number;

type SendTelegramPhotoInput = {
  chatId: TelegramPrimitive;
  photo: Blob | File;
  caption?: string;
};

type SendTelegramDocumentInput = {
  chatId: TelegramPrimitive;
  document: Blob | File | string;
  caption?: string;
  filename?: string;
};

function telegramApi(path: string) {
  const serverEnv = requireServerEnv(['TELEGRAM_BOT_TOKEN']);
  return `https://api.telegram.org/bot${serverEnv.TELEGRAM_BOT_TOKEN}${path}`;
}

async function parseTelegramResponse(response: Response) {
  const text = await response.text();

  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(
      `Telegram API request failed (${response.status} ${response.statusText}): ${
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      }`
    );
  }

  return payload;
}

export function buildTelegramDeepLink(code: string) {
  const serverEnv = requireServerEnv(['TELEGRAM_BOT_USERNAME']);
  return `https://t.me/${serverEnv.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

export async function sendTelegramMessage(chatId: TelegramPrimitive, text: string) {
  const response = await fetch(telegramApi('/sendMessage'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

/**
 * Kirim file lewat URL publik / signed URL.
 * Cocok untuk hasil photostrip dari Supabase Storage.
 */
export async function sendTelegramDocument(
  chatId: TelegramPrimitive,
  fileUrl: string,
  caption?: string
) {
  const response = await fetch(telegramApi('/sendDocument'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      caption
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

/**
 * Versi tambahan kalau nanti kamu mau kirim Blob/File langsung
 * tanpa perlu URL.
 */
export async function sendTelegramDocumentFile(input: SendTelegramDocumentInput) {
  const form = new FormData();
  form.set('chat_id', String(input.chatId));

  if (typeof input.document === 'string') {
    form.set('document', input.document);
  } else {
    form.set('document', input.document, input.filename ?? 'document.png');
  }

  if (input.caption) {
    form.set('caption', input.caption);
  }

  const response = await fetch(telegramApi('/sendDocument'), {
    method: 'POST',
    body: form,
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

/**
 * Overload:
 * 1) sendTelegramPhoto(chatId, photo, caption?)
 * 2) sendTelegramPhoto({ chatId, photo, caption })
 */
export async function sendTelegramPhoto(
  chatId: TelegramPrimitive,
  photo: Blob | File,
  caption?: string
): Promise<unknown>;
export async function sendTelegramPhoto(input: SendTelegramPhotoInput): Promise<unknown>;
export async function sendTelegramPhoto(
  arg1: TelegramPrimitive | SendTelegramPhotoInput,
  arg2?: Blob | File,
  arg3?: string
): Promise<unknown> {
  const chatId = typeof arg1 === 'object' ? arg1.chatId : arg1;
  const photo = typeof arg1 === 'object' ? arg1.photo : arg2;
  const caption = typeof arg1 === 'object' ? arg1.caption : arg3;

  if (!photo) {
    throw new Error('Telegram photo is required.');
  }

  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('photo', photo, 'broadcast-image.png');

  if (caption) {
    form.set('caption', caption);
  }

  const response = await fetch(telegramApi('/sendPhoto'), {
    method: 'POST',
    body: form,
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function getTelegramWebhookInfo() {
  const env = getServerEnv();
  if (!env.TELEGRAM_BOT_TOKEN) return null;

  const response = await fetch(telegramApi('/getWebhookInfo'), {
    method: 'GET',
    cache: 'no-store'
  });

  const payload = (await parseTelegramResponse(response)) as {
    result?: unknown;
  };

  return payload?.result ?? null;
}

export async function setTelegramWebhook(webhookUrl: string, secretToken?: string) {
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message']
  };

  if (secretToken) {
    body.secret_token = secretToken;
  }

  const response = await fetch(telegramApi('/setWebhook'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function deleteTelegramWebhook() {
  const response = await fetch(telegramApi('/deleteWebhook'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      drop_pending_updates: false
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}