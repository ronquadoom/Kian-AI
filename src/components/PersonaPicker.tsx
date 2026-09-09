import { useState } from 'react';
import { PERSONAS } from '../../shared/constants';
import { IconChevron } from './icons';

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export default function PersonaPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = PERSONAS.find((p) => p.id === value) ?? PERSONAS[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="glass glass-hover flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-200"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Persona: ${current.name}`}
      >
        <span>{current.emoji}</span>
        <span className="hidden sm:inline">{current.name}</span>
        <IconChevron />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            className="absolute bottom-full left-0 z-40 mb-2 w-72 rounded-2xl border border-white/10 bg-[#0b0f19]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={value === p.id}
                onClick={() => {
                  onChange(p.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  value === p.id ? 'bg-white/10' : 'hover:bg-white/5'
                }`}
              >
                <span className="text-base leading-6">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${value === p.id ? 'text-white' : 'text-slate-200'}`}>
                    {p.name}
                  </span>
                  <span className="block text-xs text-slate-500">{p.description}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
