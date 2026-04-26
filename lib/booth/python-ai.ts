import { clientEnv } from '@/lib/env.client';

export type PhotoFilter = 'clean' | 'vintage' | 'bw';

export type BoothAgentEvent =
  | {
      type: 'ready';
      payload: {
        message: string;
        realtime: boolean;
      };
    }
  | {
      type: 'status';
      payload: Record<string, unknown>;
    }
  | {
      type: 'voice.heard';
      payload: {
        text: string;
        parsed: Record<string, unknown>;
      };
    }
  | {
      type: 'voice.command';
      payload: {
        text: string;
        parsed: Record<string, unknown>;
      };
    }
  | {
      type: 'voice.reply';
      payload: {
        message: string;
      };
    }
  | {
      type: 'ai.started';
      payload: {
        job: string;
        percent: number;
        message: string;
      };
    }
  | {
      type: 'ai.progress';
      payload: {
        job: string;
        percent: number;
        message: string;
      };
    }
  | {
      type: 'ai.done';
      payload: {
        job: string;
        percent: number;
        imageDataUrl: string;
        message: string;
      };
    }
  | {
      type: 'ai.error';
      payload: {
        job: string;
        message: string;
      };
    }
  | {
      type: string;
      payload: Record<string, unknown>;
    };

async function requestAgent<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${clientEnv.NEXT_PUBLIC_BOOTH_AGENT_HTTP_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.detail ?? 'Booth Agent error.');
  }

  return payload as T;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca image.'));
      }
    };

    reader.onerror = () => reject(new Error('Gagal membaca image.'));
    reader.readAsDataURL(blob);
  });
}

export async function imageSourceToDataUrl(source: string): Promise<string> {
  if (source.startsWith('data:')) return source;

  const response = await fetch(source);
  const blob = await response.blob();

  return blobToDataUrl(blob);
}

export async function getBoothAgentStatus() {
  return requestAgent<{
    ok: boolean;
    status: Record<string, unknown>;
  }>('/api/booth/status');
}

export async function upscalePhoto(imageDataUrl: string) {
  const response = await requestAgent<{
    ok: boolean;
    imageDataUrl: string;
    message: string;
  }>('/api/booth/upscale', { imageDataUrl });

  return response.imageDataUrl;
}

export async function applyPhotoFilter(imageDataUrl: string, filter: PhotoFilter) {
  const response = await requestAgent<{
    ok: boolean;
    imageDataUrl: string;
    filter: PhotoFilter;
    message: string;
  }>('/api/booth/filter', { imageDataUrl, filter });

  return response.imageDataUrl;
}

export async function replacePhotoBackground(imageDataUrl: string, background: string) {
  const response = await requestAgent<{
    ok: boolean;
    imageDataUrl: string;
    background: string;
    message: string;
  }>('/api/booth/background', { imageDataUrl, background });

  return response.imageDataUrl;
}

export async function animePhoto(imageDataUrl: string) {
  const response = await requestAgent<{
    ok: boolean;
    imageDataUrl: string;
    message: string;
  }>('/api/booth/anime', { imageDataUrl });

  return response.imageDataUrl;
}

export async function decorateFace(imageDataUrl: string) {
  const response = await requestAgent<{
    ok: boolean;
    imageDataUrl: string;
    message: string;
  }>('/api/booth/face-accessory', { imageDataUrl });

  return response.imageDataUrl;
}

export async function sendVoiceCommand(text: string, imageDataUrl?: string | null) {
  return requestAgent<{
    ok: boolean;
    command: string;
    message: string;
    filter?: PhotoFilter;
    background?: string;
    phone?: string;
  }>('/api/booth/command', { text, imageDataUrl });
}

export async function sendAfterCapture() {
  return requestAgent<{
    ok: boolean;
    message: string;
    offers: string[];
  }>('/api/booth/after-capture', {});
}

export function createBoothAgentWebSocket() {
  return new WebSocket(clientEnv.NEXT_PUBLIC_BOOTH_AGENT_WS_URL);
}