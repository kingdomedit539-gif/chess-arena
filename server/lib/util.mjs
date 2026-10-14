/**
 * Tiny helpers shared by the server modules.
 * Kept dependency-free so the realtime server has no runtime deps of its own
 * beyond `socket.io` and `chess.js`.
 */

export function uid(prefix = '') {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${rnd}`;
}

/** Short human share code: ABC-XYZ (no ambiguous characters). */
export function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${out.slice(0, 3)}-${out.slice(3)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const opposite = (color) => (color === 'w' ? 'b' : 'w');

/** Sanitises an untrusted time control from the wire. */
export function normaliseTimeControl(input) {
  const initial = clamp(Math.round(Number(input?.initial) || 300), 10, 3600);
  const increment = clamp(Math.round(Number(input?.increment) || 0), 0, 120);
  return { initial, increment };
}

/** Strips control characters and clamps a display name. */
export function cleanUsername(name, fallback) {
  const value = String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 20);
  return value.length >= 2 ? value : fallback;
}

export function cleanId(id) {
  const value = String(id ?? '').trim().slice(0, 64);
  return /^[\w-]{6,64}$/.test(value) ? value : null;
}
