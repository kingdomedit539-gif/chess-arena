import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Color, PieceSymbol, Square, TimeControl } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* -------------------------------------------------------------------------- */
/*  Squares                                                                    */
/* -------------------------------------------------------------------------- */

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export interface SquareCoord {
  file: number; // 0 = a
  rank: number; // 0 = rank 1
}

export function squareToCoord(square: Square): SquareCoord {
  return { file: FILES.indexOf(square[0] as (typeof FILES)[number]), rank: RANKS.indexOf(square[1] as (typeof RANKS)[number]) };
}

export function coordToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${RANKS[rank]}`;
}

export function isLightSquare(square: Square): boolean {
  const { file, rank } = squareToCoord(square);
  return (file + rank) % 2 === 1;
}

export function squaresFromUci(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PieceSymbol) || undefined,
  };
}

/** Finds the king square for `color` from a FEN string (used for check highlight). */
export function kingSquare(fen: string, color: Color): Square | null {
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    const rank = 8 - r;
    const row = rows[r] ?? '';
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      if (ch === (color === 'w' ? 'K' : 'k')) return coordToSquare(file, rank - 1);
      file += 1;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Pieces & material                                                          */
/* -------------------------------------------------------------------------- */

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

/** Material balance (white minus black) after removing the starting army. */
export function materialBalance(capturedByWhite: PieceSymbol[], capturedByBlack: PieceSymbol[]): number {
  const w = capturedByWhite.reduce((sum, p) => sum + PIECE_VALUES[p], 0);
  const b = capturedByBlack.reduce((sum, p) => sum + PIECE_VALUES[p], 0);
  return w - b;
}

/* -------------------------------------------------------------------------- */
/*  Time formatting                                                            */
/* -------------------------------------------------------------------------- */

/** Chess.com-style clock: 5:00, 0:09, 9.4 (below 10s), 0:00.1 */
export function formatClock(ms: number, opts: { forceTenths?: boolean } = {}): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = clamped / 1000;
  if (clamped < 10_000 || opts.forceTenths) {
    if (clamped >= 60_000) {
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds - m * 60;
      return `${m}:${s.toFixed(1).padStart(4, '0')}`;
    }
    return (Math.floor(clamped / 100) / 10).toFixed(1);
  }
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTimeControl(tc: TimeControl): string {
  return tc.increment > 0 ? `${tc.initial}+${tc.increment}` : `${tc.initial}+0`;
}

export function describeTimeControl(tc: TimeControl): string {
  const total = tc.initial;
  if (total < 3) return 'Bullet';
  if (total < 10) return 'Blitz';
  if (total < 30) return 'Rapid';
  return 'Classical';
}

/** Estimated game duration in minutes (used by the lobby UI). */
export function estimatedDuration(tc: TimeControl): string {
  const mins = (tc.initial + tc.increment * 40) / 60;
  return `${Math.max(1, Math.round(mins))} min`;
}

/* -------------------------------------------------------------------------- */
/*  Misc                                                                       */
/* -------------------------------------------------------------------------- */

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${rnd}`;
}

/** Short human share code: ABC-XYZ (no ambiguous characters). */
export function randomRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pluralize(n: number, word: string, plural = `${word}s`): string {
  return `${n} ${n === 1 ? word : plural}`;
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Deterministic pastel gradient from a seed — used for generated avatars. */
export function avatarGradient(seed: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  const h1 = hash;
  const h2 = (hash + 47) % 360;
  return [`hsl(${h1} 58% 46%)`, `hsl(${h2} 62% 34%)`];
}

export function initials(name: string): string {
  const clean = name.trim().replace(/[^\w\s]/g, '');
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const opposite = (color: Color): Color => (color === 'w' ? 'b' : 'w');

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry helper with exponential backoff (used by the engine loader). */
export async function withTimeout<T>(promise: Promise<T>, ms: number, message = 'Timed out'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
