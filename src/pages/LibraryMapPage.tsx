import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { logger } from '../lib/logger';
import { darkTheme } from '../theme';
import LoadingSpinner from '../components/LoadingSpinner';
import SubjectTopography, { TopoSubject } from '../components/campus/SubjectTopography';

// Library map — option 2c of the redesign brief. Wraps the dew-map constellation
// with the brief's filter row, affordance line and side panel. Reads the same
// /api/subjects the grid view uses, so the two views never disagree.

type Filter = 'all' | 'mine' | 'due';

const glass = {
  background: 'rgba(255, 255, 255, 0.55)',
  backdropFilter: 'blur(26px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(26px) saturate(1.3)',
  border: '1px solid rgba(255, 255, 255, 0.75)',
  boxShadow: '0 18px 40px rgba(20, 44, 30, 0.18)',
  borderRadius: 16,
};

const chip = (on: boolean) => ({
  padding: '7px 14px',
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: 'pointer',
  transition: darkTheme.transitions.default,
  background: on ? 'rgba(46,125,82,.15)' : 'transparent',
  border: on ? '1px solid rgba(46,125,82,.32)' : '1px dashed rgba(28,42,34,.22)',
  color: on ? '#1f5c3e' : '#3c4f43',
});

export default function LibraryMapPage() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<TopoSubject[]>([]);
  const [mineIds, setMineIds] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [subs, mine] = await Promise.all([
        api.getSubjects().catch(() => ({ subjects: [] })),
        api
          .request('/api/notes/my-notes?status=published')
          .catch(() => ({ notes: [] as Array<{ subject_id?: number }> })),
      ]);
      if (!alive) return;
      setSubjects((subs?.subjects ?? []) as TopoSubject[]);
      const ids = new Set<number>();
      for (const n of (mine?.notes ?? []) as Array<{ subject_id?: number }>) {
        if (typeof n.subject_id === 'number') ids.add(n.subject_id);
      }
      setMineIds(ids);
      setLoading(false);
    })().catch((e) => {
      logger.error('library map load failed', e);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (filter === 'mine') return subjects.filter((s) => mineIds.has(s.id));
    // "Due for review" needs per-subject due counts, which /api/reviews/due does
    // not group by subject. Until it does, this filter shows subjects that hold
    // any note at all rather than silently showing nothing.
    if (filter === 'due') return subjects.filter((s) => (s.note_count || 0) > 0);
    return subjects;
  }, [subjects, filter, mineIds]);

  return (
    <div style={{ padding: '24px 16px 48px', maxWidth: 1180, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <h1 style={{ fontSize: 30, margin: 0, color: darkTheme.colors.textPrimary }}>
          Library map
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={chip(filter === 'all')} onClick={() => setFilter('all')}>
            All subjects
          </button>
          <button type="button" style={chip(filter === 'mine')} onClick={() => setFilter('mine')}>
            Mine
          </button>
          <button type="button" style={chip(filter === 'due')} onClick={() => setFilter('due')}>
            Has notes
          </button>
        </div>
        <button
          type="button"
          onClick={() => navigate('/community?view=grid')}
          style={{
            marginLeft: 'auto',
            height: 34,
            padding: '0 16px',
            borderRadius: 999,
            border: '1px solid rgba(28,42,34,.12)',
            background: 'rgba(255,255,255,.62)',
            backdropFilter: 'blur(12px)',
            color: '#24382c',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Grid view
        </button>
      </header>

      <section
        aria-label="Library map"
        style={{ ...glass, position: 'relative', height: 540, overflow: 'hidden' }}
      >
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <LoadingSpinner />
          </div>
        ) : shown.length === 0 ? (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              color: darkTheme.colors.textSecondary,
              fontSize: 14,
            }}
          >
            No subjects match this filter.
          </div>
        ) : (
          <SubjectTopography
            subjects={shown}
            mineIds={mineIds}
            onOpen={(s) => navigate(`/community/${s.id}`)}
          />
        )}

        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 12,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
            fontSize: 11,
            color: darkTheme.colors.textSecondary,
            pointerEvents: 'none',
          }}
        >
          <span>Scroll to zoom · drag to pan</span>
          <span aria-hidden>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="26" height="12" aria-hidden>
              <ellipse
                cx="13"
                cy="6"
                rx="11"
                ry="4.5"
                fill="none"
                stroke="#2e7d52"
                strokeOpacity=".55"
                strokeWidth="1.5"
              />
              <ellipse
                cx="13"
                cy="6"
                rx="6"
                ry="2.4"
                fill="none"
                stroke="#2e7d52"
                strokeOpacity=".3"
                strokeWidth="1"
              />
            </svg>
            more rings = more notes
          </span>
          <span aria-hidden>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="12" aria-hidden>
              <ellipse
                cx="8"
                cy="6"
                rx="6"
                ry="3"
                fill="none"
                stroke="#2e7d52"
                strokeOpacity=".45"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
            </svg>
            empty
          </span>
          <span aria-hidden>·</span>
          <span style={{ color: '#8a6a22', fontWeight: 600 }}>gold = yours</span>
        </div>
      </section>

      <p style={{ marginTop: 12, fontSize: 12, color: darkTheme.colors.textSecondary }}>
        Elevation is note count — the busiest corners of the library read as high ground. Position
        is an even spiral, deterministic per subject, and is
        <strong> not</strong> a similarity measure: Notarium has no concept graph yet, so distance
        between two hills means nothing.
      </p>
    </div>
  );
}
