import { useState, useEffect } from 'react';
import { darkTheme } from '../theme';

interface Founder {
  name: string;
  role: string;
  contribution: string;
  photo: string;
}

interface FoundersModalProps {
  onClose: () => void;
}

export default function FoundersModal({ onClose }: FoundersModalProps) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const founders: Founder[] = [
    {
      name: 'Richard Amadeus',
      role: 'Team Lead & Chief Software Developer',
      contribution: 'Co-led this team, and developed most of the code for Notarium.',
      photo: '/per.1.jpg',
    },
    {
      name: 'Zoey Budiman',
      role: 'Co-Leader & Project Manager',
      contribution: 'Led this team to success, and directed team flow throughout development.',
      photo: '/per.2.jpg',
    },
    {
      name: 'Imsal Gloria',
      role: 'Art/Design Manager & Innovation Manager',
      contribution: 'Designed the art used in this website as well as co-designing the interface.',
      photo: '/per.3.jpg',
    },
    {
      name: 'Samuel Butar-Butar',
      role: 'Assistant Software Developer',
      contribution: 'Assisted in development, primarily in the UI section.',
      photo: '/per.4.jpg',
    },
    {
      name: 'Vincent',
      role: 'Co Treasurer',
      contribution: 'Hampir Berguna',
      photo: '/per.5.jpg',
    },
  ];

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleExpand = (index: number) => {
    if (isMobile) {
      setExpandedIndex(expandedIndex === index ? null : index);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
          animation: 'fadeIn 0.2s ease-out',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: darkTheme.colors.bgSecondary,
          borderRadius: isMobile ? '16px' : '20px',
          padding: isMobile ? '20px' : '36px',
          maxWidth: isMobile ? '90%' : '550px',
          width: isMobile ? '90%' : '60%',
          maxHeight: '85vh',
          overflowY: 'auto',
          zIndex: 9999,
          border: `1px solid ${darkTheme.colors.borderColor}`,
          boxShadow: '0 25px 70px rgba(0, 0, 0, 0.6)',
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: isMobile ? '16px' : '24px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? '20px' : '24px',
              fontWeight: 'bold',
              color: darkTheme.colors.textPrimary,
            }}
          >
            Meet Our Team
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: darkTheme.colors.textSecondary,
              cursor: 'pointer',
              fontSize: '24px',
              padding: '4px 8px',
              transition: darkTheme.transitions.default,
              borderRadius: darkTheme.borderRadius.sm,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = darkTheme.colors.textPrimary;
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = darkTheme.colors.textSecondary;
              e.currentTarget.style.background = 'none';
            }}
          >
            ✕
          </button>
        </div>

        {/* Mobile Hint */}
        {isMobile && (
          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: '12px',
              color: darkTheme.colors.textSecondary,
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            Tap on a founder to see their role and contribution
          </p>
        )}

        {/* Founders List */}
        <div
          style={{
            display: 'grid',
            gap: isMobile ? '12px' : '16px',
          }}
        >
          {founders.map((founder, index) => {
            const isExpanded = expandedIndex === index;

            return (
              <div
                key={index}
                onClick={() => toggleExpand(index)}
                style={{
                  padding: isMobile ? '12px' : '16px',
                  background: darkTheme.colors.bgTertiary,
                  borderRadius: darkTheme.borderRadius.md,
                  border: `1px solid ${isExpanded && isMobile ? darkTheme.colors.accent : darkTheme.colors.borderColor}`,
                  transition: 'all 0.3s ease',
                  cursor: isMobile ? 'pointer' : 'default',
                }}
                onMouseOver={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = darkTheme.colors.accent;
                  }
                }}
                onMouseOut={(e) => {
                  if (!isMobile) {
                    e.currentTarget.style.background = darkTheme.colors.bgTertiary;
                    e.currentTarget.style.borderColor = darkTheme.colors.borderColor;
                  }
                }}
              >
                {/* Top Row: Photo and Name (Always Visible) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  {/* Founder Photo */}
                  <div
                    style={{
                      width: isMobile ? '50px' : '60px',
                      height: isMobile ? '50px' : '60px',
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                      backgroundImage: `url('${founder.photo}')`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: `2px solid ${darkTheme.colors.accent}`,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isMobile ? '20px' : '24px',
                      fontWeight: 'bold',
                      color: 'white',
                    }}
                  >
                    {/* Show initials as fallback if image doesn't load */}
                    <span
                      style={{
                        display: 'none',
                        background: `linear-gradient(135deg, ${darkTheme.colors.accent}, #8b5cf6)`,
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {founder.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </span>
                  </div>

                  {/* Founder Name */}
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: isMobile ? '15px' : '16px',
                        fontWeight: '600',
                        color: darkTheme.colors.textPrimary,
                      }}
                    >
                      {founder.name}
                    </h3>

                    {/* Desktop: Show role inline */}
                    {!isMobile && (
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: '13px',
                          color: darkTheme.colors.accent,
                          fontWeight: '500',
                        }}
                      >
                        {founder.role}
                      </p>
                    )}
                  </div>

                  {/* Mobile: Expand indicator */}
                  {isMobile && (
                    <div
                      style={{
                        fontSize: '14px',
                        color: darkTheme.colors.textSecondary,
                        transition: 'transform 0.3s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      ▼
                    </div>
                  )}
                </div>

                {/* Expandable Content (Mobile) / Always Visible (Desktop) */}
                {(isExpanded || !isMobile) && (
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: `1px solid ${darkTheme.colors.borderColor}`,
                      animation: isMobile ? 'expandDown 0.3s ease-out' : 'none',
                    }}
                  >
                    {/* Mobile: Show role */}
                    {isMobile && (
                      <p
                        style={{
                          margin: '0 0 8px 0',
                          fontSize: '13px',
                          color: darkTheme.colors.accent,
                          fontWeight: '500',
                        }}
                      >
                        {founder.role}
                      </p>
                    )}

                    {/* Contribution (Both Mobile & Desktop) */}
                    <div
                      style={{
                        padding: '10px',
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderRadius: darkTheme.borderRadius.sm,
                        borderLeft: `3px solid ${darkTheme.colors.accent}`,
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: isMobile ? '12px' : '13px',
                          color: darkTheme.colors.textSecondary,
                          lineHeight: '1.5',
                        }}
                      >
                        {founder.contribution}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, -45%);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%);
          }
        }

        @keyframes expandDown {
          from {
            opacity: 0;
            maxHeight: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            maxHeight: 500px;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
