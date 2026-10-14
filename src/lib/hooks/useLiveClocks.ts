'use client';

import { useEffect, useState } from 'react';
import type { Color, GameStatus } from '@/lib/types';
import { clockSync } from '@/lib/socket';

export interface LiveClocks {
  white: number;
  black: number;
  /** Which clock is currently draining, null when the game is not active. */
  active: Color | null;
  /** True when the server is authoritative but we are interpolating locally. */
  interpolating: boolean;
}

/**
 * Client-side clock interpolation.
 *
 * The server is authoritative and pushes a `game:clock` tick every second; in
 * between ticks we extrapolate from the last snapshot using the smoothed server
 * clock offset. That keeps the display smooth and within a frame of the server
 * without spamming the socket.
 */
export function useLiveClocks(input: {
  whiteTime: number;
  blackTime: number;
  turn: Color;
  status: GameStatus;
  serverTime: number;
}): LiveClocks {
  const { whiteTime, blackTime, turn, status, serverTime } = input;
  const [, force] = useState(0);

  useEffect(() => {
    if (status !== 'active') return;
    const id = window.setInterval(() => force((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, [status, serverTime, turn]);

  if (status !== 'active') {
    return { white: whiteTime, black: blackTime, active: null, interpolating: false };
  }

  const elapsed = Math.max(0, clockSync.now() - serverTime);
  const active: Color = turn;
  return {
    white: active === 'w' ? Math.max(0, whiteTime - elapsed) : whiteTime,
    black: active === 'b' ? Math.max(0, blackTime - elapsed) : blackTime,
    active,
    interpolating: true,
  };
}

/** Ticks once per second so UIs can show elapsed searching time etc. */
export function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return;
    const id = window.setInterval(callback, delay);
    return () => window.clearInterval(id);
  }, [callback, delay]);
}
