import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import RecallModal from '../components/modals/RecallModal';
import { darkTheme, cardStyle, buttonPrimaryStyle, buttonSecondaryStyle } from '../theme';

interface ReviewItem {
  id: number;
  note_id: number | null;
  question_text: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string | null;
}

interface StudyStats {
  current_streak: number;
  longest_streak: number;
  learning_points: number;
  due_count: number;
}

type Confidence = 1 | 2 | 3;

const CONFIDENCE_OPTIONS: Array<{ value: Confidence; label: string }> = [
  { value: 1, label: 'Ragu' },
  { value: 2, label: 'Lumayan' },
  { value: 3, label: 'Yakin' },
];

export default function ReviewPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [confidence, setConfidence] = useState<Confidence>(2);
  const [grading, setGrading] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const [finished, setFinished] = useState(false);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [latestStreak, setLatestStreak] = useState<number | null>(null);

  const [showRecall, setShowRecall] = useState(false);

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.getDueReviews();
      setItems(data.items || []);
      setCurrentIndex(0);
      setRevealed(false);
      setConfidence(2);
      setCorrectCount(0);
      setFinished(false);
    } catch (err) {
      logger.error('review', 'Failed to load due reviews', err);
      setError('Gagal memuat antrean review. Silakan muat ulang.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader sets loading/review state on mount; behavior-preserving
    loadReviews();
  }, [loadReviews]);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getStudyStats();
      setStats(data);
    } catch (err) {
      logger.error('review', 'Failed to load study stats', err);
    }
  }, []);

  const currentItem = items[currentIndex];

  const advance = useCallback(async () => {
    const isLast = currentIndex >= items.length - 1;
    if (isLast) {
      setFinished(true);
      await loadStats();
    } else {
      setCurrentIndex((i) => i + 1);
      setRevealed(false);
      setConfidence(2);
    }
  }, [currentIndex, items.length, loadStats]);

  const handleGrade = async (isCorrect: boolean) => {
    if (!currentItem || grading) return;
    setGrading(true);
    try {
      const res = await api.gradeReview(currentItem.id, {
        is_correct: isCorrect,
        confidence,
      });
      if (typeof res.current_streak === 'number') {
        setLatestStreak(res.current_streak);
      }
      if (isCorrect) setCorrectCount((c) => c + 1);
      await advance();
    } catch (err) {
      logger.error('review', 'Failed to grade review', err);
      toast.error('Gagal menyimpan penilaian. Coba lagi.');
    } finally {
      setGrading(false);
    }
  };

  // ---- Render helpers ----

  const pageTitle = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '24px',
      }}
    >
      <h2
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          margin: 0,
          color: darkTheme.colors.textPrimary,
        }}
      >
        📆 Review Hari Ini
      </h2>
      {items.length > 0 && !finished && (
        <button
          onClick={() => setShowRecall(true)}
          style={{ ...buttonSecondaryStyle } as React.CSSProperties}
          onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
          onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          🧠 Recall Bebas
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div>
        {pageTitle}
        <LoadingSpinner message="Memuat antrean review..." />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {pageTitle}
        <div
          style={
            {
              ...cardStyle,
              textAlign: 'center',
              padding: '40px 24px',
              color: darkTheme.colors.danger,
            } as React.CSSProperties
          }
        >
          <p style={{ margin: '0 0 16px 0', fontSize: '15px' }}>{error}</p>
          <button onClick={loadReviews} style={{ ...buttonPrimaryStyle } as React.CSSProperties}>
            Muat Ulang
          </button>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        {pageTitle}
        <div
          style={
            {
              ...cardStyle,
              textAlign: 'center',
              padding: '60px 40px',
              color: darkTheme.colors.textSecondary,
            } as React.CSSProperties
          }
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
          <p style={{ fontSize: '16px', margin: '0 0 8px 0', color: darkTheme.colors.textPrimary }}>
            Tidak ada review yang jatuh tempo hari ini.
          </p>
          <p style={{ fontSize: '14px', margin: '0 0 20px 0' }}>
            Kerja bagus — istirahat dulu atau latih ingatanmu dengan recall bebas.
          </p>
          <button
            onClick={() => setShowRecall(true)}
            style={{ ...buttonSecondaryStyle } as React.CSSProperties}
            onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            🧠 Coba Recall Bebas
          </button>
        </div>
        {showRecall && <RecallModal noteContent="" onClose={() => setShowRecall(false)} />}
      </div>
    );
  }

  if (finished) {
    const streak = latestStreak ?? stats?.current_streak ?? 0;
    return (
      <div>
        {pageTitle}
        <div
          style={
            {
              ...cardStyle,
              textAlign: 'center',
              padding: '48px 32px',
            } as React.CSSProperties
          }
        >
          <div style={{ fontSize: '56px', marginBottom: '12px' }}>✅</div>
          <h3
            style={{ margin: '0 0 8px 0', fontSize: '22px', color: darkTheme.colors.textPrimary }}
          >
            Sesi selesai!
          </h3>
          <p
            style={{
              margin: '0 0 24px 0',
              fontSize: '15px',
              color: darkTheme.colors.textSecondary,
            }}
          >
            Kamu menyelesaikan {items.length} review — {correctCount} benar.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              flexWrap: 'wrap',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                padding: '16px 24px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.lg,
                border: `1px solid ${darkTheme.colors.borderColor}`,
                minWidth: '120px',
              }}
            >
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: darkTheme.colors.accent }}>
                🔥 {streak}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: darkTheme.colors.textSecondary,
                  marginTop: '4px',
                }}
              >
                Streak saat ini
              </div>
            </div>
            {stats && (
              <div
                style={{
                  padding: '16px 24px',
                  background: darkTheme.colors.bgSecondary,
                  borderRadius: darkTheme.borderRadius.lg,
                  border: `1px solid ${darkTheme.colors.borderColor}`,
                  minWidth: '120px',
                }}
              >
                <div
                  style={{ fontSize: '28px', fontWeight: 'bold', color: darkTheme.colors.success }}
                >
                  🪙 {Math.max(0, stats.learning_points)}
                </div>
                <div
                  style={{
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                    marginTop: '4px',
                  }}
                >
                  Poin belajar
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={loadReviews} style={{ ...buttonPrimaryStyle } as React.CSSProperties}>
              🔄 Muat Review Baru
            </button>
            <button
              onClick={() => setShowRecall(true)}
              style={{ ...buttonSecondaryStyle } as React.CSSProperties}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              🧠 Recall Bebas
            </button>
          </div>
        </div>
        {showRecall && <RecallModal noteContent="" onClose={() => setShowRecall(false)} />}
      </div>
    );
  }

  // Active review card
  return (
    <div>
      {pageTitle}

      {/* Progress */}
      <div style={{ marginBottom: '20px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '13px',
            color: darkTheme.colors.textSecondary,
            marginBottom: '8px',
          }}
        >
          <span>
            {currentIndex + 1} dari {items.length}
          </span>
          <span>{correctCount} benar</span>
        </div>
        <div
          style={{
            height: '6px',
            background: darkTheme.colors.bgTertiary,
            borderRadius: '9999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(currentIndex / items.length) * 100}%`,
              background: darkTheme.colors.accent,
              transition: darkTheme.transitions.default,
            }}
          />
        </div>
      </div>

      {/* Question card */}
      <div
        style={
          {
            ...cardStyle,
            padding: '32px 24px',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
          } as React.CSSProperties
        }
      >
        <div
          style={{
            fontSize: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: darkTheme.colors.textSecondary,
            marginBottom: '12px',
          }}
        >
          Active Recall
        </div>
        <p
          style={{
            fontSize: '20px',
            lineHeight: '1.5',
            color: darkTheme.colors.textPrimary,
            margin: '0 0 24px 0',
            fontWeight: '500',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            flex: 1,
          }}
        >
          {currentItem.question_text}
        </p>

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            style={{ ...buttonPrimaryStyle, width: '100%' } as React.CSSProperties}
          >
            👁️ Tampilkan Jawaban
          </button>
        ) : (
          <>
            {/* Confidence */}
            <div style={{ marginBottom: '16px' }}>
              <div
                style={{
                  fontSize: '13px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '8px',
                }}
              >
                Seberapa yakin kamu? (opsional)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {CONFIDENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setConfidence(opt.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background:
                        confidence === opt.value ? darkTheme.colors.accent : 'transparent',
                      color: confidence === opt.value ? '#fff' : darkTheme.colors.textSecondary,
                      border: `1px solid ${confidence === opt.value ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
                      borderRadius: darkTheme.borderRadius.md,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      transition: darkTheme.transitions.default,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Self-grade */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => handleGrade(false)}
                disabled={grading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: darkTheme.colors.danger,
                  color: '#fff',
                  border: 'none',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: grading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  opacity: grading ? 0.6 : 1,
                  transition: darkTheme.transitions.default,
                }}
                onMouseOver={(e) =>
                  !grading && (e.currentTarget.style.background = darkTheme.colors.dangerHover)
                }
                onMouseOut={(e) =>
                  !grading && (e.currentTarget.style.background = darkTheme.colors.danger)
                }
              >
                ✗ Salah
              </button>
              <button
                onClick={() => handleGrade(true)}
                disabled={grading}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: darkTheme.colors.success,
                  color: '#0a0f1a',
                  border: 'none',
                  borderRadius: darkTheme.borderRadius.md,
                  cursor: grading ? 'not-allowed' : 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  opacity: grading ? 0.6 : 1,
                  transition: darkTheme.transitions.default,
                }}
              >
                ✓ Benar
              </button>
            </div>
          </>
        )}
      </div>

      {showRecall && (
        <RecallModal
          noteId={currentItem.note_id ?? undefined}
          noteContent={currentItem.question_text}
          onClose={() => setShowRecall(false)}
        />
      )}
    </div>
  );
}
