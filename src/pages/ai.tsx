import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { I } from '@/components/ui/icons';
import { Pill } from '@/components/ui/pill';
import { Composer } from '@/components/ui/ruixen-moon-chat';
import { AI_PROMPTS, AI_REPLY, AI_SCOPES, AI_STATE, CMD_ROWS } from '@/lib/data';
import { useAiChat } from '@/lib/use-ai-chat';
import { cn } from '@/lib/utils';
import { useApp, type AppState, type Msg } from '@/store';

const VIEWS: { id: AppState['aiView']; label: string }[] = [
  { id: 'canvas', label: 'Full canvas' },
  { id: 'split', label: 'Beside the work' },
  { id: 'command', label: 'Command overlay' },
];

function Bubble({ m, big }: { m: Msg; big?: boolean }) {
  const ai = m.who === 'ai';
  return (
    <div className={cn('flex', ai ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'border px-[18px] py-[15px] leading-[1.6] [text-wrap:pretty]',
          big ? 'text-[15px]' : 'text-sm',
          ai
            ? 'bg-neutral-100 border-neutral-300 text-neutral-900'
            : 'bg-ink border-ink text-accent-100',
        )}
        style={{ maxWidth: ai ? '80%' : '72%' }}
      >
        {m.text}
      </div>
    </div>
  );
}

/**
 * AI tutor surface: three interaction models (full canvas / beside the work / ⌘K overlay) on one engine.
 * Guest-only (DemoOnly in App.tsx): main has no chat routes, so the thread answers with the design's canned reply.
 */
export function Ai() {
  const { aiView, aiScope: scope, set } = useApp();
  const nav = useNavigate();
  const [draft, setDraft] = useState('');
  const tutor = useAiChat('aiThread', () => AI_REPLY);
  const aiThread = tutor.thread;
  const threadRef = useRef<HTMLDivElement>(null);
  // Keep the newest bubble in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [aiThread.length]);
  const state = AI_STATE;

  return (
    <div data-screen-label="AI tutor surface" className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-[9px] flex-wrap">
        {VIEWS.map((v) => (
          <Pill
            key={v.id}
            on={aiView === v.id}
            onClick={() => set({ aiView: v.id })}
            className="px-[17px] py-[9px] text-[13px] font-bold"
          >
            {v.label}
          </Pill>
        ))}
        <span className="text-[13px] text-neutral-700 ml-1.5">
          Three interaction models for the same engine.
        </span>
      </div>

      {aiView === 'canvas' && (
        <div className="flex flex-wrap gap-5 items-stretch">
          <div className="relative overflow-hidden flex-[100_1_420px] min-w-[min(100%,330px)] bg-surface border border-neutral-300 rounded-none p-6 flex flex-col gap-4 min-h-[540px]">
            <div className="relative flex items-center gap-2.5 flex-wrap">
              <span className="w-8 h-8 rounded-none bg-sage-700 text-sage-100 flex items-center justify-center text-sm font-extrabold">
                N
              </span>
              <span className="text-base font-extrabold">Notarium AI</span>
              <span className="text-xs font-bold text-neutral-700">Fisika · vektor</span>
              <div className="flex gap-[7px] flex-wrap ml-auto">
                {AI_SCOPES.map((x) => (
                  <Pill
                    key={x}
                    on={scope === x}
                    onClick={() => set({ aiScope: x })}
                    className="px-[13px] py-1.5 text-xs font-bold"
                  >
                    {x}
                  </Pill>
                ))}
              </div>
            </div>
            <div
              ref={threadRef}
              aria-live="polite"
              className="relative flex-1 flex flex-col gap-[13px] overflow-y-auto overflow-x-hidden pr-0.5"
            >
              {aiThread.map((m, i) => (
                <Bubble key={i} m={m} big />
              ))}
            </div>
            <div className="relative flex gap-2 flex-wrap">
              {AI_PROMPTS.map((p) => {
                const Icon = I[p.icon];
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => tutor.send(p.label, p.reply)}
                    className="flex items-center gap-2 border border-neutral-400 bg-neutral-100 text-neutral-800 rounded-none px-4 py-[9px] text-[13px] font-semibold cursor-pointer text-left hover:border-accent-600 hover:bg-accent-100"
                  >
                    <Icon size={15} className="text-accent-700" />
                    {p.label}
                  </button>
                );
              })}
            </div>
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={(text) => tutor.send(text)}
              onAttach={() =>
                setDraft((d) => (d ? d + ' ' : '') + '[Stoikiometri — catatan 3.jpg] ')
              }
              label="Ask Notarium AI"
              placeholder="Ask anything — it already has the context"
              hintEmpty="It has your notes, your mistakes and your week"
              hintFilled="Enter sends · it answers against your state"
            />
          </div>
          <div className="flex-[1_1_280px] min-w-[min(100%,265px)] max-w-[340px] flex flex-col gap-5">
            <div className="bg-sage-100 border border-sage-300 rounded-none p-[22px] flex flex-col gap-3.5">
              <h4 className="text-[19px] text-sage-900">What it is working from</h4>
              {state.map((a) => (
                <div key={a.label} className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-bold text-sage-800">{a.label}</span>
                  <span className="text-[13px] text-sage-700">{a.value}</span>
                </div>
              ))}
              <p className="text-[12.5px] leading-[1.5] text-sage-700 [text-wrap:pretty]">
                It never writes to mastery on its own. Only questions answered and tutor feedback do
                that.
              </p>
            </div>
            <div className="card flex flex-col gap-[11px]">
              <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-neutral-700">
                Hand off to a human
              </span>
              <p className="text-sm leading-[1.55] text-neutral-800 [text-wrap:pretty]">
                Third time on the same step. Rosmyas has 20:00 open and teaches exactly this.
              </p>
              <button
                type="button"
                onClick={() => nav('/app/tutors')}
                className="self-start border border-neutral-400 bg-transparent text-neutral-800 rounded-none px-[17px] py-[9px] text-[13px] font-bold cursor-pointer hover:bg-neutral-200 hover:border-accent-600"
              >
                See the board
              </button>
            </div>
          </div>
        </div>
      )}

      {aiView === 'split' && (
        <div className="flex flex-wrap gap-5 items-stretch">
          <div className="flex-[100_1_400px] min-w-[min(100%,320px)] bg-neutral-100 border border-neutral-300 rounded-none px-[34px] py-[30px] flex flex-col gap-[18px]">
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-accent-700">
              Fisika · soal 12
            </span>
            <h3 className="text-[26px] [text-wrap:pretty]">
              Sebuah gaya 40 N bekerja pada sudut 30° terhadap bidang miring. Tentukan komponen
              sejajar bidang.
            </h3>
            <div className="border border-dashed border-neutral-400 rounded-none bg-bg min-h-[180px] flex items-center justify-center p-[22px]">
              <span className="text-sm font-semibold text-neutral-700 text-center max-w-[32ch]">
                Diagram placeholder — rotated axes on an inclined plane
              </span>
            </div>
            <div className="flex flex-col gap-[9px]">
              {['40 cos 30° = 34,6 N', '40 sin 30° = 20 N'].map((o) => (
                <div
                  key={o}
                  className="border-[1.5px] border-neutral-300 rounded-none px-[18px] py-3.5 text-[15px] font-semibold text-neutral-900"
                >
                  {o}
                </div>
              ))}
            </div>
            <p className="text-[13px] text-neutral-700">
              The AI does not answer it. It watches which one you reach for.
            </p>
          </div>
          <div className="flex-[1_1_320px] min-w-[min(100%,300px)] max-w-[400px] bg-surface border border-neutral-300 rounded-none p-[22px] flex flex-col gap-3.5">
            <div className="flex items-center gap-[9px]">
              <span className="w-[26px] h-[26px] rounded-none bg-sage-700 text-sage-100 flex items-center justify-center text-xs font-extrabold">
                N
              </span>
              <span className="text-[15px] font-extrabold">Watching this question</span>
            </div>
            <div className="flex-1 flex flex-col gap-[11px] overflow-auto">
              <Bubble
                m={{
                  who: 'ai',
                  text: 'Before you pick: which axis is the 30° measured from? Draw that line first.',
                }}
              />
              <Bubble m={{ who: 'me', text: 'From the slope, I think' }} />
              <Bubble
                m={{
                  who: 'ai',
                  text: 'Right. So the component along the slope is the one that keeps the cosine. That is the whole of question 12.',
                }}
              />
            </div>
            <div className="flex flex-col gap-[7px]">
              {['Show me the drawing step', 'Give me one more like it'].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => set({ aiView: 'canvas' })}
                  className="text-left border border-neutral-400 bg-neutral-100 text-neutral-800 rounded-none px-[15px] py-[11px] text-[13px] font-semibold cursor-pointer hover:border-accent-600 hover:bg-accent-100"
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {aiView === 'command' && (
        <div className="relative border border-neutral-300 rounded-none bg-neutral-200 p-[34px] flex justify-center min-h-[520px]">
          <div className="w-[min(100%,620px)] flex flex-col gap-3.5">
            <div className="flex items-center gap-3 bg-neutral-100 border border-neutral-400 rounded-none px-[22px] py-[18px]">
              <span className="text-xs font-extrabold tracking-[0.06em] text-accent border border-neutral-300 rounded-none px-[7px] py-[3px]">
                ⌘K
              </span>
              <span className="flex-1 text-[17px] text-neutral-800 font-semibold">komponen</span>
              <span className="text-xs font-bold text-neutral-700">esc</span>
            </div>
            <div className="bg-neutral-100 border border-neutral-300 rounded-none p-3 flex flex-col gap-0.5">
              {CMD_ROWS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => set({ aiView: 'canvas' })}
                  className="flex items-center gap-[13px] w-full text-left border-0 bg-transparent rounded-none px-[15px] py-[13px] cursor-pointer hover:bg-neutral-200"
                >
                  <span
                    className="w-[7px] h-[7px] rounded-none flex-[0_0_7px]"
                    style={{
                      background:
                        r.kind === 'ai' ? '#c67139' : r.kind === 'practice' ? '#7a8a5e' : '#c0b6a5',
                    }}
                  />
                  <span className="flex-1 min-w-0 text-[15px] font-bold text-neutral-900">
                    {r.label}
                  </span>
                  <span className="text-[12.5px] text-neutral-700 whitespace-nowrap">{r.meta}</span>
                </button>
              ))}
            </div>
            <p className="text-[13px] leading-[1.55] text-neutral-700 [text-wrap:pretty]">
              One input for asking, finding and doing. The AI is a result type here, not a
              destination — and it is the only one that can also create the other four.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
