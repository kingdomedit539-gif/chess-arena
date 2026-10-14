/**
 * The authoritative game object.
 *
 * All chess legality, clocks and results are decided here — the browser only
 * sends intent (`{from,to,promotion}`) and renders the snapshot it gets back,
 * which is what makes the clocks cheat-resistant.
 */

import { Chess } from 'chess.js';
import { opposite } from './util.mjs';

const PIECE_POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export class Game {
  constructor({ id, roomCode, timeControl, rated, white, black, visibility, createdBy }) {
    this.id = id;
    this.roomCode = roomCode;
    this.timeControl = { initial: timeControl.initial, increment: timeControl.increment };
    this.rated = Boolean(rated);
    this.visibility = visibility ?? 'public';
    this.createdBy = createdBy ?? null;

    this.chess = new Chess();
    this.initialFen = this.chess.fen();
    this.white = white;
    this.black = black ?? null;

    this.moves = [];
    this.lastMove = null;
    this.chat = [];

    this.whiteTime = this.timeControl.initial * 1000;
    this.blackTime = this.timeControl.initial * 1000;
    this.turn = 'w';
    this.status = this.black ? 'active' : 'waiting';
    this.result = null;
    this.drawOfferBy = null;
    this.rematchOfferBy = null;

    this.createdAt = Date.now();
    this.startedAt = this.black ? Date.now() : null;
    this.turnStartedAt = this.black ? Date.now() : null;
    this.finishedAt = null;
    this.lastClockEmit = 0;
    this.lastActivity = Date.now();

    if (this.black) this.applyHeaders();
  }

  /* ------------------------------------------------------------------ */
  /*  Queries                                                            */
  /* ------------------------------------------------------------------ */

  hasPlayer(playerId) {
    return this.white?.id === playerId || this.black?.id === playerId;
  }

  colorOf(playerId) {
    if (this.white?.id === playerId) return 'w';
    if (this.black?.id === playerId) return 'b';
    return null;
  }

  playerFor(color) {
    return color === 'w' ? this.white : this.black;
  }

  /** Which side is on the clock right now (null when not active). */
  get activeClock() {
    return this.status === 'active' ? this.turn : null;
  }

  /** Milliseconds left for `color`, accounting for the running turn clock. */
  clockRemaining(color, now = Date.now()) {
    const base = color === 'w' ? this.whiteTime : this.blackTime;
    if (this.status !== 'active' || color !== this.turn) return Math.max(0, base);
    return Math.max(0, base - (now - this.turnStartedAt));
  }

  /* ------------------------------------------------------------------ */
  /*  Lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  applyHeaders() {
    try {
      this.chess.setHeader('Event', 'Chess Arena');
      if (this.white) this.chess.setHeader('White', this.white.username);
      if (this.black) this.chess.setHeader('Black', this.black.username);
    } catch {
      /* headers are cosmetic */
    }
  }

  /** Called when a private room's second player joins. */
  start(black) {
    if (black) {
      this.black = black;
      this.applyHeaders();
    }
    this.status = 'active';
    this.startedAt = Date.now();
    this.turnStartedAt = Date.now();
    this.whiteTime = this.timeControl.initial * 1000;
    this.blackTime = this.timeControl.initial * 1000;
    this.lastActivity = Date.now();
  }

  finish(result) {
    if (this.status === 'finished') return false;
    this.status = 'finished';
    this.result = result;
    this.turnStartedAt = null;
    this.finishedAt = Date.now();
    this.drawOfferBy = null;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Moves                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * @returns {{ok:true, move:MoveRecord, gameOver:boolean} | {ok:false, error:string, flagged?:boolean}}
   */
  tryMove(playerId, { from, to, promotion }) {
    if (this.status !== 'active') return { ok: false, error: 'This game is not active.' };
    const color = this.colorOf(playerId);
    if (!color) return { ok: false, error: 'You are not playing this game.' };
    if (color !== this.turn) return { ok: false, error: 'Not your turn.' };

    const now = Date.now();
    const elapsed = now - this.turnStartedAt;
    const remaining = (color === 'w' ? this.whiteTime : this.blackTime) - elapsed;
    if (remaining <= 0) {
      this.flag(color);
      return { ok: false, error: 'Your time ran out.', flagged: true };
    }

    let move = null;
    try {
      move = this.chess.move({ from, to, promotion: promotion ?? undefined });
    } catch {
      return { ok: false, error: 'Illegal move.' };
    }
    if (!move) return { ok: false, error: 'Illegal move.' };

    if (color === 'w') this.whiteTime = remaining + this.timeControl.increment * 1000;
    else this.blackTime = remaining + this.timeControl.increment * 1000;

    this.turn = this.chess.turn();
    this.turnStartedAt = now;
    this.drawOfferBy = null;
    this.lastActivity = now;

    const record = {
      ply: this.moves.length + 1,
      color,
      san: move.san,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      fen: this.chess.fen(),
      whiteTime: Math.round(this.whiteTime),
      blackTime: Math.round(this.blackTime),
      timeSpent: Math.max(0, Math.round(elapsed)),
      capture: move.captured,
      check: this.chess.isCheck(),
      checkmate: this.chess.isCheckmate(),
      castle: move.isKingsideCastle() ? 'k' : move.isQueensideCastle() ? 'q' : undefined,
    };
    this.moves.push(record);
    this.lastMove = { from: move.from, to: move.to };

    return { ok: true, move: record, gameOver: this.checkNaturalEnd() };
  }

  /** Checkmate / stalemate / insufficient material / repetition / 50-move. */
  checkNaturalEnd() {
    const chess = this.chess;
    if (chess.isCheckmate()) {
      this.finish({ winner: opposite(this.turn), reason: 'checkmate' });
      return true;
    }
    if (chess.isStalemate()) {
      this.finish({ winner: null, reason: 'stalemate' });
      return true;
    }
    if (chess.isInsufficientMaterial()) {
      this.finish({ winner: null, reason: 'insufficient-material' });
      return true;
    }
    if (chess.isThreefoldRepetition()) {
      this.finish({ winner: null, reason: 'threefold-repetition' });
      return true;
    }
    if (chess.isDrawByFiftyMoves()) {
      this.finish({ winner: null, reason: 'fifty-move-rule' });
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /*  Termination                                                        */
  /* ------------------------------------------------------------------ */

  /** True when `color` cannot possibly deliver mate (king, or king + 1 minor). */
  cannotMate(color) {
    const pieces = [];
    for (const row of this.chess.board()) {
      for (const cell of row) {
        if (cell && cell.color === color) pieces.push(cell.type);
      }
    }
    const others = pieces.filter((type) => type !== 'k');
    return others.length === 0 || (others.length === 1 && (others[0] === 'n' || others[0] === 'b'));
  }

  /** A player's clock hit zero. The opponent wins unless they cannot mate. */
  flag(color) {
    const opponent = opposite(color);
    if (this.cannotMate(opponent)) {
      this.finish({ winner: null, reason: 'insufficient-material' });
    } else {
      this.finish({ winner: opponent, reason: 'timeout' });
    }
    return this.result;
  }

  resign(playerId) {
    const color = this.colorOf(playerId);
    if (!color || this.status !== 'active') return null;
    this.finish({ winner: opposite(color), reason: 'resignation' });
    return this.result;
  }

  /** Opponent disconnected and never came back inside the grace window. */
  abandon(color) {
    if (this.status !== 'active' && this.status !== 'waiting') return null;
    if (this.status === 'waiting') {
      this.finish({ winner: null, reason: 'aborted' });
      return this.result;
    }
    const opponent = opposite(color);
    if (this.cannotMate(opponent)) this.finish({ winner: null, reason: 'insufficient-material' });
    else this.finish({ winner: opponent, reason: 'abandoned' });
    return this.result;
  }

  /** Abort before any move has been played (no rating change). */
  abort() {
    if (this.moves.length > 0) return null;
    this.finish({ winner: null, reason: 'aborted' });
    return this.result;
  }

  /* ------------------------------------------------------------------ */
  /*  Draw / rematch / chat                                              */
  /* ------------------------------------------------------------------ */

  offerDraw(playerId) {
    const color = this.colorOf(playerId);
    if (!color || this.status !== 'active') return false;
    this.drawOfferBy = color;
    return true;
  }

  acceptDraw(playerId) {
    const color = this.colorOf(playerId);
    if (!color || this.status !== 'active') return false;
    if (!this.drawOfferBy || this.drawOfferBy === color) return false;
    this.finish({ winner: null, reason: 'agreement' });
    return true;
  }

  declineDraw(playerId) {
    const color = this.colorOf(playerId);
    if (!color || !this.drawOfferBy || this.drawOfferBy === color) return false;
    const by = this.drawOfferBy;
    this.drawOfferBy = null;
    return by;
  }

  offerRematch(playerId) {
    const color = this.colorOf(playerId);
    if (!color || this.status !== 'finished') return false;
    this.rematchOfferBy = color;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /*  Serialisation                                                      */
  /* ------------------------------------------------------------------ */

  snapshot() {
    const now = Date.now();
    let pgn = '';
    try {
      pgn = this.chess.pgn({ maxWidth: 0, newline: '\n' });
    } catch {
      pgn = '';
    }
    return {
      id: this.id,
      roomCode: this.roomCode,
      status: this.status,
      rated: this.rated,
      timeControl: this.timeControl,
      fen: this.chess.fen(),
      initialFen: this.initialFen,
      turn: this.turn,
      moves: this.moves,
      whiteTime: Math.round(this.clockRemaining('w', now)),
      blackTime: Math.round(this.clockRemaining('b', now)),
      pgn,
      white: this.white,
      black: this.black ?? this.white,
      drawOfferBy: this.drawOfferBy,
      rematchOfferBy: this.rematchOfferBy,
      result: this.result,
      createdAt: this.createdAt,
      serverTime: now,
      lastMove: this.lastMove,
    };
  }

  clockSync() {
    const now = Date.now();
    return {
      id: this.id,
      whiteTime: Math.round(this.clockRemaining('w', now)),
      blackTime: Math.round(this.clockRemaining('b', now)),
      turn: this.turn,
      activeClock: this.activeClock,
      serverTime: now,
      status: this.status,
    };
  }
}

export { PIECE_POINTS };
