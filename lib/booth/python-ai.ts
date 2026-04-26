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

type ApiResponseWithImage = {
  ok: boolean;
  imageDataUrl: string;
  message?: string;
};

type VoiceCommandResponse = {
  ok: boolean;
  command: string;
  message: string;
  filter?: PhotoFilter;
  background?: string;
  phone?: string;
};

function getApiBaseUrl() {
  return clientEnv.NEXT_PUBLIC_BOOTH_API_BASE_URL.replace(/\/$/, '');
}

async function requestBoothApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store'
  });

  let payload: unknown = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = payload as { detail?: string; error?: string; message?: string } | null;

    throw new Error(
      errorPayload?.detail ??
        errorPayload?.error ??
        errorPayload?.message ??
        'Booth Python API error.'
    );
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

  const response = await fetch(source, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('Gagal mengambil image source.');
  }

  const blob = await response.blob();

  return blobToDataUrl(blob);
}

export async function getBoothAgentStatus() {
  return requestBoothApi<{
    ok: boolean;
    status: Record<string, unknown>;
  }>('/api/booth/status');
}

export async function upscalePhoto(imageDataUrl: string) {
  const response = await requestBoothApi<ApiResponseWithImage>('/api/booth/ai/upscale', {
    imageDataUrl
  });

  return response.imageDataUrl;
}

export async function applyPhotoFilter(imageDataUrl: string, filter: PhotoFilter) {
  const response = await requestBoothApi<ApiResponseWithImage & { filter?: PhotoFilter }>(
    '/api/booth/ai/filter',
    {
      imageDataUrl,
      filter
    }
  );

  return response.imageDataUrl;
}

export async function replacePhotoBackground(imageDataUrl: string, background: string) {
  const response = await requestBoothApi<ApiResponseWithImage & { background?: string }>(
    '/api/booth/ai/background',
    {
      imageDataUrl,
      background
    }
  );

  return response.imageDataUrl;
}

export async function animePhoto(imageDataUrl: string) {
  const response = await requestBoothApi<ApiResponseWithImage>('/api/booth/ai/anime', {
    imageDataUrl
  });

  return response.imageDataUrl;
}

export async function decorateFace(imageDataUrl: string) {
  const response = await requestBoothApi<ApiResponseWithImage>('/api/booth/ai/face-accessory', {
    imageDataUrl
  });

  return response.imageDataUrl;
}

export async function sendVoiceCommand(text: string, imageDataUrl?: string | null) {
  return requestBoothApi<VoiceCommandResponse>('/api/booth/voice/command', {
    text,
    imageDataUrl: imageDataUrl ?? null
  });
}

export async function sendAfterCapture() {
  return requestBoothApi<{
    ok: boolean;
    message: string;
    offers?: string[];
  }>('/api/booth/voice/after-capture', {});
}

/**
 * Vercel-only mode:
 * WebSocket lokal tidak dipakai.
 * Function ini tetap disediakan supaya import lama dari useBoothAgent.ts tidak bikin build error.
 */
export function createBoothAgentWebSocket() {
  const baseUrl = getApiBaseUrl();
  const wsUrl = baseUrl.replace(/^http/, 'ws');

  return new WebSocket(`${wsUrl}/api/booth/ws`);
}