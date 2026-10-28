import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/** The shadcn variants share this chrome; the design's flat variants below deliberately do not (they keep the pages' strings, class for class). */
const SHADCN =
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
const SHADCN_VARIANTS = [
  'default',
  'destructive',
  'outline',
  'secondary',
  'ghost',
  'link',
  'sage',
] as const;

// shadcn/button (21st.dev) — variants on the ink ramp; square per the Swiss system (no radius anywhere).
const buttonVariants = cva('rounded-none', {
  variants: {
    variant: {
      default: 'bg-accent-700 text-accent-100 hover:bg-accent-600 active:bg-accent-800',
      destructive: 'bg-accent-800 text-accent-100 hover:bg-accent-900',
      outline: 'border border-ink bg-transparent text-ink hover:bg-ink hover:text-accent-100',
      secondary: 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300',
      ghost: 'hover:bg-accent-200 hover:text-accent-700',
      link: 'text-accent-700 underline-offset-4 hover:underline',
      sage: 'bg-sage-800 text-sage-100 hover:bg-sage-700',
      // Padding and text size come from the call site, as they always did.
      /** Solid ink — every "do the thing" button. */
      primary: 'border-0 bg-ink text-accent-100 font-bold cursor-pointer hover:bg-accent-600',
      /** Hairline box that inverts to ink on hover: a bookable slot, the booking dialog's Cancel and ✕. */
      slot: 'border border-ink bg-transparent text-ink font-bold cursor-pointer hover:bg-ink hover:text-accent-100',
      /** Hairline box on the dark live-session panel — inverts to paper. */
      dark: 'border border-accent-400 bg-transparent text-accent-100 font-bold cursor-pointer hover:bg-accent-100 hover:text-ink',
    },
    size: {
      // `default` is empty here and filled in by the compound rule below, so the pills do not inherit h-10 px-4 py-2.
      default: '',
      sm: 'h-9 px-3',
      lg: 'h-11 px-8',
      icon: 'h-10 w-10',
    },
  },
  compoundVariants: [
    { variant: [...SHADCN_VARIANTS], class: SHADCN },
    { variant: [...SHADCN_VARIANTS], size: 'default', class: 'h-10 px-4 py-2' },
  ],
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
