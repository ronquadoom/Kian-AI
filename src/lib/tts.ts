/**
 * Optional text-to-speech read-back via the browser SpeechSynthesis API,
 * and speech-to-text input via SpeechRecognition, each used only where the
 * browser supports it.
 */

let cachedVoices: SpeechSynthesisVoice[] = [];

function availableVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const list = speechSynthesis.getVoices();
  if (list.length > 0) cachedVoices = list;
  return cachedVoices;
}

export function ttsSupported(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = availableVoices();
  if (voices.length === 0) return undefined;
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  return (en.find((v) => v.default) ?? en[0] ?? voices[0]);
}

export function speak(text: string): void {
  if (!ttsSupported()) return;
  const clean = text
    .replace(/```[\s\S]*?```/g, ' code block omitted. ')
    .replace(/[*_`#>|~-]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return;

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/* --------------------------- Speech-to-text --------------------------- */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

type SRConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognition(): SRConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SRConstructor | undefined;
  return ctor;
}

export function sttSupported(): boolean {
  return getSpeechRecognition() !== undefined;
}

export interface SttHandlers {
  onResult: (transcript: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (error: string) => void;
}

export function createRecognizer(handlers: SttHandlers): SpeechRecognitionLike | undefined {
  const Ctor = getSpeechRecognition();
  if (!Ctor) return undefined;
  const recognition = new Ctor();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (event) => {
    let final = '';
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      if (result.isFinal) final += transcript;
      else interim += transcript;
    }
    handlers.onResult(final || interim, final.length > 0);
  };
  recognition.onend = () => handlers.onEnd();
  recognition.onerror = (event) => handlers.onError(event.error);

  return recognition;
}
