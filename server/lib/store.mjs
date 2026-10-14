/**
 * Player + game persistence.
 *
 * In-memory Maps are the source of truth (fast, zero-config) and are mirrored to
 * JSON files under `data/` on a debounce so ratings survive a restart. If the
 * Supabase env vars are present, `supabase/schema.sql` documents the equivalent
 * SQL schema for a hosted Postgres — swap `persist()` for a Supabase client to
 * go multi-instance without touching the rest of the server.
 */

import fs from 'node:fs';
import path from 'node:path';
import { STARTING_RATING } from './elo.mjs';
import { clamp, uid } from './util.mjs';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');

const MAX_ARCHIVED_GAMES = 400;
const RECENT_GAMES_PER_PLAYER = 20;

/** @typedef {ReturnType<typeof makePlayer>} PlayerRecord */

function makePlayer(id, username) {
  return {
    id,
    username,
    avatarSeed: id,
    rating: STARTING_RATING,
    bestRating: STARTING_RATING,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: { type: 'none', count: 0 },
    recent: [],
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
}

class Store {
  constructor() {
    /** @type {Map<string, PlayerRecord>} */
    this.players = new Map();
    /** @type {Map<string, {snapshot:any,ratings:any,finishedAt:number}>} */
    this.archivedGames = new Map();
    /** @type {Set<string>} */
    this.online = new Set();
    this.saveTimer = null;
    this.load();
  }

  /* ------------------------------------------------------------------ */
  /*  Persistence                                                        */
  /* ------------------------------------------------------------------ */

  load() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      /* read-only filesystem → stay in memory */
    }
    try {
      const players = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf8'));
      for (const player of players) {
        if (player?.id) this.players.set(player.id, { ...makePlayer(player.id, player.username ?? 'Player'), ...player });
      }
    } catch {
      /* first run */
    }
    try {
      const games = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8'));
      for (const entry of games) {
        if (entry?.snapshot?.id) this.archivedGames.set(entry.snapshot.id, entry);
      }
    } catch {
      /* first run */
    }
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persist();
    }, 1500);
    if (typeof this.saveTimer.unref === 'function') this.saveTimer.unref();
  }

  persist() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PLAYERS_FILE, JSON.stringify([...this.players.values()], null, 2));
      fs.writeFileSync(
        GAMES_FILE,
        JSON.stringify([...this.archivedGames.values()].slice(-MAX_ARCHIVED_GAMES), null, 2),
      );
    } catch (error) {
      console.warn('[store] could not persist to disk:', error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Players                                                            */
  /* ------------------------------------------------------------------ */

  /** Reserves a unique display name (appends a suffix when taken). */
  uniqueUsername(name, exceptId) {
    const taken = new Set(
      [...this.players.values()].filter((p) => p.id !== exceptId).map((p) => p.username.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const candidate = `${name.slice(0, 17)}_${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 14)}_${uid('').slice(0, 4)}`;
  }

  getPlayer(id) {
    return id ? this.players.get(id) ?? null : null;
  }

  /** Idempotent create-or-load used by `user:hello`. */
  ensurePlayer(id, username) {
    let player = this.players.get(id);
    if (!player) {
      player = makePlayer(id, this.uniqueUsername(username, id));
      this.players.set(id, player);
      this.scheduleSave();
    } else if (username && username !== player.username) {
      player.username = this.uniqueUsername(username, id);
      this.scheduleSave();
    }
    player.lastSeen = Date.now();
    return player;
  }

  rename(id, username) {
    const player = this.players.get(id);
    if (!player) return null;
    player.username = this.uniqueUsername(username, id);
    player.avatarSeed = player.id;
    this.scheduleSave();
    return player;
  }

  setOnline(id, online) {
    if (online) this.online.add(id);
    else this.online.delete(id);
  }

  isOnline(id) {
    return this.online.has(id);
  }

  toPublic(player) {
    return {
      id: player.id,
      username: player.username,
      rating: player.rating,
      avatarSeed: player.avatarSeed ?? player.id,
      online: this.online.has(player.id),
    };
  }

  toLeaderboardEntry(player) {
    return {
      id: player.id,
      username: player.username,
      rating: player.rating,
      games: player.games,
      wins: player.wins,
      losses: player.losses,
      draws: player.draws,
      avatarSeed: player.avatarSeed ?? player.id,
    };
  }

  profile(id) {
    const player = this.players.get(id);
    if (!player) return null;
    return {
      player: this.toLeaderboardEntry(player),
      recent: player.recent.slice(0, RECENT_GAMES_PER_PLAYER),
      streak: player.streak,
      bestRating: player.bestRating,
    };
  }

  leaderboard(limit = 25) {
    const size = clamp(Math.round(Number(limit) || 25), 1, 200);
    return [...this.players.values()]
      .filter((player) => player.games > 0)
      .sort((a, b) => b.rating - a.rating || b.games - a.games || a.username.localeCompare(b.username))
      .slice(0, size)
      .map((player) => this.toLeaderboardEntry(player));
  }

  /* ------------------------------------------------------------------ */
  /*  Results                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Records a finished game: updates both players' stats, appends a summary to
   * each player's recent list and archives the full snapshot for review.
   */
  recordResult(game, ratings, finishedAt = Date.now()) {
    const snapshot = game.snapshot();
    const archive = { snapshot, ratings: ratings ?? null, finishedAt };
    this.archivedGames.set(snapshot.id, archive);
    while (this.archivedGames.size > MAX_ARCHIVED_GAMES) {
      const oldest = this.archivedGames.keys().next().value;
      this.archivedGames.delete(oldest);
    }

    for (const color of ['w', 'b']) {
      const player = this.players.get(color === 'w' ? snapshot.white.id : snapshot.black.id);
      if (!player || player.recent.some((entry) => entry.id === snapshot.id)) continue;
      const opponentPublic = color === 'w' ? snapshot.black : snapshot.white;
      const outcome = !snapshot.result?.winner ? 'draw' : snapshot.result.winner === color ? 'win' : 'loss';
      const ratingPart = ratings ? ratings[color] : null;

      player.games += 1;
      if (outcome === 'win') player.wins += 1;
      else if (outcome === 'loss') player.losses += 1;
      else player.draws += 1;

      if (ratingPart) player.rating = ratingPart.after;
      if (player.rating > player.bestRating) player.bestRating = player.rating;

      if (outcome === 'draw') player.streak = { type: 'draw', count: 1 };
      else if (player.streak.type === outcome) player.streak = { type: outcome, count: player.streak.count + 1 };
      else player.streak = { type: outcome, count: 1 };

      player.recent.unshift({
        id: snapshot.id,
        outcome,
        color,
        reason: snapshot.result?.reason ?? 'abandoned',
        result: snapshot.result ?? { winner: null, reason: 'abandoned' },
        opponent: opponentPublic
          ? { id: opponentPublic.id, username: opponentPublic.username, rating: opponentPublic.rating }
          : null,
        ratingDelta: ratingPart ? ratingPart.delta : 0,
        ratingAfter: player.rating,
        rated: snapshot.rated,
        timeControl: snapshot.timeControl,
        moves: Math.ceil(snapshot.moves.length / 2),
        playedAt: finishedAt,
      });
      player.recent = player.recent.slice(0, RECENT_GAMES_PER_PLAYER);
    }

    this.scheduleSave();
    return archive;
  }

  /** Archives a game without touching player stats (aborted games). */
  archiveOnly(game, finishedAt = Date.now()) {
    const snapshot = game.snapshot();
    this.archivedGames.set(snapshot.id, { snapshot, ratings: null, finishedAt });
    while (this.archivedGames.size > MAX_ARCHIVED_GAMES) {
      const oldest = this.archivedGames.keys().next().value;
      this.archivedGames.delete(oldest);
    }
    this.scheduleSave();
    return this.archivedGames.get(snapshot.id);
  }

  getArchivedGame(id) {
    return this.archivedGames.get(id) ?? null;
  }

  /** Used by the REST layer to advertise how much history is kept. */
  stats() {
    return {
      players: this.players.size,
      archivedGames: this.archivedGames.size,
      online: this.online.size,
    };
  }
}

export const store = new Store();
export { STARTING_RATING };
