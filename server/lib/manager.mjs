/**
 * Game manager: owns the live games, the matchmaking queues, presence and the
 * clock sweeper. `server/index.mjs` only wires socket events to these methods.
 */

import { Game } from './game.mjs';
import { Matchmaking, queueKey } from './matchmaking.mjs';
import { applyRatings } from './elo.mjs';
import { cleanUsername, opposite, randomRoomCode, uid } from './util.mjs';

const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS ?? 30000) || 30000;
const SWEEP_INTERVAL_MS = 200;
const CLOCK_EMIT_INTERVAL_MS = 1000;
const WAITING_ROOM_TTL_MS = 15 * 60 * 1000;
const FINISHED_TTL_MS = 30 * 60 * 1000;
const MATCH_RETRY_MS = 1000;

export class GameManager {
  /**
   * @param {import('socket.io').Server} io
   * @param {import('./store.mjs').store} store
   */
  constructor(io, store) {
    this.io = io;
    this.store = store;
    this.matchmaking = new Matchmaking();

    /** @type {Map<string, Game>} */
    this.games = new Map();
    /** @type {Map<string, string>} roomCode → gameId */
    this.rooms = new Map();
    /** @type {Map<string, string>} roomCode → creator colour preference */
    this.roomPrefs = new Map();
    /** @type {Map<string, Set<string>>} playerId → socketIds */
    this.playerSockets = new Map();
    /** @type {Map<string, Set<string>>} socketId → gameIds */
    this.socketGames = new Map();
    /** @type {Map<string, NodeJS.Timeout>} `${gameId}:${color}` → grace timer */
    this.graceTimers = new Map();
    /** playerIds with a pending match retry timer */
    this.matchTimers = new Map();
    this.sweeper = null;
    this.publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  }

  setPublicUrl(url) {
    if (!url) return;
    this.publicUrl = String(url).replace(/\/$/, '');
  }

  /* ------------------------------------------------------------------ */
  /*  Socket bookkeeping                                                 */
  /* ------------------------------------------------------------------ */

  room(gameId) {
    return `game:${gameId}`;
  }

  socketsOf(playerId) {
    return [...(this.playerSockets.get(playerId) ?? [])];
  }

  emitToPlayer(playerId, event, payload) {
    for (const socketId of this.socketsOf(playerId)) this.io.to(socketId).emit(event, payload);
  }

  emitToGame(gameId, event, payload) {
    this.io.to(this.room(gameId)).emit(event, payload);
  }

  async attachSocket(socket, player) {
    socket.data.playerId = player.id;
    let set = this.playerSockets.get(player.id);
    if (!set) {
      set = new Set();
      this.playerSockets.set(player.id, set);
    }
    set.add(socket.id);
    if (!this.socketGames.has(socket.id)) this.socketGames.set(socket.id, new Set());

    // Rejoin every live game this player is part of.
    for (const game of this.games.values()) {
      if (!game.hasPlayer(player.id)) continue;
      await socket.join(this.room(game.id));
      this.socketGames.get(socket.id).add(game.id);
      const color = game.colorOf(player.id);
      this.clearGrace(game.id, color);
      this.emitToGame(game.id, 'game:presence', { color, online: true, graceMsLeft: 0 });
      socket.emit('game:state', game.snapshot());
    }
  }

  handleDisconnect(socket) {
    const playerId = socket.data.playerId;
    this.matchmaking.removeSocket(socket.id);
    const games = this.socketGames.get(socket.id);
    this.socketGames.delete(socket.id);
    if (!playerId) return;

    const set = this.playerSockets.get(playerId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) this.playerSockets.delete(playerId);
    }
    if (this.playerSockets.has(playerId)) return; // still open in another tab

    this.store.setOnline(playerId, false);
    for (const gameId of games ?? []) {
      const game = this.games.get(gameId);
      if (!game || (game.status !== 'active' && game.status !== 'waiting')) continue;
      const color = game.colorOf(playerId);
      if (!color) continue;
      this.emitToGame(game.id, 'game:presence', { color, online: false, graceMsLeft: RECONNECT_GRACE_MS });
      const timer = setTimeout(() => this.onGraceExpired(game.id, color), RECONNECT_GRACE_MS);
      if (typeof timer.unref === 'function') timer.unref();
      this.graceTimers.set(`${game.id}:${color}`, timer);
    }
  }

  clearGrace(gameId, color) {
    const key = `${gameId}:${color}`;
    const timer = this.graceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(key);
    }
  }

  onGraceExpired(gameId, color) {
    const game = this.games.get(gameId);
    if (!game || (game.status !== 'active' && game.status !== 'waiting')) return;
    const player = game.playerFor(color);
    if (!player) return;
    // Someone reconnected on this side in the meantime.
    if (this.playerSockets.has(player.id)) return;
    this.emitToGame(game.id, 'game:notice', {
      level: 'warn',
      text: `${player.username} left the game.`,
    });
    const result = game.abandon(color);
    if (result) this.finishGame(game);
  }

  /* ------------------------------------------------------------------ */
  /*  Game creation                                                      */
  /* ------------------------------------------------------------------ */

  createGame({ white, black, timeControl, rated, visibility = 'public', roomCode, createdBy }) {
    const game = new Game({
      id: uid('g_'),
      roomCode: roomCode ?? randomRoomCode(),
      timeControl,
      rated,
      white,
      black: black ?? null,
      visibility,
      createdBy,
    });
    this.games.set(game.id, game);
    this.rooms.set(game.roomCode, game.id);
    return game;
  }

  seatBoth(game) {
    const snapshot = game.snapshot();
    for (const color of ['w', 'b']) {
      const player = game.playerFor(color);
      if (!player) continue;
      for (const socketId of this.socketsOf(player.id)) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.join(this.room(game.id));
          this.socketGames.get(socketId)?.add(game.id);
        }
      }
      this.emitToPlayer(player.id, 'match:found', { snapshot, color });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Matchmaking                                                        */
  /* ------------------------------------------------------------------ */

  enqueue(socket, player, request) {
    this.store.setOnline(player.id, true);
    const key = this.matchmaking.join({
      socketId: socket.id,
      playerId: player.id,
      rating: player.rating,
      request,
    });
    void key;
    this.emitQueueStatus(player.id, request);
    this.tryMatchFor(player.id, request);
  }

  dequeue(playerId) {
    this.matchmaking.leave(playerId);
    this.clearMatchTimer(playerId);
  }

  emitQueueStatus(playerId, request) {
    const status = this.matchmaking.status(playerId, request.timeControl, request.rated);
    if (status) this.emitToPlayer(playerId, 'queue:status', status);
  }

  clearMatchTimer(playerId) {
    const timer = this.matchTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.matchTimers.delete(playerId);
    }
  }

  tryMatchFor(playerId, request) {
    const match = this.matchmaking.takeMatch(playerId);
    if (!match) {
      // Keep trying so two players who arrive within a second still pair up.
      this.clearMatchTimer(playerId);
      const timer = setTimeout(() => {
        this.matchTimers.delete(playerId);
        const stillQueued = this.matchmaking.all().some((entry) => entry.playerId === playerId);
        if (stillQueued) this.tryMatchFor(playerId, request);
      }, MATCH_RETRY_MS);
      if (typeof timer.unref === 'function') timer.unref();
      this.matchTimers.set(playerId, timer);
      return;
    }

    const { me, opponent } = match;
    this.clearMatchTimer(me.playerId);
    this.clearMatchTimer(opponent.playerId);
    this.matchmaking.removeSocket(me.socketId);
    this.matchmaking.removeSocket(opponent.socketId);

    const mePlayer = this.store.getPlayer(me.playerId);
    const opponentPlayer = this.store.getPlayer(opponent.playerId);
    if (!mePlayer || !opponentPlayer) return;

    // The player who waited longer keeps their colour preference.
    const waitingPref = opponent.request.color ?? 'random';
    const waitingColor = waitingPref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : waitingPref;
    const white = waitingColor === 'w' ? this.store.toPublic(opponentPlayer) : this.store.toPublic(mePlayer);
    const black = waitingColor === 'w' ? this.store.toPublic(mePlayer) : this.store.toPublic(opponentPlayer);

    const game = this.createGame({
      white,
      black,
      timeControl: me.request.timeControl,
      rated: Boolean(me.request.rated),
      visibility: 'public',
      createdBy: me.playerId,
    });
    game.start();

    this.emitToPlayer(me.playerId, 'queue:left', undefined);
    this.emitToPlayer(opponent.playerId, 'queue:left', undefined);
    this.seatBoth(game);
  }

  /* ------------------------------------------------------------------ */
  /*  Private rooms                                                      */
  /* ------------------------------------------------------------------ */

  createRoom(socket, player, request) {
    const roomCode = randomRoomCode();
    const publicPlayer = this.store.toPublic(player);
    const game = this.createGame({
      white: publicPlayer,
      black: null,
      timeControl: request.timeControl,
      rated: Boolean(request.rated),
      visibility: 'private',
      roomCode,
      createdBy: player.id,
    });
    this.roomPrefs.set(roomCode, request.color ?? 'random');
    socket.join(this.room(game.id));
    this.socketGames.get(socket.id)?.add(game.id);
    this.store.setOnline(player.id, true);
    return game;
  }

  findRoom(roomCode) {
    const normalised = String(roomCode ?? '').trim().toUpperCase();
    const gameId = this.rooms.get(normalised);
    return gameId ? this.games.get(gameId) ?? null : null;
  }

  joinRoom(socket, player, roomCode) {
    const game = this.findRoom(roomCode);
    if (!game) return { ok: false, error: 'Room not found. Check the code and try again.' };
    if (game.status !== 'waiting') return { ok: false, error: 'That room is already full.' };
    if (game.white.id === player.id) return { ok: false, error: 'You created this room — share the code with a friend.' };

    const creator = game.white;
    const joiner = this.store.toPublic(player);
    const pref = this.roomPrefs.get(game.roomCode) ?? 'random';
    const creatorColor = pref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : pref;
    if (creatorColor === 'b') {
      game.white = joiner;
      game.black = creator;
    } else {
      game.black = joiner;
    }
    this.roomPrefs.delete(game.roomCode);
    game.start();
    this.seatBoth(game);
    return { ok: true };
  }

  /* ------------------------------------------------------------------ */
  /*  Moves & in-game actions                                            */
  /* ------------------------------------------------------------------ */

  applyMove(socket, payload) {
    const game = this.games.get(payload?.gameId);
    const playerId = socket.data.playerId;
    if (!game || !playerId) return { ok: false, error: 'Game not found.' };
    if (!game.hasPlayer(playerId)) return { ok: false, error: 'You are not playing this game.' };

    const result = game.tryMove(playerId, payload);
    if (!result.ok) {
      socket.emit('game:notice', { level: 'warn', text: result.error });
      socket.emit('error', { code: 'move', message: result.error });
      if (result.flagged) this.finishGame(game);
      else socket.emit('game:clock', game.clockSync());
      return result;
    }

    this.emitToGame(game.id, 'game:move', { move: result.move, snapshot: game.snapshot() });
    if (result.gameOver) this.finishGame(game);
    return result;
  }

  resign(socket, gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    const result = game.resign(socket.data.playerId);
    if (result) this.finishGame(game);
  }

  abort(socket, gameId) {
    const game = this.games.get(gameId);
    if (!game || !game.hasPlayer(socket.data.playerId)) return;
    const result = game.moves.length === 0 ? game.abort() : game.resign(socket.data.playerId);
    if (result) this.finishGame(game);
  }

  offerDraw(socket, gameId) {
    const game = this.games.get(gameId);
    if (!game || !game.offerDraw(socket.data.playerId)) return;
    const by = game.drawOfferBy;
    this.emitToGame(game.id, 'game:draw:offer', { by, snapshot: game.snapshot() });
  }

  acceptDraw(socket, gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    if (game.acceptDraw(socket.data.playerId)) this.finishGame(game);
  }

  declineDraw(socket, gameId) {
    const game = this.games.get(gameId);
    if (!game) return;
    const by = game.declineDraw(socket.data.playerId);
    if (!by) return;
    this.emitToGame(game.id, 'game:draw:decline', { by });
    this.emitToGame(game.id, 'game:state', game.snapshot());
  }

  chat(socket, gameId, text) {
    const game = this.games.get(gameId);
    const playerId = socket.data.playerId;
    if (!game || !playerId) return;
    const player = this.store.getPlayer(playerId);
    if (!player) return;
    const body = String(text ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 240);
    if (!body) return;
    const message = {
      id: uid('m_'),
      from: player.id,
      username: player.username,
      color: game.colorOf(player.id) ?? undefined,
      text: body,
      at: Date.now(),
    };
    game.chat.push(message);
    game.chat = game.chat.slice(-120);
    this.emitToGame(game.id, 'game:chat', message);
  }

  /* ------------------------------------------------------------------ */
  /*  Rematch                                                            */
  /* ------------------------------------------------------------------ */

  offerRematch(socket, gameId) {
    const game = this.games.get(gameId);
    if (!game || !game.offerRematch(socket.data.playerId)) return;
    const by = game.rematchOfferBy;
    this.emitToGame(game.id, 'game:rematch:offer', { by });
  }

  acceptRematch(socket, gameId) {
    const game = this.games.get(gameId);
    const playerId = socket.data.playerId;
    if (!game || !playerId || !game.rematchOfferBy || game.rematchOfferBy === game.colorOf(playerId)) return;
    if (!game.white || !game.black) return;

    // Swap colours for the new game.
    const white = game.black;
    const black = game.white;
    const next = this.createGame({
      white,
      black,
      timeControl: game.timeControl,
      rated: game.rated,
      visibility: 'private',
      createdBy: playerId,
    });
    next.start();

    // Drop both sockets from the old room, then seat them in the new game.
    for (const color of ['w', 'b']) {
      const player = game.playerFor(color);
      for (const socketId of this.socketsOf(player.id)) {
        const s = this.io.sockets.sockets.get(socketId);
        if (s) {
          s.leave(this.room(game.id));
          this.socketGames.get(socketId)?.delete(game.id);
        }
      }
    }
    game.rematchOfferBy = null;
    this.seatBoth(next);
  }

  /* ------------------------------------------------------------------ */
  /*  Settling                                                           */
  /* ------------------------------------------------------------------ */

  finishGame(game) {
    if (game._settled) return;
    game._settled = true;

    const snapshot = game.snapshot();
    const result = snapshot.result;
    const isAborted = !result || result.reason === 'aborted';

    let ratings = null;
    if (!isAborted && game.rated && game.white && game.black) {
      const whitePlayer = this.store.getPlayer(game.white.id);
      const blackPlayer = this.store.getPlayer(game.black.id);
      if (whitePlayer && blackPlayer) {
        const scoreWhite = !result.winner ? 0.5 : result.winner === 'w' ? 1 : 0;
        ratings = applyRatings(whitePlayer, blackPlayer, scoreWhite);
      }
    }

    if (isAborted) this.store.archiveOnly(game);
    else this.store.recordResult(game, ratings);

    this.clearGrace(game.id, 'w');
    this.clearGrace(game.id, 'b');

    const finalSnapshot = game.snapshot();
    this.emitToGame(game.id, 'game:over', {
      result: finalSnapshot.result,
      snapshot: finalSnapshot,
      ratings,
      reviewUrl: `/review/${game.id}`,
    });
    void snapshot;
  }

  /* ------------------------------------------------------------------ */
  /*  Clock sweeper                                                      */
  /* ------------------------------------------------------------------ */

  startSweeper() {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  stopSweeper() {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
  }

  sweep() {
    const now = Date.now();
    for (const game of [...this.games.values()]) {
      // Expire stale waiting rooms.
      if (game.status === 'waiting') {
        if (now - game.createdAt > WAITING_ROOM_TTL_MS) {
          game.finish({ winner: null, reason: 'aborted' });
          this.rooms.delete(game.roomCode);
          this.games.delete(game.id);
        }
        continue;
      }

      if (game.status === 'active') {
        const active = game.turn;
        if (game.clockRemaining(active, now) <= 0) {
          game.flag(active);
          this.finishGame(game);
          continue;
        }
        if (now - game.lastClockEmit >= CLOCK_EMIT_INTERVAL_MS) {
          game.lastClockEmit = now;
          this.emitToGame(game.id, 'game:clock', game.clockSync());
        }
        continue;
      }

      // Finished games are kept briefly so `game:resume` and `/api/games/:id`
      // work right after the result, then released from memory.
      if (game.status === 'finished' && game.finishedAt && now - game.finishedAt > FINISHED_TTL_MS) {
        this.rooms.delete(game.roomCode);
        this.games.delete(game.id);
      }
    }

    // Keep searching players' widening windows fresh on the client.
    for (const entry of this.matchmaking.all()) {
      this.emitQueueStatus(entry.playerId, entry.request);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Misc                                                               */
  /* ------------------------------------------------------------------ */

  resume(playerId, gameId) {
    const game = this.games.get(gameId);
    if (!game) return null;
    game.lastActivity = Date.now();
    return game.snapshot();
  }

  joinAsSpectator(socket, roomCode) {
    const game = this.findRoom(roomCode);
    if (!game) return;
    socket.join(this.room(game.id));
    this.socketGames.get(socket.id)?.add(game.id);
    socket.emit('game:state', game.snapshot());
  }

  buildJoinUrl(socket, roomCode) {
    const base =
      this.publicUrl ||
      socket.handshake?.headers?.origin ||
      `http://localhost:${process.env.PORT ?? 3000}`;
    return `${String(base).replace(/\/$/, '')}/?room=${encodeURIComponent(roomCode)}`;
  }

  sanitiseUsername(name) {
    return cleanUsername(name, `Player${Math.floor(Math.random() * 9000 + 1000)}`);
  }
}

export { RECONNECT_GRACE_MS, queueKey, opposite };
