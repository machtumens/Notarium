import { useEffect, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme } from '../theme';
import { ArrowRight } from 'lucide-react';

const SubjectsShaderScene = lazy(() => import('../components/ui/SubjectsShaderScene'));

const shaderFallbackBackground =
  'radial-gradient(circle at 30% 30%, rgba(99, 102, 241, 0.35) 0%, transparent 55%),' +
  'radial-gradient(circle at 75% 65%, rgba(236, 72, 153, 0.3) 0%, transparent 55%),' +
  'radial-gradient(circle at 50% 80%, rgba(139, 92, 246, 0.35) 0%, transparent 60%)';

export interface Subject {
  id: number;
  name: string;
  icon: string;
  note_count: number;
}

interface SubjectsPageProps {
  onSelectSubject: (subject: Subject) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function SubjectsPage({
  onSelectSubject,
  isLoading,
  setIsLoading,
}: SubjectsPageProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);

  useEffect(() => {
    const loadSubjects = async () => {
      try {
        setIsLoading(true);
        const subjectsData = await api.getSubjects();

        const normalizedSubjects = Array.isArray(subjectsData)
          ? subjectsData
          : subjectsData?.subjects || [];

        setSubjects(normalizedSubjects as Subject[]);
      } catch (err) {
        logger.error('subjects', 'Failed to load subjects', err);
        toast.error('Failed to load subjects. Please refresh.');
      } finally {
        setIsLoading(false);
      }
    };

    loadSubjects();
  }, [setIsLoading]);

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          opacity: 0.7,
          zIndex: 0,
        }}
      >
        <Suspense
          fallback={
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: shaderFallbackBackground,
              }}
            />
          }
        >
          <SubjectsShaderScene />
        </Suspense>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2
          style={{
            fontSize: '28px',
            fontWeight: 'bold',
            marginBottom: '24px',
            color: darkTheme.colors.textPrimary,
          }}
        >
          Subjects
        </h2>

        {isLoading ? (
          <LoadingSpinner message="Loading subjects..." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px',
            }}
          >
            {subjects.map((subject) => (
              <div
                key={subject.id}
                onClick={() => onSelectSubject(subject)}
                className="group"
                style={{
                  cursor: 'pointer',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'relative',
                    height: '27rem',
                    width: '100%',
                    overflow: 'hidden',
                    borderRadius: '12px',
                  }}
                >
                  {/* Background with icon */}
                  <div
                    style={{
                      position: 'absolute',
                      height: '100%',
                      width: '100%',
                      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'transform 300ms',
                    }}
                    className="group-hover:scale-105"
                  >
                    <i
                      className={`fas ${subject.icon}`}
                      style={{
                        fontSize: '120px',
                        color: 'rgba(139, 92, 246, 0.3)',
                        opacity: 0.5,
                      }}
                    ></i>
                  </div>

                  {/* Gradient overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      height: '100%',
                      background:
                        'linear-gradient(to bottom, rgba(139, 92, 246, 0) 0%, rgba(139, 92, 246, 0.4) 60%, rgba(139, 92, 246, 0.8) 100%)',
                      mixBlendMode: 'multiply',
                    }}
                  />

                  {/* Content at bottom */}
                  <div
                    style={{
                      position: 'absolute',
                      insetInline: 0,
                      bottom: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '32px',
                      color: 'white',
                    }}
                  >
                    <div
                      style={{
                        marginBottom: '12px',
                        paddingTop: '16px',
                        fontSize: '24px',
                        fontWeight: '600',
                      }}
                    >
                      {subject.name}
                    </div>
                    <div
                      style={{
                        marginBottom: '48px',
                        fontSize: '14px',
                        opacity: 0.9,
                      }}
                    >
                      {subject.note_count} notes available
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                      }}
                    >
                      View notes{' '}
                      <ArrowRight
                        className="ml-2 transition-transform group-hover:translate-x-1"
                        size={20}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
