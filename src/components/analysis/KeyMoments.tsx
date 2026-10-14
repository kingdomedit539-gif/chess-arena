'use client';

import { Target, Trophy } from 'lucide-react';
import type { Color, MoveAnalysis } from '@/lib/types';
import { CLASSIFICATIONS, formatEval } from '@/lib/engine/analysis';
import { cn } from '@/lib/utils';
import { ClassificationBadge } from './ClassificationBadge';

export interface KeyMomentsProps {
  moves: MoveAnalysis[];
  /** Ply indexes (0-based into `moves`) flagged as key moments. */
  keyMoments: number[];
  onJump: (ply: number) => void;
  onRetry: (index: number) => void;
  /** Only offer retry for the local player's colours. */
  retryColor?: Color | null;
  className?: string;
}

export function KeyMoments({ moves, keyMoments, onJump, onRetry, retryColor, className }: KeyMomentsProps) {
  const moments = keyMoments
    .map((index) => ({ index, move: moves[index] }))
    .filter((entry): entry is { index: number; move: MoveAnalysis } => Boolean(entry.move))
    .sort((a, b) => CLASSIFICATIONS[b.move.classification].severity - CLASSIFICATIONS[a.move.classification].severity)
    .slice(0, 12);

  return (
    <div className={cn('space-y-2', className)}>
      {moments.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-4 text-xs font-semibold text-accent">
          <Trophy className="h-4 w-4" />
          No key mistakes — a clean game.
        </div>
      ) : (
        moments.map(({ index, move }) => {
          const meta = CLASSIFICATIONS[move.classification];
          const moveNumber = Math.ceil((index + 1) / 2);
          const notation = `${moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`;
          const canRetry = !retryColor || retryColor === move.color;
          return (
            <div
              key={`${move.ply}-${move.san}`}
              className="rounded-lg border border-arena-line/50 bg-arena-panel2 p-2.5"
              style={{ borderLeft: `3px solid ${meta.color}` }}
            >
              <div className="flex items-start gap-2">
                <ClassificationBadge classification={move.classification} size="sm" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onJump(index)}
                    className="truncate text-left text-sm font-bold text-arena-text hover:text-accent"
                  >
                    {notation}
                  </button>
                  <p className="mt-0.5 text-[11px] leading-snug text-arena-muted">{move.comment}</p>
                  {move.bestMoveSan && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-accent">
                      <Target className="h-3 w-3" />
                      Best was {move.bestMoveSan} ({formatEval(move.bestEval, null)})
                    </p>
                  )}
                </div>
                {canRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(index)}
                    className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-accent transition-colors hover:bg-accent/20"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
