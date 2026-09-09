import { useState } from 'react';
import type { Message } from '../types';
import { Markdown } from './Markdown';
import { IconCheck, IconCopy, IconSpeaker } from './icons';

interface Props {
  message: Message;
  streaming?: boolean;
  onSpeak?: (text: string) => void;
}

export default function MessageBubble({ message, streaming, onSpeak }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (isUser) {
    return (
      <div className="bubble-in flex justify-end">
        <div className="max-w-[85%] md:max-w-[70%]">
          {message.images && message.images.length > 0 && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.images.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`attachment ${i + 1}`}
                  className="h-20 w-20 rounded-xl border border-white/10 object-cover"
                />
              ))}
            </div>
          )}
          {message.documents && message.documents.length > 0 && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.documents.map((d, i) => (
                <span
                  key={i}
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11px] text-cyan-300"
                  title={d.text.slice(0, 200)}
                >
                  📄 {d.name}
                </span>
              ))}
            </div>
          )}
          {message.content && (
            <div className="rounded-2xl rounded-br-md border border-cyan-400/20 bg-cyan-400/10 px-4 py-2.5 text-[15px] leading-relaxed text-slate-100">
              <span className="whitespace-pre-wrap">{message.content}</span>
            </div>
          )}
          {message.error && (
            <div className="mt-1.5 text-right text-xs text-amber-300">failed to send</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bubble-in flex justify-start">
      <div className="group relative max-w-[85%] md:max-w-[80%]">
        <div
          className={`rounded-2xl rounded-bl-md border px-4 py-3 ${
            message.error
              ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
              : 'border-white/10 bg-white/5 text-slate-200'
          }`}
        >
          {message.content ? (
            <div className={streaming ? 'caret' : undefined}>
              <Markdown text={message.content} />
            </div>
          ) : streaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-400" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:240ms]" />
            </div>
          ) : (
            <span className="text-slate-500">…</span>
          )}
        </div>

        {!streaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={copy}
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              title="Copy"
            >
              {copied ? <IconCheck /> : <IconCopy />}
            </button>
            {onSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(message.content)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                title="Read aloud"
              >
                <IconSpeaker />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
