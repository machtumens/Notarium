import { cn } from '@/lib/utils';

type Props = {
  on?: boolean;
  tone?: 'accent' | 'sage';
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  icon?: React.ReactNode;
};

/** Square hairline chip used for every filter / selector. Selected = solid ink, not a tint. */
export function Pill({ on = false, tone = 'accent', children, onClick, className, icon }: Props) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-[12.5px] font-semibold cursor-pointer whitespace-nowrap transition-colors',
        !on && 'border-neutral-400 text-neutral-700 bg-transparent hover:border-ink hover:text-ink',
        // Selected states are an inversion, not a wash: the only "colour" this system has is black.
        on && tone === 'accent' && 'bg-ink border-ink text-accent-100',
        on && tone === 'sage' && 'bg-neutral-200 border-ink text-ink',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
