'use client';

import { Check } from 'lucide-react';
import { BOARD_THEMES, type BoardThemeId, type PieceSetId, PIECE_SETS } from '@/lib/chess/themes';
import { useSettingsStore } from '@/store/useSettingsStore';
import { cn } from '@/lib/utils';
import { Piece } from '../board/Piece';

export function BoardSettings({ className }: { className?: string }) {
  const { boardTheme, pieceSet, set } = useSettingsStore();

  return (
    <div className={cn('space-y-5', className)}>
      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-arena-dim">Board theme</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(Object.values(BOARD_THEMES)).map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => set('boardTheme', theme.id as BoardThemeId)}
              className={cn(
                'group overflow-hidden rounded-lg border-2 transition-colors',
                boardTheme === theme.id ? 'border-accent' : 'border-transparent hover:border-arena-line',
              )}
              title={theme.name}
            >
              <span className="relative grid h-14 grid-cols-2 grid-rows-2">
                <span style={{ background: theme.light }} />
                <span style={{ background: theme.dark }} />
                <span style={{ background: theme.dark }} />
                <span style={{ background: theme.light }} />
                {boardTheme === theme.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-accent">
                    <Check className="h-5 w-5" />
                  </span>
                )}
              </span>
              <span className="block bg-arena-panel2 py-1 text-center text-[10px] font-bold text-arena-muted">
                {theme.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-arena-dim">Piece set</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.values(PIECE_SETS)).map((set_) => (
            <button
              key={set_.id}
              type="button"
              onClick={() => set('pieceSet', set_.id as PieceSetId)}
              className={cn(
                'rounded-lg border-2 bg-arena-panel2 p-2 text-left transition-colors',
                pieceSet === set_.id ? 'border-accent' : 'border-transparent hover:border-arena-line',
              )}
              title={set_.description}
            >
              <span className="flex items-center justify-center gap-0.5">
                <span className="h-7 w-7">
                  <Piece type="n" color="w" set={set_.id as PieceSetId} flat />
                </span>
                <span className="h-7 w-7">
                  <Piece type="q" color="b" set={set_.id as PieceSetId} flat />
                </span>
              </span>
              <span className="mt-1 block text-center text-[10px] font-bold text-arena-muted">{set_.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GameplaySettings({ className }: { className?: string }) {
  const store = useSettingsStore();
  return (
    <div className={cn('space-y-1', className)}>
      <Toggle
        label="Show legal moves"
        description="Dots on reachable squares and rings on captures"
        value={store.showLegalMoves}
        onChange={(v) => store.set('showLegalMoves', v)}
      />
      <Toggle
        label="Highlight last move"
        description="Keeps the previous move visible on the board"
        value={store.highlightLastMove}
        onChange={(v) => store.set('highlightLastMove', v)}
      />
      <Toggle
        label="Board coordinates"
        description="File letters and rank numbers"
        value={store.showCoordinates}
        onChange={(v) => store.set('showCoordinates', v)}
      />
      <Toggle
        label="Animate pieces"
        description="Smooth sliding animation on every move"
        value={store.animatePieces}
        onChange={(v) => store.set('animatePieces', v)}
      />
      <Toggle
        label="Always promote to queen"
        description="Skip the promotion picker"
        value={store.autoQueen}
        onChange={(v) => store.set('autoQueen', v)}
      />
      <Toggle
        label="Confirm resignation"
        description="Ask before resigning a game"
        value={store.confirmResign}
        onChange={(v) => store.set('confirmResign', v)}
      />
      <Toggle
        label="Show eval bar"
        description="Vertical engine evaluation beside the board"
        value={store.showEvalBar}
        onChange={(v) => store.set('showEvalBar', v)}
      />
      <Range
        label="Animation speed"
        min={60}
        max={400}
        step={10}
        value={store.animationMs}
        suffix="ms"
        onChange={(v) => store.set('animationMs', v)}
      />
      <Range
        label="Review engine depth"
        min={10}
        max={20}
        step={1}
        value={store.reviewDepth}
        suffix=" ply"
        onChange={(v) => store.set('reviewDepth', v)}
      />
      <Range
        label="Engine lines in practice"
        min={1}
        max={5}
        step={1}
        value={store.multiPv}
        suffix=" lines"
        onChange={(v) => store.set('multiPv', v)}
      />
    </div>
  );
}

export function SoundSettings({ className }: { className?: string }) {
  const store = useSettingsStore();
  return (
    <div className={cn('space-y-1', className)}>
      <Toggle
        label="Sound effects"
        description="Moves, captures, checks and game alerts"
        value={store.soundEnabled}
        onChange={(v) => store.set('soundEnabled', v)}
      />
      <Toggle
        label="Low time ticking"
        description="Tick when a clock drops under ten seconds"
        value={store.lowTimeWarning}
        onChange={(v) => store.set('lowTimeWarning', v)}
      />
      <Range
        label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={store.volume}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => store.set('volume', v)}
      />
      <Toggle
        label="Chat notifications"
        description="Sound when your opponent sends a message"
        value={store.chatEnabled}
        onChange={(v) => store.set('chatEnabled', v)}
      />
      <Toggle
        label="Prefer rematch"
        description="Automatically offer a rematch when a game ends"
        value={store.preferRematch}
        onChange={(v) => store.set('preferRematch', v)}
      />
    </div>
  );
}

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-arena-raised/50">
      <div className="min-w-0">
        <p className="text-sm font-bold text-arena-text">{label}</p>
        {description && <p className="text-[11px] text-arena-muted">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', value ? 'bg-accent' : 'bg-arena-line')}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            value ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Range({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  format?: (value: number) => string;
}) {
  return (
    <div className="rounded-lg px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-bold text-arena-text">{label}</p>
        <p className="font-mono text-xs font-bold tabular-nums text-arena-muted">
          {format ? format(value) : `${value}${suffix ?? ''}`}
        </p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-arena-line accent-[#81b64c]"
      />
    </div>
  );
}
