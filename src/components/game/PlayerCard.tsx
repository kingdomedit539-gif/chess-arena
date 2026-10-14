'use client';

import { Wifi, WifiOff } from 'lucide-react';
import type { Color, PieceSymbol, PlayerPublic } from '@/lib/types';
import type { PieceSetId } from '@/lib/chess/themes';
import { avatarGradient, cn, initials } from '@/lib/utils';
import { ratingBand } from '@/lib/elo';
import { CapturedPieces } from './CapturedPieces';
import { Clock } from './Clock';

export interface PlayerCardProps {
  player: PlayerPublic | null;
  color: Color;
  clockMs: number;
  clockActive: boolean;
  isYou: boolean;
  online?: boolean;
  captured: PieceSymbol[];
  advantage: number;
  pieceSet: PieceSetId;
  /** Shown while the opponent is disconnected. */
  graceSecondsLeft?: number;
  ratingDelta?: number;
  className?: string;
  compact?: boolean;
}

export function PlayerCard({
  player,
  color,
  clockMs,
  clockActive,
  isYou,
  online = true,
  captured,
  advantage,
  pieceSet,
  graceSecondsLeft,
  ratingDelta,
  className,
  compact,
}: PlayerCardProps) {
  const [from, to] = avatarGradient(player?.avatarSeed ?? player?.id ?? 'x');
  const name = player?.username ?? (color === 'w' ? 'White' : 'Black');

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-arena-line/50 bg-arena-panel px-3 py-2',
        compact && 'gap-2 px-2 py-1.5',
        className,
      )}
    >
      <div
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-black text-white/95 shadow-inner"
        style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
        aria-hidden
      >
        {initials(name)}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-arena-panel',
            online ? 'bg-accent' : 'bg-danger',
          )}
          title={online ? 'Online' : 'Disconnected'}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-arena-text">{name}</span>
          {isYou && <span className="rounded bg-arena-raised px-1.5 py-0.5 text-[10px] font-bold text-arena-muted">YOU</span>}
          {player && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-arena-muted" title={ratingBand(player.rating).label}>
              {player.rating}
              {typeof ratingDelta === 'number' && ratingDelta !== 0 && (
                <span className={cn('ml-1 font-bold', ratingDelta > 0 ? 'text-accent' : 'text-danger')}>
                  {ratingDelta > 0 ? '+' : ''}
                  {ratingDelta}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <CapturedPieces captured={captured} advantage={advantage} pieceSet={pieceSet} />
          {!online && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-danger">
              <WifiOff className="h-3 w-3" />
              {graceSecondsLeft !== undefined ? `left · ${graceSecondsLeft}s` : 'disconnected'}
            </span>
          )}
          {online && !isYou && (
            <span className="flex items-center gap-1 text-[11px] text-arena-dim">
              <Wifi className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>

      <Clock ms={clockMs} active={clockActive} critical warning compact={compact} />
    </div>
  );
}

export function PlayerCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-arena-line/50 bg-arena-panel px-3 py-2', className)}>
      <div className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-arena-raised" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-24 animate-pulse rounded bg-arena-raised" />
        <div className="h-2.5 w-16 animate-pulse rounded bg-arena-raised" />
      </div>
      <div className="h-9 w-[74px] animate-pulse rounded-md bg-arena-raised" />
    </div>
  );
}
