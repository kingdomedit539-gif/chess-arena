/**
 * Shared domain + wire types.
 *
 * These describe the contract between the browser client (`src/**`) and the
 * authoritative realtime server (`server/**`). The server is plain ESM
 * JavaScript, so it mirrors these shapes by convention — keep both sides in
 * sync when changing anything below.
 */

export type Color = 'w' | 'b';

export type GamePhase = 'LOBBY' | 'SEARCHING' | 'IN_GAME' | 'POST_GAME_REVIEW';

export type Square = string; // 'a1' .. 'h8'

export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type ColoredPiece = { type: PieceSymbol; color: Color };

/* -------------------------------------------------------------------------- */
/*  Time controls & ratings                                                    */
/* -------------------------------------------------------------------------- */

export interface TimeControl {
  /** Base time in seconds. */
  initial: number;
  /** Increment per move in seconds. */
  increment: number;
}

export type TimeControlPreset =
  | '1+0'
  | '3+0'
  | '5+0'
  | '10+0'
  | '3+2'
  | '5+5'
  | '15+10'
  | 'custom';

export interface RatingSnapshot {
  rating: number;
  /** Rating change applied after the game (0 while live). */
  delta: number;
  /** New rating after the game. */
  after?: number;
  provisional: boolean;
  games: number;
}

export interface PlayerPublic {
  id: string;
  username: string;
  rating: number;
  /** Deterministic avatar seed (used for the generated avatar gradient). */
  avatarSeed: string;
  country?: string;
  /** Set while connected over the socket. */
  online?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Game state                                                                 */
/* -------------------------------------------------------------------------- */

export type GameStatus = 'waiting' | 'active' | 'finished' | 'aborted';

export type GameEndReason =
  | 'checkmate'
  | 'timeout'
  | 'resignation'
  | 'stalemate'
  | 'insufficient-material'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'agreement'
  | 'abandoned'
  | 'aborted';

export type GameResult =
  | { winner: Color; reason: GameEndReason }
  | { winner: null; reason: GameEndReason };

export interface MoveRecord {
  /** 1-based ply index. */
  ply: number;
  color: Color;
  san: string;
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  /** FEN after the move was played. */
  fen: string;
  /** Milliseconds left on white's clock after the move. */
  whiteTime: number;
  /** Milliseconds left on black's clock after the move. */
  blackTime: number;
  /** Milliseconds the mover spent on this move. */
  timeSpent: number;
  capture?: PieceSymbol;
  check?: boolean;
  checkmate?: boolean;
  castle?: 'k' | 'q';
}

export interface GameSnapshot {
  id: string;
  roomCode: string;
  status: GameStatus;
  rated: boolean;
  timeControl: TimeControl;
  fen: string;
  /** Start position, retained so review can rebuild from the beginning. */
  initialFen: string;
  turn: Color;
  moves: MoveRecord[];
  whiteTime: number;
  blackTime: number;
  pgn: string;
  white: PlayerPublic;
  black: PlayerPublic;
  drawOfferBy: Color | null;
  rematchOfferBy: Color | null;
  result: GameResult | null;
  createdAt: number;
  /** Epoch ms of the last server tick included in this snapshot (clock sync). */
  serverTime: number;
  /** Last move, for highlighting. */
  lastMove: { from: Square; to: Square } | null;
}

/** Lightweight status the server pushes with every clock tick. */
export interface ClockSync {
  id: string;
  whiteTime: number;
  blackTime: number;
  turn: Color;
  activeClock: Color | null;
  serverTime: number;
  status: GameStatus;
}

/* -------------------------------------------------------------------------- */
/*  Analysis                                                                   */
/* -------------------------------------------------------------------------- */

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss';

export interface EngineLine {
  /** 1 = best. */
  multipv: number;
  depth: number;
  /** Centipawns, always from White's point of view. */
  cp: number;
  /** Set when a forced mate is found (plies). */
  mate: number | null;
  /** UCI moves. */
  pv: string[];
  /** SAN translation of `pv` (best effort, may be shorter than pv). */
  san: string[];
}

export interface MoveAnalysis {
  ply: number;
  color: Color;
  san: string;
  classification: Classification;
  /** Centipawn loss vs the engine's best move for the mover. */
  cpLoss: number;
  /** Eval (White POV, centipawns) before the move was played. */
  evalBefore: number;
  /** Eval (White POV, centipawns) after the move. */
  evalAfter: number;
  bestMoveSan: string | null;
  bestMoveUci: string | null;
  /** Eval of the best move instead, White POV. */
  bestEval: number;
  /** Short human-readable note shown in the review panel. */
  comment: string;
}

export interface AccuracySummary {
  white: number;
  black: number;
  whiteAcpl: number;
  blackAcpl: number;
}

export interface ReviewReport {
  gameId: string;
  moves: MoveAnalysis[];
  accuracy: AccuracySummary;
  /** Move counts per classification, keyed by color. */
  counts: Record<Color, Record<Classification, number>>;
  keyMoments: number[];
  depth: number;
  engineUsed: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Socket protocol                                                            */
/* -------------------------------------------------------------------------- */

export interface MatchRequest {
  timeControl: TimeControl;
  rated: boolean;
  /** Preferred colour, or 'random'. */
  color: Color | 'random';
}

export interface QueueStatus {
  /** 1 = first in queue. */
  position: number;
  /** ± rating window currently being searched. */
  range: number;
  searching: number;
  timeControl: TimeControl;
  elapsed: number;
}

export interface ChatMessage {
  id: string;
  from: string;
  username: string;
  color?: Color;
  text: string;
  at: number;
  system?: boolean;
}

export interface ClientToServerEvents {
  'user:hello': (
    payload: { id?: string; username?: string; token?: string },
    ack?: (res: { player: PlayerPublic; serverTime: number }) => void,
  ) => void;
  'user:profile': (
    payload: { username?: string },
    ack: (res: { player: PlayerPublic }) => void,
  ) => void;

  'queue:join': (payload: MatchRequest) => void;
  'queue:leave': () => void;

  'room:create': (
    payload: MatchRequest & { visibility: 'private' },
    ack: (res: { roomCode: string; joinUrl: string }) => void,
  ) => void;
  'room:join': (payload: { roomCode: string }, ack: (res: { ok: boolean; error?: string }) => void) => void;
  'room:spectate': (payload: { roomCode: string }) => void;

  'game:move': (payload: {
    gameId: string;
    from: Square;
    to: Square;
    promotion?: PieceSymbol;
    /** Client-supplied liveness check so the server can measure lag. */
    clientTime: number;
  }) => void;
  'game:resign': (payload: { gameId: string }) => void;
  'game:abort': (payload: { gameId: string }) => void;
  'game:draw:offer': (payload: { gameId: string }) => void;
  'game:draw:accept': (payload: { gameId: string }) => void;
  'game:draw:decline': (payload: { gameId: string }) => void;
  'game:rematch:offer': (payload: { gameId: string }) => void;
  'game:rematch:accept': (payload: { gameId: string }) => void;
  'game:chat': (payload: { gameId: string; text: string }) => void;
  'game:sync': (payload: { gameId: string }) => void;
  'game:resume': (payload: { gameId: string }, ack: (res: { snapshot: GameSnapshot } | { error: string }) => void) => void;
}

export interface ServerToClientEvents {
  'user:ready': (payload: { player: PlayerPublic; serverTime: number }) => void;
  'queue:status': (payload: QueueStatus) => void;
  'queue:left': () => void;
  'match:found': (payload: { snapshot: GameSnapshot; color: Color }) => void;
  'game:state': (payload: GameSnapshot) => void;
  'game:move': (payload: { move: MoveRecord; snapshot: GameSnapshot }) => void;
  'game:clock': (payload: ClockSync) => void;
  'game:over': (payload: {
    result: GameResult;
    snapshot: GameSnapshot;
    ratings: { white: RatingSnapshot; black: RatingSnapshot } | null;
    reviewUrl: string;
  }) => void;
  'game:draw:offer': (payload: { by: Color; snapshot: GameSnapshot }) => void;
  'game:draw:decline': (payload: { by: Color }) => void;
  'game:rematch:offer': (payload: { by: Color }) => void;
  'game:chat': (payload: ChatMessage) => void;
  'game:presence': (payload: { color: Color; online: boolean; graceMsLeft: number }) => void;
  'game:notice': (payload: { level: 'info' | 'warn' | 'error'; text: string }) => void;
  error: (payload: { code: string; message: string }) => void;
}

/* -------------------------------------------------------------------------- */
/*  HTTP DTOs (custom server exposes a tiny REST surface for archives)         */
/* -------------------------------------------------------------------------- */

export interface ArchivedGame {
  snapshot: GameSnapshot;
  ratings: { white: RatingSnapshot; black: RatingSnapshot } | null;
  finishedAt: number;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  avatarSeed: string;
}

/** Compact row used by the "recent games" lists. */
export interface GameSummary {
  id: string;
  outcome: 'win' | 'loss' | 'draw';
  color: Color;
  reason: GameEndReason;
  result: GameResult;
  opponent: { id: string; username: string; rating: number } | null;
  ratingDelta: number;
  ratingAfter: number;
  rated: boolean;
  timeControl: TimeControl;
  moves: number;
  playedAt: number;
}

export interface PlayerProfile {
  player: LeaderboardEntry;
  recent: GameSummary[];
  streak: { type: 'win' | 'loss' | 'draw' | 'none'; count: number };
  bestRating: number;
}
