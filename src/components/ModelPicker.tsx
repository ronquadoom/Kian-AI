import { useState } from 'react';
import { MODELS, OFFLINE_MODEL_ID, PROVIDERS } from '../../shared/constants';
import type { ProviderId } from '../types';
import { IconChevron } from './icons';

interface Props {
  value: string;
  onChange: (id: string) => void;
}

const AUTO_ACCENT = '#22d3ee';
const OFFLINE_ACCENT = '#64748b';

function accentFor(id: string): { dot: string; label: string } {
  if (id === 'auto') return { dot: AUTO_ACCENT, label: 'Auto' };
  if (id === OFFLINE_MODEL_ID) return { dot: OFFLINE_ACCENT, label: 'Offline Demo' };
  const model = MODELS.find((m) => m.id === id);
  if (!model) return { dot: AUTO_ACCENT, label: 'Auto' };
  return { dot: PROVIDERS[model.provider].accent, label: model.label };
}

export default function ModelPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = accentFor(value);
  const providers: ProviderId[] = ['groq', 'gemini', 'openrouter'];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass glass-hover flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-200"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: current.dot }} />
        <span>{current.label}</span>
        <IconChevron />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute bottom-full left-0 z-40 mb-2 max-h-[60vh] w-80 overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f19]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            <Option
              id="auto"
              label="Auto"
              dot={AUTO_ACCENT}
              note="Failover: Groq → Gemini → OpenRouter · images → vision model"
              selected={value === 'auto'}
              onSelect={(id) => {
                onChange(id);
                setOpen(false);
              }}
            />

            <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Named models
            </div>
            {providers.map((provider) => (
              <div key={provider}>
                <div className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: PROVIDERS[provider].accent }} />
                  {PROVIDERS[provider].name}
                </div>
                {MODELS.filter((m) => m.provider === provider).map((m) => (
                  <Option
                    key={m.id}
                    id={m.id}
                    label={m.label}
                    dot={PROVIDERS[provider].accent}
                    note={m.note}
                    selected={value === m.id}
                    onSelect={(id) => {
                      onChange(id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            ))}

            <div className="my-1 border-t border-white/10" />
            <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              No network
            </div>
            <Option
              id={OFFLINE_MODEL_ID}
              label="Offline Demo"
              dot={OFFLINE_ACCENT}
              note="Rule-based template — not a model"
              selected={value === OFFLINE_MODEL_ID}
              onSelect={(id) => {
                onChange(id);
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Option({
  id,
  label,
  dot,
  note,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  dot: string;
  note?: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
        selected ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${selected ? 'text-white' : 'text-slate-200'}`}>{label}</span>
        {note && <span className="block text-xs text-slate-500">{note}</span>}
      </span>
    </button>
  );
}
