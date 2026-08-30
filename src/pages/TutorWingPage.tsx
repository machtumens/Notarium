import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { darkTheme } from '../theme';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatAppointment } from '../lib/datetime';

// Tutor wing — redesign brief option 2f, T1 (profiles + directory).
//
// Moss is the tutor colour, per the brief ("Tutor wing — 1e in moss").
// Scheduling and booking are deliberately absent: 1:1 sessions are gated on the
// safeguarding question recorded in the tutor-wing plan. Rather than shipping a
// dead "Book 1:1" button, the card states plainly that booking is not open yet.

type Tutor = Awaited<ReturnType<typeof api.getTutors>>['tutors'][number];
type Eligibility = Awaited<ReturnType<typeof api.getTutorEligibility>>;
type Session = Awaited<ReturnType<typeof api.getSessions>>['sessions'][number];

// Sessions carry the zone in the text. Two people have to be in the same place
// at the same moment, and a bare "18:00" is how one of them ends up waiting in
// an empty room.
const when = (iso: string) => formatAppointment(iso, iso);

const glass: React.CSSProperties = {
  background: 'rgba(255,255,255,.55)',
  backdropFilter: 'blur(26px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
  border: '1px solid rgba(255,255,255,.75)',
  boxShadow: '0 18px 40px rgba(20,44,30,.18)',
  borderRadius: 16,
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

export default function TutorWingPage() {
  const [tutors, setTutors] = useState<Tutor[] | null>(null);
  const [elig, setElig] = useState<Eligibility | null>(null);
  const [applying, setApplying] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => {
    api
      .getTutors()
      .then((r) => setTutors(r.tutors ?? []))
      .catch((e) => {
        logger.error('tutors', 'list failed', e);
        setTutors([]);
      });
    api
      .getTutorEligibility()
      .then(setElig)
      .catch(() => setElig(null));
    api
      .getSessions()
      .then((r) => setSessions(r.sessions ?? []))
      .catch(() => setSessions([]));
  };

  const finish = async (s: Session) => {
    setBusy(s.id);
    try {
      const r = await api.completeSession(s.id);
      toast(
        r.already_completed
          ? 'Already completed.'
          : r.points_awarded
            ? `Session closed — ${r.points_awarded} learning points.`
            : 'Session closed. No attendees, so no points.',
      );
      load();
    } catch (e) {
      toast('Could not close the session.');
      logger.error('tutors', 'complete failed', e);
    } finally {
      setBusy(null);
    }
  };

  const join = async (s: Session) => {
    setBusy(s.id);
    try {
      if (s.i_am_in) {
        await api.cancelSession(s.id);
        toast('You left the session.');
      } else {
        const r = await api.bookSession(s.id);
        toast(`Seat ${r.seat_no} is yours.`);
      }
      load();
    } catch (e) {
      // The server is the authority on capacity; surface its refusal rather
      // than pre-checking seats_left, which can be stale by the time we click.
      toast('Could not update your seat — the room may be full.');
      logger.error('tutors', 'book/cancel failed', e);
    } finally {
      setBusy(null);
    }
  };

  useEffect(load, []);

  const apply = async (subjectId: number) => {
    setApplying(true);
    try {
      const r = await api.applyAsTutor({ subject_id: subjectId });
      toast(r.message ?? 'Application sent.');
      load();
    } catch (e) {
      toast('Could not send the application.');
      logger.error('tutors', 'apply failed', e);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ padding: '24px 16px 48px', maxWidth: 1080, margin: '0 auto' }}>
      <header style={{ marginBottom: 18 }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: '#3d6b52',
            marginBottom: 8,
          }}
        >
          Tutor wing
        </div>
        <h1 style={{ fontSize: 30, margin: 0, color: darkTheme.colors.textPrimary }}>
          Top-ranked students from your school
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: darkTheme.colors.textSecondary }}>
          Sessions are free — tutors earn learning points, not money.
        </p>
      </header>

      {/* Become a tutor. Honey, because it is a "you" action. */}
      {elig && (
        <section style={{ ...glass, padding: '16px 18px', marginBottom: 16 }}>
          {elig.my_profiles.length > 0 ? (
            <div style={{ fontSize: 13, color: darkTheme.colors.textPrimary }}>
              {elig.my_profiles.map((p) => (
                <div key={p.id} style={{ marginBottom: 4 }}>
                  <strong>{p.subject_name}</strong> —{' '}
                  <span
                    style={{
                      color: p.status === 'active' ? '#1f5c3e' : '#6f5015',
                      fontWeight: 600,
                    }}
                  >
                    {p.status === 'active'
                      ? 'you are a tutor'
                      : p.status === 'pending'
                        ? 'awaiting moderator review'
                        : p.status}
                  </span>
                </div>
              ))}
            </div>
          ) : elig.eligible ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: darkTheme.colors.textPrimary }}>
                You qualify to tutor. A moderator reviews every application.
              </div>
              <button
                type="button"
                disabled={applying}
                onClick={() => {
                  const first = tutors?.[0]?.subject_id;
                  if (first) apply(first);
                  else toast('Open a subject from Community, then apply from there.');
                }}
                style={{
                  marginLeft: 'auto',
                  height: 38,
                  padding: '0 22px',
                  borderRadius: 999,
                  background: 'rgba(201,155,74,.2)',
                  border: '1px solid rgba(185,138,60,.45)',
                  color: '#6f5015',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: applying ? 'wait' : 'pointer',
                }}
              >
                Become a tutor
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                Not eligible to tutor yet
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#3c4f43' }}>
                {elig.reasons.map((r) => (
                  <li key={r} style={{ marginBottom: 3 }}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {sessions.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2
            className="mono"
            style={{
              fontSize: 10.5,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: '#3c4f43',
              margin: '0 0 10px',
            }}
          >
            Sessions this week
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {sessions.map((s) => {
              const full = s.seats_left <= 0 && !s.i_am_in;
              // The tutor running the room closes it; everyone else joins.
              const mine = s.i_am_tutor;
              return (
                <article key={s.id} style={{ ...glass, padding: '14px 16px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      marginBottom: 3,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {s.topic ??
                        s.subject_name ??
                        (s.kind === 'one_to_one' ? '1:1 session' : 'Group session')}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: 9,
                        letterSpacing: '.08em',
                        padding: '2px 7px',
                        borderRadius: 999,
                        // Juniper for 1:1, moss for group — a student should be
                        // able to tell at a glance which kind they are joining.
                        background:
                          s.kind === 'one_to_one' ? 'rgba(62,125,140,.16)' : 'rgba(99,163,127,.18)',
                        color: s.kind === 'one_to_one' ? '#2c5f6b' : '#1f5c3e',
                        fontWeight: 700,
                      }}
                    >
                      {s.kind === 'one_to_one' ? '1:1' : 'GROUP'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#3c4f43', marginBottom: 8 }}>
                    {s.tutor_name} · {when(s.starts_at)}
                    {s.location ? ` · ${s.location}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={chip}>
                      {s.kind === 'one_to_one'
                        ? s.seats_taken > 0
                          ? 'Taken'
                          : 'Open'
                        : `${s.seats_taken} of ${s.seat_cap} seats taken`}
                    </span>
                    {mine ? (
                      <button
                        type="button"
                        disabled={busy === s.id}
                        onClick={() => finish(s)}
                        style={{
                          marginLeft: 'auto',
                          height: 34,
                          padding: '0 18px',
                          borderRadius: 999,
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: 'none',
                          background: 'linear-gradient(180deg, #3f9468, #2a6c47)',
                          color: '#fff',
                        }}
                      >
                        Close &amp; award
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === s.id || full}
                        onClick={() => join(s)}
                        style={{
                          marginLeft: 'auto',
                          height: 34,
                          padding: '0 18px',
                          borderRadius: 999,
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: full ? 'not-allowed' : 'pointer',
                          border: s.i_am_in ? '1px solid rgba(28,42,34,.18)' : 'none',
                          background: s.i_am_in
                            ? 'rgba(255,255,255,.62)'
                            : full
                              ? 'rgba(28,42,34,.08)'
                              : 'linear-gradient(180deg, #3f9468, #2a6c47)',
                          color: s.i_am_in ? '#24382c' : full ? '#5b6f62' : '#fff',
                        }}
                      >
                        {s.i_am_in
                          ? 'Leave'
                          : full
                            ? s.kind === 'one_to_one'
                              ? 'Taken'
                              : 'Full'
                            : s.kind === 'one_to_one'
                              ? 'Book 1:1'
                              : 'Join group'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tutors === null ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
          <LoadingSpinner />
        </div>
      ) : tutors.length === 0 ? (
        <section style={{ ...glass, padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No tutors yet</div>
          <div
            style={{
              fontSize: 13,
              color: darkTheme.colors.textSecondary,
              maxWidth: 460,
              margin: '0 auto',
            }}
          >
            The wing opens once classmates apply and a moderator approves them. If you qualify, you
            can be the first.
          </div>
        </section>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: 14,
          }}
        >
          {tutors.map((t) => (
            <article key={t.id} style={{ ...glass, padding: '16px 18px' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                <div
                  aria-hidden
                  style={{
                    width: 44,
                    height: 44,
                    flex: 'none',
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #2e7d52, #63a37f)',
                  }}
                >
                  {initials(t.name ?? '?')}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 11.5, color: '#3c4f43' }}>
                    {t.alumni ? 'Alumni' : t.grade ? `Grade ${t.grade}` : 'Student'}
                    {t.subject_name ? ` · ${t.subject_icon ?? ''} ${t.subject_name}` : ''}
                  </div>
                </div>
              </div>

              {t.blurb && (
                <p
                  style={{ fontSize: 12.5, color: '#24382c', margin: '0 0 10px', lineHeight: 1.5 }}
                >
                  {t.blurb}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                <span style={chip}>
                  {t.rating_avg ? `${t.rating_avg.toFixed(1)}★` : 'No ratings yet'}
                </span>
                <span style={chip}>{t.session_count} sessions</span>
                {t.grade_min && t.grade_max && (
                  <span style={chip}>
                    Grade {t.grade_min}–{t.grade_max}
                  </span>
                )}
              </div>

              {/* Group rooms are bookable above. 1:1 stays unbuilt pending the
                  safeguarding decision, so no per-tutor Book button here. */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: '1px dashed rgba(28,42,34,.16)',
                  fontSize: 11.5,
                  color: '#5b6f62',
                }}
              >
                Book one of their sessions above — 1:1 or group.
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const chip: React.CSSProperties = {
  padding: '5px 11px',
  borderRadius: 999,
  background: 'rgba(99,163,127,.16)',
  border: '1px solid rgba(99,163,127,.34)',
  color: '#1f5c3e',
  fontWeight: 600,
};
