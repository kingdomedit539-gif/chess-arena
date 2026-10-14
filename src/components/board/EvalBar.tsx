'use client';

import { motion } from 'framer-motion';
import type { Color } from '@/lib/types';
import { formatEval } from '@/lib/engine/analysis';
import { cn } from '@/lib/utils';

export interface EvalBarProps {
  /** Centipawns from White's point of view. */
  cpWhite: number;
  mateWhite: number | null;
  orientation: Color;
  thinking?: boolean;
  className?: string;
  /** Height in CSS rem/px units is controlled by the parent via `className`. */
  showLabel?: boolean;
}

function barFraction(cpWhite: number, mateWhite: number | null): number {
  if (mateWhite !== null) return mateWhite > 0 ? 1 : 0;
  const clamped = Math.max(-1000, Math.min(1000, cpWhite));
  // Same logistic as the review maths so the bar and the numbers agree.
  const win = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
  return win / 100;
}

/**
 * Vertical evaluation bar (chess.com style). White's share grows from the
 * bottom when the board is drawn from White's perspective and from the top when
 * it is flipped.
 */
export function EvalBar({ cpWhite, mateWhite, orientation, thinking, className, showLabel = true }: EvalBarProps) {
  const whiteShare = barFraction(cpWhite, mateWhite);
  const label = formatEval(cpWhite, mateWhite);
  const whiteAtBottom = orientation === 'w';
  const anchor = whiteAtBottom ? 'bottom' : 'top';
  const labelAtTop = whiteAtBottom ? whiteShare <= 0.5 : whiteShare > 0.5;

  return (
    <div
      className={cn(
        'relative w-6 shrink-0 overflow-hidden rounded-sm border border-black/40 bg-[#1e1c1a] sm:w-7',
        className,
      )}
      role="meter"
      aria-label="Engine evaluation"
      aria-valuenow={Math.round(whiteShare * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="absolute inset-x-0 bg-gradient-to-b from-white to-[#dcdcd6]"
        style={{ [anchor]: 0 } as React.CSSProperties}
        animate={{ height: `${Math.max(1, Math.min(99, whiteShare * 100))}%` }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-accent/70" />
      {thinking && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute inset-y-0 w-full animate-sweep bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
      )}
      {showLabel && (
        <span
          className={cn(
            'pointer-events-none absolute inset-x-0 text-center text-[9px] font-bold tabular-nums sm:text-[10px]',
            labelAtTop ? 'top-1 text-arena-text' : 'bottom-1 text-black',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}
