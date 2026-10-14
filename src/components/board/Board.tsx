'use client';

import { Chess } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color, PieceSymbol, Square } from '@/lib/types';
import type { BoardTheme } from '@/lib/chess/themes';
import type { PieceSetId } from '@/lib/chess/themes';
import { cn, coordToSquare, FILES, isLightSquare, kingSquare, RANKS } from '@/lib/utils';
import { Piece } from './Piece';
import { PromotionPicker } from './PromotionPicker';

export interface BoardArrow {
  from: Square;
  to: Square;
  color: string;
  /** Rendered thinner (engine suggestion). */
  thin?: boolean;
}

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

interface TrackedPiece {
  id: string;
  square: Square;
  type: PieceSymbol;
  color: Color;
}

interface RawPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

let pieceIdCounter = 0;

function parseBoard(chess: Chess): RawPiece[] {
  const out: RawPiece[] = [];
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell) out.push({ square: cell.square, type: cell.type as PieceSymbol, color: cell.color as Color });
    }
  }
  return out;
}

/**
 * Matches pieces across two positions so the moving piece keeps its React node
 * (and therefore slides instead of popping). Handles castling, captures and
 * promotions: a piece that lands on a square is matched to the missing piece of
 * the same kind/colour, and a new type on the same square keeps the old id so
 * promotion morphs in place.
 */
function trackPieces(prev: TrackedPiece[], next: RawPiece[]): TrackedPiece[] {
  const bySquare = new Map(prev.map((p) => [p.square, p]));
  const claimed = new Set<string>();
  const slots: Array<{ id: string | null; raw: RawPiece }> = next.map((raw) => {
    const previous = bySquare.get(raw.square);
    if (previous && previous.type === raw.type && previous.color === raw.color && !claimed.has(previous.id)) {
      claimed.add(previous.id);
      return { id: previous.id, raw };
    }
    return { id: null, raw };
  });

  for (const slot of slots) {
    if (slot.id) continue;
    const sameSquare = bySquare.get(slot.raw.square);
    if (sameSquare && sameSquare.color === slot.raw.color && !claimed.has(sameSquare.id)) {
      claimed.add(sameSquare.id);
      slot.id = sameSquare.id;
      continue;
    }
    const missing = prev.find(
      (p) => !claimed.has(p.id) && p.color === slot.raw.color && p.type === slot.raw.type,
    );
    if (missing) {
      claimed.add(missing.id);
      slot.id = missing.id;
      continue;
    }
    slot.id = `p${++pieceIdCounter}`;
  }

  return slots.map((slot) => ({ id: slot.id!, ...slot.raw }));
}

export interface BoardProps {
  fen: string;
  orientation: Color;
  theme: BoardTheme;
  pieceSet: PieceSetId;
  interactive?: boolean;
  /** Only this colour can be moved by the user (usually your colour). */
  movableColor?: Color | null;
  lastMove?: { from: Square; to: Square } | null;
  selectedSquare?: Square | null;
  onSelectSquare?: (square: Square | null) => void;
  onMove?: (move: BoardMove) => void;
  onIllegalMove?: () => void;
  /** Controlled arrows; when omitted the board manages its own right-click art. */
  arrows?: BoardArrow[];
  highlights?: Square[];
  onArrowsChange?: (arrows: BoardArrow[]) => void;
  onHighlightsChange?: (squares: Square[]) => void;
  allowDrawing?: boolean;
  /** Colour used for newly drawn arrows (defaults to the theme's green). */
  drawColor?: string;
  showCoordinates?: boolean;
  showLegalMoves?: boolean;
  animationMs?: number;
  autoQueen?: boolean;
  /** Extra classes for the board frame. */
  className?: string;
  /** Called when a right-click toggle happens (so the parent can react). */
  onSquareRightClick?: (square: Square) => void;
}

export function Board({
  fen,
  orientation,
  theme,
  pieceSet,
  interactive = true,
  movableColor = null,
  lastMove,
  selectedSquare,
  onSelectSquare,
  onMove,
  onIllegalMove,
  arrows,
  highlights,
  onArrowsChange,
  onHighlightsChange,
  allowDrawing = false,
  drawColor,
  showCoordinates = true,
  showLegalMoves = true,
  animationMs = 170,
  autoQueen = false,
  className,
  onSquareRightClick,
}: BoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const piecesRef = useRef<TrackedPiece[]>([]);
  const dragRef = useRef<{
    square: Square;
    startX: number;
    startY: number;
    active: boolean;
    pointerId: number;
  } | null>(null);
  const arrowDragRef = useRef<{ from: Square; pointerId: number } | null>(null);

  const [internalSelected, setInternalSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ square: Square; x: number; y: number } | null>(null);
  const [hoverSquare, setHoverSquare] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const [localArrows, setLocalArrows] = useState<BoardArrow[]>([]);
  const [localHighlights, setLocalHighlights] = useState<Square[]>([]);

  const selected = selectedSquare !== undefined ? selectedSquare : internalSelected;
  const controlledArrows = arrows !== undefined;
  const controlledHighlights = highlights !== undefined;
  const activeArrows = controlledArrows ? arrows! : localArrows;
  const activeHighlights = controlledHighlights ? highlights! : localHighlights;

  const chess = useMemo(() => {
    const game = new Chess();
    try {
      game.load(fen);
    } catch {
      /* keep the default position if the FEN is malformed */
    }
    return game;
  }, [fen]);

  const pieces = useMemo(() => {
    const tracked = trackPieces(piecesRef.current, parseBoard(chess));
    piecesRef.current = tracked;
    return tracked;
  }, [chess]);

  const board = useMemo(() => {
    const map = new Map<Square, Color>();
    for (const piece of pieces) map.set(piece.square, piece.color);
    return map;
  }, [pieces]);

  const turn = chess.turn() as Color;
  const checkSquare = useMemo(() => (chess.inCheck() ? kingSquare(fen, chess.turn() as Color) : null), [chess, fen]);

  const legalTargets = useMemo(() => {
    if (!selected) return new Map<Square, boolean>();
    const targets = new Map<Square, boolean>();
    for (const move of chess.moves({ square: selected as never, verbose: true })) {
      targets.set(move.to as Square, Boolean(move.captured) || move.flags.includes('e'));
    }
    return targets;
  }, [chess, selected]);

  const setSelected = useCallback(
    (square: Square | null) => {
      setInternalSelected(square);
      onSelectSquare?.(square);
    },
    [onSelectSquare],
  );

  // Clear stale selection when the position changes underneath us.
  useEffect(() => {
    if (selected && !board.has(selected)) setInternalSelected(null);
  }, [board, selected]);

  /* ------------------------------------------------------------------ */
  /*  Coordinate helpers                                                 */
  /* ------------------------------------------------------------------ */

  const squareFromPoint = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const relX = (clientX - rect.left) / rect.width;
      const relY = (clientY - rect.top) / rect.height;
      if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;
      let file = Math.floor(relX * 8);
      let row = Math.floor(relY * 8);
      if (orientation === 'b') {
        file = 7 - file;
        row = 7 - row;
      }
      return coordToSquare(file, 7 - row);
    },
    [orientation],
  );

  const squareToPercent = useCallback(
    (square: Square) => {
      const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
      const rank = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
      const x = orientation === 'w' ? file : 7 - file;
      const y = orientation === 'w' ? 7 - rank : rank;
      return { x, y };
    },
    [orientation],
  );

  /* ------------------------------------------------------------------ */
  /*  Move handling                                                      */
  /* ------------------------------------------------------------------ */

  const canMovePiece = useCallback(
    (square: Square) => {
      if (!interactive) return false;
      const color = board.get(square);
      if (!color) return false;
      if (movableColor && color !== movableColor) return false;
      return color === turn;
    },
    [board, interactive, movableColor, turn],
  );

  const attemptMove = useCallback(
    (from: Square, to: Square) => {
      if (from === to) return;
      const piece = chess.get(from as never);
      if (!piece) return;
      const targets = new Map<Square, boolean>();
      for (const move of chess.moves({ square: from as never, verbose: true })) {
        targets.set(move.to as Square, Boolean(move.captured));
      }
      if (!targets.has(to)) {
        setSelected(null);
        onIllegalMove?.();
        return;
      }
      const isPromotion =
        piece.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));
      if (isPromotion && !autoQueen) {
        setPromotion({ from, to, color: piece.color as Color });
        setSelected(null);
        return;
      }
      setSelected(null);
      onMove?.({ from, to, promotion: isPromotion ? 'q' : undefined });
    },
    [autoQueen, chess, onIllegalMove, onMove, setSelected],
  );

  const handleSquarePress = useCallback(
    (square: Square) => {
      if (!interactive) return;
      if (selected && legalTargets.has(square)) {
        attemptMove(selected, square);
        return;
      }
      if (canMovePiece(square)) {
        setSelected(selected === square ? null : square);
        return;
      }
      setSelected(null);
    },
    [attemptMove, canMovePiece, interactive, legalTargets, selected, setSelected],
  );

  /* ------------------------------------------------------------------ */
  /*  Pointer events (drag + draw)                                       */
  /* ------------------------------------------------------------------ */

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive && !allowDrawing) return;
      const square = squareFromPoint(event.clientX, event.clientY);
      if (!square) return;

      if (event.button === 2) {
        if (!allowDrawing) return;
        arrowDragRef.current = { from: square, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
        setHoverSquare(square);
        return;
      }
      if (event.button !== 0) return;

      if (canMovePiece(square)) {
        dragRef.current = { square, startX: event.clientX, startY: event.clientY, active: false, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ square, x: event.clientX, y: event.clientY });
        if (selected !== square) setSelected(square);
        return;
      }
      handleSquarePress(square);
    },
    [allowDrawing, canMovePiece, handleSquarePress, interactive, selected, setSelected, squareFromPoint],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const square = squareFromPoint(event.clientX, event.clientY);
      if (arrowDragRef.current && arrowDragRef.current.pointerId === event.pointerId) {
        setHoverSquare(square);
        return;
      }
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (!dragState.active && Math.hypot(dx, dy) < 5) return;
      dragState.active = true;
      setDrag({ square: dragState.square, x: event.clientX, y: event.clientY });
      setHoverSquare(square);
    },
    [squareFromPoint],
  );

  const commitArrow = useCallback(
    (from: Square, to: Square) => {
      if (from === to) {
        const existing = activeHighlights.includes(from);
        const nextSquares = existing ? activeHighlights.filter((s) => s !== from) : [...activeHighlights, from];
        if (controlledHighlights) onHighlightsChange?.(nextSquares);
        else {
          setLocalHighlights(nextSquares);
          onHighlightsChange?.(nextSquares);
        }
        onSquareRightClick?.(from);
        return;
      }
      const colour = activeArrows.find((a) => a.from === from && a.to === to)?.color;
      const nextArrows = colour
        ? activeArrows.filter((a) => !(a.from === from && a.to === to))
        : [...activeArrows, { from, to, color: drawColor ?? theme.arrows.green }];
      if (controlledArrows) onArrowsChange?.(nextArrows);
      else {
        setLocalArrows(nextArrows);
        onArrowsChange?.(nextArrows);
      }
    },
    [activeArrows, activeHighlights, controlledArrows, controlledHighlights, drawColor, onArrowsChange, onHighlightsChange, onSquareRightClick, theme.arrows.green],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const square = squareFromPoint(event.clientX, event.clientY);

      if (arrowDragRef.current && arrowDragRef.current.pointerId === event.pointerId) {
        const from = arrowDragRef.current.from;
        arrowDragRef.current = null;
        setHoverSquare(null);
        if (square) commitArrow(from, square);
        return;
      }

      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      dragRef.current = null;
      const wasActive = dragState.active;
      setDrag(null);
      setHoverSquare(null);
      if (!wasActive) return; // plain click → handled by pointerdown selection
      if (!square || square === dragState.square) return;
      attemptMove(dragState.square, square);
    },
    [attemptMove, commitArrow, squareFromPoint],
  );

  const onPointerCancel = useCallback(() => {
    dragRef.current = null;
    arrowDragRef.current = null;
    setDrag(null);
    setHoverSquare(null);
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                          */
  /* ------------------------------------------------------------------ */

  const squares = useMemo(() => {
    const list: Array<{ square: Square; light: boolean; x: number; y: number }> = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const file = orientation === 'w' ? col : 7 - col;
        const rank = orientation === 'w' ? 7 - row : row;
        const square = coordToSquare(file, rank)!;
        list.push({ square, light: isLightSquare(square), x: col, y: row });
      }
    }
    return list;
  }, [orientation]);

  const promoteSquare = promotion ? squareToPercent(promotion.to) : null;

  return (
    <div
      ref={boardRef}
      className={cn(
        'relative aspect-square w-full touch-none select-none overflow-hidden rounded-[6px]',
        className,
      )}
      style={{ background: theme.frame }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
      data-testid="board"
    >
      {/* Squares + highlights */}
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
        {squares.map(({ square, light, x, y }) => {
          const isSelected = selected === square;
          const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
          const isCheck = checkSquare === square;
          const isHighlight = activeHighlights.includes(square);
          const isHover = hoverSquare === square;
          const base = light ? theme.light : theme.dark;
          const overlay = isCheck
            ? theme.check
            : isSelected
              ? light
                ? theme.selectedLight
                : theme.selectedDark
              : isLastMove
                ? light
                  ? theme.lastMoveLight
                  : theme.lastMoveDark
                : isHighlight
                  ? light
                    ? theme.hintLight
                    : theme.hintDark
                  : isHover && drag
                    ? light
                      ? theme.hintLight
                      : theme.hintDark
                    : undefined;
          return (
            <div
              key={square}
              className="relative"
              style={{ background: base }}
              aria-label={square}
            >
              {overlay && (
                <div className="pointer-events-none absolute inset-0" style={{ background: overlay }} />
              )}
              {showCoordinates && x === 0 && (
                <span
                  className="pointer-events-none absolute left-[3px] top-[1px] text-[10px] font-bold leading-none sm:text-[11px]"
                  style={{ color: light ? theme.coordLight : theme.coordDark }}
                >
                  {square[1]}
                </span>
              )}
              {showCoordinates && y === 7 && (
                <span
                  className="pointer-events-none absolute bottom-[1px] right-[3px] text-[10px] font-bold leading-none sm:text-[11px]"
                  style={{ color: light ? theme.coordLight : theme.coordDark }}
                >
                  {square[0]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legal move indicators */}
      {interactive && showLegalMoves && (
        <div className="pointer-events-none absolute inset-0">
          {Array.from(legalTargets.entries()).map(([target, isCapture]) => {
            const { x, y } = squareToPercent(target);
            return (
              <div
                key={target}
                className="absolute flex h-[12.5%] w-[12.5%] items-center justify-center"
                style={{ transform: `translate3d(${x * 100}%, ${y * 100}%, 0)` }}
              >
                {isCapture ? (
                  <span
                    className="absolute inset-[6%] rounded-full border-[6px]"
                    style={{ borderColor: theme.ring }}
                  />
                ) : (
                  <span className="h-[30%] w-[30%] rounded-full" style={{ background: theme.dot }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pieces */}
      <div className="absolute inset-0">
        {pieces.map((piece) => {
          const isDragging = Boolean(drag && dragRef.current?.active && drag.square === piece.square);
          const { x, y } = squareToPercent(piece.square);
          return (
            <div
              key={piece.id}
              className={cn(
                'absolute left-0 top-0 h-[12.5%] w-[12.5%]',
                !isDragging && 'cursor-grab active:cursor-grabbing',
                isDragging && 'z-30 cursor-grabbing',
              )}
              style={{
                transform: isDragging
                  ? `translate3d(calc(${x * 100}% + ${drag!.x - (boardRef.current?.getBoundingClientRect().left ?? 0) - (boardRef.current?.getBoundingClientRect().width ?? 0) / 16}px), calc(${y * 100}% + ${drag!.y - (boardRef.current?.getBoundingClientRect().top ?? 0) - (boardRef.current?.getBoundingClientRect().height ?? 0) / 16}px), 0)`
                  : `translate3d(${x * 100}%, ${y * 100}%, 0)`,
                transition:
                  isDragging || !animationMs
                    ? 'none'
                    : `transform ${animationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`,
                zIndex: isDragging ? 30 : undefined,
              }}
            >
              <Piece type={piece.type} color={piece.color} set={pieceSet} />
            </div>
          );
        })}
      </div>

      {/* Arrows + highlights */}
      <ArrowLayer
        arrows={activeArrows}
        orientation={orientation}
        frame={theme.frame}
        preview={
          arrowDragRef.current && hoverSquare
            ? { from: arrowDragRef.current.from, to: hoverSquare, color: theme.arrows.orange }
            : null
        }
      />

      {/* Promotion picker */}
      {promotion && promoteSquare && (
        <PromotionPicker
          color={promotion.color}
          pieceSet={pieceSet}
          file={promoteSquare.x}
          onSelect={(piece) => {
            const { from, to } = promotion;
            setPromotion(null);
            onMove?.({ from, to, promotion: piece });
          }}
          onCancel={() => setPromotion(null)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Arrow layer                                                                */
/* -------------------------------------------------------------------------- */

function ArrowLayer({
  arrows,
  orientation,
  frame,
  preview,
}: {
  arrows: BoardArrow[];
  orientation: Color;
  frame: string;
  preview: BoardArrow | null;
}) {
  const all = preview ? [...arrows, preview] : arrows;
  if (all.length === 0) return null;
  return (
    <svg
      viewBox="0 0 8 8"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.35))' }}
      aria-hidden
    >
      <defs>
        {all.map((arrow, index) => (
          <marker
            key={`${arrow.from}${arrow.to}${index}`}
            id={`arrowhead-${index}`}
            markerWidth={arrow.thin ? 0.3 : 0.4}
            markerHeight={arrow.thin ? 0.3 : 0.4}
            refX={arrow.thin ? 0.24 : 0.3}
            refY={arrow.thin ? 0.15 : 0.2}
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d={arrow.thin ? 'M0,0 L0.3,0.15 L0,0.3 z' : 'M0,0 L0.4,0.2 L0,0.4 z'} fill={arrow.color} />
          </marker>
        ))}
      </defs>
      {all.map((arrow, index) => {
        const [fx, fy] = squarePoint(arrow.from, orientation);
        const [tx, ty] = squarePoint(arrow.to, orientation);
        const dx = tx - fx;
        const dy = ty - fy;
        const length = Math.hypot(dx, dy) || 1;
        const shrinkX = (dx / length) * 0.36;
        const shrinkY = (dy / length) * 0.36;
        const color = arrow.color === 'frame' ? frame : arrow.color;
        return (
          <line
            key={`${arrow.from}-${arrow.to}-${index}`}
            x1={fx + shrinkX * 0.5}
            y1={fy + shrinkY * 0.5}
            x2={tx - shrinkX * 0.5}
            y2={ty - shrinkY * 0.5}
            stroke={color}
            strokeWidth={arrow.thin ? 0.09 : 0.14}
            strokeLinecap="round"
            opacity={arrow.thin ? 0.78 : 0.9}
            markerEnd={`url(#arrowhead-${index})`}
          />
        );
      })}
    </svg>
  );
}

function squarePoint(square: Square, orientation: Color): [number, number] {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = RANKS.indexOf(square[1] as (typeof RANKS)[number]);
  const x = orientation === 'w' ? file : 7 - file;
  const y = orientation === 'w' ? 7 - rank : rank;
  return [x + 0.5, y + 0.5];
}

export default Board;
