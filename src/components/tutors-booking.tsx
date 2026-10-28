import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import { BOOK_KINDS, BOOK_TOPICS, tutorByName } from '@/lib/data';
import { cn } from '@/lib/utils';
import { useApp, type Booking } from '@/store';

export type BookingOpts = { name: string; slots?: string[]; slotId?: string; kind?: string };

const DEFAULT_KIND = 'Tutor session · 1:1';
const DEFAULT_TOPIC = 'Penguraian komponen';
const LENS = ['25 min', '60 min'];

/** Mirrors logic.js openBooking: the global `booking` object the dialog renders from. */
export function buildBooking(opts: BookingOpts): Booking {
  const t = tutorByName(opts.name);
  return {
    name: t.name,
    initials: t.initials,
    subject: t.subject,
    tone: t.tone,
    slots: opts.slots?.length ? opts.slots : t.slots.length ? t.slots : ['Minta jadwal'],
    slotId: opts.slotId ?? null,
    kind: opts.kind || DEFAULT_KIND,
  };
}

/** Every field label in the dialog is the Swiss caption. */
const label = 'meta';
const primary = buttonVariants({ variant: 'primary' });
/** The hairline box that inverts to ink on hover — the ✕ and Cancel. */
const slot = buttonVariants({ variant: 'slot' });
/** What Tab can land on inside the dialog. */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Booking modal. Mounted only while the global `booking` is set; the kind / when / length /
 * topic picks are page-local (logic.js bookKind / bookWhen / bookLen / bookTopic).
 */
export function BookingDialog({ booking }: { booking: Booking }) {
  const { set } = useApp();
  const [when, setWhen] = useState(booking.slots[0] ?? 'Minta jadwal');
  const [kind, setKind] = useState(booking.kind);
  const [len, setLen] = useState('60 min');
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const dialog = useRef<HTMLDivElement>(null);

  const close = () => set({ booking: null });
  // Focus: the first control takes it on open, and whatever opened the dialog gets it back when the dialog unmounts.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, []);
  // Escape closes; Tab and Shift+Tab wrap inside the dialog (from the dialog box itself — tabIndex -1, where a click on plain text lands — they go to the first / last control).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!controls.length) return;
    const first = controls[0],
      last = controls[controls.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const atEdge = e.shiftKey ? active === first : active === last;
    if (atEdge || !active || !controls.includes(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };
  const confirm = () =>
    set((s) => ({
      booking: null,
      tutorView: 'calendar',
      bookedTutor: booking.name,
      bookedSlot: when,
      confirmed: s.confirmed.concat({
        slotId: booking.slotId,
        text: `${booking.name} · ${when} · ${len}`,
      }),
    }));
  const note =
    topic === 'Let them decide'
      ? 'Your whole learning state goes across — they pick the topic when they see it.'
      : `The AI diagnostic for ${topic} goes across two hours before, so nobody spends the first fifteen minutes finding out what is wrong.`;

  return (
    // A modal here is a square white panel on a plain dark scrim: hairline border, no radius, no shadow, no blur.
    <div className="fixed inset-0 z-40 bg-ink/50 flex items-center justify-center p-[22px] animate-fadein">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${booking.name}`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-[min(100%,570px)] max-h-[88vh] overflow-auto bg-bg border border-ink px-7 py-6 flex flex-col gap-[17px] animate-fadein"
      >
        {/* ✕ stays the first control in the DOM: the focus trap hands it focus on open. */}
        <div className="flex items-center gap-3.5 flex-wrap border-b border-ink pb-4">
          <span className="w-[52px] h-[52px] rounded-full bg-ink text-accent-100 flex items-center justify-center text-[17px] font-extrabold flex-[0_0_52px]">
            {booking.initials}
          </span>
          <div className="flex-[1_1_190px] min-w-0 leading-[1.3]">
            <div className="text-[22px] font-extrabold tracking-[-0.03em]">{booking.name}</div>
            <div className="text-[13.5px] font-semibold text-neutral-700">{booking.subject}</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className={cn(slot, 'w-9 h-9 text-sm flex-[0_0_36px]')}
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-[9px]">
          <span className={label}>Kind of session</span>
          <div className="flex flex-col gap-2">
            {BOOK_KINDS.map((k) => (
              // Picked = inverted, not tinted. The body line rides on opacity so it inverts with the box.
              <button
                key={k.label}
                type="button"
                onClick={() => setKind(k.label)}
                className={cn(
                  'border px-4 py-[13px] flex flex-col gap-0.5 text-left cursor-pointer w-full',
                  kind === k.label
                    ? 'bg-ink border-ink text-accent-100'
                    : 'bg-transparent border-neutral-300 text-ink hover:border-ink',
                )}
              >
                <span className="text-[14.5px] font-extrabold">{k.label}</span>
                <span className="text-[12.5px] opacity-70">{k.body}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-[22px] flex-wrap">
          <div className="flex-[1_1_210px] min-w-0 flex flex-col gap-[9px]">
            <span className={label}>When</span>
            <div className="flex gap-2 flex-wrap">
              {booking.slots.map((sl) => (
                <Pill
                  key={sl}
                  on={when === sl}
                  onClick={() => setWhen(sl)}
                  className="px-[15px] py-[9px] text-[13px] font-bold"
                >
                  {sl}
                </Pill>
              ))}
            </div>
          </div>
          <div className="flex-[0_1_150px] min-w-0 flex flex-col gap-[9px]">
            <span className={label}>Length</span>
            <div className="flex gap-2 flex-wrap">
              {LENS.map((l) => (
                <Pill
                  key={l}
                  on={len === l}
                  onClick={() => setLen(l)}
                  className="px-[15px] py-[9px] text-[13px] font-bold"
                >
                  {l}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[9px]">
          <span className={label}>What to work on</span>
          <div className="flex gap-2 flex-wrap">
            {BOOK_TOPICS.map((tp) => (
              <Pill
                key={tp}
                on={topic === tp}
                onClick={() => setTopic(tp)}
                className="px-[15px] py-[9px] text-[13px] font-semibold"
              >
                {tp}
              </Pill>
            ))}
          </div>
        </div>

        <div className="border-t border-neutral-300 pt-3.5 flex flex-col gap-1">
          <span className={label}>Sent with the booking</span>
          <p className="text-[13.5px] leading-[1.5] text-neutral-700 [text-wrap:pretty]">{note}</p>
        </div>

        {/* Cancel stays the last control in the DOM: the focus trap wraps Tab back to the ✕ from it. */}
        <div className="flex items-center gap-[11px] flex-wrap border-t border-neutral-300 pt-4">
          <button type="button" onClick={confirm} className={cn(primary, 'px-6 py-3 text-[15px]')}>
            Confirm {len} · {when || 'jadwal'}
          </button>
          <button type="button" onClick={close} className={cn(slot, 'px-[22px] py-3 text-sm')}>
            Cancel
          </button>
          <span className="text-[12.5px] text-neutral-700">
            No credits, no payment — peers tutor peers here.
          </span>
        </div>
      </div>
    </div>
  );
}
