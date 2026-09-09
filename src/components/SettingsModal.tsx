import type { Settings } from '../types';
import { PROVIDERS } from '../../shared/constants';
import { ttsSupported } from '../lib/tts';
import { IconClose } from './icons';

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onChange, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f19] p-6 shadow-2xl shadow-black/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Settings &amp; honest limits</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <IconClose />
          </button>
        </div>

        {/* Text-to-speech */}
        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Text-to-speech read-back</h3>
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
            <span className="text-sm text-slate-300">
              Read assistant replies aloud
              {!ttsSupported() && <span className="ml-1 text-xs text-slate-500">(not supported here)</span>}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.ttsEnabled}
              disabled={!ttsSupported()}
              onClick={() => onChange({ ...settings, ttsEnabled: !settings.ttsEnabled })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                settings.ttsEnabled ? 'bg-gradient-to-r from-cyan-400 to-violet-500' : 'bg-slate-700'
              } disabled:opacity-40`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  settings.ttsEnabled ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>
        </section>

        {/* Providers & quotas */}
        <section className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Providers &amp; free quotas</h3>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            “Free” means $0, not unlimited. Limits are approximate and set by each provider; they change over time.
          </p>
          <div className="space-y-2">
            {(['groq', 'gemini', 'openrouter'] as const).map((id) => {
              const p = PROVIDERS[id];
              return (
                <div key={id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                    <span className="text-sm font-medium" style={{ color: p.text }}>
                      {p.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{p.freeQuota}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {p.limits.map((limit, i) => (
                      <li key={i} className="text-[11px] leading-relaxed text-slate-500">
                        • {limit}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            Gemini free tier may use prompts to improve Google products, and is not available in the
            EU/EEA/UK/Switzerland.
          </p>
        </section>

        {/* Keys & privacy */}
        <section className="mb-2">
          <h3 className="mb-2 text-sm font-semibold text-slate-200">Keys &amp; privacy</h3>
          <ul className="space-y-1.5 text-xs leading-relaxed text-slate-400">
            <li>
              • You need <span className="font-mono text-slate-300">no keys</span> as a visitor — the proxy holds them
              in server environment variables.
            </li>
            <li>• A key shipped in the client bundle is public; Kian AI never does that.</li>
            <li>• Chats and settings stay in your browser (localStorage). They are never uploaded.</li>
            <li>• Messages are sent to the provider you selected, so provider privacy terms apply.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
