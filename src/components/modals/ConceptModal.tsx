import { useState } from 'react';
import api from '../../lib/api';
import LoadingSpinner from '../LoadingSpinner';
import {
  darkTheme,
  modalOverlayStyle,
  modalContentStyle,
  inputStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
} from '../../theme';

interface ConceptModalProps {
  onClose: () => void;
}

export default function ConceptModal({ onClose }: ConceptModalProps) {
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleExplain = async () => {
    if (!concept.trim()) return;

    try {
      setLoading(true);
      const data = await api.ai.explainConcept(concept);
      setExplanation(data.explanation || '');
    } catch (error) {
      console.error('Failed to explain concept:', error);
      setExplanation('Failed to explain concept. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={modalOverlayStyle}>
      <div
        style={
          {
            ...modalContentStyle,
            maxWidth: '600px',
            maxHeight: '80vh',
            overflowY: 'auto',
          } as React.CSSProperties
        }
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            position: 'sticky',
            top: 0,
            background: 'rgba(10, 10, 10, 0.95)',
            paddingBottom: '16px',
            zIndex: 1,
          }}
        >
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff', margin: 0 }}>
            Concept Explainer
          </h2>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '600',
                color: '#fff',
                marginBottom: '8px',
              }}
            >
              Enter a concept to explain
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleExplain()}
                style={
                  {
                    ...inputStyle,
                    flex: 1,
                  } as React.CSSProperties
                }
                placeholder="e.g., Photosynthesis, Quantum mechanics..."
                disabled={loading}
              />
              <button
                onClick={handleExplain}
                disabled={loading || !concept.trim()}
                style={
                  {
                    ...buttonPrimaryStyle,
                    opacity: loading || !concept.trim() ? 0.6 : 1,
                    cursor: loading || !concept.trim() ? 'not-allowed' : 'pointer',
                  } as React.CSSProperties
                }
              >
                <i className="fas fa-magic"></i>
              </button>
            </div>
          </div>

          {loading ? (
            <LoadingSpinner message="Generating explanation..." size="md" />
          ) : explanation ? (
            <>
              <div
                style={{
                  background: darkTheme.colors.bgSecondary,
                  padding: '16px',
                  borderRadius: darkTheme.borderRadius.lg,
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  lineHeight: '1.6',
                  color: darkTheme.colors.textSecondary,
                  fontSize: '14px',
                }}
              >
                {explanation}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setExplanation(null)}
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
                  Clear
                </button>
                <button
                  onClick={onClose}
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
                  Close
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
