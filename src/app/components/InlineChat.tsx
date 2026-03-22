import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Sparkles } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import type { ChatContext, SharedChatState } from '../hooks/useChat';
import type { AuditReport, AuditRequest } from '../../types';

function renderMarkdown(text: string) {
  return text.split('\n').map((line, i, arr) => {
    const parts = line.split(/\*\*(.+?)\*\*/g);
    return (
      <span key={i}>
        {parts.map((part, j) => (j % 2 === 1 ? <strong key={j}>{part}</strong> : part))}
        {i < arr.length - 1 && <br />}
      </span>
    );
  });
}

interface InlineChatProps {
  context: ChatContext;
  auditContext?: { request: AuditRequest; report: AuditReport };
  shared?: SharedChatState;
}

export function InlineChat({ context, auditContext, shared }: InlineChatProps) {
  const { message, setMessage, isThinking, conversation, prompts, handleSend, handlePromptClick } =
    useChat({ context, auditContext, shared });

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversation.length === 0 && !isThinking) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, isThinking]);

  return (
    <div
      className="rounded-2xl overflow-hidden border border-[var(--border)]/60"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 4px 24px rgba(167,191,251,0.14), 0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border)]/50 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7, #BFDBFE, #A7BFFB)',
            backgroundSize: '300% 300%',
            animation: 'gradientShift 6s ease infinite',
          }}
        >
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-sm font-medium text-[var(--foreground)]">Ask Olarion</h3>
      </div>

      {/* Unified body — prompts left-aligned to match findings / report sections */}
      <div className="px-6 pt-5 pb-3 min-h-[80px] max-h-[320px] overflow-y-auto space-y-3 bg-white/40">
        <AnimatePresence>
          {conversation.length === 0 && (
            <motion.div
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <p className="text-xs text-[var(--muted-foreground)] mb-3">Suggested questions</p>
              <div className="flex flex-col items-stretch gap-2 w-full">
                {prompts.map((prompt, idx) => (
                  <motion.button
                    key={idx}
                    type="button"
                    onClick={() => handlePromptClick(prompt)}
                    whileHover={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      y: -1,
                      boxShadow: '0 4px 16px rgba(167,191,251,0.18)',
                      transition: { duration: 0.15, ease: 'easeOut' },
                    }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/70 border border-[var(--border)]/50 text-sm text-[var(--foreground)] transition-colors text-left leading-snug"
                  >
                    {prompt}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {conversation.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white'
                  : 'bg-white/70 text-[var(--foreground)] border border-[var(--border)]/50'
              }`}
              style={msg.role === 'user' ? { background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7)' } : {}}
            >
              {msg.role === 'assistant' ? renderMarkdown(msg.text) : msg.text}
            </div>
          </motion.div>
        ))}

        {isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
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
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[var(--border)]/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isThinking && handleSend()}
            placeholder="Ask about findings, evidence, or what to fix first…"
            disabled={isThinking}
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)]/50 bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#A7BFFB]/40 focus:border-[#A7BFFB]/60 transition-all text-sm placeholder:text-[var(--muted-foreground)] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!message.trim() || isThinking}
            className="w-10 h-10 rounded-xl text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #A7BFFB, #7BAAF7)' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
