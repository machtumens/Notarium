import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { darkTheme } from '../theme';
import { useAuth } from '../app/AuthContext';
import CampusPlate, { CampusWing } from '../components/campus/CampusPlate';

// Campus hub — option 2b of the redesign brief, wired to real study data.
// The four wings are real destinations; only the tutor wing is inert, because
// no tutoring backend exists (no tutors, sessions, bookings or availability).
// It is rendered locked rather than omitted so the composition still reads as
// the brief's four-corner campus.

interface Stats {
  current_streak: number;
  longest_streak: number;
  learning_points: number;
  due_count: number;
}

const EMPTY: Stats = {
  current_streak: 0,
  longest_streak: 0,
  learning_points: 0,
  due_count: 0,
};

const glass = {
  background: 'rgba(255, 255, 255, 0.55)',
  backdropFilter: 'blur(26px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
  border: '1px solid rgba(255, 255, 255, 0.75)',
  boxShadow: '0 18px 40px rgba(20, 44, 30, 0.18)',
  borderRadius: 16,
};

export default function CampusPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [rank, setRank] = useState<{ position: number; total: number } | null>(null);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, mine, board] = await Promise.all([
        api.getStudyStats().catch(() => EMPTY),
        api
          .request('/api/notes/my-notes?status=published')
          .catch(() => ({ notes: [] as unknown[] })),
        api.getLeaderboard().catch(() => ({ leaderboard: [] as unknown[] })),
      ]);
      if (!alive) return;
      setStats(s);
      setNoteCount(Array.isArray(mine?.notes) ? mine.notes.length : null);
      const rows = (board?.leaderboard ?? []) as Array<{ id?: number; email?: string }>;
      if (rows.length && user) {
        const idx = rows.findIndex((r) => r.id === user.id || r.email === user.email);
        if (idx >= 0) setRank({ position: idx + 1, total: rows.length });
      }
    })().catch((e) => logger.error('campus load failed', e));
    return () => {
      alive = false;
    };
  }, [user]);

  const wings = useMemo<CampusWing[]>(
    () => [
      {
        key: 'library',
        label: 'Library',
        detail: noteCount === null ? 'Your notes and the community shelf' : `${noteCount} yours`,
        lift: 46,
        corner: 'tl',
        fill: ['rgba(63,148,104,.55)', 'rgba(42,108,71,.38)'],
        glow: 'rgba(63,148,104,.35)',
        drop: 'rgba(35,88,60,.2)',
        onEnter: () => navigate('/community'),
      },
      {
        key: 'exam',
        label: 'Exam hall',
        detail: 'Build a timed mock from your notes',
        lift: 72,
        corner: 'tr',
        // Juniper — the brief assigns it to exams and timed work.
        fill: ['rgba(94,166,184,.5)', 'rgba(46,98,112,.36)'],
        glow: 'rgba(94,166,184,.3)',
        drop: 'rgba(40,82,94,.2)',
        onEnter: () => navigate('/quiz'),
      },
      {
        key: 'trophy',
        label: 'Trophy deck',
        detail: rank
          ? `Rank ${rank.position} of ${rank.total} · ${stats.learning_points} pts`
          : `${stats.learning_points} learning points`,
        lift: 30,
        corner: 'bl',
        // Honey — points and standing are "you" colours.
        fill: ['rgba(217,178,106,.5)', 'rgba(155,110,45,.34)'],
        glow: 'rgba(217,178,106,.32)',
        drop: 'rgba(130,94,42,.2)',
        onEnter: () => navigate('/progress'),
      },
      {
        key: 'tutor',
        label: 'Tutor wing',
        detail: 'Peer and alumni tutors from your school',
        lift: 54,
        corner: 'br',
        fill: ['rgba(143,208,171,.5)', 'rgba(63,125,88,.34)'],
        glow: 'rgba(143,208,171,.3)',
        drop: 'rgba(46,96,68,.2)',
        onEnter: () => navigate('/tutors'),
      },
    ],
    [navigate, noteCount, rank, stats.learning_points],
  );

  return (
    <div style={{ padding: '24px 16px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <header style={{ marginBottom: 20 }}>
        <div
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: darkTheme.colors.textSecondary,
            marginBottom: 8,
          }}
        >
          {user?.class ? `Class ${user.class} · Campus` : 'Campus'}
        </div>
        <h1 style={{ fontSize: 34, margin: 0, color: darkTheme.colors.textPrimary }}>
          Your campus
        </h1>
        <p style={{ margin: '8px 0 0', color: darkTheme.colors.textSecondary, fontSize: 14 }}>
          {stats.due_count > 0
            ? `${stats.due_count} cards due · ${stats.current_streak} day streak`
            : `No cards due · ${stats.current_streak} day streak`}
        </p>
      </header>

      <section
        aria-label="Campus map"
        style={{
          ...glass,
          position: 'relative',
          height: 'clamp(340px, 52vh, 520px)',
          overflow: 'hidden',
        }}
      >
        <CampusPlate key={resetKey} wings={wings} />

        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 12,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: 11,
            color: darkTheme.colors.textSecondary,
          }}
        >
          <span>Drag to orbit</span>
          <span aria-hidden>·</span>
          <span>Click a wing to enter</span>
          <span aria-hidden>·</span>
          <span style={{ color: '#8a6a22', fontWeight: 600 }}>You are here</span>
          <button
            type="button"
            onClick={() => setResetKey((k) => k + 1)}
            style={{
              marginLeft: 'auto',
              height: 28,
              padding: '0 13px',
              borderRadius: 999,
              border: '1px solid rgba(28,42,34,.12)',
              background: 'rgba(255,255,255,.7)',
              backdropFilter: 'blur(12px)',
              color: '#24382c',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recentre
          </button>
        </div>
      </section>

      {/* Wing legend — the plate alone never states which slab is which. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {wings.map((w) => (
          <button
            key={w.key}
            type="button"
            disabled={w.locked}
            onClick={w.onEnter}
            style={{
              ...glass,
              textAlign: 'left',
              padding: '14px 16px',
              cursor: w.locked ? 'not-allowed' : 'pointer',
              opacity: w.locked ? 0.6 : 1,
              transition: darkTheme.transitions.default,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: darkTheme.colors.textPrimary,
                marginBottom: 4,
              }}
            >
              {w.label}
              {w.locked && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 10,
                    padding: '2px 7px',
                    borderRadius: 999,
                    background: 'rgba(28,42,34,.08)',
                    color: darkTheme.colors.textSecondary,
                  }}
                >
                  LOCKED
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: darkTheme.colors.textSecondary }}>{w.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
