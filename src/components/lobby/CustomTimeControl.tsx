'use client';

import { Sliders } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TimeControl } from '@/lib/types';
import { cn, describeTimeControl, estimatedDuration, formatTimeControl } from '@/lib/utils';
import { Button } from '../ui/Button';

export interface CustomTimeControlProps {
  value: TimeControl;
  onChange: (tc: TimeControl) => void;
  onPlay: (tc: TimeControl) => void;
  rated: boolean;
  onRatedChange: (rated: boolean) => void;
  disabled?: boolean;
  className?: string;
}

const INITIAL_MIN = 1;
const INITIAL_MAX = 180;
const INCREMENT_MAX = 60;

export function CustomTimeControl({
  value,
  onChange,
  onPlay,
  rated,
  onRatedChange,
  disabled,
  className,
}: CustomTimeControlProps) {
  const [minutes, setMinutes] = useState(String(Math.round(value.initial / 60)));
  const [increment, setIncrement] = useState(String(value.increment));

  useEffect(() => {
    setMinutes(String(Math.round(value.initial / 60)));
    setIncrement(String(value.increment));
  }, [value.initial, value.increment]);

  const commit = () => {
    const mins = Math.min(INITIAL_MAX, Math.max(INITIAL_MIN, Number(minutes) || INITIAL_MIN));
    const inc = Math.min(INCREMENT_MAX, Math.max(0, Number(increment) || 0));
    onChange({ initial: mins * 60, increment: inc });
    setMinutes(String(mins));
    setIncrement(String(inc));
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-arena-muted">
        <Sliders className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Custom time control</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-arena-dim">Minutes</span>
          <input
            type="number"
            min={INITIAL_MIN}
            max={INITIAL_MAX}
            value={minutes}
            disabled={disabled}
            onChange={(event) => setMinutes(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === 'Enter' && commit()}
            className="input tabular-nums"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-arena-dim">Increment (s)</span>
          <input
            type="number"
            min={0}
            max={INCREMENT_MAX}
            value={increment}
            disabled={disabled}
            onChange={(event) => setIncrement(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => event.key === 'Enter' && commit()}
            className="input tabular-nums"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[
          { initial: 180, increment: 2 },
          { initial: 300, increment: 5 },
          { initial: 600, increment: 5 },
          { initial: 900, increment: 10 },
          { initial: 1800, increment: 0 },
        ].map((preset) => (
          <button
            key={`${preset.initial}+${preset.increment}`}
            type="button"
            onClick={() => onChange(preset)}
            className={cn(
              'rounded-md border px-2 py-1 text-xs font-bold transition-colors',
              value.initial === preset.initial && value.increment === preset.increment
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-arena-line/60 text-arena-muted hover:border-accent/50 hover:text-arena-text',
            )}
          >
            {formatTimeControl(preset)}
          </button>
        ))}
      </div>

      <RatedToggle rated={rated} onChange={onRatedChange} />

      <div className="flex items-center justify-between gap-3 rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2">
        <div>
          <p className="text-sm font-bold text-arena-text">
            {formatTimeControl(value)} · {describeTimeControl(value)}
          </p>
          <p className="text-[11px] text-arena-muted">About {estimatedDuration(value)} per player</p>
        </div>
        <Button size="sm" onClick={() => onPlay(value)} disabled={disabled}>
          Play
        </Button>
      </div>
    </div>
  );
}

export function RatedToggle({
  rated,
  onChange,
  className,
}: {
  rated: boolean;
  onChange: (rated: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg bg-arena-panel2 px-3 py-2', className)}>
      <div>
        <p className="text-sm font-bold text-arena-text">{rated ? 'Rated' : 'Casual'}</p>
        <p className="text-[11px] text-arena-muted">
          {rated ? 'Win/loss affects your rating' : 'No rating change — play freely'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={rated}
        aria-label="Rated game"
        onClick={() => onChange(!rated)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          rated ? 'bg-accent' : 'bg-arena-line',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            rated ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
