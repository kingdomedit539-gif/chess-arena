'use client';

import type { Classification } from '@/lib/types';
import { CLASSIFICATIONS } from '@/lib/engine/analysis';
import { cn } from '@/lib/utils';

export interface ClassificationBadgeProps {
  classification: Classification;
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const SIZES = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-6 w-6 text-xs',
};

export function ClassificationBadge({ classification, size = 'sm', showLabel, className }: ClassificationBadgeProps) {
  const meta = CLASSIFICATIONS[classification];
  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      title={`${meta.label} — ${meta.description}`}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full font-black leading-none',
          SIZES[size],
        )}
        style={{ background: meta.bg, color: meta.color, boxShadow: `inset 0 0 0 1px ${meta.color}55` }}
      >
        {meta.symbol}
      </span>
      {showLabel && <span className="text-xs font-semibold" style={{ color: meta.color }}>{meta.label}</span>}
    </span>
  );
}
