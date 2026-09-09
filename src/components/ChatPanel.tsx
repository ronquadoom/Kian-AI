import { useEffect, useRef } from 'react';
import type { Chat } from '../types';
import { MODELS, OFFLINE_MODEL_ID, PROVIDERS } from '../../shared/constants';
import MessageBubble from './MessageBubble';

interface Props {
  chat: Chat | undefined;
  streaming: boolean;
  modelId: string;
  onSpeak: (text: string) => void;
}

function modelMeta(modelId: string): { label: string; dot: string } {
  if (modelId === 'auto') return { label: 'Auto', dot: '#22d3ee' };
  if (modelId === OFFLINE_MODEL_ID) return { label: 'Offline Demo', dot: '#64748b' };
  const model = MODELS.find((m) => m.id === modelId);
  if (!model) return { label: modelId, dot: '#22d3ee' };
  return { label: model.label, dot: PROVIDERS[model.provider].accent };
}

export default function ChatPanel({ chat, streaming, modelId, onSpeak }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const meta = modelMeta(modelId);

  const lastMessage = chat?.messages[chat.messages.length - 1];
  const messageCount = chat?.messages.length ?? 0;
  const lastContentLength = lastMessage?.content.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messageCount, lastContentLength, streaming]);

  if (!chat) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-3xl font-bold text-black shadow-2xl shadow-cyan-500/25">
            K
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Kian AI</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
            A free, honest AI chat. It talks to real models — Groq, Gemini, and OpenRouter — and says so plainly
            when it can&apos;t reach one.
          </p>
          <p className="mt-4 text-xs text-slate-600">Start a new chat to begin.</p>
        </div>
      </div>
    );
  }

  const messages = chat.messages;

  return (
    <>
      <header className="z-10 flex items-center justify-between border-b border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-100">{chat.title || 'New chat'}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
          <span className="hidden sm:inline">{meta.label}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 md:px-8">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-400">
              Say hi — or attach an image, a PDF, or switch the model and persona below.
            </div>
          )}

          {messages.map((m, i) => {
            const isStreaming = streaming && i === messages.length - 1 && m.role === 'assistant';
            return <MessageBubble key={m.id} message={m} streaming={isStreaming} onSpeak={onSpeak} />;
          })}

          {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <MessageBubble
              message={{ id: 'pending', role: 'assistant', content: '' }}
              streaming
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </>
  );
}
