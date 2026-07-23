import * as React from 'react';
import { useState, useRef } from 'react';
import { Lightbulb, Globe, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlaceholdersAndVanishInput } from './placeholders-and-vanish-input';
import { cn } from '@/lib/utils';

const AI_PLACEHOLDERS = [
  'How Can I Help You?',
  'Explain the concept of cellular respiration...',
  "Help me understand Newton's laws of motion...",
  'What are the key events of World War II?',
  'Can you break down this calculus problem?',
  'Summarize this chapter for me...',
  'Create a practice quiz on this topic...',
  'What are the main themes in this literature?',
];

interface AIChatInputProps {
  onSubmit: (
    message: string,
    options?: { think?: boolean; deepSearch?: boolean },
  ) => void | Promise<void>;
  onFileUpload?: (file: File) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function AIChatInput({
  onSubmit,
  onFileUpload,
  disabled = false,
  placeholder,
}: AIChatInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [thinkActive, setThinkActive] = useState(false);
  const [deepSearchActive, setDeepSearchActive] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || disabled || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(inputValue, {
        think: thinkActive,
        deepSearch: deepSearchActive,
      });
      setInputValue('');
      setShowControls(false);
      setThinkActive(false);
      setDeepSearchActive(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFileUpload) {
      await onFileUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="w-full space-y-4" ref={formRef}>
      {/* Enhanced Controls Bar - Shows when input is focused */}
      <AnimatePresence>
        {(showControls || inputValue) && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex gap-3 items-center flex-wrap px-1"
          >
            {/* File Upload */}
            {onFileUpload && (
              <>
                <button
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-full transition-all font-medium backdrop-blur-xl border',
                    'bg-black/40 border-white/10 text-white/70',
                    'hover:bg-black/60 hover:border-purple-500/30 hover:text-white hover:shadow-[0_0_15px_rgba(139,92,246,0.2)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black/40',
                  )}
                  title="Attach file"
                  type="button"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip size={16} />
                  <span className="text-sm">Attach</span>
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

            {/* Think Toggle */}
            <button
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-full transition-all font-medium group backdrop-blur-xl border',
                thinkActive
                  ? 'bg-purple-600/20 border-purple-400/50 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-black/60 hover:border-purple-500/30 hover:text-white',
              )}
              title="Enable deeper reasoning"
              type="button"
              onClick={() => setThinkActive((a) => !a)}
              disabled={disabled}
            >
              <Lightbulb
                className={cn('transition-all', thinkActive && 'fill-yellow-300 text-yellow-300')}
                size={16}
              />
              <span className="text-sm">Think</span>
            </button>

            {/* Deep Search Toggle */}
            <button
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-full transition-all font-medium backdrop-blur-xl border',
                deepSearchActive
                  ? 'bg-blue-600/20 border-blue-400/50 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-black/60 hover:border-blue-500/30 hover:text-white',
              )}
              title="Search relevant study materials"
              type="button"
              onClick={() => setDeepSearchActive((a) => !a)}
              disabled={disabled}
            >
              <Globe size={16} />
              <span className="text-sm">Deep Search</span>
            </button>

            {/* Info Text */}
            <span className="text-xs text-white/30 ml-2 font-medium">Press Enter to send</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Input - PlaceholdersAndVanishInput with enhanced wrapper */}
      <div className="relative" onFocus={() => setShowControls(true)}>
        {/* Animated gradient border */}
        <div
          className={cn(
            'rounded-full overflow-hidden transition-all duration-500',
            'relative',
            showControls || inputValue
              ? 'shadow-[0_0_40px_rgba(139,92,246,0.5),0_0_80px_rgba(59,130,246,0.3)]'
              : 'shadow-[0_0_20px_rgba(139,92,246,0.25)]',
          )}
        >
          {/* Gradient border effect */}
          <div
            className={cn(
              'absolute inset-0 rounded-full opacity-75 blur-sm transition-opacity duration-500',
              'bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600',
              showControls || inputValue ? 'opacity-100' : 'opacity-50',
            )}
          />

          {/* Static border */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-500/30 via-blue-500/30 to-purple-500/30 p-[2px]">
            <div className="rounded-full bg-black/90 h-full w-full" />
          </div>

          {/* Content */}
          <div className="relative z-10">
            <PlaceholdersAndVanishInput
              placeholders={placeholder ? [placeholder] : AI_PLACEHOLDERS}
              onChange={(e) => {
                setInputValue(e.target.value);
                if (e.target.value && !showControls) {
                  setShowControls(true);
                }
              }}
              onSubmit={handleSubmit}
            />
          </div>
        </div>

        {/* Loading Overlay */}
        {isSubmitting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full backdrop-blur-md z-[100]">
            <div className="flex items-center gap-3 text-white">
              <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <span className="text-sm font-semibold">Sending...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
