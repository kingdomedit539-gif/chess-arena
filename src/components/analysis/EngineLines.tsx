'use client';

import { Cpu, Play } from 'lucide-react';
import type { EngineLine } from '@/lib/types';
import { formatEval } from '@/lib/engine/analysis';
import { cn } from '@/lib/utils';

export interface EngineLinesProps {
  lines: EngineLine[];
  /** Highlight the strongest line. */
  activeIndex?: number;
  /** Click a line to play its first move (practice board only). */
  onSelect?: (uci: string) => void;
  available?: boolean;
  error?: string | null;
  depth?: number;
  className?: string;
}

export function EngineLines({ lines, activeIndex = 0, onSelect, available = true, error, depth, className }: EngineLinesProps) {
  if (!available) {
    return (
      <div className={cn('rounded-lg border border-warn/40 bg-warn/10 px-3 py-3', className)}>
        <p className="flex items-center gap-2 text-xs font-bold text-warn">
          <Cpu className="h-3.5 w-3.5" />
          Engine unavailable
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-arena-muted">
          Stockfish could not be loaded{error ? ` (${error})` : ''}. Run <code className="text-arena-text">npm run fetch:engine</code> to
          bundle it locally, then reload.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {lines.length === 0 && (
        <p className="rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-3 text-center text-xs text-arena-dim">
          Waiting for the engine…
        </p>
      )}
      {lines.map((line, index) => {
        const positive = (line.mate ?? line.cp) >= 0;
        return (
          <button
            key={line.multipv}
            type="button"
            onClick={() => onSelect?.(line.pv[0])}
            disabled={!onSelect}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors',
              index === activeIndex ? 'border-accent/50 bg-accent/10' : 'border-arena-line/50 bg-arena-panel2',
              onSelect && 'hover:border-accent/60',
            )}
          >
            <span
              className={cn(
                'w-12 shrink-0 rounded py-0.5 text-center font-mono text-xs font-black tabular-nums',
                positive ? 'bg-white/90 text-black' : 'bg-[#1e1c1a] text-white',
              )}
            >
              {formatEval(line.cp, line.mate)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold text-arena-text">
              {line.san.length > 0 ? line.san.join(' ') : line.pv.slice(0, 4).join(' ')}
            </span>
            {onSelect && <Play className="h-3 w-3 shrink-0 text-arena-dim" />}
          </button>
        );
      })}
      {typeof depth === 'number' && depth > 0 && (
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-arena-dim">depth {depth}</p>
      )}
    </div>
  );
}
