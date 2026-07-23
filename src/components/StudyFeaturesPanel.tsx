import { useState } from 'react';
import api from '../lib/api';
import { darkTheme, buttonPrimaryStyle, inputStyle, cardStyle } from '../theme';
import LoadingSpinner from './LoadingSpinner';
import RecallModal from './modals/RecallModal';
import type { Quiz } from '../types';

interface Note {
  id: number;
  title: string;
  description: string;
  extracted_text: string;
  subject_id?: number;
}

interface StudyFeaturesPanelProps {
  note?: Note;
  subject?: string;
  topic?: string;
}

export default function StudyFeaturesPanel({
  note,
  subject = 'General',
  topic = 'Selected Topic',
}: StudyFeaturesPanelProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'quiz' | 'plan' | 'concept' | 'recall'>(
    'summary',
  );
  const [result, setResult] = useState<string>('');
  const [quizData, setQuizData] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conceptInput, setConceptInput] = useState('');
  const [showRecall, setShowRecall] = useState(false);

  const handleGenerateSummary = async () => {
    if (!note) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.request(`/api/notes/${note.id}/summary`, {
        method: 'POST',
        body: {
          content: note.extracted_text || note.description,
          title: note.title,
        },
      });
      setResult(response.summary || '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!note) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.request(`/api/notes/${note.id}/quiz`, {
        method: 'POST',
        body: {
          content: note.extracted_text || note.description,
          title: note.title,
        },
      });
      setQuizData(response.quiz || null);
      setResult('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setQuizData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStudyPlan = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.request('/api/study-plan', {
        method: 'POST',
        body: {
          subject: subject,
          topic: topic,
        },
      });
      setResult(response.plan || '');
      setQuizData(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExplainConcept = async () => {
    if (!conceptInput.trim()) {
      setError('Please enter a concept to explain');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await api.request('/api/concept-explain', {
        method: 'POST',
        body: {
          concept: conceptInput,
          subject: subject,
        },
      });
      setResult(response.explanation || '');
      setQuizData(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={
        {
          ...cardStyle,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        } as React.CSSProperties
      }
    >
      <div>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
          🎓 Study Tools
        </h3>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            borderBottom: `1px solid ${darkTheme.colors.borderColor}`,
            paddingBottom: '12px',
          }}
        >
          {['summary', 'quiz', 'plan', 'concept', 'recall'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab as any);
                setResult('');
                setQuizData(null);
                setError('');
                setConceptInput('');
              }}
              style={{
                padding: '8px 16px',
                background: activeTab === tab ? darkTheme.colors.accent : 'transparent',
                color: activeTab === tab ? 'white' : darkTheme.colors.textSecondary,
                border: 'none',
                borderRadius: darkTheme.borderRadius.md,
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: darkTheme.transitions.default,
              }}
            >
              {tab === 'summary' && '📝 Summary'}
              {tab === 'quiz' && '❓ Quiz'}
              {tab === 'plan' && '📅 Study Plan'}
              {tab === 'concept' && '💡 Explain'}
              {tab === 'recall' && '🧠 Recall'}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === 'summary' && (
          <div>
            {note ? (
              <>
                <p
                  style={{
                    marginBottom: '12px',
                    color: darkTheme.colors.textSecondary,
                    fontSize: '13px',
                  }}
                >
                  Generate a concise summary of "{note.title}"
                </p>
                <button
                  onClick={handleGenerateSummary}
                  disabled={loading}
                  style={
                    {
                      ...buttonPrimaryStyle,
                      width: '100%',
                      opacity: loading ? 0.6 : 1,
                    } as React.CSSProperties
                  }
                >
                  {loading ? '⏳ Generating...' : '✨ Generate Summary'}
                </button>
              </>
            ) : (
              <p style={{ color: darkTheme.colors.textSecondary, fontSize: '13px' }}>
                Select a note to generate a summary
              </p>
            )}
          </div>
        )}

        {activeTab === 'quiz' && (
          <div>
            {note ? (
              <>
                <p
                  style={{
                    marginBottom: '12px',
                    color: darkTheme.colors.textSecondary,
                    fontSize: '13px',
                  }}
                >
                  Generate quiz questions from "{note.title}"
                </p>
                <button
                  onClick={handleGenerateQuiz}
                  disabled={loading}
                  style={
                    {
                      ...buttonPrimaryStyle,
                      width: '100%',
                      opacity: loading ? 0.6 : 1,
                    } as React.CSSProperties
                  }
                >
                  {loading ? '⏳ Generating...' : '❓ Generate Quiz'}
                </button>
              </>
            ) : (
              <p style={{ color: darkTheme.colors.textSecondary, fontSize: '13px' }}>
                Select a note to generate quiz questions
              </p>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <div>
            <p
              style={{
                marginBottom: '12px',
                color: darkTheme.colors.textSecondary,
                fontSize: '13px',
              }}
            >
              Create a 7-day study plan for {topic} in {subject}
            </p>
            <button
              onClick={handleGenerateStudyPlan}
              disabled={loading}
              style={
                {
                  ...buttonPrimaryStyle,
                  width: '100%',
                  opacity: loading ? 0.6 : 1,
                } as React.CSSProperties
              }
            >
              {loading ? '⏳ Creating...' : '📅 Create Study Plan'}
            </button>
          </div>
        )}

        {activeTab === 'concept' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={conceptInput}
              onChange={(e) => setConceptInput(e.target.value)}
              placeholder="Enter a concept (e.g., 'Photosynthesis')"
              style={
                {
                  ...inputStyle,
                  flex: 1,
                  fontSize: '13px',
                } as React.CSSProperties
              }
              onKeyPress={(e) => e.key === 'Enter' && handleExplainConcept()}
            />
            <button
              onClick={handleExplainConcept}
              disabled={loading || !conceptInput.trim()}
              style={
                {
                  ...buttonPrimaryStyle,
                  padding: '8px 16px',
                  opacity: loading || !conceptInput.trim() ? 0.6 : 1,
                } as React.CSSProperties
              }
            >
              {loading ? '⏳' : '💡'}
            </button>
          </div>
        )}

        {activeTab === 'recall' && (
          <div>
            {note ? (
              <>
                <p
                  style={{
                    marginBottom: '12px',
                    color: darkTheme.colors.textSecondary,
                    fontSize: '13px',
                  }}
                >
                  Tutup catatan, lalu tulis ulang semua yang kamu ingat dari "{note.title}". Menulis
                  dari ingatan memperkuat pemahaman lebih dalam daripada sekadar membaca ulang.
                </p>
                <button
                  onClick={() => setShowRecall(true)}
                  style={
                    {
                      ...buttonPrimaryStyle,
                      width: '100%',
                    } as React.CSSProperties
                  }
                >
                  🧠 Mulai Recall Bebas
                </button>
              </>
            ) : (
              <p style={{ color: darkTheme.colors.textSecondary, fontSize: '13px' }}>
                Pilih catatan untuk memulai recall bebas
              </p>
            )}
          </div>
        )}
      </div>

      {showRecall && note && (
        <RecallModal
          noteId={note.id}
          noteContent={note.extracted_text || note.description}
          noteTitle={note.title}
          onClose={() => setShowRecall(false)}
        />
      )}

      {/* Results */}
      {loading && <LoadingSpinner size="sm" message="Generating..." />}

      {error && (
        <div
          style={{
            padding: '12px',
            background: '#ff4757' + '20',
            border: `1px solid #ff4757`,
            borderRadius: darkTheme.borderRadius.md,
            color: '#ff4757',
            fontSize: '13px',
          }}
        >
          Error: {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: '12px',
            background: `${darkTheme.colors.accent}15`,
            borderRadius: darkTheme.borderRadius.md,
            borderLeft: `3px solid ${darkTheme.colors.accent}`,
            maxHeight: '300px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontSize: '13px',
            lineHeight: '1.5',
            color: darkTheme.colors.textPrimary,
          }}
        >
          {result}
        </div>
      )}

      {quizData?.questions && (
        <div
          style={{
            padding: '12px',
            background: `${darkTheme.colors.accent}15`,
            borderRadius: darkTheme.borderRadius.md,
            borderLeft: `3px solid ${darkTheme.colors.accent}`,
            maxHeight: '400px',
            overflowY: 'auto',
          }}
        >
          <h4 style={{ margin: '0 0 12px 0', color: darkTheme.colors.accent, fontSize: '14px' }}>
            Quiz - {quizData.questions.length} Questions
          </h4>
          {quizData.questions.map((q, idx: number) => (
            <div
              key={idx}
              style={{
                marginBottom: '16px',
                padding: '12px',
                background: darkTheme.colors.bgSecondary,
                borderRadius: darkTheme.borderRadius.sm,
                fontSize: '13px',
              }}
            >
              <p style={{ margin: '0 0 8px 0', fontWeight: '500', color: darkTheme.colors.accent }}>
                Q{idx + 1}: {q.question}
              </p>
              <div style={{ marginBottom: '8px' }}>
                {q.options?.map((opt: string, optIdx: number) => (
                  <div
                    key={optIdx}
                    style={{
                      padding: '4px 8px',
                      margin: '4px 0',
                      background: darkTheme.colors.bgTertiary,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      color: darkTheme.colors.textSecondary,
                    }}
                  >
                    {opt}
                  </div>
                ))}
              </div>
              {q.explanation && (
                <p
                  style={{
                    margin: '8px 0 0 0',
                    padding: '8px',
                    background: `${darkTheme.colors.accent}10`,
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: darkTheme.colors.textSecondary,
                    fontStyle: 'italic',
                  }}
                >
                  <strong>Explanation:</strong> {q.explanation}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
