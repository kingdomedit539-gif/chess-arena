/**
 * Matchmaking queues.
 *
 * One queue per exact time control + rated flag, exactly like chess.com's
 * pools. Within a queue we pair the closest-rated opponent whose rating gap is
 * inside a window that widens the longer you wait (150 Elo + 60/s, capped at
 * 1200) so a quiet pool still finds a game in a reasonable time.
 */

const BASE_RANGE = 150;
const RANGE_GROWTH_PER_SECOND = 60;
const MAX_RANGE = 1200;

export function queueKey(timeControl, rated) {
  return `${timeControl.initial}+${timeControl.increment}|${rated ? 'rated' : 'casual'}`;
}

export class Matchmaking {
  constructor() {
    /** @type {Map<string, Array<{socketId:string, playerId:string, rating:number, request:any, joinedAt:number}>>} */
    this.queues = new Map();
  }

  get(key) {
    let queue = this.queues.get(key);
    if (!queue) {
      queue = [];
      this.queues.set(key, queue);
    }
    return queue;
  }

  /** Adds (or replaces) a player's entry. Returns the queue key. */
  join(entry) {
    this.leave(entry.playerId);
    const key = queueKey(entry.request.timeControl, entry.request.rated);
    this.get(key).push({ ...entry, joinedAt: Date.now() });
    return key;
  }

  /** Removes a player from every queue (players are only ever in one). */
  leave(playerId) {
    for (const [key, queue] of this.queues) {
      const index = queue.findIndex((entry) => entry.playerId === playerId);
      if (index !== -1) {
        const [removed] = queue.splice(index, 1);
        if (queue.length === 0) this.queues.delete(key);
        return { key, entry: removed };
      }
    }
    return null;
  }

  removeSocket(socketId) {
    for (const [key, queue] of this.queues) {
      const index = queue.findIndex((entry) => entry.socketId === socketId);
      if (index !== -1) {
        queue.splice(index, 1);
        if (queue.length === 0) this.queues.delete(key);
        return;
      }
    }
  }

  /** Finds (and removes) the best opponent for `playerId`, or null. */
  takeMatch(playerId, now = Date.now()) {
    for (const [key, queue] of this.queues) {
      const me = queue.find((entry) => entry.playerId === playerId);
      if (!me) continue;
      const range = Math.min(MAX_RANGE, BASE_RANGE + (Math.floor((now - me.joinedAt) / 1000) * RANGE_GROWTH_PER_SECOND));
      let best = null;
      let bestGap = Infinity;
      for (const candidate of queue) {
        if (candidate.playerId === playerId) continue;
        const gap = Math.abs(candidate.rating - me.rating);
        if (gap > range) continue;
        const candidateElapsed = now - candidate.joinedAt;
        const candidateRange = Math.min(
          MAX_RANGE,
          BASE_RANGE + Math.floor(candidateElapsed / 1000) * RANGE_GROWTH_PER_SECOND,
        );
        if (gap > candidateRange) continue;
        if (gap < bestGap) {
          best = candidate;
          bestGap = gap;
        }
      }
      if (!best) return null;
      queue.splice(queue.indexOf(me), 1);
      queue.splice(queue.indexOf(best), 1);
      if (queue.length === 0) this.queues.delete(key);
      return { key, me, opponent: best, range: Math.round(range) };
    }
    return null;
  }

  /** Position + widening window for the "searching…" overlay. */
  status(playerId, timeControl, rated) {
    const key = queueKey(timeControl, rated);
    const queue = this.queues.get(key) ?? [];
    const index = queue.findIndex((entry) => entry.playerId === playerId);
    if (index === -1) return null;
    const entry = queue[index];
    const elapsed = Date.now() - entry.joinedAt;
    return {
      position: index + 1,
      range: Math.round(Math.min(MAX_RANGE, BASE_RANGE + Math.floor(elapsed / 1000) * RANGE_GROWTH_PER_SECOND)),
      searching: queue.length,
      timeControl,
      elapsed,
    };
  }

  /** Every entry currently waiting (used by the 200 ms sweeper). */
  all() {
    return [...this.queues.values()].flat();
  }
}

export { BASE_RANGE, MAX_RANGE };
