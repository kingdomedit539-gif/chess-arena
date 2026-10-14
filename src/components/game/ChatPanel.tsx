'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/types';
import { cn, initials } from '@/lib/utils';
import { IconButton } from '../ui/Button';

export interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  myId?: string;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function ChatPanel({ messages, onSend, myId, disabled, className, placeholder = 'Say something…' }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text.slice(0, 400));
    setDraft('');
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-arena-dim">Chat is quiet. Say hi to your opponent.</p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((message) =>
            message.system ? (
              <motion.p
                key={message.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-[11px] font-semibold uppercase tracking-wide text-arena-dim"
              >
                {message.text}
              </motion.p>
            ) : (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('flex items-start gap-2', message.from === myId && 'flex-row-reverse')}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white/90',
                    message.color === 'w' ? 'bg-[#f0f0ea] text-black' : 'bg-[#2c2a28]',
                  )}
                >
                  {initials(message.username)}
                </span>
                <div className={cn('max-w-[78%] rounded-lg px-2.5 py-1.5', message.from === myId ? 'bg-accent/20' : 'bg-arena-raised')}>
                  <p className="text-[11px] font-bold text-arena-muted">{message.username}</p>
                  <p className="break-words text-sm text-arena-text">{message.text}</p>
                </div>
              </motion.div>
            ),
          )}
        </AnimatePresence>
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-arena-line/50 p-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={400}
          className="h-9 min-w-0 flex-1 rounded-md border border-arena-line/70 bg-arena-panel2 px-3 text-sm text-arena-text placeholder:text-arena-dim focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <IconButton label="Send message" type="submit" variant="primary" disabled={disabled || !draft.trim()}>
          <Send className="h-4 w-4" />
        </IconButton>
      </form>
    </div>
  );
}
