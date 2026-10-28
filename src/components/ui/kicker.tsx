import { cn } from '@/lib/utils';

/**
 * The small uppercase label in its two deliberate sizes:
 * - `sm` — the shell / Home / control-bar one, colour included (the former `.kicker` CSS rule: 10px · extrabold · 0.14em · neutral-700);
 * - `md` — the design pages' card headline (11px · bold · 0.1em); the caller adds the colour.
 * A caller's tracking or colour class replaces the size's (`cn` merges them), as the utilities used to win over the `.kicker` rule.
 */
const SIZE = {
  sm: 'text-[10px] font-extrabold tracking-[0.14em] uppercase text-neutral-700',
  md: 'text-[11px] font-bold tracking-[0.1em] uppercase',
} as const;

type Props = React.HTMLAttributes<HTMLElement> & {
  size: keyof typeof SIZE;
  /** A span unless the spot is a block (the Shell rail label) or a heading (the Home stat title). */
  as?: 'span' | 'div' | 'h4';
};

/** One kicker for every small label — the pages used to carry the string each, and the shell had its own CSS rule. */
export function Kicker({ size, as: Tag = 'span', className, ...props }: Props) {
  return <Tag className={cn(SIZE[size], className)} {...props} />;
}
