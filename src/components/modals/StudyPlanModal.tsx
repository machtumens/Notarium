import { useState, useEffect } from 'react';
import api from '../../lib/api';
import LoadingSpinner from '../LoadingSpinner';
import { darkTheme, modalOverlayStyle, modalContentStyle, buttonSecondaryStyle } from '../../theme';

interface StudyPlanModalProps {
  subject: string;
  topic: string;
  onClose: () => void;
}

export default function StudyPlanModal({ subject, topic, onClose }: StudyPlanModalProps) {
  const [plan, setPlan] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- stable component loader function referenced by the effect; behavior-preserving
    loadPlan();
  }, [subject, topic]);

  const loadPlan = async () => {
    try {
      setLoading(true);
      const data = await api.ai.generateStudyPlan(subject, topic);
      setPlan(data.plan || '');
    } catch (error) {
      console.error('Failed to load study plan:', error);
      setPlan('Failed to generate study plan. Please try again.');
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
            Study Plan: {topic}
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

        {loading ? (
          <LoadingSpinner message="Generating study plan..." size="md" />
        ) : (
          <>
            <div
              style={{
                background: darkTheme.colors.bgSecondary,
                padding: '16px',
                borderRadius: darkTheme.borderRadius.lg,
                marginBottom: '24px',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                lineHeight: '1.6',
                color: darkTheme.colors.textSecondary,
                fontSize: '14px',
              }}
            >
              {plan}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '12px',
              }}
            >
              <button
                onClick={loadPlan}
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
                Regenerate
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
        )}
      </div>
    </div>
  );
}
