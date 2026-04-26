'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clientEnv } from '@/lib/env.client';

type BoothRuntimeStatus = {
  ok: boolean;
  runtime_mode: string;
  camera_mode: string;
  camera_ready: boolean;
  battery_percent: number | null;
  printer_ready: boolean;
  printer_queue: number;
  voice_ready: boolean;
  ai_ready: boolean;
  message: string;
};

type VoiceResponse = {
  ok: boolean;
  intent: string;
  target: string | null;
  action:
    | 'upscale_hd'
    | 'change_background'
    | 'style_anime'
    | 'decorate_face'
    | 'apply_filter'
    | 'print_now'
    | 'send_whatsapp'
    | 'unknown';
  reply: string;
  payload: Record<string, unknown>;
};

type AiProgress = {
  jobId?: string | null;
  progress: number;
  message: string;
};

export function useBoothAiRuntime() {
  const baseUrl = useMemo(() => clientEnv.NEXT_PUBLIC_BOOTH_API_BASE_URL.replace(/\/$/, ''), []);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [status, setStatus] = useState<BoothRuntimeStatus | null>(null);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState<AiProgress | null>(null);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(`${baseUrl}/api/booth/status`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Gagal membaca status booth runtime.');
    const payload = (await response.json()) as BoothRuntimeStatus;
    setStatus(payload);
    return payload;
  }, [baseUrl]);

  const sendVoiceCommand = useCallback(
    async (command: string, boothId?: string, sessionCode?: string) => {
      const response = await fetch(`${baseUrl}/api/booth/voice/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, booth_id: boothId, session_code: sessionCode })
      });

      if (!response.ok) throw new Error('Gagal memproses perintah suara.');
      const payload = (await response.json()) as VoiceResponse;
      setAssistantReply(payload.reply);
      return payload;
    },
    [baseUrl]
  );

  const startHdProgress = useCallback(
    (jobId = `hd-${Date.now()}`) => {
      eventSourceRef.current?.close();
      setIsAiBusy(true);
      setAiProgress({ jobId, progress: 0, message: 'Menyiapkan HD foto.' });

      const source = new EventSource(`${baseUrl}/api/booth/ai/upscale-stream?job_id=${encodeURIComponent(jobId)}`);
      eventSourceRef.current = source;

      const handlePayload = (event: MessageEvent<string>) => {
        const payload = JSON.parse(event.data) as AiProgress;
        setAiProgress(payload);
        if (payload.message) setAssistantReply(payload.message);
      };

      source.addEventListener('start', handlePayload);
      source.addEventListener('progress', handlePayload);
      source.addEventListener('done', (event) => {
        handlePayload(event as MessageEvent<string>);
        setIsAiBusy(false);
        source.close();
        eventSourceRef.current = null;
      });

      source.onerror = () => {
        setIsAiBusy(false);
        setAssistantReply('Koneksi proses HD terputus. Coba ulangi sekali lagi ya.');
        source.close();
        eventSourceRef.current = null;
      };
    },
    [baseUrl]
  );

  useEffect(() => {
    void refreshStatus().catch(() => undefined);
    return () => eventSourceRef.current?.close();
  }, [refreshStatus]);

  return {
    status,
    isAiBusy,
    aiProgress,
    assistantReply,
    refreshStatus,
    sendVoiceCommand,
    startHdProgress
  };
}
