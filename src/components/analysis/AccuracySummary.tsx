'use client';

import { Gauge, Percent, Sigma } from 'lucide-react';
import type { AccuracySummary as AccuracyData, Classification, Color, PlayerPublic } from '@/lib/types';
import { CLASSIFICATIONS, ORDERED_CLASSIFICATIONS } from '@/lib/engine/analysis';
import { avatarGradient, cn, initials } from '@/lib/utils';
import { ClassificationBadge } from './ClassificationBadge';

export interface AccuracySummaryProps {
  accuracy: AccuracyData;
  counts: Record<Color, Record<Classification, number>>;
  white: PlayerPublic | null;
  black: PlayerPublic | null;
  engineUsed: boolean;
  className?: string;
}

export function AccuracyCards({
  accuracy,
  counts,
  white,
  black,
  engineUsed,
  className,
}: AccuracySummaryProps) {
  const rows = ORDERED_CLASSIFICATIONS.filter(
    (classification) => counts.w[classification] > 0 || counts.b[classification] > 0,
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div className="grid grid-cols-2 gap-3">
        <AccuracyPill player={white} label="White" accuracy={accuracy.white} acpl={accuracy.whiteAcpl} tone="#f5f5f0" />
        <AccuracyPill player={black} label="Black" accuracy={accuracy.black} acpl={accuracy.blackAcpl} tone="#3a3733" />
      </div>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-arena-line/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-arena-panel2 text-[10px] uppercase tracking-wider text-arena-dim">
                <th className="px-3 py-2 text-left font-bold">Classification</th>
                <th className="w-14 px-3 py-2 text-center font-bold">White</th>
                <th className="w-14 px-3 py-2 text-center font-bold">Black</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-arena-line/30">
              {rows.map((classification) => (
                <tr key={classification} className="bg-arena-panel/40">
                  <td className="px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <ClassificationBadge classification={classification} size="xs" />
                      <span className="text-xs font-semibold text-arena-text">
                        {CLASSIFICATIONS[classification].label}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono text-xs font-bold tabular-nums text-arena-text">
                    {counts.w[classification]}
                  </td>
                  <td className="px-3 py-1.5 text-center font-mono text-xs font-bold tabular-nums text-arena-text">
                    {counts.b[classification]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-4 text-center text-xs text-arena-dim">
          {engineUsed
            ? 'Not enough moves to classify.'
            : 'Classification needs the engine — showing tactical hints only.'}
        </p>
      )}
    </div>
  );
}

function AccuracyPill({
  player,
  label,
  accuracy,
  acpl,
  tone,
}: {
  player: PlayerPublic | null;
  label: string;
  accuracy: number;
  acpl: number;
  tone: string;
}) {
  const name = player?.username ?? label;
  const [from, to] = avatarGradient(player?.avatarSeed ?? label);
  const grade = accuracy >= 90 ? 'Excellent' : accuracy >= 80 ? 'Good' : accuracy >= 65 ? 'Fair' : 'Needs work';

  return (
    <div className="rounded-lg border border-arena-line/50 bg-arena-panel2 p-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded text-[10px] font-black text-white/95"
          style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-arena-text">{name}</p>
          <p className="text-[10px] font-semibold text-arena-dim">{label}</p>
        </div>
      </div>
      <p className="mt-2 flex items-baseline gap-1 font-mono text-2xl font-black tabular-nums text-arena-text">
        {accuracy.toFixed(1)}
        <Percent className="h-4 w-4 text-arena-dim" />
      </p>
      <p className="text-[11px] font-semibold text-arena-muted">{grade} accuracy</p>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-arena-dim">
        <Sigma className="h-3 w-3" /> {acpl} avg cp loss
      </div>
      <span className="mt-1.5 block h-1 w-full rounded-full" style={{ background: tone }} />
    </div>
  );
}

export interface RatingChangeProps {
  delta: number;
  before: number;
  after: number;
  className?: string;
}

export function RatingChange({ delta, before, after, className }: RatingChangeProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2', className)}>
      <Gauge className={cn('h-4 w-4', delta >= 0 ? 'text-accent' : 'text-danger')} />
      <span className="font-mono text-sm font-bold tabular-nums text-arena-text">
        {before} → {after}
      </span>
      <span className={cn('font-mono text-sm font-black tabular-nums', delta >= 0 ? 'text-accent' : 'text-danger')}>
        {delta >= 0 ? '+' : ''}
        {delta}
      </span>
    </div>
  );
}
