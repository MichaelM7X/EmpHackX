import { motion, AnimatePresence } from 'motion/react';
import { Send, X, Minimize2, Sparkles, Bot } from 'lucide-react';
import { ClarionLogo } from './ClarionLogo';
import { useEffect, useRef, useState } from 'react';
import type { AuditReport, AuditRequest } from '../../types';
import { useChat } from '../hooks/useChat';
import type { ChatContext, SharedChatState } from '../hooks/useChat';

interface FloatingChatProps {
  context: ChatContext;
  auditContext?: { request: AuditRequest; report: AuditReport };
  hidden?: boolean;
  shared?: SharedChatState;
}

export function FloatingChat({ context, auditContext, hidden = false, shared }: FloatingChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const { message, setMessage, isThinking, conversation, prompts, handleSend, handlePromptClick } =
    useChat({ context, auditContext, shared });

  return (
    <div ref={containerRef}>
      {/* Floating Button */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: hidden && !isOpen ? 0 : 1,
          scale: hidden && !isOpen ? 0.85 : 1,
          y: hidden && !isOpen ? 8 : 0,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{ pointerEvents: hidden && !isOpen ? 'none' : 'auto' }}
        className="fixed bottom-8 right-8 z-50"
        onMouseEnter={() => setShowLabel(true)}
        onMouseLeave={() => !isOpen && setShowLabel(false)}
      >
        <AnimatePresence>
          {!isOpen && showLabel && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap"
            >
              <div className="px-3 py-2 rounded-lg bg-[var(--primary)] text-white text-sm shadow-lg">
                Ask Clarion
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Breathing halo */}
        {!isOpen && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(93,108,128,0.15) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.15, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          animate={!isOpen ? { y: [0, -4, 0] } : {}}
          transition={!isOpen ? { y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' } } : {}}
          onClick={() => (isOpen ? setIsOpen(false) : setIsOpen(true))}
          className="relative w-14 h-14 rounded-full text-white flex items-center justify-center overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7, #BFDBFE, #A7BFFB)',
            backgroundSize: '300% 300%',
            animation: 'gradientShift 14s ease infinite',
            boxShadow: '0 4px 24px rgba(167,191,251,0.55), 0 1px 6px rgba(167,191,251,0.3)',
            filter: 'drop-shadow(0 0 8px rgba(167,191,251,0.4))',
          }}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <X className="w-5 h-5" />
              </motion.div>
            ) : (
              <motion.div key="bot" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                <Bot className="w-7 h-7" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      {/* Chat Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-28 right-8 w-[400px] rounded-2xl z-50 overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.75)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(203,213,225,0.5)',
              boxShadow: '0 8px 40px rgba(167,191,251,0.18), 0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[var(--border)]/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7, #BFDBFE, #A7BFFB)',
                    backgroundSize: '300% 300%',
                    animation: 'gradientShift 14s ease infinite',
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <h3 className="text-sm font-medium text-[var(--foreground)]">Ask Clarion</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors p-1.5 hover:bg-white/60 rounded-lg"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Suggested Prompts */}
            {conversation.length === 0 && (
              <div className="px-5 py-3.5 border-b border-[var(--border)]/50">
                <p className="text-xs text-[var(--muted-foreground)] mb-2.5">Suggested questions</p>
                <div className="space-y-1.5">
                  {prompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePromptClick(prompt)}
                      className="w-full text-left px-3.5 py-2.5 rounded-xl bg-white/50 border border-[var(--border)]/50 hover:bg-white/80 hover:border-[var(--accent-primary)]/30 transition-all text-sm text-[var(--foreground)]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation */}
            <div className="px-5 py-4 max-h-[300px] overflow-y-auto">
              {conversation.length === 0 ? (
                <div className="text-center py-8">
                  <div className="flex justify-center mb-3">
                    <Sparkles className="w-8 h-8 text-[#A7BFFB]" />
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {getContextPrompt(context)}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversation.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'text-white'
                            : 'bg-white/70 text-[var(--foreground)] border border-[var(--border)]/50'
                        }`}
                        style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7)' } : {}}
                      >
                        {msg.text}
                      </div>
                    </motion.div>
                  ))}

                  {isThinking && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                      <div className="px-4 py-2.5 rounded-xl bg-white/70 border border-[var(--border)]/50 flex items-center gap-2">
                        <div className="flex gap-1">
                          {[0, 0.2, 0.4].map((delay, i) => (
                            <motion.div
                              key={i}
                              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1, repeat: Infinity, delay }}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: '#A7BFFB' }}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-[var(--muted-foreground)]">Thinking…</span>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-5 py-3.5 border-t border-[var(--border)]/50">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isThinking && handleSend()}
                  placeholder="Ask a question..."
                  disabled={isThinking}
                  className="flex-1 px-3.5 py-2 rounded-xl border border-[var(--border)]/50 bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#A7BFFB]/40 focus:border-[#A7BFFB]/60 transition-all text-sm placeholder:text-[var(--muted-foreground)] disabled:opacity-50"
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim() || isThinking}
                  className="w-9 h-9 rounded-xl text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  style={{ background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7)' }}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getContextPrompt(context: string): string {
  if (context === 'results') return 'Ask Clarion about your findings, evidence, or what to fix first.';
  if (context === 'setup') return 'Ask Clarion about audit setup and configuration.';
  return 'Ask Clarion anything about model auditing.';
}
