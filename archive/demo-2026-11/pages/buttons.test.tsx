import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { buttonVariants } from '@/components/ui/button';
import { Mobile } from '@/pages/mobile';
import { Onboard } from '@/pages/onboard';
import { AppProvider } from '@/store';

/**
 * F2: Onboarding and Mobile take their filled accent pill from `buttonVariants({ variant: 'primary' })`
 * instead of a private string each (W5.3 did this for the other pages). Padding and text size stay at the call
 * site, as they always did, so each button's class set is `primary` plus its own sizing — nothing more.
 */
const set = (s: string) => s.split(/\s+/).filter(Boolean).sort();
const classes = (el: Element) => Array.from(el.classList).sort();
const primary = buttonVariants({ variant: 'primary' });
const renderPage = (page: React.ReactNode) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  );
  return render(
    <MemoryRouter>
      <AppProvider>{page}</AppProvider>
    </MemoryRouter>,
  );
};

describe('onboard / mobile buttons on buttonVariants (F2)', () => {
  it('no page keeps its own copy of the accent pill string', () => {
    for (const f of ['onboard', 'mobile']) {
      const src = readFileSync(`src/pages/${f}.tsx`, 'utf8');
      expect(src, f).not.toMatch(/bg-ink text-accent-100 rounded-none/);
      expect(src, f).toMatch(/buttonVariants\(\{ variant: 'primary' \}\)/);
    }
  });

  it('Onboarding: Continue is primary + its sizing and disabled look', () => {
    renderPage(<Onboard />);
    expect(classes(screen.getByRole('button', { name: 'Continue' }))).toEqual(
      set(`${primary} px-7 py-3.5 text-[15px] disabled:opacity-40 disabled:cursor-not-allowed`),
    );
  });

  it('Mobile: the phone CTAs are primary + the frame sizing', () => {
    renderPage(<Mobile />);
    expect(classes(screen.getByRole('button', { name: 'Continue note' }))).toEqual(
      set(`${primary} self-stretch p-[13px] text-[15px] min-h-[46px]`),
    );
    expect(classes(screen.getByRole('button', { name: 'Start drill' }))).toEqual(
      set(`${primary} self-stretch p-[13px] text-[15px] min-h-[46px]`),
    );
    expect(classes(screen.getByRole('button', { name: 'Start · 5 min' }))).toEqual(
      set(`${primary} p-[15px] text-base min-h-[50px]`),
    );
  });
});
