import 'server-only';

import { getServerEnv, requireServerEnv } from '@/lib/env.server';

type TelegramPrimitive = string | number;

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type TelegramReplyMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

type SendTelegramPhotoInput = {
  chatId: TelegramPrimitive;
  photo: Blob | File;
  caption?: string;
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

  return payload as any;
}

export function buildTelegramDeepLink(code: string) {
  const serverEnv = requireServerEnv(['TELEGRAM_BOT_USERNAME']);
  return `https://t.me/${serverEnv.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(code)}`;
}

export async function sendTelegramMessage(
  chatId: TelegramPrimitive,
  text: string,
  replyMarkup?: TelegramReplyMarkup
) {
  const response = await fetch(telegramApi('/sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: replyMarkup
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function editTelegramMessage(
  chatId: TelegramPrimitive,
  messageId: number,
  text: string,
  replyMarkup?: TelegramReplyMarkup
) {
  const response = await fetch(telegramApi('/editMessageText'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function deleteTelegramMessage(chatId: TelegramPrimitive, messageId: number) {
  const response = await fetch(telegramApi('/deleteMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function sendChatAction(
  chatId: TelegramPrimitive,
  action:
    | 'typing'
    | 'upload_photo'
    | 'record_video'
    | 'upload_video'
    | 'record_voice'
    | 'upload_voice'
    | 'upload_document'
    | 'choose_sticker'
    | 'find_location'
    | 'record_video_note'
    | 'upload_video_note'
) {
  const response = await fetch(telegramApi('/sendChatAction'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function sendTelegramDocument(
  chatId: TelegramPrimitive,
  fileUrl: string,
  caption?: string,
  replyMarkup?: TelegramReplyMarkup
) {
  const response = await fetch(telegramApi('/sendDocument'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      caption,
      reply_markup: replyMarkup
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function sendTelegramPhotoUrl(
  chatId: TelegramPrimitive,
  photoUrl: string,
  caption?: string,
  replyMarkup?: TelegramReplyMarkup
) {
  const response = await fetch(telegramApi('/sendPhoto'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      reply_markup: replyMarkup
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

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
  form.set('photo', photo, 'telegram-image.png');

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

export async function sendTelegramLocation(
  chatId: TelegramPrimitive,
  latitude: number,
  longitude: number
) {
  const response = await fetch(telegramApi('/sendLocation'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      latitude,
      longitude
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false
) {
  const response = await fetch(telegramApi('/answerCallbackQuery'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    }),
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

  const payload = await parseTelegramResponse(response);
  return payload?.result ?? null;
}

export async function setTelegramWebhook(webhookUrl: string, secretToken?: string) {
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query']
  };

  if (secretToken) {
    body.secret_token = secretToken;
  }

  const response = await fetch(telegramApi('/setWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}

export async function deleteTelegramWebhook() {
  const response = await fetch(telegramApi('/deleteWebhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      drop_pending_updates: false
    }),
    cache: 'no-store'
  });

  return await parseTelegramResponse(response);
}