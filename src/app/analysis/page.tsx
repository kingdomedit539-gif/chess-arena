'use client';

import { Chess } from 'chess.js';
import {
  ArrowLeftRight,
  ClipboardPaste,
  Copy,
  Eraser,
  Play,
  Redo2,
  RotateCcw,
  Swords,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { MoveRecord, PieceSymbol, Square } from '@/lib/types';
import { getBoardTheme } from '@/lib/chess/themes';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useLiveEval } from '@/lib/hooks/useLiveEval';
import { cn, squaresFromUci } from '@/lib/utils';
import { sounds } from '@/lib/sounds';
import { Board, type BoardArrow } from '@/components/board/Board';
import { EvalBar } from '@/components/board/EvalBar';
import { MoveList } from '@/components/game/MoveList';
import { EngineLines } from '@/components/analysis/EngineLines';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { BoardSettings } from '@/components/settings/SettingsPanels';
import { cpToMate } from '@/lib/engine/analysis';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

interface PracticeState {
  fens: string[];
  sans: string[];
  /** Undo stack (kept in one object so updates stay pure). */
  redo: Array<{ fens: string[]; sans: string[] }>;
}

const INITIAL: PracticeState = { fens: [START_FEN], sans: [], redo: [] };

export default function PracticePage() {
  const settings = useSettingsStore();
  const [state, setState] = useState<PracticeState>(INITIAL);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [selected, setSelected] = useState<Square | null>(null);
  const [engineOn, setEngineOn] = useState(true);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [highlights, setHighlights] = useState<Square[]>([]);
  const [drawColor, setDrawColor] = useState<string>('#81b64c');
  const [fenDraft, setFenDraft] = useState('');
  const [pgnDraft, setPgnDraft] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const fen = state.fens[state.fens.length - 1] ?? START_FEN;

  const chess = useMemo(() => {
    const instance = new Chess();
    try {
      instance.load(fen);
    } catch {
      /* fall back to the start position */
    }
    return instance;
  }, [fen]);

  const theme = getBoardTheme(settings.boardTheme);
  const turn = chess.turn() as 'w' | 'b';
  const isGameOver = chess.isGameOver();

  const evaluation = useLiveEval(engineOn ? fen : null, engineOn, {
    depth: 22,
    movetime: 900,
    multipv: settings.multiPv,
  });

  const engineArrows: BoardArrow[] = useMemo(() => {
    if (!engineOn || isGameOver) return [];
    const palette = [theme.arrows.blue, theme.arrows.green, theme.arrows.orange];
    return evaluation.lines
      .slice(0, settings.multiPv)
      .map((line, index) => {
        const uci = line.pv[0];
        if (!uci || uci.length < 4) return null;
        const { from, to } = squaresFromUci(uci);
        return { from, to, color: palette[index % palette.length], thin: index > 0 } as BoardArrow;
      })
      .filter((arrow): arrow is BoardArrow => arrow !== null);
  }, [engineOn, evaluation.lines, isGameOver, settings.multiPv, theme.arrows]);

  /* ------------------------------------------------------------------ */
  /*  Board mutations                                                    */
  /* ------------------------------------------------------------------ */

  const pushState = useCallback((next: { fens: string[]; sans: string[] }) => {
    setState((previous) => ({
      fens: next.fens,
      sans: next.sans,
      redo: [...previous.redo.slice(-30), { fens: previous.fens, sans: previous.sans }],
    }));
  }, []);

  const playMove = useCallback(
    ({ from, to, promotion }: { from: Square; to: Square; promotion?: PieceSymbol }) => {
      const instance = new Chess();
      try {
        instance.load(fen);
      } catch {
        return;
      }
      let move = null;
      try {
        move = instance.move({ from, to, promotion: promotion ?? undefined });
      } catch {
        move = null;
      }
      if (!move) {
        sounds.play('illegal');
        setSelected(null);
        return;
      }
      sounds.play(move.captured ? 'capture' : move.isKingsideCastle() || move.isQueensideCastle() ? 'castle' : 'move');
      const nextFens = [...state.fens, instance.fen()];
      const nextSans = [...state.sans, move.san];
      pushState({ fens: nextFens, sans: nextSans });
      setSelected(null);
      setArrows([]);
      setHighlights([]);
    },
    [fen, pushState, state.fens, state.sans],
  );

  const playUci = useCallback(
    (uci: string) => {
      if (!uci || uci.length < 4) return;
      playMove({
        from: uci.slice(0, 2) as Square,
        to: uci.slice(2, 4) as Square,
        promotion: (uci[4] as PieceSymbol) || undefined,
      });
    },
    [playMove],
  );

  const undo = useCallback(() => {
    setState((s) => {
      if (s.fens.length <= 1) return s;
      return {
        fens: s.fens.slice(0, -1),
        sans: s.sans.slice(0, -1),
        redo: [...s.redo, { fens: s.fens, sans: s.sans }],
      };
    });
    sounds.play('click');
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      const last = s.redo[s.redo.length - 1];
      if (!last) return s;
      return { fens: last.fens, sans: last.sans, redo: s.redo.slice(0, -1) };
    });
    sounds.play('click');
  }, []);

  const reset = useCallback(() => {
    pushState({ fens: [START_FEN], sans: [] });
    setArrows([]);
    setHighlights([]);
    setSelected(null);
    sounds.play('click');
  }, [pushState]);

  const loadFen = useCallback(
    (candidate: string) => {
      const instance = new Chess();
      try {
        instance.load(candidate.trim());
      } catch {
        sounds.play('illegal');
        return false;
      }
      pushState({ fens: [instance.fen()], sans: [] });
      setArrows([]);
      setHighlights([]);
      sounds.play('gameStart');
      return true;
    },
    [pushState],
  );

  const loadPgn = useCallback(
    (pgn: string) => {
      const instance = new Chess();
      try {
        instance.loadPgn(pgn);
      } catch {
        sounds.play('illegal');
        return false;
      }
      const replay = new Chess();
      const fens: string[] = [replay.fen()];
      const sans: string[] = [];
      for (const move of instance.history({ verbose: true })) {
        try {
          const applied = replay.move({ from: move.from, to: move.to, promotion: move.promotion });
          if (!applied) break;
          sans.push(applied.san);
          fens.push(replay.fen());
        } catch {
          break;
        }
      }
      if (sans.length === 0) return false;
      pushState({ fens, sans });
      setArrows([]);
      setHighlights([]);
      sounds.play('gameStart');
      return true;
    },
    [pushState],
  );

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      sounds.play('click');
      toast({ level: 'success', title: `${label} copied` });
    } catch {
      toast({ level: 'error', title: 'Could not copy', description: 'Your browser blocked clipboard access.' });
    }
  }, []);

  // `MoveList` only reads `san` / `classification` / `timeSpent`, so a minimal
  // shape is enough here — cast keeps the shared component untouched.
  const moveListMoves = state.sans.map((san, index) => ({
    ply: index + 1,
    san,
    color: (index % 2 === 0 ? 'w' : 'b') as 'w' | 'b',
  })) as unknown as MoveRecord[];

  const arrowColours = [
    { value: theme.arrows.green, label: 'Green' },
    { value: theme.arrows.orange, label: 'Orange' },
    { value: theme.arrows.red, label: 'Red' },
    { value: theme.arrows.blue, label: 'Blue' },
    { value: theme.arrows.yellow, label: 'Yellow' },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4 lg:px-6 lg:py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-arena-text">Practice board</h1>
          <p className="mt-1 text-sm text-arena-muted">
            Free analysis with Stockfish: load any position, draw arrows, and step through the engine&apos;s top lines. No
            opponents, no bots — just you and the board.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={engineOn ? 'primary' : 'secondary'} size="sm" onClick={() => setEngineOn((v) => !v)}>
            <Swords className="h-3.5 w-3.5" />
            {engineOn ? 'Engine on' : 'Engine off'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowSetup((v) => !v)}>
            <ClipboardPaste className="h-3.5 w-3.5" />
            {showSetup ? 'Hide setup' : 'FEN / PGN'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        <div className="mx-auto w-full max-w-[720px] space-y-3">
          <div className="flex gap-2">
            {settings.showEvalBar && engineOn && (
              <EvalBar
                cpWhite={evaluation.cpWhite}
                mateWhite={cpToMate(evaluation.cpWhite) ?? evaluation.mateWhite}
                orientation={orientation}
                thinking={evaluation.thinking}
                className="h-auto self-stretch"
              />
            )}
            <div className="min-w-0 flex-1">
              <Board
                fen={fen}
                orientation={orientation}
                theme={theme}
                pieceSet={settings.pieceSet}
                interactive
                movableColor={turn}
                selectedSquare={selected}
                onSelectSquare={setSelected}
                onMove={playMove}
                onIllegalMove={() => sounds.play('illegal')}
                arrows={[...engineArrows, ...arrows]}
                highlights={highlights}
                onArrowsChange={setArrows}
                onHighlightsChange={setHighlights}
                allowDrawing
                drawColor={drawColor}
                showCoordinates={settings.showCoordinates}
                showLegalMoves={settings.showLegalMoves}
                animationMs={settings.animatePieces ? settings.animationMs : 0}
                autoQueen={settings.autoQueen}
                className="board-frame"
              />
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-arena-line/50 bg-arena-panel px-2 py-2">
            <ToolButton label="Undo" onClick={undo} disabled={state.fens.length <= 1}>
              <Undo2 className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Redo" onClick={redo} disabled={state.redo.length === 0}>
              <Redo2 className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Reset to start position" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Flip board" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}>
              <ArrowLeftRight className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Clear arrows and highlights" onClick={() => {
              setArrows([]);
              setHighlights([]);
            }}>
              <Eraser className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Play the engine's best move" onClick={() => playUci(evaluation.lines[0]?.pv[0] ?? '')} disabled={!evaluation.lines[0]}>
              <Play className="h-4 w-4" />
            </ToolButton>
            <ToolButton label="Empty board" onClick={() => loadFen(EMPTY_FEN)}>
              <Trash2 className="h-4 w-4" />
            </ToolButton>

            <div className="ml-auto flex items-center gap-1.5 pl-2">
              <span className="hidden text-[10px] font-bold uppercase tracking-wider text-arena-dim sm:inline">Arrow</span>
              {arrowColours.map((colour) => (
                <button
                  key={colour.label}
                  type="button"
                  aria-label={`${colour.label} arrows`}
                  title={`${colour.label} arrows`}
                  onClick={() => setDrawColor(colour.value)}
                  className={cn(
                    'h-5 w-5 rounded-full border-2 transition-transform',
                    drawColor === colour.value ? 'scale-110 border-white' : 'border-transparent hover:scale-105',
                  )}
                  style={{ background: colour.value }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-arena-muted">
            <span>
              {isGameOver
                ? chess.isCheckmate()
                  ? `Checkmate — ${turn === 'w' ? 'Black' : 'White'} wins`
                  : 'Game over (draw)'
                : `${turn === 'w' ? 'White' : 'Black'} to move`}
            </span>
            <span className="text-arena-dim">Right-drag to draw an arrow · right-click a square to highlight</span>
          </div>

          {showSetup && (
            <div className="panel space-y-3 p-3">
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-arena-dim">
                  Position (FEN)
                </label>
                <div className="flex gap-2">
                  <input
                    value={fenDraft}
                    onChange={(event) => setFenDraft(event.target.value)}
                    placeholder={fen}
                    className="input flex-1 font-mono text-xs"
                  />
                  <Button size="sm" variant="secondary" onClick={() => loadFen(fenDraft || fen)}>
                    Load
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void copy(fen, 'FEN')} aria-label="Copy FEN">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-arena-dim">
                  Game (PGN)
                </label>
                <textarea
                  value={pgnDraft}
                  onChange={(event) => setPgnDraft(event.target.value)}
                  rows={3}
                  placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 …"
                  className="w-full rounded-md border border-arena-line/70 bg-arena-panel2 p-2 font-mono text-xs text-arena-text placeholder:text-arena-dim focus:border-accent focus:outline-none"
                />
                <div className="mt-1.5 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => loadPgn(pgnDraft)} disabled={!pgnDraft.trim()}>
                    Load PGN
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void copy(state.sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san)).join(' '), 'PGN')}
                    disabled={state.sans.length === 0}
                  >
                    <Copy className="h-4 w-4" />
                    Copy PGN
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="panel p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-arena-muted">
              <Swords className="h-3.5 w-3.5 text-accent" />
              Engine lines
            </p>
            {engineOn ? (
              <EngineLines
                lines={evaluation.lines}
                available={evaluation.available}
                error={evaluation.error}
                depth={evaluation.depth}
                onSelect={(uci) => playUci(uci)}
              />
            ) : (
              <p className="rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-3 text-center text-xs text-arena-dim">
                Engine is off. Turn it on to see candidate moves as arrows.
              </p>
            )}
            <p className="mt-2 text-[11px] text-arena-dim">
              Click any line to play its first move on the board.
            </p>
          </div>

          <div className="panel overflow-hidden">
            <div className="panel-header">
              <span className="panel-title">Moves</span>
              <span className="text-[11px] font-bold text-arena-dim">{state.sans.length} played</span>
            </div>
            <div className="max-h-[280px] overflow-y-auto">
              <MoveList moves={moveListMoves} currentPly={state.sans.length} emptyHint="Make a move to start." />
            </div>
          </div>

          <div className="panel p-3">
            <BoardSettings />
          </div>
        </aside>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-2 text-arena-muted transition-colors hover:bg-arena-raised hover:text-arena-text disabled:opacity-35"
    >
      {children}
    </button>
  );
}
