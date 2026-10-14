'use client';

import {
  ArrowLeftRight,
  BarChart3,
  Handshake,
  RotateCcw,
  Settings2,
  Sparkles,
  Swords,
  Flag,
} from 'lucide-react';
import { useState } from 'react';
import type { Color, GameStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Modal';

export interface GameActionBarProps {
  status: GameStatus;
  myColor: Color;
  /** True when the draw button should be enabled. */
  canOfferDraw: boolean;
  /** Set when *you* have a pending draw offer out. */
  drawOfferedByMe: boolean;
  /** Set when the opponent offered a draw (shows the pulsing state). */
  drawOfferedByOpponent: boolean;
  analysisEnabled: boolean;
  onToggleAnalysis: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onFlip: () => void;
  onRematch?: () => void;
  onReview?: () => void;
  onSettings?: () => void;
  showSettings?: boolean;
  className?: string;
}

export function GameActionBar({
  status,
  canOfferDraw,
  drawOfferedByMe,
  drawOfferedByOpponent,
  analysisEnabled,
  onToggleAnalysis,
  onResign,
  onOfferDraw,
  onFlip,
  onRematch,
  onReview,
  onSettings,
  showSettings = true,
  className,
}: GameActionBarProps) {
  const [confirmResign, setConfirmResign] = useState(false);
  const live = status === 'active' || status === 'waiting';

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {live && (
          <>
            <Button variant="secondary" size="sm" onClick={onOfferDraw} disabled={!canOfferDraw || drawOfferedByMe}>
              <Handshake className="h-4 w-4" />
              {drawOfferedByMe ? 'Draw offered…' : 'Draw'}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmResign(true)}>
              <Flag className="h-4 w-4" />
              Resign
            </Button>
            <Button
              variant={drawOfferedByOpponent ? 'success' : 'secondary'}
              size="sm"
              className={cn(drawOfferedByOpponent && 'animate-pulse')}
              onClick={onOfferDraw}
              disabled={!drawOfferedByOpponent}
              hidden={!drawOfferedByOpponent}
            >
              <Sparkles className="h-4 w-4" />
              Accept draw
            </Button>
          </>
        )}

        {!live && (
          <>
            {onRematch && (
              <Button size="sm" onClick={onRematch}>
                <RotateCcw className="h-4 w-4" />
                Rematch
              </Button>
            )}
            {onReview && (
              <Button variant="secondary" size="sm" onClick={onReview}>
                <BarChart3 className="h-4 w-4" />
                Match review
              </Button>
            )}
          </>
        )}

        <Button
          variant={analysisEnabled ? 'primary' : 'secondary'}
          size="sm"
          onClick={onToggleAnalysis}
          title="Toggle live engine evaluation"
        >
          <Swords className="h-4 w-4" />
          {analysisEnabled ? 'Analysis on' : 'Analysis off'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onFlip} title="Flip board">
          <ArrowLeftRight className="h-4 w-4" />
          Flip
        </Button>
        {showSettings && onSettings && (
          <Button variant="ghost" size="icon" onClick={onSettings} title="Board settings" aria-label="Board settings" className="ml-auto">
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmResign}
        onCancel={() => setConfirmResign(false)}
        onConfirm={() => {
          setConfirmResign(false);
          onResign();
        }}
        title="Resign this game?"
        description="The game will be scored as a loss and your rating will be updated."
        confirmLabel="Resign"
        destructive
      />
    </>
  );
}
