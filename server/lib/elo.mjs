/**
 * Elo rating maths. Mirrors `src/lib/elo.ts` — the server is the single source
 * of truth (it owns both ratings); the client copy is for previews only.
 */

export const PROVISIONAL_GAMES = 10;
export const STARTING_RATING = 1200;

/** Logistic expected score for `rating` against `opponent`. */
export function expectedScore(rating, opponent) {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Dynamic K-factor: high while provisional, lower for established players. */
export function kFactor(rating, gamesPlayed) {
  if (gamesPlayed < PROVISIONAL_GAMES) return 40;
  if (gamesPlayed < 30) return 32;
  if (gamesPlayed < 100 || rating < 2100) return 24;
  if (rating < 2400) return 16;
  return 12;
}

export function eloDelta({ rating, opponentRating, score, gamesPlayed }) {
  const k = kFactor(rating, gamesPlayed);
  return Math.round(k * (score - expectedScore(rating, opponentRating)));
}

/**
 * Applies a result to both players.
 * @param {{rating:number,games:number}} whitePlayer
 * @param {{rating:number,games:number}} blackPlayer
 * @param {number} scoreWhite 1 = white wins, 0 = black wins, 0.5 = draw
 */
export function applyRatings(whitePlayer, blackPlayer, scoreWhite) {
  const rawWhite = eloDelta({
    rating: whitePlayer.rating,
    opponentRating: blackPlayer.rating,
    score: scoreWhite,
    gamesPlayed: whitePlayer.games,
  });
  const rawBlack = eloDelta({
    rating: blackPlayer.rating,
    opponentRating: whitePlayer.rating,
    score: 1 - scoreWhite,
    gamesPlayed: blackPlayer.games,
  });

  // Opposite results always round to mirror values, but keep the sum balanced
  // for draws so the pool does not drift.
  let whiteDelta = rawWhite;
  let blackDelta = rawBlack;
  if (scoreWhite === 0.5) {
    const balanced = Math.round((rawWhite - rawBlack) / 2);
    whiteDelta = balanced;
    blackDelta = -balanced;
  }

  const whiteAfter = Math.max(100, whitePlayer.rating + whiteDelta);
  const blackAfter = Math.max(100, blackPlayer.rating + blackDelta);
  // Re-derive the deltas in case the floor kicked in.
  const finalWhiteDelta = whiteAfter - whitePlayer.rating;
  const finalBlackDelta = blackAfter - blackPlayer.rating;

  const whiteGames = whitePlayer.games + 1;
  const blackGames = blackPlayer.games + 1;

  return {
    white: {
      rating: whitePlayer.rating,
      delta: finalWhiteDelta,
      after: whiteAfter,
      provisional: whiteGames < PROVISIONAL_GAMES,
      games: whiteGames,
    },
    black: {
      rating: blackPlayer.rating,
      delta: finalBlackDelta,
      after: blackAfter,
      provisional: blackGames < PROVISIONAL_GAMES,
      games: blackGames,
    },
  };
}

export function ratingBand(rating) {
  if (rating < 800) return { label: 'Beginner', color: '#a8a49e' };
  if (rating < 1200) return { label: 'Novice', color: '#8dbf5f' };
  if (rating < 1600) return { label: 'Intermediate', color: '#81b64c' };
  if (rating < 2000) return { label: 'Advanced', color: '#4a90d9' };
  if (rating < 2400) return { label: 'Expert', color: '#a06cd5' };
  if (rating < 2700) return { label: 'Master', color: '#e58f2a' };
  return { label: 'Grandmaster', color: '#ca3431' };
}
