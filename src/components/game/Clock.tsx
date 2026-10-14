'use client';

import { cn, formatClock } from '@/lib/utils';

export interface ClockProps {
  ms: number;
  active: boolean;
  /** Under 10s: red styling. */
  critical?: boolean;
  /** Under 20s but above 10s: amber styling. */
  warning?: boolean;
  className?: string;
  compact?: boolean;
}

export function Clock({ ms, active, critical, warning, className, compact }: ClockProps) {
  const danger = critical && ms < 10_000;
  const caution = warning && ms < 20_000;
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md font-mono font-bold tabular-nums transition-colors duration-200',
        compact ? 'h-7 min-w-[52px] px-2 text-sm' : 'h-9 min-w-[74px] px-3 text-lg',
        active
          ? danger
            ? 'bg-danger text-white'
            : 'bg-[#f2f2f2] text-[#1d1c1a]'
          : 'bg-arena-panel2 text-arena-muted',
        !active && caution && 'text-warn/80',
        active && !danger && caution && 'bg-warn text-black',
        active && danger && 'animate-pulse',
        'shadow-inner',
        className,
      )}
      aria-live={active ? 'off' : 'polite'}
      aria-label={`${formatClock(ms)} remaining`}
    >
      {formatClock(ms)}
    </div>
  );
}
