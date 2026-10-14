'use client';

import { useEffect, useRef } from 'react';
import type { Classification, Color, MoveAnalysis, MoveRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ClassificationBadge } from '../analysis/ClassificationBadge';

export interface MoveListEntry {
  san: string;
  ply: number;
  /** 1-based full-move number. */
  moveNumber: number;
  color: Color;
  classification?: Classification;
  timeSpent?: number;
  comment?: string;
}

export interface MoveListProps {
  moves: Array<MoveRecord | MoveAnalysis>;
  /** Ply of the currently displayed position (0 = start). */
  currentPly: number;
  onJump?: (ply: number) => void;
  showBadges?: boolean;
  autoScroll?: boolean;
  className?: string;
  /** Fills the container height with an internal scroller. */
  scrollable?: boolean;
  emptyHint?: string;
}

function toEntry(move: MoveRecord | MoveAnalysis, index: number): MoveListEntry {
  const ply = index + 1;
  const color: Color = ply % 2 === 1 ? 'w' : 'b';
  const isAnalysis = 'classification' in move;
  return {
    san: move.san,
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    classification: isAnalysis ? (move as MoveAnalysis).classification : undefined,
    timeSpent: 'timeSpent' in move ? (move as MoveRecord).timeSpent : undefined,
    comment: isAnalysis ? (move as MoveAnalysis).comment : undefined,
  };
}

export function moveListEntries(moves: Array<MoveRecord | MoveAnalysis>): MoveListEntry[] {
  return moves.map(toEntry);
}

/**
 * Numbered move table with jump-to-move navigation. Works for live games (plain
 * SAN) and for review (SAN + classification badge + time spent).
 */
export function MoveList({
  moves,
  currentPly,
  onJump,
  showBadges,
  autoScroll = true,
  className,
  scrollable,
  emptyHint = 'No moves yet',
}: MoveListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const entries = moveListEntries(moves);

  useEffect(() => {
    if (!autoScroll || !scrollerRef.current) return;
    const target =
      scrollerRef.current.querySelector<HTMLElement>('[data-active="true"]') ??
      scrollerRef.current.querySelector<HTMLElement>(`[data-ply="${Math.max(1, currentPly)}"]`);
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [autoScroll, currentPly, entries.length]);

  const rows: Array<{ number: number; white?: MoveListEntry; black?: MoveListEntry }> = [];
  for (const entry of entries) {
    const last = rows[rows.length - 1];
    if (entry.color === 'w' || !last || last.number !== entry.moveNumber) {
      rows.push({ number: entry.moveNumber, [entry.color === 'w' ? 'white' : 'black']: entry } as (typeof rows)[number]);
    } else {
      last.black = entry;
    }
  }

  return (
    <div
      ref={scrollerRef}
      className={cn('overflow-y-auto pr-1', scrollable && 'h-full', className)}
      data-testid="move-list"
    >
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-arena-dim">{emptyHint}</p>
      ) : (
        <div className="divide-y divide-arena-line/30">
          {rows.map((row) => (
            <div key={row.number} className="flex items-stretch text-sm">
              <span className="w-9 shrink-0 py-1.5 pl-2 font-mono text-xs text-arena-dim">{row.number}.</span>
              <MoveCell entry={row.white} currentPly={currentPly} onJump={onJump} showBadges={showBadges} />
              <MoveCell entry={row.black} currentPly={currentPly} onJump={onJump} showBadges={showBadges} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MoveCell({
  entry,
  currentPly,
  onJump,
  showBadges,
}: {
  entry?: MoveListEntry;
  currentPly: number;
  onJump?: (ply: number) => void;
  showBadges?: boolean;
}) {
  if (!entry) return <span className="flex-1" />;
  const isActive = entry.ply === currentPly;
  const seconds = entry.timeSpent !== undefined ? Math.max(0, entry.timeSpent / 1000) : undefined;
  return (
    <button
      type="button"
      data-ply={entry.ply}
      data-active={isActive}
      onClick={() => onJump?.(entry.ply === currentPly ? entry.ply - 1 : entry.ply)}
      className={cn(
        'group flex flex-1 items-center gap-1.5 rounded px-2 py-1.5 text-left font-semibold transition-colors',
        isActive ? 'bg-accent/20 text-arena-text' : 'text-arena-text/90 hover:bg-arena-raised',
      )}
      title={entry.comment ?? undefined}
    >
      <span className="tabular-nums">{entry.san}</span>
      {showBadges && entry.classification && <ClassificationBadge classification={entry.classification} size="xs" />}
      {seconds !== undefined && seconds >= 8 && (
        <span className="ml-auto hidden font-mono text-[10px] text-arena-dim group-hover:inline sm:inline">
          {seconds.toFixed(0)}s
        </span>
      )}
    </button>
  );
}
