'use client';

import { motion } from 'framer-motion';
import { BrainCircuit, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AnalysisProgressProps {
  /** 0-100. */
  value: number;
  label?: string;
  detail?: string;
  /** Shown when the engine could not be loaded. */
  degraded?: boolean;
  className?: string;
}

/**
 * Determinate analysis progress bar. `value` is always 0-100 so it can be fed
 * straight from `onProgress` (`done / total * 100`).
 */
export function AnalysisProgress({ value, label, detail, degraded, className }: AnalysisProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const done = pct >= 100;

  return (
    <div className={cn('rounded-lg border border-arena-line/50 bg-arena-panel2 p-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-arena-muted">
          {done ? (
            <BrainCircuit className="h-3.5 w-3.5 text-accent" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
          )}
          {label ?? 'Engine analysis'}
        </span>
        <span className="font-mono text-sm font-black tabular-nums text-arena-text">{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-arena-bg">
        <motion.div
          className={cn(
            'h-full rounded-full',
            degraded ? 'bg-warn' : done ? 'bg-accent' : 'bg-gradient-to-r from-accent-deep to-accent',
          )}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {detail && <p className="mt-1.5 text-[11px] text-arena-dim">{detail}</p>}
    </div>
  );
}
