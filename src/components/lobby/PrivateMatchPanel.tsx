'use client';

import { Link2, LogIn, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Color, TimeControl } from '@/lib/types';
import { cn, formatTimeControl } from '@/lib/utils';
import { Button } from '../ui/Button';

export interface PrivateMatchPanelProps {
  timeControl: TimeControl;
  rated: boolean;
  onCreate: (options: { timeControl: TimeControl; rated: boolean; color: Color | 'random' }) => void;
  onJoin: (code: string) => void;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}

const COLOURS: Array<{ value: Color | 'random'; label: string }> = [
  { value: 'random', label: 'Random' },
  { value: 'w', label: 'White' },
  { value: 'b', label: 'Black' },
];

export function PrivateMatchPanel({
  timeControl,
  rated,
  onCreate,
  onJoin,
  disabled,
  error,
  className,
}: PrivateMatchPanelProps) {
  const [code, setCode] = useState('');
  const [color, setColor] = useState<Color | 'random'>('random');

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 text-arena-muted">
        <Link2 className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Private match</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {COLOURS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setColor(option.value)}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-bold transition-colors',
              color === option.value
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-arena-line/60 text-arena-muted hover:border-accent/50 hover:text-arena-text',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <Button
        variant="secondary"
        fullWidth
        disabled={disabled}
        onClick={() => onCreate({ timeControl, rated, color })}
      >
        <Plus className="h-4 w-4" />
        Create a game ({formatTimeControl(timeControl)})
      </Button>

      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={8}
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && code.trim().length >= 5) onJoin(code.trim());
          }}
          className="input font-mono tracking-[0.2em]"
        />
        <Button
          size="md"
          disabled={disabled || code.trim().length < 5}
          onClick={() => onJoin(code.trim())}
          className="shrink-0"
        >
          <LogIn className="h-4 w-4" />
          Join
        </Button>
      </div>

      {error && <p className="text-xs font-semibold text-danger">{error}</p>}
      <p className="text-[11px] leading-relaxed text-arena-dim">
        Private games are invitation only. Share the code or link — the board opens for both players the moment your
        opponent joins.
      </p>
    </div>
  );
}
