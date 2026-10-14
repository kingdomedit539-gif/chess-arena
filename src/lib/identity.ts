'use client';

/**
 * Local player identity. A minimal device-scoped identity keeps the demo
 * self-contained (no auth provider); the same `id` is what the server keys
 * ratings on and what makes reconnects stick.
 */

import { uid } from './utils';

const ID_KEY = 'chess-arena:user-id';
const NAME_KEY = 'chess-arena:username';

const ADJECTIVES = [
  'Swift', 'Sharp', 'Silent', 'Clever', 'Bold', 'Calm', 'Rapid', 'Royal', 'Iron', 'Cosmic',
  'Frost', 'Golden', 'Wild', 'Quiet', 'Tactical', 'Blazing', 'Noble', 'Atomic',
];

const NOUNS = [
  'Knight', 'Rook', 'Bishop', 'Queen', 'Pawn', 'Gambit', 'Fork', 'Pin', 'Skewer', 'Castle',
  'Endgame', 'Tempo', 'Zugzwang', 'Promotion', 'Fianchetto', 'Sicilian', 'Blitz',
];

export interface Identity {
  id: string;
  username: string;
}

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a}${n}${Math.floor(Math.random() * 900 + 100)}`;
}

function safeGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage disabled — identity becomes per-session */
  }
}

export function getIdentity(): Identity {
  let id = safeGet(ID_KEY);
  if (!id) {
    id = uid('u_');
    safeSet(ID_KEY, id);
  }
  let username = safeGet(NAME_KEY);
  if (!username) {
    username = randomName();
    safeSet(NAME_KEY, username);
  }
  return { id, username };
}

export function setUsername(username: string) {
  const clean = username.trim().slice(0, 20) || randomName();
  safeSet(NAME_KEY, clean);
  return clean;
}

export function suggestUsername(): string {
  return randomName();
}
