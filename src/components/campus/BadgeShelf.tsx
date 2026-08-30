import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { logger } from '../../lib/logger';

// Badge shelf — redesign brief option 2g.
//
// Badges are computed server-side from the same counters the rest of Progress
// reads, so a badge can never claim something the numbers next to it contradict.
// Unearned badges show their progress rather than being hidden: "7 / 10 mocks"
// is a reason to come back, an absent badge is not.

interface Badge {
  key: string;
  label: string;
  hint: string;
  earned: boolean;
  progress?: { have: number; need: number };
  unavailable?: string;
}

export default function BadgeShelf() {
  const [badges, setBadges] = useState<Badge[] | null>(null);

  useEffect(() => {
    let alive = true;
    // Wrapped in try/catch as well as .catch(): if `api.getBadges` is missing
    // entirely (an older bundle, or a partial mock) the call THROWS
    // synchronously, which an unhandled promise rejection handler never sees —
    // it propagates out of the effect and unmounts the whole page. Progress
    // exists to show rankings; a decorative badge row must never be able to
    // blank it.
    try {
      // No synchronous setState here: `badges === null` already renders nothing,
      // so the guard paths simply leave it null rather than triggering a
      // cascading render inside the effect.
      const p = api.getBadges?.();
      if (p) {
        p.then((r) => {
          if (alive) setBadges(r?.badges ?? []);
        }).catch((e) => {
          logger.error('badges', 'failed to load', e);
          if (alive) setBadges([]);
        });
      }
    } catch (e) {
      logger.error('badges', 'badges unavailable', e);
    }
    return () => {
      alive = false;
    };
  }, []);

  if (!badges || badges.length === 0) return null;

  return (
    <section
      aria-label="Badges"
      style={{
        background: 'rgba(255,255,255,.55)',
        backdropFilter: 'blur(26px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
        border: '1px solid rgba(255,255,255,.75)',
        boxShadow: '0 18px 40px rgba(20,44,30,.18)',
        borderRadius: 16,
        padding: '16px 18px',
        marginBottom: 16,
      }}
    >
      <h3
        className="mono"
        style={{
          fontSize: 10.5,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: '#3c4f43',
          margin: '0 0 12px',
        }}
      >
        Badges
      </h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {badges.map((b) => {
          const pct = b.progress ? Math.min(1, b.progress.have / b.progress.need) : 0;
          const locked = Boolean(b.unavailable);
          const title = b.unavailable
            ? `${b.label} — ${b.unavailable}`
            : b.earned
              ? `${b.label} — earned`
              : b.progress
                ? `${b.label} — ${b.progress.have} of ${b.progress.need}. ${b.hint}`
                : `${b.label} — ${b.hint}`;

          return (
            <div
              key={b.key}
              title={title}
              aria-label={title}
              style={{
                minWidth: 104,
                flex: '1 1 104px',
                maxWidth: 160,
                padding: '10px 12px',
                borderRadius: 12,
                // Earned badges are honey — the "you" colour. Unearned stay
                // neutral rather than greyed to near-invisibility.
                background: b.earned ? 'rgba(201,155,74,.18)' : 'rgba(28,42,34,.04)',
                border: `1px solid ${b.earned ? 'rgba(185,138,60,.45)' : 'rgba(28,42,34,.10)'}`,
                opacity: locked ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: b.earned ? '#6f5015' : '#1c2a22',
                  marginBottom: 4,
                }}
              >
                {b.label}
              </div>

              {b.earned ? (
                <div style={{ fontSize: 10.5, color: '#6f5015', fontWeight: 600 }}>Earned</div>
              ) : locked ? (
                <div style={{ fontSize: 10.5, color: '#5b6f62' }}>{b.unavailable}</div>
              ) : b.progress ? (
                <>
                  <div
                    style={{
                      height: 4,
                      borderRadius: 999,
                      background: 'rgba(28,42,34,.10)',
                      overflow: 'hidden',
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(pct * 100)}%`,
                        height: '100%',
                        background: '#63a37f',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: '#3c4f43' }}>
                    {b.progress.have} / {b.progress.need}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10.5, color: '#3c4f43' }}>{b.hint}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
