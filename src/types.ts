export type ProviderId = 'openrouter' | 'groq' | 'gemini';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Image attachments (data URLs, already downscaled). */
  images?: string[];
  /** Document attachments (extracted text). */
  documents?: { name: string; text: string }[];
  error?: boolean;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
}

export interface ModelDef {
  id: string;
  label: string;
  provider: ProviderId;
  vision?: boolean;
  /** Short honest note shown next to the model in the picker. */
  note?: string;
}

export interface Settings {
  activeModelId: string;
  personaId: string;
  ttsEnabled: boolean;
}

export type AttachmentKind = 'image' | 'document';

export interface Attachment {
  kind: AttachmentKind;
  name: string;
  dataUrl?: string;
  text?: string;
}

export type Role = 'user' | 'assistant';
