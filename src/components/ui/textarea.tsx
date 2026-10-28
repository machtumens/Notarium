import * as React from 'react';

import { cn } from '@/lib/utils';

// shadcn/textarea (21st.dev). Structure verbatim; the props interface is an alias, not an empty
// `extends` interface, so `@typescript-eslint/no-empty-object-type` has nothing to flag.
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-neutral-300 bg-bg px-3 py-2 text-sm placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
