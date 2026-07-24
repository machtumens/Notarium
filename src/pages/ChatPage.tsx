import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import api from '../lib/api';
import { logger } from '../lib/logger';
import LoadingSpinner from '../components/LoadingSpinner';
import { darkTheme } from '../theme';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { ShaderAnimation } from '@/components/ui/shader-lines';
import { PlaceholdersAndVanishInput } from '@/components/ui/placeholders-and-vanish-input';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UploadedDocument {
  fileName: string;
  uploadedAt: string;
}

import type { ChatSession } from '../types';

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [_uploadedDocuments, _setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const [_keyConcepts, _setKeyConcepts] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await api.chat.getSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      logger.error('chat', 'Failed to load sessions', err);
      toast.error('Failed to load chat sessions.');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (sessionId: number) => {
    try {
      const data = await api.chat.getMessages(sessionId);
      setMessages(data.messages || []);
    } catch (err) {
      logger.error('chat', 'Failed to load messages', err);
      toast.error('Failed to load messages.');
    }
  };

  const handleSelectSession = async (session: ChatSession) => {
    setSelectedSession(session);
    await loadMessages(session.id);
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;

    setSending(true);

    try {
      let currentSession = selectedSession;

      if (!currentSession) {
        const data = await api.chat.createSession('General', 'AI Chat');
        currentSession = data.session as import('../types').ChatSession;
        setSessions([currentSession, ...sessions]);
        setSelectedSession(currentSession);
      }

      setMessages((prev) => [...prev, { role: 'user', content: message }]);

      const response = await api.request(`/api/chat/sessions/${currentSession!.id}/ai-response`, {
        method: 'POST',
        body: { message, subject: currentSession!.subject },
      });

      const aiResponseContent =
        response.response || 'I apologize, but I could not generate a response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: aiResponseContent }]);
    } catch (error: unknown) {
      logger.error('chat', 'Failed to send message', error);
      setMessages((prev) => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'user') {
          newMessages.pop();
        }
        return newMessages;
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response from AI tutor. Please try again.'}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          transform: isMobile
            ? sidebarOpen
              ? 'translateX(0px)'
              : 'translateX(0px)'
            : sidebarOpen
              ? 'translateX(170px)'
              : 'translateX(40px)',
          transition: 'transform 0.3s ease',
          opacity: isMobile && sidebarOpen ? 0.3 : 1,
        }}
      >
        <ShaderAnimation />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.6) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Left Floating Sidebar */}
      <div
        style={
          {
            position: 'fixed',
            top: isMobile ? '64px' : '76px',
            left: sidebarOpen ? (isMobile ? '0' : '20px') : isMobile ? '-100%' : '-280px',
            width: isMobile ? '100%' : '260px',
            height: `calc(100vh - ${isMobile ? '64px' : '96px'})`,
            background: 'rgba(10, 10, 15, 0.95)',
            backdropFilter: 'blur(30px)',
            borderRadius: isMobile ? '0' : '20px',
            border: isMobile ? 'none' : '1px solid rgba(139, 92, 246, 0.2)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            zIndex: 100,
            transition: 'left 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
          } as React.CSSProperties
        }
      >
        <h2
          style={{
            margin: 0,
            marginBottom: '20px',
            fontSize: '18px',
            fontWeight: '700',
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Chat History
        </h2>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '20px',
                color: darkTheme.colors.textSecondary,
              }}
            >
              <LoadingSpinner />
            </div>
          ) : sessions.length > 0 ? (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSelectSession(session)}
                style={{
                  padding: '12px 16px',
                  background:
                    selectedSession?.id === session.id
                      ? 'rgba(139, 92, 246, 0.2)'
                      : 'rgba(255, 255, 255, 0.05)',
                  border:
                    selectedSession?.id === session.id
                      ? '1px solid #8b5cf6'
                      : '1px solid rgba(139, 92, 246, 0.15)',
                  borderRadius: '12px',
                  color: darkTheme.colors.textPrimary,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedSession?.id === session.id ? '600' : '500',
                  transition: darkTheme.transitions.default,
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{session.subject}</div>
                <div style={{ fontSize: '12px', opacity: '0.7' }}>{session.topic}</div>
              </button>
            ))
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: darkTheme.colors.textSecondary,
                fontSize: '14px',
              }}
            >
              No chats yet. Create one to get started!
            </div>
          )}
        </div>
      </div>

      {/* Toggle Sidebar Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: isMobile ? '80px' : '92px',
          left: sidebarOpen ? (isMobile ? '20px' : '300px') : '20px',
          width: '40px',
          height: '40px',
          background: 'rgba(139, 92, 246, 0.2)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '12px',
          color: darkTheme.colors.textPrimary,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 101,
          transition: 'left 0.3s ease',
          fontSize: '16px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        }}
      >
        <i className={`fas fa-${sidebarOpen ? (isMobile ? 'times' : 'chevron-left') : 'bars'}`}></i>
      </button>

      {/* Main Content Area */}
      <div
        style={{
          position: 'relative',
          marginLeft: sidebarOpen ? (isMobile ? '0px' : '340px') : isMobile ? '20px' : '80px',
          marginRight: isMobile ? '20px' : '20px',
          marginTop: isMobile ? '64px' : '76px',
          marginBottom: '20px',
          height: `calc(100vh - ${isMobile ? '84px' : '96px'})`,
          transition: 'margin-left 0.3s ease',
          zIndex: 10,
          opacity: isMobile && sidebarOpen ? 0 : 1,
          pointerEvents: isMobile && sidebarOpen ? 'none' : 'auto',
        }}
      >
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {!selectedSession && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '32px',
                padding: '20px',
              }}
            >
              <div style={{ textAlign: 'center', maxWidth: '600px' }}>
                <h1
                  style={{
                    fontSize: isMobile ? '28px' : '42px',
                    fontWeight: '800',
                    margin: '0 0 16px 0',
                    color: 'white',
                  }}
                >
                  Ask AI Anything
                </h1>
                <p
                  style={{
                    fontSize: isMobile ? '16px' : '18px',
                    color: darkTheme.colors.textSecondary,
                    lineHeight: '1.7',
                    margin: 0,
                  }}
                >
                  Start chatting by typing your question below
                </p>
              </div>
            </div>
          )}

          {selectedSession && (
            <div
              style={
                {
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'rgba(10, 10, 15, 0.7)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '20px',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  overflow: 'hidden',
                } as React.CSSProperties
              }
            >
              {/* Chat Header */}
              <div
                style={{
                  padding: isMobile ? '16px 20px' : '20px 28px',
                  borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                  background:
                    'linear-gradient(135deg, rgba(139, 92, 246, 0.08), rgba(59, 130, 246, 0.08))',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: isMobile ? '16px' : '18px',
                      fontWeight: '700',
                      background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {selectedSession.subject}
                  </h2>
                  <p
                    style={{
                      margin: '4px 0 0 0',
                      fontSize: '13px',
                      color: darkTheme.colors.textSecondary,
                      fontWeight: '500',
                    }}
                  >
                    {selectedSession.topic}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: isMobile ? '20px' : '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {messages.length === 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      flexDirection: 'column',
                      gap: '20px',
                    }}
                  >
                    <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                      <h3
                        style={{
                          fontSize: '20px',
                          fontWeight: '700',
                          color: '#e4e4e7',
                          margin: '0 0 12px 0',
                          background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        How Can I Help?
                      </h3>
                      <p
                        style={{
                          fontSize: '14px',
                          color: darkTheme.colors.textSecondary,
                          lineHeight: '1.6',
                          margin: 0,
                        }}
                      >
                        Ask me anything about {selectedSession.subject}!
                      </p>
                    </div>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      gap: '12px',
                      animation: 'fadeIn 0.4s ease-out',
                    }}
                  >
                    {msg.role === 'assistant' && (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          flexShrink: 0,
                          fontSize: '16px',
                          fontWeight: '700',
                          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                        }}
                      >
                        AI
                      </div>
                    )}
                    <div
                      style={{
                        maxWidth: isMobile ? '85%' : '75%',
                        padding: '14px 18px',
                        borderRadius:
                          msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background:
                          msg.role === 'user'
                            ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                            : 'rgba(30, 30, 35, 0.7)',
                        color: msg.role === 'user' ? '#fff' : darkTheme.colors.textPrimary,
                        fontSize: '15px',
                        lineHeight: '1.7',
                        boxShadow:
                          msg.role === 'user'
                            ? '0 4px 12px rgba(139, 92, 246, 0.3)'
                            : '0 2px 8px rgba(0, 0, 0, 0.2)',
                        border: msg.role === 'user' ? 'none' : '1px solid rgba(139, 92, 246, 0.15)',
                      }}
                    >
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                    {msg.role === 'user' && (
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          flexShrink: 0,
                          fontSize: '20px',
                          fontWeight: '600',
                          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
                        }}
                      >
                        👤
                      </div>
                    )}
                  </div>
                ))}
                {sending && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: '700',
                        color: 'white',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    >
                      AI
                    </div>
                    <div
                      style={{
                        padding: '14px 18px',
                        borderRadius: '16px 16px 16px 4px',
                        background: 'rgba(30, 30, 35, 0.7)',
                        color: '#e4e4e7',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(139, 92, 246, 0.3)',
                          borderTopColor: '#8b5cf6',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite',
                        }}
                      />
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Input Area - Always visible at bottom */}
          <div
            style={{
              padding: isMobile ? '16px' : '20px 24px',
              borderTop: selectedSession ? '1px solid rgba(139, 92, 246, 0.15)' : 'none',
              background: selectedSession ? 'rgba(0, 0, 0, 0.6)' : 'transparent',
              backdropFilter: 'blur(20px)',
            }}
          >
            <PlaceholdersAndVanishInput
              placeholders={[
                'Ask me anything...',
                'What would you like to know?',
                "I'm here to help...",
                'Type your question here...',
              ]}
              onChange={(e) => setInputValue(e.target.value)}
              onSubmit={(e) => {
                e.preventDefault();
                if (inputValue.trim()) {
                  handleSendMessage(inputValue);
                  setInputValue('');
                }
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(0.98);
          }
        }
      `}</style>
    </div>
  );
}
