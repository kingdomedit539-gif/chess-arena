'use client';

import { Chess, type Move } from 'chess.js';
import type {
  AccuracySummary,
  Classification,
  Color,
  EngineLine,
  MoveAnalysis,
  ReviewReport,
} from '@/lib/types';
import { MATE_CP, mateToCp, type EngineEvaluation, type StockfishEngine } from './StockfishEngine';

/* -------------------------------------------------------------------------- */
/*  Classification metadata (drives the badges in the review UI)               */
/* -------------------------------------------------------------------------- */

export interface ClassificationMeta {
  id: Classification;
  label: string;
  symbol: string;
  /** Badge colours. */
  color: string;
  bg: string;
  description: string;
  /** Counts toward "you made a mistake" style summaries. */
  severity: number;
}

export const CLASSIFICATIONS: Record<Classification, ClassificationMeta> = {
  brilliant: {
    id: 'brilliant',
    label: 'Brilliant',
    symbol: '!!',
    color: '#26c2a3',
    bg: 'rgba(38,194,163,0.16)',
    description: 'A sound sacrifice or only winning idea.',
    severity: 0,
  },
  great: {
    id: 'great',
    label: 'Great',
    symbol: '!',
    color: '#4a90d9',
    bg: 'rgba(74,144,217,0.16)',
    description: 'The only move that keeps the advantage.',
    severity: 0,
  },
  best: {
    id: 'best',
    label: 'Best',
    symbol: '★',
    color: '#81b64c',
    bg: 'rgba(129,182,76,0.16)',
    description: 'Matched the engine’s top choice.',
    severity: 0,
  },
  excellent: {
    id: 'excellent',
    label: 'Excellent',
    symbol: '✓',
    color: '#95c95f',
    bg: 'rgba(149,201,95,0.14)',
    description: 'Nearly as strong as the best move.',
    severity: 0,
  },
  good: {
    id: 'good',
    label: 'Good',
    symbol: '·',
    color: '#a8a49e',
    bg: 'rgba(168,164,158,0.14)',
    description: 'A reasonable move that keeps the position.',
    severity: 0,
  },
  inaccuracy: {
    id: 'inaccuracy',
    label: 'Inaccuracy',
    symbol: '?!',
    color: '#e5b02a',
    bg: 'rgba(229,176,42,0.16)',
    description: 'A slightly imprecise move.',
    severity: 1,
  },
  mistake: {
    id: 'mistake',
    label: 'Mistake',
    symbol: '?',
    color: '#e58f2a',
    bg: 'rgba(229,143,42,0.16)',
    description: 'Gives away a meaningful amount of the position.',
    severity: 2,
  },
  miss: {
    id: 'miss',
    label: 'Miss',
    symbol: '×',
    color: '#e2703a',
    bg: 'rgba(226,112,58,0.16)',
    description: 'A winning opportunity was available.',
    severity: 3,
  },
  blunder: {
    id: 'blunder',
    label: 'Blunder',
    symbol: '??',
    color: '#ca3431',
    bg: 'rgba(202,52,49,0.18)',
    description: 'A serious error that changes the result.',
    severity: 4,
  },
};

export const ORDERED_CLASSIFICATIONS: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export function emptyCounts(): Record<Classification, number> {
  return ORDERED_CLASSIFICATIONS.reduce(
    (acc, key) => ({ ...acc, [key]: 0 }),
    {} as Record<Classification, number>,
  );
}

/* -------------------------------------------------------------------------- */
/*  Eval helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Centipawns → expected score percentage (Lichess' logistic fit, 0-100). */
export function cpToWinPercent(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function evalToWinPercent(cpWhite: number, mateWhite: number | null): number {
  if (mateWhite !== null) return mateWhite > 0 ? 100 : 0;
  return cpToWinPercent(cpWhite);
}

/** Formats an eval for the bar / engine lines: +1.24, -0.05, M3, -M2. */
export function formatEval(cpWhite: number, mateWhite: number | null): string {
  if (mateWhite !== null) {
    const plies = Math.abs(mateWhite);
    const moves = Math.ceil(plies / 2);
    return `${mateWhite > 0 ? '' : '-'}M${moves}`;
  }
  const pawns = cpWhite / 100;
  const sign = pawns > 0 ? '+' : pawns < 0 ? '-' : '';
  return `${sign}${Math.abs(pawns).toFixed(Math.abs(pawns) >= 10 ? 1 : 2)}`;
}

/**
 * Recovers a mate distance (in plies, White POV) from a folded centipawn score.
 * Reviews persist evals as plain centipawns, so the bar/labels need this to
 * render `M3` instead of `+1000.00`.
 */
export function cpToMate(cpWhite: number): number | null {
  const abs = Math.abs(cpWhite);
  if (abs < MATE_CP - 100 * 100) return null;
  const plies = Math.round((MATE_CP - abs) / 100);
  return plies === 0 ? null : Math.sign(cpWhite) * Math.max(1, plies);
}

/** `formatEval` that accepts a folded centipawn score. */
export function formatEvalFromCp(cpWhite: number): string {
  return formatEval(cpWhite, cpToMate(cpWhite));
}

export function toEngineLines(evaluation: EngineEvaluation, fen: string, limit = 3): EngineLine[] {
  const flip = (fen.split(' ')[1] ?? 'w') === 'b' ? -1 : 1;
  return evaluation.lines.slice(0, limit).map((line) => ({
    multipv: line.multipv,
    depth: line.depth,
    cp: line.cp * flip,
    mate: line.mate === null ? null : line.mate * flip,
    pv: line.pv,
    san: pvToSan(fen, line.pv, 6),
  }));
}

/** Translates a UCI principal variation into SAN, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[], max = 6): string[] {
  const chess = new Chess();
  try {
    chess.load(fen);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] ?? undefined,
      });
      if (!move) break;
      out.push(move.san);
    } catch {
      break;
    }
  }
  return out;
}

export function uciToSan(fen: string, uci: string | null): string | null {
  if (!uci) return null;
  const list = pvToSan(fen, [uci], 1);
  return list[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Classification                                                             */
/* -------------------------------------------------------------------------- */

export interface ClassificationInput {
  /** Eval (White POV, cp with mates folded) before the move. */
  cpWhiteBefore: number;
  cpWhiteAfter: number;
  mover: Color;
  /** Was the played move the engine's first choice? */
  playedBest: boolean;
  /** Gap in centipawns between the best and second best move (mover POV). */
  secondBestGap: number;
  /** Mate distance (plies, White POV) available before the move, if any. */
  mateBefore: number | null;
  /** Mate distance (plies, White POV) after the played move, if any. */
  mateAfter: number | null;
  /** Heuristic sacrifice detection for the played move. */
  sacrifice: boolean;
}

export function classifyMove(input: ClassificationInput): {
  classification: Classification;
  cpLoss: number;
  comment: string;
} {
  const sign = input.mover === 'w' ? 1 : -1;
  const before = input.cpWhiteBefore * sign;
  const after = input.cpWhiteAfter * sign;
  const cpLoss = Math.max(0, Math.round(before - after));
  const winLoss = Math.max(0, cpToWinPercent(before) - cpToWinPercent(after));

  // Did the mover throw away a forced mate?
  const hadMate = input.mateBefore !== null && input.mateBefore * sign > 0;
  const keepsMate = input.mateAfter !== null && input.mateAfter * sign > 0;
  if (hadMate && !keepsMate && cpLoss >= 90) {
    const hadWin = input.mateBefore !== null ? Math.ceil(Math.abs(input.mateBefore) / 2) : 0;
    return {
      classification: 'miss',
      cpLoss,
      comment: `Missed a forced mate in ${hadWin}.`,
    };
  }

  if (input.sacrifice && input.playedBest && after > -150) {
    return { classification: 'brilliant', cpLoss, comment: 'Brilliant sacrifice — the engine agrees.' };
  }

  if (input.playedBest && input.secondBestGap >= 150 && Math.abs(after) > 60) {
    return {
      classification: 'great',
      cpLoss,
      comment: `Only move — the alternative drops ${(input.secondBestGap / 100).toFixed(1)}.`,
    };
  }

  if (input.playedBest || cpLoss <= 5) {
    return { classification: 'best', cpLoss, comment: 'Best move.' };
  }
  if (cpLoss <= 25) return { classification: 'excellent', cpLoss, comment: 'Excellent.' };
  if (cpLoss <= 90 && winLoss < 5) return { classification: 'good', cpLoss, comment: 'Solid move.' };
  if (winLoss < 10) {
    return { classification: 'inaccuracy', cpLoss, comment: `Inaccuracy — lost ${(cpLoss / 100).toFixed(2)}.` };
  }
  if (winLoss < 22) {
    return { classification: 'mistake', cpLoss, comment: `Mistake — lost ${(cpLoss / 100).toFixed(2)}.` };
  }
  return { classification: 'blunder', cpLoss, comment: `Blunder — lost ${(cpLoss / 100).toFixed(2)}.` };
}

/** Lichess-style per-move accuracy from the mover's perspective (0-100). */
export function moveAccuracy(cpWhiteBefore: number, cpWhiteAfter: number, mover: Color): number {
  const sign = mover === 'w' ? 1 : -1;
  const before = cpToWinPercent(cpWhiteBefore * sign);
  const after = cpToWinPercent(cpWhiteAfter * sign);
  const loss = Math.max(0, before - after);
  const accuracy = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, accuracy));
}

/* -------------------------------------------------------------------------- */
/*  Sacrifice heuristic (SEE-lite)                                             */
/* -------------------------------------------------------------------------- */

const PIECE_CP: Record<string, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 10000 };

/**
 * Heuristic "did the mover give up material here?" check.
 *
 * Not a full static exchange evaluation — we only need to know whether the
 * landing square is capturable by something cheaper than the piece that landed
 * on it and inadequately defended.
 */
export function detectSacrifice(fenBefore: string, move: { from: string; to: string; promotion?: string }): boolean {
  const chess = new Chess();
  try {
    chess.load(fenBefore);
  } catch {
    return false;
  }
  const mover = chess.turn();
  let applied: Move | null = null;
  try {
    applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  } catch {
    return false;
  }
  if (!applied) return false;
  const landedValue = PIECE_CP[applied.piece] ?? 0;
  if (landedValue <= 100) return false; // hanging a pawn is not "brilliant"

  const attackers = chess
    .moves({ verbose: true })
    .filter((m) => m.to === move.to)
    .map((m) => PIECE_CP[m.piece] ?? 0);
  if (attackers.length === 0) return false;
  const cheapestAttacker = Math.min(...attackers);
  if (cheapestAttacker >= landedValue) return false;

  // Simulate the cheapest capture and see whether the material comes back.
  const cheapestMove = chess.moves({ verbose: true }).find((m) => m.to === move.to && PIECE_CP[m.piece] === cheapestAttacker);
  if (!cheapestMove) return false;
  try {
    chess.move({ from: cheapestMove.from, to: cheapestMove.to, promotion: cheapestMove.promotion });
  } catch {
    return false;
  }
  const defenders = chess
    .moves({ verbose: true })
    .filter((m) => m.to === move.to)
    .map((m) => PIECE_CP[m.piece] ?? 0);
  const cheapestDefender = defenders.length ? Math.min(...defenders) : Number.POSITIVE_INFINITY;
  // Re-take is only profitable if the recapturing piece is worth less than the
  // material the opponent just won.
  const recaptureValue = landedValue - cheapestAttacker;
  if (!Number.isFinite(cheapestDefender)) return true; // completely undefended → sacrifice
  return cheapestAttacker < landedValue && recaptureValue > cheapestDefender - cheapestAttacker;
}

/* -------------------------------------------------------------------------- */
/*  Review pipeline                                                            */
/* -------------------------------------------------------------------------- */

export interface ReviewMoveInput {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  color: Color;
  fen: string;
}

export interface AnalyseGameOptions {
  gameId: string;
  initialFen: string;
  moves: ReviewMoveInput[];
  engine: StockfishEngine | null;
  /** Search depth per position. 12 is snappy, 18 is strong. */
  depth?: number;
  onProgress?: (progress: {
    done: number;
    total: number;
    phase: 'evaluating' | 'classifying' | 'done';
    engineUsed: boolean;
  }) => void;
  signal?: AbortSignal;
}

/**
 * Evaluates every position once (N+1 searches for N moves — the eval after a
 * move is simply the eval of the next position), then classifies each move.
 */
export async function analyseGame(options: AnalyseGameOptions): Promise<ReviewReport> {
  const { gameId, initialFen, moves, engine, signal } = options;
  const depth = options.depth ?? 14;
  const total = moves.length + 1;

  if (!engine || moves.length === 0) {
    return analyseGameHeuristically(options);
  }

  const fens: string[] = [initialFen];
  for (const move of moves) fens.push(move.fen);

  const evaluations: EngineEvaluation[] = [];
  try {
    for (let i = 0; i < fens.length; i++) {
      if (signal?.aborted) break;
      const evaluation = await engine.analyse(fens[i], { depth, multipv: 2, signal });
      evaluations.push(evaluation);
      options.onProgress?.({ done: i + 1, total, phase: 'evaluating', engineUsed: true });
    }
  } catch {
    // Engine died mid-run — fall back to whatever we can still classify.
  }

  if (evaluations.length < 2) return analyseGameHeuristically(options);

  return buildReport({
    gameId,
    initialFen,
    moves,
    fens,
    evaluations,
    depth,
    engineUsed: true,
    onProgress: options.onProgress,
    signal,
  });
}

function buildReport(args: {
  gameId: string;
  initialFen: string;
  moves: ReviewMoveInput[];
  fens: string[];
  evaluations: EngineEvaluation[];
  depth: number;
  engineUsed: boolean;
  onProgress?: AnalyseGameOptions['onProgress'];
  signal?: AbortSignal;
}): ReviewReport {
  const { gameId, moves, fens, evaluations, depth, engineUsed } = args;
  const analysed: MoveAnalysis[] = [];
  const counts: Record<Color, Record<Classification, number>> = { w: emptyCounts(), b: emptyCounts() };
  const keyMoments: number[] = [];
  const perColorAccuracy: Record<Color, number[]> = { w: [], b: [] };
  const perColorCpLoss: Record<Color, number[]> = { w: [], b: [] };

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const before = evaluations[i];
    const after = evaluations[i + 1];
    if (!before || !after) {
      analysed.push({
        ply: i + 1,
        color: move.color,
        san: move.san,
        classification: 'good',
        cpLoss: 0,
        evalBefore: 0,
        evalAfter: 0,
        bestMoveSan: null,
        bestMoveUci: null,
        bestEval: 0,
        comment: 'Not analysed.',
      });
      continue;
    }

    const cpWhiteBefore = before.cpWhite;
    const cpWhiteAfter = after.cpWhite;
    const primary = before.lines[0];
    const secondary = before.lines[1];
    const sign = move.color === 'w' ? 1 : -1;
    const bestMoveUci = primary?.pv[0] ?? before.bestMove ?? null;
    const bestMoveSan = uciToSan(fens[i], bestMoveUci);
    const playedBest = bestMoveUci !== null && bestMoveUci.slice(0, 4) === `${move.from}${move.to}`;
    const secondBestGap =
      secondary && primary
        ? Math.max(0, mateToCp(primary.mate, primary.cp) - mateToCp(secondary.mate, secondary.cp)) * sign
        : 0;

    const sacrifice = detectSacrifice(fens[i], move);
    const { classification, cpLoss, comment } = classifyMove({
      cpWhiteBefore,
      cpWhiteAfter,
      mover: move.color,
      playedBest,
      secondBestGap,
      mateBefore: before.mateWhite,
      mateAfter: after.mateWhite,
      sacrifice,
    });

    if (classification === 'blunder' && !sacrifice) {
      // A blunder that hands over an immediate capture is often a "miss" for the opponent.
      const opponent = move.color === 'w' ? 'b' : 'w';
      void opponent;
    }

    counts[move.color][classification] += 1;
    perColorAccuracy[move.color].push(moveAccuracy(cpWhiteBefore, cpWhiteAfter, move.color));
    perColorCpLoss[move.color].push(Math.min(cpLoss, 1000));
    if (CLASSIFICATIONS[classification].severity >= 2) keyMoments.push(i);

    analysed.push({
      ply: i + 1,
      color: move.color,
      san: move.san,
      classification,
      cpLoss,
      evalBefore: cpWhiteBefore,
      evalAfter: cpWhiteAfter,
      bestMoveSan,
      bestMoveUci,
      bestEval: before.cpWhite,
      comment,
    });
  }

  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const accuracy: AccuracySummary = {
    white: Math.round(mean(perColorAccuracy.w) * 10) / 10,
    black: Math.round(mean(perColorAccuracy.b) * 10) / 10,
    whiteAcpl: Math.round(mean(perColorCpLoss.w)),
    blackAcpl: Math.round(mean(perColorCpLoss.b)),
  };

  args.onProgress?.({ done: moves.length + 1, total: moves.length + 1, phase: 'done', engineUsed });

  return {
    gameId,
    moves: analysed,
    accuracy,
    counts,
    keyMoments,
    depth,
    engineUsed,
  };
}

/**
 * Degraded review used when Stockfish cannot be loaded: material + tactical
 * heuristics only. Clearly flagged in the UI so results are not mistaken for
 * engine output.
 */
export function analyseGameHeuristically(options: AnalyseGameOptions): ReviewReport {
  const { gameId, initialFen, moves } = options;
  const chess = new Chess();
  try {
    chess.load(initialFen);
  } catch {
    /* ignore */
  }
  const analysed: MoveAnalysis[] = [];
  const counts: Record<Color, Record<Classification, number>> = { w: emptyCounts(), b: emptyCounts() };
  const keyMoments: number[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const fenBefore = chess.fen();
    let classification: Classification = 'good';
    let comment = 'Material-neutral move.';
    try {
      const applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      if (applied) {
        if (detectSacrifice(fenBefore, move)) {
          classification = 'inaccuracy';
          comment = 'Piece may be hanging — verify with the engine.';
        } else if (applied.captured) {
          classification = 'best';
          comment = 'Capture.';
        } else if (chess.isCheckmate()) {
          classification = 'best';
          comment = 'Checkmate!';
        } else if (chess.isCheck()) {
          classification = 'excellent';
          comment = 'Check.';
        }
      }
    } catch {
      /* ignore illegal (should not happen) */
    }
    counts[move.color][classification] += 1;
    if (CLASSIFICATIONS[classification].severity >= 2) keyMoments.push(i);
    analysed.push({
      ply: i + 1,
      color: move.color,
      san: move.san,
      classification,
      cpLoss: 0,
      evalBefore: 0,
      evalAfter: 0,
      bestMoveSan: null,
      bestMoveUci: null,
      bestEval: 0,
      comment,
    });
  }

  options.onProgress?.({ done: moves.length + 1, total: moves.length + 1, phase: 'done', engineUsed: false });

  return {
    gameId,
    moves: analysed,
    accuracy: { white: 0, black: 0, whiteAcpl: 0, blackAcpl: 0 },
    counts,
    keyMoments,
    depth: 0,
    engineUsed: false,
  };
}

export { MATE_CP };
