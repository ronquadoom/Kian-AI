import { useEffect, useRef, useState } from 'react';
import { MAX_ATTACHMENTS, MAX_DOCUMENTS, MAX_IMAGES, OFFLINE_MODEL_ID } from '../../shared/constants';
import { extractDocuments, isDocumentFile, type ExtractedDocument } from '../lib/documents';
import { isImageFile, PER_MESSAGE_MAX_BYTES, prepareImage } from '../lib/image';
import { createRecognizer, sttSupported, type SttHandlers } from '../lib/tts';
import ModelPicker from './ModelPicker';
import PersonaPicker from './PersonaPicker';
import { IconMic, IconPaperclip, IconSend, IconStop, IconClose } from './icons';

export interface PreparedImage {
  id: string;
  dataUrl: string;
  name: string;
  bytes: number;
}

export interface ComposerSubmit {
  text: string;
  images: PreparedImage[];
  documents: ExtractedDocument[];
}

interface Props {
  streaming: boolean;
  modelId: string;
  personaId: string;
  onModelChange: (id: string) => void;
  onPersonaChange: (id: string) => void;
  onSend: (submit: ComposerSubmit) => void;
  onStop: () => void;
}

export default function Composer({
  streaming,
  modelId,
  personaId,
  onModelChange,
  onPersonaChange,
  onSend,
  onStop,
}: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const recognizerRef = useRef<ReturnType<typeof createRecognizer> | undefined>(undefined);

  const imageBytes = images.reduce((sum, img) => sum + img.bytes, 0);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
  }, [text]);

  useEffect(() => () => recognizerRef.current?.abort(), []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const incoming = Array.from(files);
    const imageFiles = incoming.filter(isImageFile);
    const newDocFiles = incoming.filter(isDocumentFile);

    const combined = images.length + docFiles.length + imageFiles.length + newDocFiles.length;
    if (combined > MAX_ATTACHMENTS) {
      flash(`OpenRouter rejects more than ${MAX_ATTACHMENTS} attachments — attach fewer.`);
      return;
    }
    if (images.length + imageFiles.length > MAX_IMAGES) {
      flash(`Up to ${MAX_IMAGES} images per message.`);
      return;
    }
    if (docFiles.length + newDocFiles.length > MAX_DOCUMENTS) {
      flash(`Up to ${MAX_DOCUMENTS} documents per message.`);
      return;
    }

    const prepared: PreparedImage[] = [];
    for (const file of imageFiles) {
      const result = await prepareImage(file);
      if (!result) {
        flash(`“${file.name}” is too large even after resizing (per-image 1.5 MB, per-message 3 MB).`);
        continue;
      }
      const bytes = result.bytes;
      if (imageBytes + prepared.reduce((s, p) => s + p.bytes, 0) + bytes > PER_MESSAGE_MAX_BYTES) {
        flash('Image budget for this message (3 MB) reached — attach fewer or smaller images.');
        continue;
      }
      prepared.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        dataUrl: `data:${result.mime};base64,${result.data}`,
        name: file.name,
        bytes,
      });
    }
    setImages((prev) => [...prev, ...prepared]);
    setDocFiles((prev) => [...prev, ...newDocFiles]);
  };

  const submit = async () => {
    if (streaming) return;
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && docFiles.length === 0) return;

    let documents: ExtractedDocument[] = [];
    if (docFiles.length > 0) {
      documents = await extractDocuments(docFiles);
    }

    onSend({ text: trimmed, images, documents });
    setText('');
    setImages([]);
    setDocFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const toggleListening = () => {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
      return;
    }
    const handlers: SttHandlers = {
      onResult: (transcript, isFinal) => {
        setText((prev) => {
          if (isFinal) return prev ? `${prev} ${transcript}`.trim() : transcript;
          // Interims: replace a trailing interim segment with the latest.
          const base = prev.replace(/ [^ ]+$/, '');
          return `${base} ${transcript}`.trim();
        });
      },
      onEnd: () => setListening(false),
      onError: (error) => {
        setListening(false);
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          flash('Microphone access was denied.');
        } else if (error !== 'aborted' && error !== 'no-speech') {
          flash(`Speech recognition error: ${error}.`);
        }
      },
    };
    const recognition = createRecognizer(handlers);
    if (!recognition) {
      flash('This browser does not support speech-to-text.');
      return;
    }
    recognizerRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      flash('Could not start speech recognition.');
    }
  };

  const offline = modelId === OFFLINE_MODEL_ID;
  const canSend = !streaming && (text.trim().length > 0 || images.length > 0 || docFiles.length > 0);

  return (
    <div className="relative z-10 px-4 pb-4 md:px-8">
      <div className="mx-auto max-w-3xl">
        {notice && (
          <div className="mb-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {notice}
          </div>
        )}

        {offline && (
          <div className="mb-2 rounded-xl border border-slate-500/30 bg-slate-500/10 px-3 py-2 text-xs text-slate-300">
            <span className="font-semibold text-slate-100">Offline Demo</span> is a rule-based template, not a
            model — replies are canned and describe what <em>would</em> be sent. No AI is called.
          </div>
        )}

        <div className="glass rounded-2xl p-2 shadow-2xl shadow-black/40">
          {(images.length > 0 || docFiles.length > 0) && (
            <div className="flex flex-wrap gap-2 px-2 pb-2 pt-1">
              {images.map((img) => (
                <div key={img.id} className="group relative">
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((p) => p.id !== img.id))}
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-white/20 bg-black/80 p-0.5 text-slate-300 hover:text-white"
                    title="Remove"
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
              {docFiles.map((f, i) => (
                <div key={`${f.name}-${i}`} className="group relative flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                  <span className="font-mono text-[11px] text-cyan-300">📄 {f.name}</span>
                  <button
                    type="button"
                    onClick={() => setDocFiles((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-white"
                    title="Remove"
                  >
                    <IconClose />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Message Kian…  (Enter to send, Shift+Enter for a new line)"
            className="max-h-[220px] w-full resize-none bg-transparent px-3 py-2 text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          <div className="flex items-center gap-1.5 px-1 pt-1">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.markdown,.csv,.log,.json,.js,.ts,.tsx,.jsx,.html,.css,.yml,.yaml,.toml,.ini,.sh,.py,.java,.c,.cpp,.h,.rs,.go,.rb,.php"
              className="hidden"
              onChange={(e) => {
                void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              title={`Attach images (≤${MAX_IMAGES}) or documents (≤${MAX_DOCUMENTS})`}
            >
              <IconPaperclip />
            </button>

            {sttSupported() && (
              <button
                type="button"
                onClick={toggleListening}
                className={`rounded-xl p-2 transition-colors ${
                  listening ? 'bg-red-500/20 text-red-300' : 'text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
                title={listening ? 'Stop listening' : 'Dictate with your microphone'}
              >
                <IconMic />
              </button>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <PersonaPicker value={personaId} onChange={onPersonaChange} />
              <ModelPicker value={modelId} onChange={onModelChange} />

              {streaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 text-red-300 transition-colors hover:bg-red-500/25"
                  title="Stop generating"
                >
                  <IconStop />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={!canSend}
                  className="send-gradient flex h-11 w-11 items-center justify-center rounded-xl text-white disabled:opacity-40"
                  title="Send"
                >
                  <IconSend />
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-600">
          Kian AI can make mistakes. “Free” means $0, not unlimited — provider quotas apply.
        </p>
      </div>
    </div>
  );
}
