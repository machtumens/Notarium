import { useNavigate } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { Pill } from '@/components/ui/pill';
import {
  COVERAGE,
  EVENT_SKIN,
  EXAMS,
  TASKS,
  TUTOR_FILTERS,
  WEEK_PLAN,
  tutorByName,
  tutorsFiltered,
  type EventKind,
  type Tutor,
} from '@/lib/data';
import { cn } from '@/lib/utils';
import { BookingDialog, buildBooking, type BookingOpts } from '@/components/tutors-booking';
import { useApp, type AppState, type Confirmed } from '@/store';

const VIEWS: { id: AppState['tutorView']; label: string }[] = [
  { id: 'cards', label: 'Ranked cards' },
  { id: 'board', label: 'Availability board' },
  { id: 'coverage', label: 'Subject coverage' },
  { id: 'calendar', label: 'Calendar' },
];
const CAL_LEGEND: { label: string; kind: EventKind }[] = [
  { label: 'Ujian', kind: 'exam' },
  { label: 'Sesi terkonfirmasi', kind: 'booked' },
  { label: 'Slot terbuka', kind: 'open' },
  { label: 'Tugas', kind: 'task' },
  { label: 'Sekolah', kind: 'school' },
];
/**
 * Calendar chip skin per kind. EVENT_SKIN still owns the copy and the structural flags (kicker,
 * dashed, clickable); only the colour moved here, onto tokens. The exam is the loud one, school
 * recedes because it is a background fact, and a bookable slot is a hairline box so it can invert.
 */
const CHIP: Record<EventKind, string> = {
  exam: 'bg-ink text-accent-100 border-ink',
  school: 'bg-neutral-100 border-neutral-300 text-neutral-700',
  task: 'bg-transparent border-neutral-400 text-neutral-700',
  booked: 'bg-neutral-200 border-ink text-ink',
  open: 'bg-transparent border-ink text-ink',
  group: 'bg-neutral-100 border-ink text-ink',
};
/** A bookable chip is a slot, so it inverts on hover like `buttonVariants({ variant: 'slot' })`. */
const CHIP_HOVER = 'hover:bg-ink hover:text-accent-100 hover:border-ink';

const isTa = (t: Tutor) => t.role === 'Teaching assistant';
// Match and role used to be a tint each. With one colour left, ink against grey carries the rank.
const matchCls = (t: Tutor) => (t.match >= 90 ? 'text-ink' : 'text-neutral-700');
const roleCls = (t: Tutor) => (isTa(t) ? 'text-ink' : 'text-neutral-700');
const primary = buttonVariants({ variant: 'primary' });
const slot = buttonVariants({ variant: 'slot' });
/** On an inverted block the hairline button has to invert the other way. */
const onInk = buttonVariants({ variant: 'dark' });
/** A panel in this system is content under a rule, not a filled box. */
const panel = 'border-t border-ink pt-4';
/** A list row: flush to the gutter, separated by a hairline, never a card. */
const row = 'border-b border-neutral-300';

type Nav = {
  openBooking: (o: BookingOpts) => void;
  goSession: () => void;
  goBooked: () => void;
  startPractice: () => void;
};

/** Tutor board: ranked cards / availability board / subject coverage / calendar, plus the booking modal. */
export function Tutors() {
  const {
    tutorView,
    tutorFilter: filter,
    calWeek,
    booking,
    confirmed,
    bookedTutor,
    bookedSlot,
    set,
  } = useApp();
  const nav = useNavigate();
  const tutors = tutorsFiltered(filter);
  const bookedLine = bookedTutor
    ? bookedTutor + (bookedSlot ? ` · ${bookedSlot}` : '')
    : 'Paul · 19:00';
  const go: Nav = {
    openBooking: (o) => set({ booking: buildBooking(o) }),
    goSession: () => {
      set({ sessionPhase: 'during' });
      nav('/app/session');
    },
    goBooked: () => {
      set({ sessionPhase: 'before' });
      nav('/app/session');
    },
    startPractice: () => {
      set({ practiceView: 'question' });
      nav('/app/practice');
    },
  };

  return (
    <div data-screen-label="Tutor board" className="flex flex-col gap-6">
      {/* Masthead band. The shell owns this screen's h1, so the deck steps down from it rather than competing. */}
      <div className="border-b border-ink pb-5 flex flex-col gap-2.5 items-start">
        <span className="meta">Tutor board · live</span>
        <h3 className="text-[clamp(20px,2.4vw,28px)] max-w-[48ch] [text-wrap:pretty]">
          Eight peers tutor here. Four are free tonight, ordered by what you are weakest at
        </h3>
      </div>
      {/* The view row reads heavier than the filter row under it: the same chip at two deliberate weights. */}
      <div className="flex items-center gap-2 flex-wrap">
        {VIEWS.map((v) => (
          <Pill
            key={v.id}
            on={tutorView === v.id}
            onClick={() => set({ tutorView: v.id })}
            className="px-4 py-2 text-[13px] font-bold"
          >
            {v.label}
          </Pill>
        ))}
        <span className="w-px h-[22px] bg-neutral-300 mx-1" />
        {TUTOR_FILTERS.map((f) => (
          <Pill key={f} on={filter === f} onClick={() => set({ tutorFilter: f })}>
            {f}
          </Pill>
        ))}
      </div>

      {tutorView === 'cards' && <TutorCards tutors={tutors} go={go} bookedLine={bookedLine} />}
      {tutorView === 'board' && <TutorBoard tutors={tutors} go={go} />}
      {tutorView === 'calendar' && (
        <TutorCalendar
          week={calWeek}
          setWeek={(w) => set({ calWeek: w })}
          confirmed={confirmed}
          go={go}
        />
      )}
      {tutorView === 'coverage' && <TutorCoverage />}

      {booking && (
        <BookingDialog
          key={`${booking.name}|${booking.slotId ?? ''}|${booking.slots[0] ?? ''}`}
          booking={booking}
        />
      )}
    </div>
  );
}

function TutorCards({ tutors, go, bookedLine }: { tutors: Tutor[]; go: Nav; bookedLine: string }) {
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
      <div className="flex-[100_1_420px] min-w-[min(100%,330px)] border-t border-ink">
        {tutors.map((t) => (
          <div
            key={t.name}
            className={cn(row, 'py-5 grid gap-4 md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-8')}
          >
            {/* The landing page's numeral column, with a face on it: who, then the figure that ranks them. */}
            <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-2.5">
              <span className="w-[54px] h-[54px] rounded-full border border-ink flex items-center justify-center text-[17px] font-extrabold flex-[0_0_54px]">
                {t.initials}
              </span>
              <span
                data-num={t.match || undefined}
                className={cn('text-[13px] font-bold leading-[1.25]', matchCls(t))}
              >
                {t.match ? `${t.match}% match` : 'subject not set'}
              </span>
            </div>
            <div className="min-w-0 flex flex-col gap-2">
              <span className="text-[21px] font-extrabold tracking-[-0.03em]">{t.name}</span>
              <div className="flex gap-3.5 flex-wrap text-[13px] text-neutral-700 font-semibold">
                <span>{t.subject}</span>
                <span>{t.rating} avg</span>
                <span>{t.sessions}</span>
                <span className={cn('font-bold', roleCls(t))}>{t.role}</span>
              </div>
              <p className="text-sm leading-[1.5] text-neutral-800 max-w-[60ch] [text-wrap:pretty]">
                {t.why}
              </p>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {t.slots.map((sl) => (
                  <button
                    key={sl}
                    type="button"
                    onClick={() => go.openBooking({ name: t.name, slots: [sl] })}
                    className={cn(slot, 'px-4 py-[9px] text-[13px]')}
                  >
                    {sl}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => go.openBooking({ name: t.name })}
                  className={cn(primary, 'px-5 py-2.5 text-sm')}
                >
                  {t.match ? 'Book session' : 'Ask her to pick a subject'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex-[1_1_280px] min-w-[min(100%,265px)] max-w-[340px] flex flex-col gap-7">
        <div className="border-t border-neutral-300 pt-3.5 flex flex-col gap-2">
          <span className="meta">How this is ranked</span>
          <p className="text-sm leading-[1.55] text-neutral-700 [text-wrap:pretty]">
            Match is your learning state against what each tutor actually teaches — not their
            rating. A 5.0 tutor for a subject at 81% ranks below a 4.7 for a topic at 41%.
          </p>
        </div>
        {/* This view's one inverted block: the session you are meant to walk into. */}
        <div className="bg-ink text-accent-100 p-5 flex flex-col gap-2.5">
          <span className="meta text-accent-300">Next session</span>
          <span data-num className="text-[20px] font-extrabold tracking-[-0.02em]">
            {bookedLine}
          </span>
          <p className="text-sm leading-[1.5] text-accent-300">
            Your diagnostic is already attached. He sees the Vektor state before you arrive.
          </p>
          <button
            type="button"
            onClick={go.goSession}
            className={cn(onInk, 'self-start mt-1 px-[18px] py-2.5 text-sm')}
          >
            Open session
          </button>
        </div>
      </div>
    </div>
  );
}

function TutorBoard({ tutors, go }: { tutors: Tutor[]; go: Nav }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3.5 flex-wrap border-b border-ink pb-3">
        <h4 className="text-[20px]">Available tonight</h4>
        <span className="meta">Live · 8 peers, 11 open slots</span>
      </div>
      {tutors.map((t) => (
        <div key={t.name} className={cn(row, 'flex items-center gap-3.5 flex-wrap py-3.5')}>
          <span className="w-[38px] h-[38px] rounded-full border border-ink flex items-center justify-center text-sm font-extrabold flex-[0_0_38px]">
            {t.initials}
          </span>
          <div className="flex-[1_1_180px] min-w-0 leading-[1.3]">
            <div className="text-[15px] font-extrabold text-neutral-900">{t.name}</div>
            <div className="text-[13px] text-neutral-700">{t.subject}</div>
          </div>
          <span
            data-num={t.match || undefined}
            className={cn('text-[13px] font-bold flex-none', matchCls(t))}
          >
            {t.match ? `${t.match}%` : '—'}
          </span>
          <div className="flex gap-2 flex-wrap flex-none">
            {t.slots.map((sl) => (
              <button
                key={sl}
                type="button"
                onClick={() => go.openBooking({ name: t.name, slots: [sl] })}
                className={cn(slot, 'px-3.5 py-2 text-xs whitespace-nowrap')}
              >
                {sl}
              </button>
            ))}
          </div>
          <span className={cn('text-[13px] font-bold flex-none', roleCls(t))}>{t.role}</span>
        </div>
      ))}
      <p className="text-[13px] text-neutral-700 pt-3.5">
        Rows are ordered by match, not by rating or price. Slots grey out as they fill.
      </p>
    </div>
  );
}

/** logic.js calendarData: a confirmed booking turns its open/group slot into a booked chip. */
function calendarData(week: number, confirmed: Confirmed[], go: Nav) {
  const done = new Set(confirmed.map((c) => c.slotId).filter(Boolean));
  const plan = WEEK_PLAN[week] ?? WEEK_PLAN[0];
  let open = 0,
    exams = 0,
    tasks = 0;
  const days = plan.days.map((d) => {
    const events = d.events.map((e) => {
      const booked = !!e.id && done.has(e.id);
      const kind: EventKind = booked ? 'booked' : e.kind;
      const st = EVENT_SKIN[kind];
      if (kind === 'open' || kind === 'group') open += 1;
      if (kind === 'exam') exams += 1;
      if (kind === 'task') tasks += 1;
      const onClick =
        kind === 'open' || kind === 'group'
          ? () =>
              go.openBooking({
                name: e.who ?? e.label,
                slotId: e.id,
                slots: [`${d.day} ${d.date} · ${e.meta.split(' · ')[0]}`],
                kind: kind === 'group' ? 'Study group · peers' : 'Tutor session · 1:1',
              })
          : kind === 'booked'
            ? go.goBooked
            : undefined;
      return {
        kicker: booked ? 'Sesi · baru' : st.kicker,
        label: e.label,
        meta: booked ? `${e.meta} · confirmed` : e.meta,
        cls: CHIP[kind],
        dashed: !!st.dashed,
        clickable: !!st.clickable,
        onClick,
      };
    });
    return { day: d.day, date: d.date, today: !!d.today, events };
  });
  return { days, summary: `${exams} ujian · ${tasks} tugas · ${open} slot terbuka` };
}

function TutorCalendar({
  week,
  setWeek,
  confirmed,
  go,
}: {
  week: number;
  setWeek: (i: number) => void;
  confirmed: Confirmed[];
  go: Nav;
}) {
  const cal = calendarData(week, confirmed, go);
  const lastConfirmed = confirmed.at(-1)?.text ?? '';
  return (
    <div className="flex flex-col gap-5">
      {confirmed.length > 0 && (
        <div className="flex items-baseline gap-3.5 flex-wrap border-t border-ink pt-3.5">
          <span className="meta">Booked</span>
          <span data-num className="text-[15px] font-extrabold text-ink">
            {lastConfirmed}
          </span>
          <span className="text-[13px] text-neutral-700">
            Diagnostic attached · it is on both calendars now
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {WEEK_PLAN.map((w, i) => (
          <Pill
            key={w.label}
            on={week === i}
            onClick={() => setWeek(i)}
            className="px-4 py-2 text-[13px] font-bold"
          >
            {w.label}
          </Pill>
        ))}
        <span data-num className="meta ml-1">
          {cal.summary}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
        <div className="flex-[100_1_560px] min-w-[min(100%,320px)] grid grid-cols-[repeat(auto-fit,minmax(146px,1fr))] gap-x-4 gap-y-6">
          {cal.days.map((d) => (
            // Today is a heavier rule and an ink date, not a tinted column.
            <div
              key={d.date}
              className={cn(
                'border-t pt-2.5 flex flex-col gap-2 min-h-[212px]',
                d.today ? 'border-ink' : 'border-neutral-300',
              )}
            >
              <div className="flex items-baseline gap-[7px] pb-1.5 border-b border-neutral-300">
                <span
                  data-num
                  className={cn(
                    'text-[21px] font-extrabold tracking-[-0.03em]',
                    d.today ? 'text-ink' : 'text-neutral-700',
                  )}
                >
                  {d.date}
                </span>
                <span className="meta">{d.day}</span>
                <span className="meta ml-auto text-ink">{d.today ? 'Hari ini' : ''}</span>
              </div>
              {d.events.map((e, i) => (
                // The chip's lines inherit its colour and separate by opacity, so the hover inversion carries them.
                <button
                  key={i}
                  type="button"
                  onClick={e.onClick}
                  className={cn(
                    'border px-2.5 py-2 flex flex-col gap-px text-left w-full',
                    e.cls,
                    e.dashed ? 'border-dashed' : 'border-solid',
                    e.clickable ? cn('cursor-pointer', CHIP_HOVER) : 'cursor-default',
                  )}
                >
                  <span className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-70">
                    {e.kicker}
                  </span>
                  <span className="text-[13px] font-bold leading-[1.3]">{e.label}</span>
                  <span className="text-xs font-semibold opacity-80">{e.meta}</span>
                </button>
              ))}
              {d.events.length === 0 && (
                <span className="text-[12.5px] text-neutral-700 p-0.5">Nothing scheduled</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex-[1_1_290px] min-w-[min(100%,265px)] max-w-[350px] flex flex-col gap-6">
          <div className={cn(panel, 'flex flex-col gap-3.5')}>
            <div className="flex items-baseline justify-between gap-2.5">
              <h4 className="text-[19px]">Ujian</h4>
              <span data-num className="meta">
                {EXAMS.length} upcoming
              </span>
            </div>
            {EXAMS.map((x) => (
              <div
                key={x.label}
                className={cn(
                  'flex gap-[11px] items-start border-l-2 pl-3',
                  x.urgent ? 'border-ink' : 'border-neutral-300',
                )}
              >
                <div className="flex-auto min-w-0 flex flex-col gap-px">
                  <span className="text-[14.5px] font-bold text-neutral-900">{x.label}</span>
                  <span data-num className="text-[12.5px] text-neutral-700">
                    {x.when}
                  </span>
                  <span className="text-[12.5px] text-neutral-700">{x.topic}</span>
                </div>
                <span
                  data-num
                  className={cn(
                    'flex-none text-[11.5px] whitespace-nowrap',
                    x.urgent ? 'font-extrabold text-ink' : 'font-bold text-neutral-700',
                  )}
                >
                  {x.in}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={go.startPractice}
              className={cn(primary, 'self-start px-[19px] py-2.5 text-[13.5px]')}
            >
              Practice what these cover
            </button>
          </div>

          <div className={cn(panel, 'flex flex-col gap-3.5')}>
            <div className="flex items-baseline justify-between gap-2.5">
              <h4 className="text-[19px]">Tugas</h4>
              <span data-num className="meta">
                {TASKS.length} to hand in
              </span>
            </div>
            {TASKS.map((t) => (
              <div
                key={t.label}
                className={cn(
                  'flex gap-[11px] items-start border-l-2 border-dashed pl-3',
                  t.urgent ? 'border-ink' : 'border-neutral-300',
                )}
              >
                <div className="flex-auto min-w-0 flex flex-col gap-px">
                  <span className="text-[14.5px] font-bold text-neutral-900">{t.label}</span>
                  <span data-num className="text-[12.5px] text-neutral-700">
                    {t.when}
                  </span>
                </div>
                {/* No data-num here: a task's countdown can read "hari ini", which is a word, not a figure. */}
                <span
                  className={cn(
                    'flex-none text-[11.5px] whitespace-nowrap',
                    t.urgent ? 'font-extrabold text-ink' : 'font-bold text-neutral-700',
                  )}
                >
                  {t.in}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3.5 flex-wrap border-t border-neutral-300 pt-3.5">
            {CAL_LEGEND.map((l) => (
              <span
                key={l.label}
                className="flex items-center gap-[7px] text-[12.5px] font-semibold text-neutral-800"
              >
                <span
                  className={cn(
                    'w-3 h-3 border flex-[0_0_12px]',
                    CHIP[l.kind],
                    EVENT_SKIN[l.kind].dashed ? 'border-dashed' : 'border-solid',
                  )}
                />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TutorCoverage() {
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-8 items-start">
      <div className="flex-[100_1_420px] min-w-[min(100%,330px)] flex flex-col">
        <div className="flex items-baseline justify-between gap-3.5 flex-wrap border-b border-ink pb-2.5">
          <h4 className="text-[20px]">Six subjects, eight peers</h4>
          <span className="meta">Every tutor on this board is a student here</span>
        </div>
        {COVERAGE.map((c) => {
          const empty = c.people.length === 0;
          const count = empty
            ? 'no tutors yet'
            : c.people.length === 1
              ? '1 tutor · thin cover'
              : `${c.people.length} tutors`;
          return (
            <div key={c.name} className={cn(row, 'flex gap-[18px] flex-wrap items-start py-3.5')}>
              <div className="flex-[0_0_180px] min-w-[150px] flex flex-col gap-1">
                {/* A subject with nobody on it recedes by weight — there is no colour left to grey it with. */}
                <span
                  className={cn(
                    'text-[19px] tracking-[-0.02em]',
                    empty ? 'font-semibold text-neutral-700' : 'font-extrabold text-ink',
                  )}
                >
                  {c.name}
                </span>
                <span data-num={c.people.length || undefined} className="meta">
                  {count}
                </span>
              </div>
              <div className="flex-[1_1_260px] min-w-0 flex flex-wrap gap-2 items-center">
                {c.people.map((name) => {
                  const t = tutorByName(name);
                  return (
                    <span
                      key={name}
                      className="flex items-center gap-2 border border-neutral-300 py-1 pr-3 pl-1 text-[13.5px] font-bold"
                    >
                      <span className="w-[26px] h-[26px] rounded-full border border-ink flex items-center justify-center text-[10.5px] font-extrabold flex-[0_0_26px]">
                        {t.initials}
                      </span>
                      {name}
                      <span
                        className={cn(
                          'text-[10px] font-bold tracking-[0.14em] uppercase',
                          roleCls(t),
                        )}
                      >
                        {isTa(t) ? 'TA' : 'peer'}
                      </span>
                    </span>
                  );
                })}
                {empty && (
                  <span className="border border-dashed border-neutral-400 px-3.5 py-1.5 text-[13px] font-semibold text-neutral-700">
                    {c.note}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex-[1_1_280px] min-w-[min(100%,265px)] max-w-[340px] flex flex-col gap-7">
        {/* This view's one inverted block: the hole in the board is the thing worth seeing. */}
        <div className="bg-ink text-accent-100 p-5 flex flex-col gap-2">
          <span className="meta text-accent-300">Thin cover</span>
          <p className="text-sm leading-[1.55] [text-wrap:pretty]">
            Geografi has one tutor. If Jennifer is booked the subject has nobody, so the board says
            that instead of returning an empty search.
          </p>
        </div>
        <div className="border-t border-neutral-300 pt-3.5 flex flex-col gap-2">
          <span className="meta">Teaching assistants</span>
          <p className="text-sm leading-[1.55] text-neutral-700 [text-wrap:pretty]">
            Paul and Rosmyas are Fisika TAs — they carry the clinic slots and the worked solutions.
            The other six tutor their own subjects, a year above you or alongside you.
          </p>
        </div>
      </div>
    </div>
  );
}
