'use client';

import { motion } from 'framer-motion';
import { Clock, Flame, Rabbit, Turtle, Zap } from 'lucide-react';
import type { TimeControl, TimeControlPreset } from '@/lib/types';
import { cn, estimatedDuration } from '@/lib/utils';

export interface TimePreset {
  id: TimeControlPreset;
  initial: number;
  increment: number;
  label: string;
  category: 'Bullet' | 'Blitz' | 'Rapid';
  icon: typeof Clock;
  accent: string;
}

export const TIME_PRESETS: TimePreset[] = [
  { id: '1+0', initial: 60, increment: 0, label: '1 min', category: 'Bullet', icon: Rabbit, accent: '#e58f2a' },
  { id: '3+0', initial: 180, increment: 0, label: '3 min', category: 'Blitz', icon: Zap, accent: '#f0d45c' },
  { id: '5+0', initial: 300, increment: 0, label: '5 min', category: 'Blitz', icon: Zap, accent: '#81b64c' },
  { id: '10+0', initial: 600, increment: 0, label: '10 min', category: 'Rapid', icon: Turtle, accent: '#4a90d9' },
  { id: '3+2', initial: 180, increment: 2, label: '3 | 2', category: 'Blitz', icon: Flame, accent: '#f0d45c' },
  { id: '5+5', initial: 300, increment: 5, label: '5 | 5', category: 'Blitz', icon: Flame, accent: '#81b64c' },
];

export interface QuickPlayGridProps {
  onPlay: (timeControl: TimeControl) => void;
  disabled?: boolean;
  playing?: boolean;
}

export function QuickPlayGrid({ onPlay, disabled, playing }: QuickPlayGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {TIME_PRESETS.map((preset, index) => {
        const Icon = preset.icon;
        return (
          <motion.button
            key={preset.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.97 }}
            disabled={disabled}
            onClick={() => onPlay({ initial: preset.initial, increment: preset.increment })}
            className={cn(
              'group relative overflow-hidden rounded-xl border border-white/5 bg-arena-panel p-4 text-left shadow-panel transition-colors',
              'hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50',
              playing && 'animate-pulse',
            )}
          >
            <span
              className="absolute inset-x-0 top-0 h-1 opacity-70"
              style={{ background: `linear-gradient(90deg, ${preset.accent}, transparent)` }}
            />
            <Icon className="mb-2 h-5 w-5" style={{ color: preset.accent }} />
            <p className="text-lg font-black leading-tight text-arena-text">{preset.label}</p>
            <p className="text-xs font-semibold text-arena-muted">
              {preset.category} · {estimatedDuration({ initial: preset.initial, increment: preset.increment })}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-arena-dim group-hover:text-accent">
              <Clock className="h-3 w-3" />
              {preset.increment > 0 ? `+${preset.increment}s per move` : 'No increment'}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
