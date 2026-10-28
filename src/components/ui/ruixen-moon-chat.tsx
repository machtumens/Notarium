import { useCallback, useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { I } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

/**
 * ruixen-moon-chat (21st.dev) — the auto-resizing composer with attach / send and
 * quick-action pills. The original paints a fixed moon photo behind it; here the
 * background is a slot so the Horizon-Glow / Ink-Garden canvas can sit there instead,
 * and the chrome takes the Organic palette. Used by the sign-in screen and the AI surface.
 */

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

export function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }
      textarea.style.height = `${minHeight}px`; // reset first
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Infinity));
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);
  return { textareaRef, adjustHeight };
}

export type QuickActionProps = { icon: React.ReactNode; label: string; onClick?: () => void };

export function QuickAction({ icon, label, onClick }: QuickActionProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="flex items-center gap-2 rounded-none bg-neutral-100 text-neutral-800 px-[17px] py-2.5 h-auto text-[13.5px] font-bold hover:bg-accent-200 hover:border-accent hover:text-accent-700"
    >
      <span className="text-accent-700">{icon}</span>
      <span>{label}</span>
    </Button>
  );
}

type ComposerProps = {
  value?: string;
  onChange?: (v: string) => void;
  onSend: (text: string) => void;
  onAttach?: () => void;
  placeholder?: string;
  hintEmpty?: string;
  hintFilled?: string;
  className?: string;
  /** A reply is in flight: Send is disabled and Enter does nothing (typing still works). */
  busy?: boolean;
  /** Accessible name for the textarea (it has no visible label). */
  label?: string;
};

/** The composer box alone (textarea + attach + send). Controlled or uncontrolled. Enter sends, Shift+Enter adds a line. */
export function Composer({
  value,
  onChange,
  onSend,
  onAttach,
  placeholder = 'Type your request...',
  hintEmpty = '',
  hintFilled = 'Enter sends',
  className,
  busy = false,
  label = 'Your message',
}: ComposerProps) {
  const [inner, setInner] = useState('');
  const text = value ?? inner;
  const setText = (v: string) => {
    if (onChange) onChange(v);
    else setInner(v);
  };
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 48, maxHeight: 150 });
  const canSend = text.trim().length > 0 && !busy;

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
    adjustHeight(true);
  };

  return (
    <div
      className={cn(
        'relative bg-neutral-100 border border-neutral-400 rounded-none pl-2 pr-1.5 py-1.5 flex flex-col gap-0.5',
        className,
      )}
    >
      <Textarea
        ref={textareaRef}
        value={text}
        rows={1}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        className={cn(
          'w-full px-3.5 py-3 resize-none border-none rounded-none',
          'bg-transparent text-ink text-[15px] leading-[1.5]',
          'focus-visible:ring-0 focus-visible:ring-offset-0',
          'placeholder:text-neutral-600 min-h-[48px]',
        )}
        style={{ overflow: 'hidden' }}
      />
      <div className="flex items-center gap-[9px]">
        <Button
          variant="ghost"
          size="icon"
          onClick={onAttach}
          aria-label="Attach a note or photo"
          title="Attach a note or photo"
          className="border border-neutral-400 rounded-none w-[38px] h-[38px] flex-[0_0_38px] text-neutral-700 hover:bg-accent-200 hover:border-accent"
        >
          <I.paperclip size={17} />
        </Button>
        <span className="text-xs font-semibold text-neutral-700">
          {canSend ? hintFilled : hintEmpty}
        </span>
        <Button
          disabled={!canSend}
          onClick={send}
          aria-label="Send"
          className={cn(
            'ml-auto w-[42px] h-[42px] flex-[0_0_42px] rounded-none p-0',
            canSend
              ? 'bg-accent-700 text-accent-100 hover:bg-accent-800'
              : 'bg-neutral-200 text-neutral-600 cursor-not-allowed',
          )}
        >
          <I.arrowUp size={19} />
          <span className="sr-only">Send</span>
        </Button>
      </div>
    </div>
  );
}

type MoonChatProps = {
  background?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  brand?: string;
  children?: React.ReactNode;
  quickActions?: QuickActionProps[];
  footer?: React.ReactNode;
  className?: string;
  'data-screen-label'?: string;
};

/**
 * Sign-in layout. The 21st.dev demo centred everything over a glow; this system does not centre
 * and has no glow, so it is an editorial two-column instead: the argument on the left under a
 * rule, the form on the right. Below `md` the columns stack and it reads top to bottom.
 */
export default function RuixenMoonChat({
  background,
  title,
  subtitle,
  brand = 'Notarium',
  children,
  quickActions = [],
  footer,
  className,
  'data-screen-label': screenLabel,
}: MoonChatProps) {
  return (
    <div
      data-screen-label={screenLabel}
      className={cn(
        'relative w-full min-h-[calc(100vh-53px)] px-6 md:px-10 pt-12 pb-16',
        className,
      )}
    >
      {background}
      <div className="relative mx-auto w-full max-w-[1060px] grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,440px)] md:gap-16 md:items-start">
        <div className="flex flex-col gap-4 border-t-2 border-ink pt-5">
          <span className="meta">{brand}</span>
          <h1 className="text-[clamp(32px,5vw,64px)] text-ink max-w-[13ch] [text-wrap:balance]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-base leading-[1.5] text-neutral-700 max-w-[46ch] [text-wrap:pretty]">
              {subtitle}
            </p>
          )}
        </div>
        <div className="relative flex flex-col gap-4">
          {children}
          {quickActions.length > 0 && (
            <div className="flex items-center flex-wrap gap-2">
              {quickActions.map((q) => (
                <QuickAction key={q.label} {...q} />
              ))}
            </div>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
