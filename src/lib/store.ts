/**
 * localStorage persistence for chats and settings.
 *
 * localStorage is small (~5 MB), so image attachments are the first thing we
 * drop if a write overflows — text history is always kept. Settings persist too.
 */

import type { Chat, Message, Settings } from '../types';

const CHATS_KEY = 'kian:chats:v1';
const SETTINGS_KEY = 'kian:settings:v1';

export const DEFAULT_SETTINGS: Settings = {
  activeModelId: 'auto',
  personaId: 'assistant',
  ttsEnabled: false,
};

function stripImages(messages: Message[]): Message[] {
  return messages.map((m) => ({ ...m, images: undefined }));
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadChats(): Chat[] {
  const raw = safeGet(CHATS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Chat[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages));
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]): void {
  const raw = JSON.stringify(chats);
  if (safeSet(CHATS_KEY, raw)) return;
  // Quota exceeded — retry without images so text history still persists.
  const stripped = chats.map((c) => ({ ...c, messages: stripImages(c.messages) }));
  safeSet(CHATS_KEY, JSON.stringify(stripped));
}

export function loadSettings(): Settings {
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
}
