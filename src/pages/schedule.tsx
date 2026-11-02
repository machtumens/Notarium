import { useState, type FormEvent } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { api, type StudyRequest, type TutorSession } from '@/lib/api';
import { useAsync } from '@/lib/use-async';
import { cn } from '@/lib/utils';

const primary = cn(buttonVariants({ variant: 'primary' }), 'px-4 py-2.5 text-[13px]');
const slot = cn(buttonVariants({ variant: 'slot' }), 'px-3 py-1.5 text-[12px]');
const FIELD =
  'border border-neutral-400 px-3 py-2 text-[14px] bg-transparent text-ink focus:border-ink focus:outline-none';
const DAYS = 7;
const TZ = 'Asia/Jakarta';
// The school runs on UTC+7 with no DST, so a fixed offset is exact.
const JKT_MS = 7 * 3600_000;

const dayKey = (d: Date) => new Date(d.getTime() + JKT_MS).toISOString().slice(0, 10);
const week = () =>
  Array.from({ length: DAYS }, (_, i) => dayKey(new Date(Date.now() + i * 86400_000)));
const dayLabel = (key: string, i: number) =>
  i === 0
    ? 'Today'
    : i === 1
      ? 'Tomorrow'
      : new Date(`${key}T12:00:00+07:00`).toLocaleDateString('en-GB', {
          timeZone: TZ,
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const toIso = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+07:00`).toISOString();

/**
 * Schedule: who is tutoring what, when, over the next seven days — and what students are asking
 * for on each day, so tutors can see demand before they open a room. Group rooms only; 1:1 stays
 * off until the school has a safeguarding answer (see backend routes/tutors.ts).
 */
export function Schedule() {
  const days = week();
  const subjects = useAsync(() => api.subjects(), []);
  const sessions = useAsync(() => api.sessions.list(), []);
  const asks = useAsync(() => api.requests.list(days[0], DAYS), [days[0]]);
  const profiles = useAsync(() => api.tutors.mine(), []);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>, reload: () => void) => {
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const reloadAll = () => {
    sessions.retry();
    asks.retry();
  };

  const byDay = (key: string) => ({
    rooms: (sessions.data ?? []).filter((s) => dayKey(new Date(s.starts_at)) === key),
    wants: (asks.data ?? []).filter((r) => r.day === key),
  });
  const active = (profiles.data ?? []).filter((p) => p.status === 'active');
  const pending = (profiles.data ?? []).filter((p) => p.status === 'pending');

  return (
    <div data-screen-label="Schedule" className="flex flex-wrap gap-x-10 gap-y-8 items-start">
      <div className="flex-[100_1_440px] min-w-[min(100%,300px)] flex flex-col gap-6">
        <div className="border-t border-ink pt-3 flex flex-col gap-1">
          <span className="meta">Schedule</span>
          <h2 className="text-[clamp(28px,4vw,44px)]">Tutors this week</h2>
        </div>
        {error && (
          <p role="alert" className="text-ink border-l-[3px] border-ink pl-3">
            {error}
          </p>
        )}
        {days.map((key, i) => {
          const { rooms, wants } = byDay(key);
          return (
            <section
              key={key}
              aria-label={dayLabel(key, i)}
              className="border-t border-neutral-300 pt-3 flex flex-col gap-3"
            >
              <h3 className="text-[17px]">{dayLabel(key, i)}</h3>
              {rooms.length === 0 && wants.length === 0 && (
                <p className="text-neutral-600 text-[14px]">Nothing yet.</p>
              )}
              {rooms.map((s) => (
                <Room key={s.id} s={s} onAct={(fn) => act(fn, reloadAll)} />
              ))}
              {wants.length > 0 && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="meta">Asked for:</span>
                  {wants.map((w) => (
                    <Want key={w.subject_id} w={w} onAct={(fn) => act(fn, asks.retry)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <aside className="flex-[1_1_300px] min-w-[min(100%,280px)] flex flex-col gap-8">
        <AskForm
          days={days}
          subjects={subjects.data ?? []}
          onAsk={(sid, day, note) => act(() => api.requests.create(sid, day, note), asks.retry)}
        />
        {active.length > 0 ? (
          <RunForm
            days={days}
            profiles={active}
            onRun={(body) => act(() => api.sessions.create(body), sessions.retry)}
          />
        ) : (
          <ApplyForm
            subjects={subjects.data ?? []}
            pending={pending.map((p) => p.subject_name)}
            onApply={(sid, blurb) => act(() => api.tutors.apply(sid, blurb), profiles.retry)}
          />
        )}
      </aside>
    </div>
  );
}

function Room({ s, onAct }: { s: TutorSession; onAct: (fn: () => Promise<unknown>) => void }) {
  return (
    <div className="border border-neutral-300 px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 items-baseline">
      <span data-num className="font-extrabold text-ink">
        {time(s.starts_at)}–{time(s.ends_at)}
      </span>
      <span className="font-semibold text-ink">{s.subject_name}</span>
      {s.topic && <span className="text-neutral-800">{s.topic}</span>}
      <span className="meta">
        {s.i_am_tutor ? 'you are tutoring' : `with ${s.tutor_name}`}
        {s.location ? ` · ${s.location}` : ''} · {s.seats_left} seats left
      </span>
      <span className="ml-auto">
        {s.i_am_tutor ? (
          <button
            type="button"
            className={slot}
            onClick={() => onAct(() => api.sessions.cancel(s.id))}
          >
            Call off
          </button>
        ) : s.i_am_in ? (
          <button
            type="button"
            className={slot}
            onClick={() => onAct(() => api.sessions.cancel(s.id))}
          >
            Leave
          </button>
        ) : (
          <button
            type="button"
            className={slot}
            disabled={s.seats_left === 0}
            onClick={() => onAct(() => api.sessions.book(s.id))}
          >
            {s.seats_left === 0 ? 'Full' : 'Join'}
          </button>
        )}
      </span>
    </div>
  );
}

function Want({ w, onAct }: { w: StudyRequest; onAct: (fn: () => Promise<unknown>) => void }) {
  const mine = w.my_request_id != null;
  return (
    <button
      type="button"
      title={w.notes ?? undefined}
      className={cn(slot, mine && 'border-ink border-2')}
      onClick={() =>
        onAct(() =>
          mine
            ? api.requests.remove(w.my_request_id!)
            : api.requests.create(w.subject_id, w.day, ''),
        )
      }
    >
      {w.subject_name} · {w.count} {mine ? '(you — withdraw)' : '+ me too'}
    </button>
  );
}

type Opt = { id: number; name: string };

function AskForm({
  days,
  subjects,
  onAsk,
}: {
  days: string[];
  subjects: Opt[];
  onAsk: (subjectId: number, day: string, note: string) => void;
}) {
  const [sid, setSid] = useState(0);
  const [day, setDay] = useState(days[0]);
  const [note, setNote] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const subjectId = sid || subjects[0]?.id;
    if (!subjectId) return;
    onAsk(subjectId, day, note);
    setNote('');
  };
  return (
    <form onSubmit={submit} className="border-t border-ink pt-3 flex flex-col gap-2.5">
      <span className="meta">Ask for help</span>
      <p className="text-[14px] text-neutral-700">
        Tell tutors which subject you want covered, and when.
      </p>
      <select
        aria-label="Subject"
        className={FIELD}
        value={sid}
        onChange={(e) => setSid(Number(e.target.value))}
      >
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Day"
        className={FIELD}
        value={day}
        onChange={(e) => setDay(e.target.value)}
      >
        {days.map((d, i) => (
          <option key={d} value={d}>
            {dayLabel(d, i)}
          </option>
        ))}
      </select>
      <input
        aria-label="What you are stuck on (optional)"
        placeholder="What you're stuck on (optional)"
        maxLength={140}
        className={FIELD}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" className={cn(primary, 'w-fit')}>
        Send request
      </button>
    </form>
  );
}

function RunForm({
  days,
  profiles,
  onRun,
}: {
  days: string[];
  profiles: { id: number; subject_name: string }[];
  onRun: (body: Parameters<typeof api.sessions.create>[0]) => void;
}) {
  const [pid, setPid] = useState(profiles[0].id);
  const [day, setDay] = useState(days[0]);
  const [from, setFrom] = useState('15:00');
  const [to, setTo] = useState('16:00');
  const [seats, setSeats] = useState(8);
  const [topic, setTopic] = useState('');
  const [location, setLocation] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onRun({
      tutor_profile_id: pid,
      starts_at: toIso(day, from),
      ends_at: toIso(day, to),
      seat_cap: seats,
      topic,
      location,
    });
  };
  return (
    <form onSubmit={submit} className="border-t border-ink pt-3 flex flex-col gap-2.5">
      <span className="meta">Run a session</span>
      <select
        aria-label="Subject you tutor"
        className={FIELD}
        value={pid}
        onChange={(e) => setPid(Number(e.target.value))}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.subject_name}
          </option>
        ))}
      </select>
      <select
        aria-label="Day"
        className={FIELD}
        value={day}
        onChange={(e) => setDay(e.target.value)}
      >
        {days.map((d, i) => (
          <option key={d} value={d}>
            {dayLabel(d, i)}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          type="time"
          aria-label="Starts"
          className={cn(FIELD, 'flex-1')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="time"
          aria-label="Ends"
          className={cn(FIELD, 'flex-1')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <input
        type="number"
        min={2}
        max={30}
        aria-label="Seats"
        className={FIELD}
        value={seats}
        onChange={(e) => setSeats(Number(e.target.value))}
      />
      <input
        aria-label="Topic"
        placeholder="Topic, e.g. Stoichiometry"
        className={FIELD}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <input
        aria-label="Where"
        placeholder="Room or meeting link"
        className={FIELD}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />
      <button type="submit" className={cn(primary, 'w-fit')}>
        Put it on the schedule
      </button>
    </form>
  );
}

function ApplyForm({
  subjects,
  pending,
  onApply,
}: {
  subjects: Opt[];
  pending: string[];
  onApply: (subjectId: number, blurb: string) => void;
}) {
  const [sid, setSid] = useState(0);
  const [blurb, setBlurb] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const subjectId = sid || subjects[0]?.id;
    if (subjectId) onApply(subjectId, blurb);
  };
  return (
    <form onSubmit={submit} className="border-t border-ink pt-3 flex flex-col gap-2.5">
      <span className="meta">Become a tutor</span>
      {pending.length > 0 && (
        <p className="text-[14px] text-neutral-800">Waiting for approval: {pending.join(', ')}.</p>
      )}
      <p className="text-[14px] text-neutral-700">
        A moderator approves each subject. Then you can put sessions on the schedule.
      </p>
      <select
        aria-label="Subject to tutor"
        className={FIELD}
        value={sid}
        onChange={(e) => setSid(Number(e.target.value))}
      >
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        aria-label="About you"
        placeholder="One line about how you can help"
        maxLength={400}
        className={FIELD}
        value={blurb}
        onChange={(e) => setBlurb(e.target.value)}
      />
      <button type="submit" className={cn(slot, 'w-fit')}>
        Apply
      </button>
    </form>
  );
}
