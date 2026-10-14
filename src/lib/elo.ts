/**
 * Elo rating maths.
 *
 * Mirrored in `server/lib/elo.mjs` — the server is the single source of truth
 * (it owns both ratings); this copy is used for previews/UI only. Keep the
 * formulas in sync.
 */

export const PROVISIONAL_GAMES = 10;

/** Logistic expected score for `rating` against `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Dynamic K-factor: high while provisional, lower for established players. */
export function kFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < PROVISIONAL_GAMES) return 40;
  if (gamesPlayed < 30) return 32;
  if (gamesPlayed < 100 || rating < 2100) return 24;
  if (rating < 2400) return 16;
  return 12;
}

export interface EloDeltaInput {
  rating: number;
  opponentRating: number;
  /** 1 win, 0.5 draw, 0 loss. */
  score: number;
  gamesPlayed: number;
}

export function eloDelta({ rating, opponentRating, score, gamesPlayed }: EloDeltaInput): number {
  const k = kFactor(rating, gamesPlayed);
  return Math.round(k * (score - expectedScore(rating, opponentRating)));
}

export interface RatingBand {
  label: string;
  color: string;
}

export function ratingBand(rating: number): RatingBand {
  if (rating < 800) return { label: 'Beginner', color: '#a8a49e' };
  if (rating < 1200) return { label: 'Novice', color: '#8dbf5f' };
  if (rating < 1600) return { label: 'Intermediate', color: '#81b64c' };
  if (rating < 2000) return { label: 'Advanced', color: '#4a90d9' };
  if (rating < 2400) return { label: 'Expert', color: '#a06cd5' };
  if (rating < 2700) return { label: 'Master', color: '#e58f2a' };
  return { label: 'Grandmaster', color: '#ca3431' };
}

export const STARTING_RATING = 1200;
