import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme } from '../theme';
import { useAuth } from '../app/AuthContext';
import { Flame, CalendarClock, ArrowRight, BookOpen, GraduationCap } from 'lucide-react';

// TodayPage — the personal study dashboard and the new default landing (/).
// Uses only pre-existing study endpoints (zero new backend). Field names are the
// PVL-verified shapes from backend/src/routes/study.ts getStudyStats:
//   /api/study/stats  -> { current_streak, longest_streak, learning_points, due_count }
//   /api/reviews/due  -> { items: DueCard[], due_count }
//   /api/notes/my-notes -> { notes: RecentNote[] }
interface StudyStats {
  current_streak: number;
  longest_streak: number;
  learning_points: number;
  due_count: number;
}

interface DueCard {
  id: number;
  note_id: number | null;
  question_text: string;
  due_at: string | null;
}

interface RecentNote {
  id: number;
  title: string;
  subject_id: number;
}

const EMPTY_STATS: StudyStats = {
  current_streak: 0,
  longest_streak: 0,
  learning_points: 0,
  due_count: 0,
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<StudyStats>(EMPTY_STATS);
  const [dueCards, setDueCards] = useState<DueCard[]>([]);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        const [statsRes, dueRes, notesRes] = await Promise.all([
          api.getStudyStats().catch(() => EMPTY_STATS),
          api.getDueReviews().catch(() => ({ items: [], due_count: 0 })),
          api
            .request<{ notes: RecentNote[] }>('/api/notes/my-notes', { method: 'GET' })
            .catch(() => ({ notes: [] })),
        ]);

        if (cancelled) return;

        setStats(statsRes);
        setDueCards((dueRes.items || []).slice(0, 3));
        setRecentNotes((notesRes.notes || []).slice(0, 3));
      } catch (err) {
        if (cancelled) return;
        logger.error('today', 'Failed to load study dashboard', err);
        toast.error('Failed to load your dashboard. Please refresh.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return <LoadingSpinner message="Loading your dashboard..." />;
  }

  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Greeting */}
      <h1
        style={{
          fontSize: 'clamp(24px, 5vw, 34px)',
          fontWeight: 'bold',
          margin: '0 0 4px 0',
          color: darkTheme.colors.textPrimary,
        }}
      >
        Welcome back, {firstName}
      </h1>
      <p style={{ margin: '0 0 28px 0', color: darkTheme.colors.textSecondary, fontSize: '15px' }}>
        Here's your study snapshot for today.
      </p>

      {/* Stat row: streak + due count */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        {/* Streak card */}
        <div
          style={{
            background: darkTheme.colors.bgSecondary,
            border: `1px solid ${darkTheme.colors.borderColor}`,
            borderRadius: darkTheme.borderRadius.md,
            padding: '24px',
            boxShadow: darkTheme.shadows.default,
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background:
                'linear-gradient(135deg, rgba(249, 115, 22, 0.25), rgba(234, 88, 12, 0.15))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f97316',
              flexShrink: 0,
            }}
          >
            <Flame size={28} />
          </div>
          <div>
            <div
              style={{
                fontSize: '40px',
                fontWeight: '800',
                lineHeight: 1,
                color: darkTheme.colors.textPrimary,
              }}
            >
              {stats.current_streak}
            </div>
            <div
              style={{ fontSize: '13px', color: darkTheme.colors.textSecondary, marginTop: '4px' }}
            >
              day streak · best {stats.longest_streak}
            </div>
          </div>
        </div>

        {/* Due count card */}
        <div
          style={{
            background: darkTheme.colors.bgSecondary,
            border: `1px solid ${darkTheme.colors.borderColor}`,
            borderRadius: darkTheme.borderRadius.md,
            padding: '24px',
            boxShadow: darkTheme.shadows.default,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '18px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                background: `linear-gradient(135deg, ${darkTheme.colors.accent}30, ${darkTheme.colors.accent}10)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: darkTheme.colors.accent,
                flexShrink: 0,
              }}
            >
              <CalendarClock size={28} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '40px',
                  fontWeight: '800',
                  lineHeight: 1,
                  color: darkTheme.colors.textPrimary,
                }}
              >
                {stats.due_count}
              </div>
              <div
                style={{
                  fontSize: '13px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                cards due · {stats.learning_points} learning points
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/review')}
            style={{
              padding: '10px 20px',
              background: `linear-gradient(135deg, ${darkTheme.colors.accent} 0%, #27ae60 100%)`,
              border: 'none',
              color: 'white',
              borderRadius: darkTheme.borderRadius.md,
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.3s',
              boxShadow: darkTheme.shadows.default,
              whiteSpace: 'nowrap',
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseOut={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            Start Review <ArrowRight size={18} />
          </button>
        </div>

        {/* Prep for class card — the discoverability entry point to /primer (Paperloop Phase 5) */}
        <button
          type="button"
          onClick={() => navigate('/primer')}
          style={{
            textAlign: 'left',
            background: darkTheme.colors.bgSecondary,
            border: `1px solid ${darkTheme.colors.borderColor}`,
            borderRadius: darkTheme.borderRadius.md,
            padding: '24px',
            boxShadow: darkTheme.shadows.default,
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
            cursor: 'pointer',
            transition: darkTheme.transitions.default,
            color: darkTheme.colors.textPrimary,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-3px)';
            e.currentTarget.style.boxShadow = darkTheme.shadows.lg;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = darkTheme.shadows.default;
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background:
                'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(124, 58, 237, 0.15))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8b5cf6',
              flexShrink: 0,
            }}
          >
            <GraduationCap size={28} />
          </div>
          <div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: '700',
                color: darkTheme.colors.textPrimary,
              }}
            >
              Prep for class
            </div>
            <div
              style={{ fontSize: '13px', color: darkTheme.colors.textSecondary, marginTop: '4px' }}
            >
              Get a quick primer on any topic
            </div>
          </div>
        </button>
      </div>

      {/* Due cards preview */}
      <section style={{ marginBottom: '32px' }}>
        <h2
          style={{
            fontSize: '18px',
            fontWeight: '700',
            margin: '0 0 14px 0',
            color: darkTheme.colors.textPrimary,
          }}
        >
          Up next
        </h2>
        {dueCards.length === 0 ? (
          <div
            style={{
              padding: '28px',
              textAlign: 'center',
              color: darkTheme.colors.textSecondary,
              background: darkTheme.colors.bgSecondary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              fontSize: '14px',
            }}
          >
            You're all caught up — no cards due right now. 🎉
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
              gap: '16px',
            }}
          >
            {dueCards.map((card) => (
              <button
                key={card.id}
                onClick={() => navigate('/review')}
                style={{
                  textAlign: 'left',
                  background: darkTheme.colors.bgSecondary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  padding: '18px',
                  cursor: 'pointer',
                  transition: darkTheme.transitions.default,
                  boxShadow: darkTheme.shadows.default,
                  color: darkTheme.colors.textPrimary,
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = darkTheme.shadows.lg;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = darkTheme.shadows.default;
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: darkTheme.colors.accent,
                    marginBottom: '8px',
                  }}
                >
                  Review card
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
                  {truncate(card.question_text, 80)}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recent notes preview */}
      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              fontWeight: '700',
              margin: 0,
              color: darkTheme.colors.textPrimary,
            }}
          >
            Recent notes
          </h2>
          <button
            onClick={() => navigate('/my-notes')}
            style={{
              background: 'none',
              border: 'none',
              color: darkTheme.colors.accent,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            View all <ArrowRight size={14} />
          </button>
        </div>
        {recentNotes.length === 0 ? (
          <div
            style={{
              padding: '28px',
              textAlign: 'center',
              color: darkTheme.colors.textSecondary,
              background: darkTheme.colors.bgSecondary,
              border: `1px solid ${darkTheme.colors.borderColor}`,
              borderRadius: darkTheme.borderRadius.md,
              fontSize: '14px',
            }}
          >
            No notes yet. Head to Community to explore and upload notes.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
              gap: '16px',
            }}
          >
            {recentNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => navigate('/my-notes')}
                style={{
                  textAlign: 'left',
                  background: darkTheme.colors.bgSecondary,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  borderRadius: darkTheme.borderRadius.md,
                  padding: '18px',
                  cursor: 'pointer',
                  transition: darkTheme.transitions.default,
                  boxShadow: darkTheme.shadows.default,
                  color: darkTheme.colors.textPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = darkTheme.shadows.lg;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = darkTheme.shadows.default;
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: `${darkTheme.colors.accent}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: darkTheme.colors.accent,
                    flexShrink: 0,
                  }}
                >
                  <BookOpen size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {note.title}
                  </div>
                  <div style={{ fontSize: '12px', color: darkTheme.colors.textSecondary }}>
                    Subject #{note.subject_id}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
