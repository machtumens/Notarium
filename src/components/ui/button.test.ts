import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@/components/ui/button';

/**
 * W5.3: the design's pill buttons come from `buttonVariants` instead of per-page strings. Each variant
 * must be one string in one place, class for class, and the shadcn variants must keep their chrome.
 * Values updated for the Swiss redesign: square, ink-filled, hover inverts instead of tinting.
 */
const set = (s: string) => s.split(/\s+/).filter(Boolean).sort();

describe('buttonVariants (W5.3)', () => {
  it('primary is the solid ink button the pages carried as `primary`', () => {
    expect(set(buttonVariants({ variant: 'primary' }))).toEqual(
      set(
        'border-0 bg-ink text-accent-100 rounded-none font-bold cursor-pointer hover:bg-accent-600',
      ),
    );
  });

  it("slot is the hairline box that inverts to ink on hover (tutor slots, the booking dialog's Cancel and ✕)", () => {
    expect(set(buttonVariants({ variant: 'slot' }))).toEqual(
      set(
        'border border-ink bg-transparent text-ink rounded-none font-bold cursor-pointer hover:bg-ink hover:text-accent-100',
      ),
    );
  });

  it('dark is the hairline box on the live-session panel', () => {
    expect(set(buttonVariants({ variant: 'dark' }))).toEqual(
      set(
        'border border-accent-400 bg-transparent text-accent-100 rounded-none font-bold cursor-pointer hover:bg-accent-100 hover:text-ink',
      ),
    );
  });

  it('keeps the shadcn variants as they were, bar the shared square radius (RuixenMoonChat)', () => {
    const chrome =
      'inline-flex items-center justify-center whitespace-nowrap rounded-none text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
    expect(set(buttonVariants({}))).toEqual(
      set(
        `${chrome} bg-accent-700 text-accent-100 hover:bg-accent-600 active:bg-accent-800 h-10 px-4 py-2`,
      ),
    );
    expect(set(buttonVariants({ variant: 'outline', size: 'sm' }))).toEqual(
      set(
        `${chrome} border border-ink bg-transparent text-ink hover:bg-ink hover:text-accent-100 h-9 px-3`,
      ),
    );
    expect(set(buttonVariants({ variant: 'ghost', size: 'icon' }))).toEqual(
      set(`${chrome} hover:bg-accent-200 hover:text-accent-700 h-10 w-10`),
    );
  });
});
