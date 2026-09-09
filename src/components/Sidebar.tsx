import { useState } from 'react';
import type { Chat } from '../types';
import { IconChat, IconGear, IconPencil, IconPlus, IconTrash } from './icons';

interface Props {
  chats: Chat[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export default function Sidebar({ chats, activeId, onSelect, onNew, onRename, onDelete, onOpenSettings }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const commit = () => {
    if (editingId && draft.trim()) onRename(editingId, draft.trim().slice(0, 60));
    setEditingId(null);
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-white/10 bg-black/20 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-bold text-black shadow-lg shadow-cyan-500/20">
          K
        </div>
        <div>
          <div className="text-base font-semibold tracking-tight text-white">Kian AI</div>
          <div className="text-[11px] text-slate-500">free · honest · browser</div>
        </div>
      </div>

      <div className="px-4 pb-3 pt-1">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-medium text-slate-200 transition-all hover:border-cyan-400/40 hover:bg-white/10 hover:text-white"
        >
          <IconPlus />
          New chat
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {chats.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-600">No chats yet.</p>
        )}
        {[...chats]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map((chat) => {
            const active = chat.id === activeId;
            const editing = editingId === chat.id;
            return (
              <div
                key={chat.id}
                onClick={() => !editing && onSelect(chat.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <IconChat />
                {editing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="w-full rounded-md border border-cyan-400/40 bg-black/40 px-1.5 py-0.5 text-sm text-white outline-none"
                  />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{chat.title || 'New chat'}</span>
                    <span className="text-[10px] tabular-nums text-slate-500">{relativeTime(chat.updatedAt)}</span>
                    <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(chat.id);
                          setDraft(chat.title || '');
                        }}
                        className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                      >
                        <IconPencil />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(chat.id);
                        }}
                        className="rounded-md p-1 text-slate-400 hover:bg-red-500/20 hover:text-red-300"
                      >
                        <IconTrash />
                      </button>
                    </span>
                  </>
                )}
              </div>
            );
          })}
      </div>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <IconGear />
          Settings &amp; limits
        </button>
        <p className="px-2.5 pt-2 text-[11px] leading-relaxed text-slate-600">
          “Free” means $0, not unlimited. Providers have daily caps — see Settings &amp; limits.
        </p>
      </div>
    </aside>
  );
}
