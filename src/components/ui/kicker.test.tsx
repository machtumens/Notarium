import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Kicker } from '@/components/ui/kicker';

/**
 * W5.3 made one Kicker of the pages' `KICK` strings; F1 folds the `.kicker` CSS rule (shell / Home / control-bar)
 * into it as `size="sm"`. Each size must be its former string class for class, and a caller's tracking or colour
 * must win over the size's the way the utilities used to win over the `.kicker` rule.
 */
const classes = (el: Element) => Array.from(el.classList).sort();
const expected = (s: string) => s.split(' ').sort();

describe('Kicker sizes (F1)', () => {
  it("md is the design pages' label (11px · bold · 0.1em) plus the caller's colour, on a span", () => {
    render(
      <Kicker size="md" className="text-accent-700">
        Before you publish
      </Kicker>,
    );
    const el = screen.getByText('Before you publish');
    expect(el.tagName).toBe('SPAN');
    expect(classes(el)).toEqual(
      expected('text-[11px] font-bold tracking-[0.1em] uppercase text-accent-700'),
    );
  });

  it('md takes a pill skin on top (the Tutors board badge)', () => {
    render(
      <Kicker
        size="md"
        className="bg-neutral-100 border border-[#e0cdb4] rounded-full px-[13px] py-[5px] text-accent-700"
      >
        Tutor board · live
      </Kicker>,
    );
    expect(classes(screen.getByText('Tutor board · live'))).toEqual(
      expected(
        'text-[11px] font-bold tracking-[0.1em] uppercase bg-neutral-100 border border-[#e0cdb4] rounded-full px-[13px] py-[5px] text-accent-700',
      ),
    );
  });

  it('sm is the former .kicker rule (10px · extrabold · 0.14em · neutral-700), colour included', () => {
    render(<Kicker size="sm">Context</Kicker>);
    const el = screen.getByText('Context');
    expect(el.tagName).toBe('SPAN');
    expect(classes(el)).toEqual(
      expected('text-[10px] font-extrabold tracking-[0.14em] uppercase text-neutral-700'),
    );
  });

  it("sm lets the caller's tracking and colour replace the rule's, as the cascade did (Home hero, note, rail label)", () => {
    render(
      <Kicker size="sm" className="relative tracking-[0.18em] text-accent-400">
        Your next best action
      </Kicker>,
    );
    expect(classes(screen.getByText('Your next best action'))).toEqual(
      expected('text-[10px] font-extrabold uppercase relative tracking-[0.18em] text-accent-400'),
    );
  });

  it('keeps the element the spot had: the Home stat title is an h4, the Shell rail label a div', () => {
    render(
      <>
        <Kicker as="h4" size="sm" className="font-body tracking-[0.18em] text-sage-700">
          This week
        </Kicker>
        <Kicker as="div" size="sm" className="tracking-[0.18em] px-3.5">
          Subjects
        </Kicker>
      </>,
    );
    const h4 = screen.getByText('This week');
    expect(h4.tagName).toBe('H4');
    expect(classes(h4)).toEqual(
      expected('font-body text-[10px] font-extrabold uppercase tracking-[0.18em] text-sage-700'),
    );
    expect(screen.getByText('Subjects').tagName).toBe('DIV');
  });

  it('the .kicker CSS rule is gone — the component is the only kicker', () => {
    expect(readFileSync('src/index.css', 'utf8')).not.toMatch(/\.kicker\b/);
  });
});
