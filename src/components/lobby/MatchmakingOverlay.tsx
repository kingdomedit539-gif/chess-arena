'use client';

import { Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { QueueStatus } from '@/lib/types';
import { cn, describeTimeControl, formatClock, formatTimeControl } from '@/lib/utils';
import { Button } from '../ui/Button';

export interface MatchmakingOverlayProps {
  open: boolean;
  status: QueueStatus | null;
  startedAt: number | null;
  onCancel: () => void;
  /** Private rooms show a code instead of a rating window. */
  roomCode?: string | null;
  joinUrl?: string | null;
}

export function MatchmakingOverlay({ open, status, startedAt, onCancel, roomCode, joinUrl }: MatchmakingOverlayProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!open) return;
    const start = startedAt ?? Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => window.clearInterval(id);
  }, [open, startedAt]);

  const tc = status?.timeControl;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Matchmaking"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-arena-panel shadow-2xl"
          >
            <div className="relative flex flex-col items-center px-6 py-8">
              <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-accent/25 animate-pulse-ring" />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-accent text-black">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </span>
              </div>

              <h2 className="text-xl font-black text-arena-text">
                {roomCode ? 'Waiting for your opponent' : 'Finding an opponent'}
              </h2>
              <p className="mt-1 text-center text-sm text-arena-muted">
                {roomCode
                  ? 'Share the room link or code — the game starts automatically when they join.'
                  : 'We match players of similar rating. Hang tight!'}
              </p>

              {tc && (
                <div className="mt-5 flex items-center gap-3 rounded-lg border border-arena-line/50 bg-arena-panel2 px-4 py-2.5">
                  <span className="text-sm font-bold text-arena-text">{formatTimeControl(tc)}</span>
                  <span className="text-arena-dim">·</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-arena-muted">
                    {describeTimeControl(tc)}
                  </span>
                  <span className="text-arena-dim">·</span>
                  <span className="font-mono text-sm tabular-nums text-arena-muted">{formatClock(elapsed * 1000)}</span>
                </div>
              )}

              {roomCode && (
                <div className="mt-4 w-full">
                  <p className="mb-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-arena-dim">Room code</p>
                  <p className="select-all rounded-lg border border-accent/40 bg-accent/10 py-2.5 text-center font-mono text-2xl font-black tracking-[0.3em] text-accent">
                    {roomCode}
                  </p>
                  {joinUrl && (
                    <div className="mt-2 flex gap-2">
                      <input readOnly value={joinUrl} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void navigator.clipboard?.writeText(joinUrl)}
                        className="shrink-0"
                      >
                        Copy
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {!roomCode && status && (
                <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center">
                  <Stat label="In queue" value={String(status.searching)} />
                  <Stat label="Rating window" value={`±${status.range}`} />
                </div>
              )}

              <Button variant="secondary" className={cn('mt-6 w-full')} onClick={onCancel}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-arena-dim">{label}</p>
      <p className="font-mono text-sm font-bold text-arena-text">{value}</p>
    </div>
  );
}
