"use client";

import { useEffect, useState } from "react";
import { Loader2, Play, Volume2 } from "lucide-react";

export interface CartesiaVoiceOption {
  id: string;
  name: string;
  gender: string;
  accent: string;
  description: string;
  preview_url: string;
}

interface CartesiaVoicePickerProps {
  language: string;
  value: string;
  onChange: (voiceId: string) => void;
}

function languageKey(language: string): string {
  return language.split(/[-_]/)[0]?.toLowerCase() || "hi";
}

export function CartesiaVoicePicker({ language, value, onChange }: CartesiaVoicePickerProps) {
  const [voices, setVoices] = useState<CartesiaVoiceOption[]>([]);
  const [loadedLanguage, setLoadedLanguage] = useState<string | null>(null);
  const [error, setError] = useState<{ language: string; message: string } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const loading = loadedLanguage !== language;
  const visibleError = error?.language === language ? error.message : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/voices?language=${encodeURIComponent(language)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load Cartesia voices");
        const options = Array.isArray(data.voices) ? data.voices as CartesiaVoiceOption[] : [];
        setVoices(options);
        setLoadedLanguage(language);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError({ language, message: cause instanceof Error ? cause.message : "Unable to load Cartesia voices" });
        setLoadedLanguage(language);
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedLanguage(language); });
    return () => controller.abort();
  }, [language]);

  const selectedVoice = voices.find((voice) => voice.id === value);
  const languageCode = languageKey(language);

  async function previewVoice(voice: CartesiaVoiceOption) {
    setPlayingId(voice.id);
    try {
      const audio = new Audio(voice.preview_url);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => { setPlayingId(null); setError({ language, message: "Voice preview failed. Check the Cartesia API key and voice language." }); };
      await audio.play();
    } catch {
      setPlayingId(null);
      setError({ language, message: "Voice preview could not be played." });
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-blue-600" />
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Choose agent voice</h3>
          <p className="text-xs text-slate-500">Cartesia voices for {languageCode.toUpperCase()}; preview before saving.</p>
        </div>
        {loading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-slate-400" />}
      </div>
      {visibleError && <p role="alert" className="text-xs text-red-600">{visibleError}</p>}
      {!loading && voices.length === 0 && <p className="text-xs text-slate-500">No voices found. Check your Cartesia credentials.</p>}
      {(voices.length > 0 || value) && (
        <div className="space-y-2">
          <select
            aria-label="Cartesia voice"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {!selectedVoice && value && <option value={value}>Current voice · {value}</option>}
            {!selectedVoice && !value && <option value="">Choose a voice</option>}
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.name} · {voice.accent}</option>
            ))}
          </select>
          {selectedVoice && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">{selectedVoice.description}</p>
              <button type="button" onClick={() => void previewVoice(selectedVoice)} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" aria-label={`Preview ${selectedVoice.name}`}>
                {playingId === selectedVoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Preview
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
