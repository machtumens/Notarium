import { useState } from 'react';
import { toast } from 'sonner';
import api from '../../lib/api';
import LoadingSpinner from '../LoadingSpinner';
import {
  darkTheme,
  modalOverlayStyle,
  modalContentStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  inputStyle,
} from '../../theme';

interface RecallModalProps {
  noteId?: number;
  noteContent: string;
  noteTitle?: string;
  onClose: () => void;
}

interface RecallResult {
  score: number;
  feedback: string;
  missed_points: string[];
}

const SCORE_GOOD = 75;
const SCORE_OK = 50;

function scoreColor(score: number): string {
  if (score >= SCORE_GOOD) return darkTheme.colors.success;
  if (score >= SCORE_OK) return darkTheme.colors.warning;
  return darkTheme.colors.danger;
}

export default function RecallModal({ noteId, noteContent, noteTitle, onClose }: RecallModalProps) {
  const [recallText, setRecallText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecallResult | null>(null);

  const handleSubmit = async () => {
    if (!recallText.trim()) {
      toast.error('Tulis dulu apa yang kamu ingat sebelum mengirim.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.gradeRecall({
        note_id: noteId,
        note_content: noteContent,
        recall_text: recallText,
      });
      setResult(data);
    } catch (error) {
      console.error('Failed to grade recall:', error);
      toast.error('Gagal menilai ingatanmu. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setRecallText('');
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div
        style={
          {
            ...modalContentStyle,
            maxWidth: '600px',
            maxHeight: '85vh',
            overflowY: 'auto',
          } as React.CSSProperties
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            position: 'sticky',
            top: 0,
            background: 'rgba(10, 10, 10, 0.95)',
            paddingBottom: '12px',
            zIndex: 1,
          }}
        >
          <div>
            <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
              🧠 Recall Bebas
            </h2>
            {noteTitle && (
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: '13px',
                  color: darkTheme.colors.textSecondary,
                }}
              >
                {noteTitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: darkTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '24px',
              transition: darkTheme.transitions.default,
              flexShrink: 0,
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseOut={(e) => (e.currentTarget.style.color = darkTheme.colors.textSecondary)}
          >
            ✕
          </button>
        </div>

        {!result ? (
          <>
            <p
              style={{
                marginBottom: '12px',
                color: darkTheme.colors.textSecondary,
                fontSize: '14px',
                lineHeight: '1.5',
              }}
            >
              Tulis semua yang kamu ingat tentang catatan ini — tanpa melihat. Menuliskan dari
              ingatan (bukan mengenali) memperkuat pemahaman jauh lebih dalam.
            </p>
            <textarea
              value={recallText}
              onChange={(e) => setRecallText(e.target.value)}
              placeholder="Tulis semua yang kamu ingat tentang catatan ini..."
              disabled={loading}
              rows={8}
              style={
                {
                  ...inputStyle,
                  width: '100%',
                  resize: 'vertical',
                  minHeight: '160px',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                  marginBottom: '16px',
                } as React.CSSProperties
              }
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleSubmit}
                disabled={loading || !recallText.trim()}
                style={
                  {
                    ...buttonPrimaryStyle,
                    flex: 1,
                    opacity: loading || !recallText.trim() ? 0.6 : 1,
                    cursor: loading || !recallText.trim() ? 'not-allowed' : 'pointer',
                  } as React.CSSProperties
                }
              >
                {loading ? '⏳ Menilai...' : '✅ Kirim & Nilai'}
              </button>
              <button
                onClick={onClose}
                disabled={loading}
                style={
                  {
                    ...buttonSecondaryStyle,
                    flex: 1,
                  } as React.CSSProperties
                }
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')
                }
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                Tutup
              </button>
            </div>
            {loading && (
              <div style={{ marginTop: '16px' }}>
                <LoadingSpinner size="sm" message="Membandingkan dengan catatan..." />
              </div>
            )}
          </>
        ) : (
          <>
            {/* Score */}
            <div
              style={{
                textAlign: 'center',
                marginBottom: '20px',
                padding: '20px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.lg,
                border: `1px solid ${darkTheme.colors.borderColor}`,
              }}
            >
              <div
                style={{
                  fontSize: '13px',
                  color: darkTheme.colors.textSecondary,
                  marginBottom: '6px',
                }}
              >
                Skor Ingatanmu
              </div>
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: scoreColor(result.score),
                  lineHeight: 1,
                }}
              >
                {result.score}
                <span style={{ fontSize: '20px', color: darkTheme.colors.textSecondary }}>
                  {' '}
                  / 100
                </span>
              </div>
            </div>

            {/* Feedback */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: darkTheme.colors.accent }}>
                Umpan Balik
              </h4>
              <div
                style={{
                  padding: '12px',
                  background: `${darkTheme.colors.accent}15`,
                  borderRadius: darkTheme.borderRadius.md,
                  borderLeft: `3px solid ${darkTheme.colors.accent}`,
                  fontSize: '14px',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  color: darkTheme.colors.textPrimary,
                }}
              >
                {result.feedback}
              </div>
            </div>

            {/* Missed points */}
            {result.missed_points && result.missed_points.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4
                  style={{ margin: '0 0 8px 0', fontSize: '14px', color: darkTheme.colors.warning }}
                >
                  Poin yang Terlewat ({result.missed_points.length})
                </h4>
                <ul
                  style={{
                    margin: 0,
                    padding: '0 0 0 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {result.missed_points.map((point, idx) => (
                    <li
                      key={idx}
                      style={{
                        fontSize: '13px',
                        lineHeight: '1.5',
                        color: darkTheme.colors.textSecondary,
                      }}
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.missed_points && result.missed_points.length === 0 && (
              <div
                style={{
                  marginBottom: '20px',
                  padding: '12px',
                  background: `${darkTheme.colors.success}15`,
                  borderRadius: darkTheme.borderRadius.md,
                  borderLeft: `3px solid ${darkTheme.colors.success}`,
                  fontSize: '13px',
                  color: darkTheme.colors.textPrimary,
                }}
              >
                🎉 Bagus! Kamu mengingat semua poin penting.
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={handleRetry}
                style={
                  {
                    ...buttonSecondaryStyle,
                    flex: 1,
                  } as React.CSSProperties
                }
                onMouseOver={(e) =>
                  (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')
                }
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
                Coba Lagi
              </button>
              <button
                onClick={onClose}
                style={
                  {
                    ...buttonPrimaryStyle,
                    flex: 1,
                  } as React.CSSProperties
                }
              >
                Selesai
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
