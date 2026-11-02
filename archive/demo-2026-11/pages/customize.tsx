import { I } from '@/components/ui/icons';
import { Pill } from '@/components/ui/pill';
import { ProfileFields } from '@/components/profile-fields';
import { ADAPT_EXPLAINER, ADAPT_OPTIONS } from '@/lib/data';
import { BG_MODES, THEMES, THEME_NAMES } from '@/lib/themes';
import { cn } from '@/lib/utils';
import { useApp } from '@/store';

// A section is content under a rule, not a tinted box, so every section's rule starts at the same
// left edge and the page reads as one column of bands.
const CARD = 'border-t border-ink pt-4 flex flex-col';
// A pickable cell: square, hairline, and it inverts when chosen — the system has no tint to select with.
const CELL = 'text-left border bg-transparent cursor-pointer';
const PICKED = 'border-ink bg-ink';
const UNPICKED = 'border-neutral-300 hover:border-ink';

/**
 * Customize your space: adaptive mode (Automatic / Hybrid / Manual), the theme and background
 * of the glow (moved here from the top strip), the module grid, and the tray of modules that
 * can be added back. Grid and tray live in the global store so the Home canvas sees the same set.
 */
export function Customize() {
  const { adapt, theme, bgMode, grid, tray, set, isUser } = useApp();

  const removeModule = (label: string) =>
    set((s) => ({
      grid: s.grid.filter((g) => g !== label),
      tray: s.tray.concat([{ label, meta: 'removed' }]),
    }));
  const addModule = (label: string) =>
    set((s) => ({
      tray: s.tray.filter((t) => t.label !== label),
      grid: s.grid.concat([label]),
    }));

  return (
    <div
      data-screen-label="Customize your space"
      className="flex flex-wrap gap-x-10 gap-y-9 items-start"
    >
      <div className="flex-[100_1_400px] min-w-[min(100%,330px)] flex flex-col gap-8">
        {/* Guests have no account to save to, so the section is simply absent for them. */}
        {isUser && (
          <div className={cn(CARD, 'gap-5')}>
            <div className="flex items-baseline justify-between gap-3.5 flex-wrap">
              <h4 className="text-[19px]">Your profile</h4>
              <span className="text-[12.5px] text-neutral-600">
                Saved on Notarium, not just this browser
              </span>
            </div>
            <ProfileFields saveLabel="Save profile" />
          </div>
        )}
        <div className={cn(CARD, 'gap-4')}>
          <h4 className="text-[19px]">Adaptive mode</h4>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] gap-3">
            {ADAPT_OPTIONS.map((o) => {
              const on = adapt === o.label;
              return (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => set({ adapt: o.label })}
                  className={cn(CELL, 'p-4 flex flex-col gap-1.5', on ? PICKED : UNPICKED)}
                >
                  <span
                    className={cn(
                      'text-[15px] font-extrabold',
                      on ? 'text-accent-100' : 'text-neutral-900',
                    )}
                  >
                    {o.label}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] leading-[1.45]',
                      on ? 'text-accent-300' : 'text-neutral-700',
                    )}
                  >
                    {o.body}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn(CARD, 'gap-4')}>
          <div className="flex items-baseline justify-between gap-3.5">
            <h4 className="text-[19px]">Theme</h4>
            <span className="text-[12.5px] font-bold text-ink">{theme}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {THEME_NAMES.map((name) => {
              const p = THEMES[name];
              const on = theme === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-pressed={on}
                  onClick={() => set({ theme: name })}
                  className="flex items-center gap-2.5 border-0 bg-transparent p-0 cursor-pointer group"
                >
                  {/* The swatch is the one place colour survives: it IS the theme, so it stays literal. Only its frame goes monochrome — square and hairline, ink when picked. */}
                  <span
                    className={cn(
                      'block border p-[3px] leading-[0]',
                      on ? PICKED : 'border-neutral-300 group-hover:border-ink',
                    )}
                  >
                    <span
                      className="block h-[22px] w-[22px]"
                      style={{
                        background: `linear-gradient(135deg, ${p.d} 0%, ${p.b} 52%, ${p.c} 100%)`,
                      }}
                    />
                  </span>
                  <span
                    className={cn(
                      'text-[13px]',
                      on ? 'font-extrabold text-ink' : 'font-semibold text-neutral-700',
                    )}
                  >
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={cn(CARD, 'gap-4')}>
          <h4 className="text-[19px]">Background</h4>
          <div className="flex flex-wrap gap-2">
            {BG_MODES.map((m) => (
              <Pill key={m} on={bgMode === m} onClick={() => set({ bgMode: m })}>
                {m}
              </Pill>
            ))}
          </div>
        </div>

        <div className={cn(CARD, 'gap-4')}>
          <div className="flex items-baseline justify-between gap-3.5">
            <h4 className="text-[19px]">Your space</h4>
            <span className="text-[13px] text-neutral-600">
              Click a module to take it off the canvas
            </span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
            {grid.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => removeModule(label)}
                className={cn(CELL, 'flex items-center gap-3 px-4 py-3', UNPICKED)}
              >
                <I.grip size={16} className="text-neutral-500 flex-none" />
                <span className="flex-1 min-w-0 text-[14px] font-bold text-neutral-900">
                  {label}
                </span>
                <I.x size={15} className="text-neutral-600 flex-none" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-[1_1_300px] min-w-[min(100%,280px)] flex flex-col gap-8">
        {/* An aside, so it takes the quiet rule rather than the loud one. */}
        <div className="border-t border-neutral-300 pt-4 flex flex-col gap-2">
          <span className="meta">What hybrid means</span>
          <p className="text-[14px] leading-[1.55] text-neutral-700 [text-wrap:pretty]">
            {ADAPT_EXPLAINER[adapt]}
          </p>
        </div>

        <div className={cn(CARD, 'gap-3')}>
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-[19px]">Add module</h4>
            <span data-num className="text-[12px] font-bold text-neutral-600">
              {tray.length} available
            </span>
          </div>
          <div className="flex flex-col">
            {tray.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => addModule(t.label)}
                className="flex items-center gap-3 w-full text-left border-0 border-b border-neutral-300 bg-transparent px-0 py-2.5 cursor-pointer hover:border-ink"
              >
                <span className="w-[22px] h-[22px] border border-neutral-400 flex items-center justify-center flex-[0_0_22px]">
                  <I.plus size={13} className="text-ink" />
                </span>
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-neutral-900">
                  {t.label}
                </span>
                <span className="text-[12px] text-neutral-600">{t.meta}</span>
              </button>
            ))}
          </div>
          <p className="text-[12px] text-neutral-600 mt-1">
            Third-party modules land in this same tray.
          </p>
        </div>
      </div>
    </div>
  );
}
