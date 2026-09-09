import { useEffect, useRef, useState } from 'react';
import type { Chat, Message, Settings } from './types';
import { OFFLINE_MODEL_ID } from '../shared/constants';
import { loadChats, loadSettings, saveChats, saveSettings } from './lib/store';
import { personaById } from './lib/persona';
import { resolveSelection } from './lib/models';
import { QuotaMemory, type ClientError } from './lib/quota';
import { streamChat } from './lib/chat';
import { speak } from './lib/tts';
import { uid } from './lib/id';
import Backdrop from './components/Backdrop';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import Composer, { type ComposerSubmit } from './components/Composer';
import SettingsModal from './components/SettingsModal';

function errorSummary(errors: ClientError[]): string {
  const lines = errors.map((e) => `- ${e.message}`);
  return [
    'I could not get a real answer, so I did not invent one.',
    '',
    '**What happened:**',
    ...lines,
    '',
    'Fix the issue and try again, or switch models. If every provider fails, the proxy likely has no keys configured for this deployment — add them in the server environment (see README).',
  ].join('\n');
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>(() => loadChats());
  const [activeId, setActiveId] = useState<string>(() => loadChats()[0]?.id ?? '');
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const quotaRef = useRef<QuotaMemory>(new QuotaMemory());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => saveChats(chats), [chats]);
  useEffect(() => saveSettings(settings), [settings]);

  const activeChat = chats.find((c) => c.id === activeId);

  const updateChat = (id: string, updater: (chat: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
  };

  const newChat = () => {
    const chat: Chat = { id: uid(), title: '', createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
  };

  const renameChat = (id: string, title: string) => updateChat(id, (c) => ({ ...c, title }));

  const deleteChat = (id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? '');
      return next;
    });
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const send = async (submit: ComposerSubmit) => {
    if (streaming) return;
    const now = Date.now();
    const persona = personaById(settings.personaId);
    const hasImages = submit.images.length > 0;
    const selection = resolveSelection(settings.activeModelId, hasImages);

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: submit.text,
      images: submit.images.map((i) => i.dataUrl),
      documents: submit.documents,
    };
    const assistantMsg: Message = { id: uid(), role: 'assistant', content: '' };

    // Resolve the target chat synchronously from current state.
    let chat = chats.find((c) => c.id === activeId) ?? null;
    if (!chat) {
      chat = { id: uid(), title: '', createdAt: now, updatedAt: now, messages: [] };
      setChats((prev) => [chat as Chat, ...prev]);
      setActiveId(chat.id);
    }
    const chatId = chat.id;
    const contextMessages = [...chat.messages, userMsg];
    const newTitle = chat.title || (submit.text ? submit.text.slice(0, 48) : 'New chat');

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? { ...c, title: newTitle, messages: [...c.messages, userMsg, assistantMsg], updatedAt: now }
          : c,
      ),
    );

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    let partial = '';
    const result = await streamChat({
      messages: contextMessages,
      persona,
      selection,
      hasImages,
      quota: quotaRef.current,
      onDelta: (delta) => {
        partial += delta;
        updateChat(chatId, (c) => ({
          ...c,
          messages: c.messages.map((m) => (m.id === assistantMsg.id ? { ...m, content: partial } : m)),
        }));
      },
      signal: controller.signal,
    });

    if (!result.ok && !result.cancelled && partial.length === 0) {
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id ? { ...m, content: errorSummary(result.errors), error: true } : m,
        ),
      }));
    } else {
      updateChat(chatId, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: result.content || partial, error: !result.ok }
            : m,
        ),
      }));
    }

    setStreaming(false);
    abortRef.current = null;

    if (settings.ttsEnabled && result.ok && result.content) {
      speak(result.content);
    }
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#090d16] text-slate-300">
      <Backdrop />

      <div className="relative z-10 flex w-full">
        <Sidebar
          chats={chats}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={newChat}
          onRename={renameChat}
          onDelete={deleteChat}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <main className="relative flex min-w-0 flex-1 flex-col">
          <ChatPanel
            chat={activeChat}
            streaming={streaming}
            modelId={settings.activeModelId === OFFLINE_MODEL_ID ? OFFLINE_MODEL_ID : settings.activeModelId}
            onSpeak={speak}
          />
          <Composer
            streaming={streaming}
            modelId={settings.activeModelId}
            personaId={settings.personaId}
            onModelChange={(id) => setSettings((s) => ({ ...s, activeModelId: id }))}
            onPersonaChange={(id) => setSettings((s) => ({ ...s, personaId: id }))}
            onSend={(submit) => void send(submit)}
            onStop={stop}
          />
        </main>
      </div>

      {settingsOpen && (
        <SettingsModal settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
