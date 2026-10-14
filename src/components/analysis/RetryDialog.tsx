'use client';

import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Eye, RotateCcw, Target, XCircle } from 'lucide-react';
import type { Color, Square } from '@/lib/types';
import { getBoardTheme } from '@/lib/chess/themes';
import { squaresFromUci } from '@/lib/utils';
import { sounds } from '@/lib/sounds';
import { useSettingsStore } from '@/store/useSettingsStore';
import { Board, type BoardArrow } from '../board/Board';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface RetryDialogProps {
  open: boolean;
  /** Position before the mistake. */
  fen: string | null;
  /** Side to move (the player who made the mistake). */
  sideToMove: Color;
  bestUci: string | null;
  bestSan: string | null;
  notation: string;
  classificationLabel: string;
  onClose: () => void;
  onSolved?: () => void;
}

/**
 * "Retry your mistakes" — the player replays the position and tries to find the
 * engine's move. Purely local: nothing is reported to the server.
 */
export function RetryDialog({
  open,
  fen,
  sideToMove,
  bestUci,
  bestSan,
  notation,
  classificationLabel,
  onClose,
  onSolved,
}: RetryDialogProps) {
  const settings = useSettingsStore();
  const [attempts, setAttempts] = useState(0);
  const [solved, setSolved] = useState(false);
  const [wrong, setWrong] = useState<{ from: Square; to: Square } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);

  const theme = getBoardTheme(settings.boardTheme);
  const best = useMemo(() => (bestUci && bestUci.length >= 4 ? squaresFromUci(bestUci) : null), [bestUci]);

  const reset = useCallback(() => {
    setAttempts(0);
    setSolved(false);
    setWrong(null);
    setRevealed(false);
    setSelected(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const arrows: BoardArrow[] = revealed && best ? [{ from: best.from, to: best.to, color: theme.arrows.green }] : [];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Retry the position"
      description={`You played ${notation} (${classificationLabel}). Find a stronger idea.`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          {!revealed && best && (
            <Button variant="secondary" onClick={() => setRevealed(true)}>
              <Eye className="h-4 w-4" />
              Show me
            </Button>
          )}
          <Button onClick={handleClose}>{solved ? 'Done' : 'Close'}</Button>
        </>
      }
    >
      {fen && (
        <div className="mx-auto w-full max-w-[420px]">
          <Board
            fen={fen}
            orientation={sideToMove}
            theme={theme}
            pieceSet={settings.pieceSet}
            interactive={!solved}
            movableColor={sideToMove}
            selectedSquare={selected}
            onSelectSquare={setSelected}
            onMove={({ from, to }) => {
              setAttempts((n) => n + 1);
              if (best && from === best.from && to === best.to) {
                setSolved(true);
                setWrong(null);
                sounds.play('gameWin');
                onSolved?.();
                return;
              }
              setWrong({ from, to });
              sounds.play('illegal');
            }}
            onIllegalMove={() => sounds.play('illegal')}
            arrows={arrows}
            allowDrawing
            showCoordinates={settings.showCoordinates}
            showLegalMoves={settings.showLegalMoves}
            animationMs={settings.animatePieces ? settings.animationMs : 0}
            autoQueen
            className="board-frame"
          />
        </div>
      )}

      <div className="mt-3 space-y-2">
        {solved ? (
          <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm font-bold text-accent">
            <CheckCircle2 className="h-4 w-4" />
            Found it! {bestSan} was the move.
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2.5">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-arena-muted" />
            <p className="text-xs leading-relaxed text-arena-muted">
              {wrong
                ? `Not the best move (attempt ${attempts}). Try again — the position resets every time you move.`
                : 'Play the move you think is best. Then compare it with the engine.'}
            </p>
          </div>
        )}

        {attempts > 0 && !solved && revealed && bestSan && (
          <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-xs font-bold text-warn">
            <XCircle className="h-4 w-4" />
            The engine plays {bestSan} — the arrow shows the idea.
          </div>
        )}
      </div>
    </Modal>
  );
}
