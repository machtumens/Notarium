import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Lightbulb, Mic, Globe, Paperclip, Send, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const STUDY_PLACEHOLDERS = [
  'Explain the concept of cellular respiration...',
  "Help me understand Newton's laws of motion...",
  'What are the key events of World War II?',
  'Can you break down this calculus problem?',
  'Summarize this chapter for me...',
  'Create a practice quiz on this topic...',
  'What are the main themes in this literature?',
];

interface StudyChatInputProps {
  onSubmit: (
    message: string,
    options?: { think?: boolean; deepSearch?: boolean },
  ) => void | Promise<void>;
  onFileUpload?: (file: File) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

const StudyChatInput = ({
  onSubmit,
  onFileUpload,
  disabled = false,
  placeholder,
}: StudyChatInputProps) => {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [thinkActive, setThinkActive] = useState(false);
  const [deepSearchActive, setDeepSearchActive] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cycle placeholder text when input is inactive
  useEffect(() => {
    if (isActive || inputValue || placeholder) return;

    const interval = setInterval(() => {
      setShowPlaceholder(false);
      setTimeout(() => {
        setPlaceholderIndex((prev) => (prev + 1) % STUDY_PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3500);

    return () => clearInterval(interval);
  }, [isActive, inputValue, placeholder]);

  // Close input when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        if (!inputValue) setIsActive(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue]);

  const handleActivate = () => {
    if (!disabled) setIsActive(true);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || disabled || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(inputValue, {
        think: thinkActive,
        deepSearch: deepSearchActive,
      });
      setInputValue('');
      setIsActive(false);
      setThinkActive(false);
      setDeepSearchActive(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      await onFileUpload(file);
      e.target.value = '';
    }
  };

  const containerVariants = {
    collapsed: {
      height: 68,
      boxShadow: '0 2px 8px 0 rgba(139, 92, 246, 0.2)',
      transition: { type: 'spring', stiffness: 120, damping: 18 },
    },
    expanded: {
      height: 128,
      boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.35)',
      transition: { type: 'spring', stiffness: 120, damping: 18 },
    },
  };

  const placeholderContainerVariants = {
    initial: {},
    animate: { transition: { staggerChildren: 0.025 } },
    exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 } },
  };

  const letterVariants = {
    initial: {
      opacity: 0,
      filter: 'blur(12px)',
      y: 10,
    },
    animate: {
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        opacity: { duration: 0.25 },
        filter: { duration: 0.4 },
        y: { type: 'spring', stiffness: 80, damping: 20 },
      },
    },
    exit: {
      opacity: 0,
      filter: 'blur(12px)',
      y: -10,
      transition: {
        opacity: { duration: 0.2 },
        filter: { duration: 0.3 },
        y: { type: 'spring', stiffness: 80, damping: 20 },
      },
    },
  };

  const currentPlaceholder = placeholder || STUDY_PLACEHOLDERS[placeholderIndex];

  return (
    <div className="w-full">
      <motion.div
        ref={wrapperRef}
        className="w-full"
        variants={containerVariants}
        animate={isActive || inputValue ? 'expanded' : 'collapsed'}
        initial="collapsed"
        style={{
          overflow: 'hidden',
          borderRadius: 24,
          background: 'rgba(17, 17, 17, 0.8)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
        }}
        onClick={handleActivate}
      >
        <div className="flex flex-col items-stretch w-full h-full">
          {/* Input Row */}
          <div className="flex items-center gap-2 p-3 w-full">
            {onFileUpload && (
              <>
                <button
                  className="p-3 rounded-full hover:bg-white/10 transition text-white/70 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Attach file"
                  type="button"
                  tabIndex={-1}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <Paperclip size={20} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </>
            )}

            {/* Text Input & Placeholder */}
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                className="flex-1 border-0 outline-0 rounded-md py-2 text-base bg-transparent w-full font-normal text-white disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ position: 'relative', zIndex: 1 }}
                onFocus={handleActivate}
              />
              <div className="absolute left-0 top-0 w-full h-full pointer-events-none flex items-center px-3 py-2">
                <AnimatePresence mode="wait">
                  {showPlaceholder && !isActive && !inputValue && (
                    <motion.span
                      key={placeholder || placeholderIndex}
                      className="absolute left-0 top-1/2 -translate-y-1/2 text-white/40 select-none pointer-events-none"
                      style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        zIndex: 0,
                        maxWidth: '100%',
                      }}
                      variants={placeholderContainerVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      {currentPlaceholder.split('').map((char, i) => (
                        <motion.span
                          key={i}
                          variants={letterVariants}
                          style={{ display: 'inline-block' }}
                        >
                          {char === ' ' ? '\u00A0' : char}
                        </motion.span>
                      ))}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <button
              className={`flex items-center gap-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white p-3 rounded-full font-medium justify-center transition disabled:opacity-50 disabled:cursor-not-allowed ${
                isSubmitting ? 'animate-pulse' : ''
              }`}
              title="Send"
              type="button"
              tabIndex={-1}
              onClick={handleSend}
              disabled={disabled || !inputValue.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <div className="w-[18px] h-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>

          {/* Expanded Controls */}
          <motion.div
            className="w-full flex justify-start px-4 items-center text-sm pb-3"
            variants={{
              hidden: {
                opacity: 0,
                y: 20,
                pointerEvents: 'none' as const,
                transition: { duration: 0.25 },
              },
              visible: {
                opacity: 1,
                y: 0,
                pointerEvents: 'auto' as const,
                transition: { duration: 0.35, delay: 0.08 },
              },
            }}
            initial="hidden"
            animate={isActive || inputValue ? 'visible' : 'hidden'}
          >
            <div className="flex gap-3 items-center flex-wrap">
              {/* Think Toggle */}
              <button
                className={`flex items-center gap-1 px-4 py-2 rounded-full transition-all font-medium group ${
                  thinkActive
                    ? 'bg-purple-600/30 outline outline-1 outline-purple-400/60 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
                title="Enable deeper reasoning"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setThinkActive((a) => !a);
                }}
                disabled={disabled}
              >
                <Lightbulb
                  className={`transition-all ${thinkActive ? 'fill-yellow-300 text-yellow-300' : ''}`}
                  size={16}
                />
                <span className="text-sm">Think</span>
              </button>

              {/* Deep Search Toggle */}
              <motion.button
                className={`flex items-center px-4 gap-1 py-2 rounded-full transition font-medium whitespace-nowrap overflow-hidden justify-start ${
                  deepSearchActive
                    ? 'bg-blue-600/30 outline outline-1 outline-blue-400/60 text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
                title="Search relevant study materials"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeepSearchActive((a) => !a);
                }}
                disabled={disabled}
                initial={false}
                animate={{
                  width: deepSearchActive ? 140 : 36,
                  paddingLeft: deepSearchActive ? 16 : 9,
                }}
              >
                <div className="flex-shrink-0">
                  <Globe size={16} />
                </div>
                <motion.span
                  className="text-sm"
                  initial={false}
                  animate={{
                    opacity: deepSearchActive ? 1 : 0,
                  }}
                >
                  Deep Search
                </motion.span>
              </motion.button>

              {/* Info Text */}
              <span className="text-xs text-white/40 ml-2">Press Enter to send</span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export { StudyChatInput };
