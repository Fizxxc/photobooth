'use client';

import { useState } from 'react';
import { Loader2, Mic, Sparkles, Wand2 } from 'lucide-react';
import { useBoothAiRuntime } from '@/hooks/useBoothAiRuntime';

type Props = {
  boothId: string;
  sessionCode?: string | null;
  onFilter?: (filterName: 'clean' | 'vintage' | 'bw') => void;
  onPrint?: () => void;
};

export function BoothAiAssistantPanel({ boothId, sessionCode, onFilter, onPrint }: Props) {
  const { status, isAiBusy, aiProgress, assistantReply, sendVoiceCommand, startHdProgress } = useBoothAiRuntime();
  const [command, setCommand] = useState('');
  const [isListening, setIsListening] = useState(false);

  async function runCommand(text: string) {
    const clean = text.trim();
    if (!clean) return;

    const result = await sendVoiceCommand(clean, boothId, sessionCode ?? undefined);

    if (result.action === 'upscale_hd') startHdProgress(sessionCode ?? undefined);
    if (result.action === 'apply_filter') onFilter?.((result.target as 'clean' | 'vintage' | 'bw') ?? 'clean');
    if (result.action === 'print_now') onPrint?.();

    setCommand('');
  }

  function startBrowserSpeech() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      void runCommand(command || 'jadikan hd');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      setCommand(transcript);
      void runCommand(transcript);
    };

    recognition.start();
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4 text-white backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">AI Assistant</p>
          <h3 className="mt-1 text-lg font-semibold">Asisten Pintar</h3>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/60">
          {status?.ai_ready ? 'Ready' : 'Offline'}
        </span>
      </div>

      {isAiBusy ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-white/80">
              <Loader2 className="h-4 w-4 animate-spin" /> HD Processing
            </span>
            <span className="font-semibold">{aiProgress?.progress ?? 0}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${aiProgress?.progress ?? 0}%` }} />
          </div>
          <p className="mt-3 text-xs leading-5 text-white/55">{aiProgress?.message}</p>
        </div>
      ) : null}

      {assistantReply ? <p className="mt-4 text-sm leading-6 text-white/70">“{assistantReply}”</p> : null}

      <div className="mt-4 flex gap-2">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void runCommand(command);
          }}
          placeholder="Contoh: Jadikan HD"
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-white/35"
        />
        <button
          type="button"
          onClick={startBrowserSpeech}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-black"
          aria-label="Mulai perintah suara"
        >
          <Mic className={`h-4 w-4 ${isListening ? 'animate-pulse' : ''}`} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => startHdProgress(sessionCode ?? undefined)} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10">
          <Wand2 className="h-3.5 w-3.5" /> HD FOTO
        </button>
        <button type="button" onClick={() => void runCommand('filter clean')} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10">
          <Sparkles className="h-3.5 w-3.5" /> Clean
        </button>
      </div>
    </section>
  );
}
