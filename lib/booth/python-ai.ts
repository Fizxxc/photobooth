export type PhotoFilter = 'clean' | 'vintage' | 'bw';

export type BoothAiResponse = {
  ok: boolean;
  imageDataUrl?: string;
  message?: string;
  error?: string;
  detail?: string;
  filter?: PhotoFilter;
  background?: string;
};

export type VoiceCommandResponse = {
  ok: boolean;
  command: string;
  message: string;
  error?: string;
  filter?: PhotoFilter;
  background?: string;
  phone?: string;
};

export type BoothAgentStatusResponse = {
  ok: boolean;
  status: Record<string, unknown>;
  error?: string;
};

export type AfterCaptureResponse = {
  ok: boolean;
  message: string;
  offers?: string[];
  error?: string;
};

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

function normalizeApiPath(path: string) {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

async function requestBoothApi<T extends { ok?: boolean; error?: string; detail?: string; message?: string }>(
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(normalizeApiPath(path), {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json'
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });

  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || !payload) {
    throw new Error(
      payload?.detail ??
        payload?.error ??
        payload?.message ??
        `Booth API gagal diproses. Status ${response.status}.`
    );
  }

  if (payload.ok === false) {
    throw new Error(payload.detail ?? payload.error ?? payload.message ?? 'Booth API gagal diproses.');
  }

  return payload;
}

function ensureImageResponse(payload: BoothAiResponse) {
  if (!payload.imageDataUrl) {
    throw new Error(payload.error ?? payload.detail ?? payload.message ?? 'Booth API tidak mengembalikan imageDataUrl.');
  }

  return payload.imageDataUrl;
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

    reader.onerror = () => {
      reject(new Error('Gagal membaca image.'));
    };

    reader.readAsDataURL(blob);
  });
}

export async function imageSourceToDataUrl(source: string): Promise<string> {
  if (!source) {
    throw new Error('Image source kosong.');
  }

  if (source.startsWith('data:image/')) {
    return source;
  }

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
  return requestBoothApi<BoothAgentStatusResponse>('/api/booth/status');
}

export async function upscalePhoto(imageDataUrl: string) {
  const response = await requestBoothApi<BoothAiResponse>('/api/booth/ai/upscale', {
    imageDataUrl
  });

  return ensureImageResponse(response);
}

export async function applyPhotoFilter(imageDataUrl: string, filter: PhotoFilter) {
  const response = await requestBoothApi<BoothAiResponse>('/api/booth/ai/filter', {
    imageDataUrl,
    filter
  });

  return ensureImageResponse(response);
}

export async function replacePhotoBackground(imageDataUrl: string, background: string) {
  const response = await requestBoothApi<BoothAiResponse>('/api/booth/ai/background', {
    imageDataUrl,
    background
  });

  return ensureImageResponse(response);
}

export async function animePhoto(imageDataUrl: string) {
  const response = await requestBoothApi<BoothAiResponse>('/api/booth/ai/anime', {
    imageDataUrl
  });

  return ensureImageResponse(response);
}

export async function decorateFace(imageDataUrl: string) {
  const response = await requestBoothApi<BoothAiResponse>('/api/booth/ai/face-accessory', {
    imageDataUrl
  });

  return ensureImageResponse(response);
}

export async function sendVoiceCommand(text: string, imageDataUrl?: string | null) {
  return requestBoothApi<VoiceCommandResponse>('/api/booth/voice/command', {
    text,
    imageDataUrl: imageDataUrl ?? null
  });
}

export async function sendAfterCapture() {
  return requestBoothApi<AfterCaptureResponse>('/api/booth/voice/after-capture', {});
}

/**
 * Alias untuk kompatibilitas kalau ada file lama yang import nama berbeda.
 */
export const changePhotoBackground = replacePhotoBackground;
export const decorateFacePhoto = decorateFace;

/**
 * Vercel mode:
 * WebSocket tidak dipakai di api/index.js.
 * Function ini tetap ada supaya import lama tidak bikin build error.
 */
export function createBoothAgentWebSocket() {
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';

  return new WebSocket(`${protocol}//${host}/api/booth/ws`);
}