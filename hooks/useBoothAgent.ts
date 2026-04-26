'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type BoothAgentEvent,
  type PhotoFilter,
  animePhoto,
  applyPhotoFilter,
  createBoothAgentWebSocket,
  decorateFace,
  imageSourceToDataUrl,
  replacePhotoBackground,
  sendAfterCapture,
  sendVoiceCommand,
  upscalePhoto
} from '@/lib/booth/python-ai';

type AgentStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type RunOptions = {
  imageSource: string;
  onImageResult: (imageDataUrl: string) => void;
};

export function useBoothAgent() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const [status, setStatus] = useState<AgentStatus>('connecting');
  const [message, setMessage] = useState<string | null>(null);
  const [aiJob, setAiJob] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<BoothAgentEvent | null>(null);

  const connect = useCallback(() => {
    try {
      setStatus('connecting');

      const ws = createBoothAgentWebSocket();
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        setMessage('Booth Agent realtime connected.');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as BoothAgentEvent;
          setLastEvent(data);

          if (data.type === 'ready') {
            setStatus('connected');
            setMessage(data.payload.message);
          }

          if (data.type === 'voice.heard') {
            setMessage(`Voice: ${data.payload.text}`);
          }

          if (data.type === 'voice.reply') {
            setMessage(data.payload.message);
          }

          if (data.type === 'ai.started') {
            setAiJob(data.payload.job);
            setAiProgress(data.payload.percent);
            setAiMessage(data.payload.message);
          }

          if (data.type === 'ai.progress') {
            setAiJob(data.payload.job);
            setAiProgress(data.payload.percent);
            setAiMessage(data.payload.message);
          }

          if (data.type === 'ai.done') {
            setAiJob(data.payload.job);
            setAiProgress(100);
            setAiMessage(data.payload.message);
          }

          if (data.type === 'ai.error') {
            setAiJob(null);
            setAiProgress(0);
            setAiMessage(data.payload.message);
            setMessage(data.payload.message);
          }
        } catch {
          // ignore invalid WS payload
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setMessage('Booth Agent connection error.');
      };

      ws.onclose = () => {
        setStatus('disconnected');

        reconnectTimerRef.current = window.setTimeout(() => {
          connect();
        }, 2500);
      };
    } catch {
      setStatus('error');
      setMessage('Booth Agent tidak bisa dihubungkan.');
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      wsRef.current?.close();
    };
  }, [connect]);

  const finishLater = useCallback(() => {
    window.setTimeout(() => {
      setAiJob(null);
      setAiProgress(0);
      setAiMessage(null);
    }, 900);
  }, []);

  const runUpscale = useCallback(
    async ({ imageSource, onImageResult }: RunOptions) => {
      const dataUrl = await imageSourceToDataUrl(imageSource);
      const result = await upscalePhoto(dataUrl);
      onImageResult(result);
      finishLater();
    },
    [finishLater]
  );

  const runFilter = useCallback(
    async ({ imageSource, onImageResult }: RunOptions, filter: PhotoFilter) => {
      const dataUrl = await imageSourceToDataUrl(imageSource);
      const result = await applyPhotoFilter(dataUrl, filter);
      onImageResult(result);
      finishLater();
    },
    [finishLater]
  );

  const runBackground = useCallback(
    async ({ imageSource, onImageResult }: RunOptions, background: string) => {
      const dataUrl = await imageSourceToDataUrl(imageSource);
      const result = await replacePhotoBackground(dataUrl, background);
      onImageResult(result);
      finishLater();
    },
    [finishLater]
  );

  const runAnime = useCallback(
    async ({ imageSource, onImageResult }: RunOptions) => {
      const dataUrl = await imageSourceToDataUrl(imageSource);
      const result = await animePhoto(dataUrl);
      onImageResult(result);
      finishLater();
    },
    [finishLater]
  );

  const runDecorateFace = useCallback(
    async ({ imageSource, onImageResult }: RunOptions) => {
      const dataUrl = await imageSourceToDataUrl(imageSource);
      const result = await decorateFace(dataUrl);
      onImageResult(result);
      finishLater();
    },
    [finishLater]
  );

  const afterCapture = useCallback(async () => {
    const response = await sendAfterCapture();
    setMessage(response.message);
  }, []);

  const executeVoiceText = useCallback(
    async ({
      text,
      imageSource,
      onImageResult,
      onPrint,
      onWhatsapp
    }: {
      text: string;
      imageSource?: string | null;
      onImageResult?: (imageDataUrl: string) => void;
      onPrint?: () => void;
      onWhatsapp?: (phone: string) => void;
    }) => {
      const dataUrl = imageSource ? await imageSourceToDataUrl(imageSource) : null;
      const parsed = await sendVoiceCommand(text, dataUrl);

      setMessage(parsed.message);

      if (!dataUrl || !onImageResult) {
        return;
      }

      if (parsed.command === 'upscale') {
        const result = await upscalePhoto(dataUrl);
        onImageResult(result);
        finishLater();
      }

      if (parsed.command === 'filter') {
        const result = await applyPhotoFilter(dataUrl, parsed.filter ?? 'clean');
        onImageResult(result);
        finishLater();
      }

      if (parsed.command === 'background') {
        const result = await replacePhotoBackground(dataUrl, parsed.background ?? 'pantai');
        onImageResult(result);
        finishLater();
      }

      if (parsed.command === 'anime') {
        const result = await animePhoto(dataUrl);
        onImageResult(result);
        finishLater();
      }

      if (parsed.command === 'face_accessory') {
        const result = await decorateFace(dataUrl);
        onImageResult(result);
        finishLater();
      }

      if (parsed.command === 'print_now') {
        onPrint?.();
      }

      if (parsed.command === 'delivery_whatsapp' && parsed.phone) {
        onWhatsapp?.(parsed.phone);
      }
    },
    [finishLater]
  );

  return {
    status,
    message,
    aiJob,
    aiProgress,
    aiMessage,
    lastEvent,
    isConnected: status === 'connected',
    runUpscale,
    runFilter,
    runBackground,
    runAnime,
    runDecorateFace,
    afterCapture,
    executeVoiceText,
    setMessage
  };
}