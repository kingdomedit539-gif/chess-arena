'use client';

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/**
 * Single socket per browser tab. `reconnectionAttempts: Infinity` plus the
 * server-side 30s grace window is what makes mid-game reconnects seamless.
 */
export function getSocket(): GameSocket {
  if (socket) return socket;
  // Defaults to the same origin (the combined Node server). Set
  // NEXT_PUBLIC_SOCKET_URL to point at a separate realtime host — e.g. a
  // Vercel frontend talking to a Render socket.io service.
  const override = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  const url =
    override && override.length > 0
      ? override
      : typeof window === 'undefined'
        ? undefined
        : window.location.origin;
  socket = io(url, {
    path: '/socket.io',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
    reconnectionAttempts: Infinity,
    timeout: 12000,
  }) as GameSocket;
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/* -------------------------------------------------------------------------- */
/*  Server clock synchronisation                                               */
/* -------------------------------------------------------------------------- */

/**
 * The server owns the clocks. Every snapshot/tick carries `serverTime`, which we
 * turn into an offset against the local clock. Offsets are smoothed (exponential
 * moving average) so a single laggy packet cannot make the clock jump.
 */
class ClockSync {
  private offset = 0;
  private samples = 0;
  private rtt = 0;

  sync(serverTime: number) {
    const sample = serverTime - Date.now();
    if (this.samples === 0) {
      this.offset = sample;
    } else {
      // Ignore wild outliers (>2s) that usually mean a tab wake-up.
      if (Math.abs(sample - this.offset) > 2000) {
        this.offset = sample;
      } else {
        this.offset = this.offset * 0.8 + sample * 0.2;
      }
    }
    this.samples += 1;
  }

  /** Best estimate of the current server timestamp. */
  now(): number {
    return Date.now() + this.offset;
  }

  get drift(): number {
    return this.offset;
  }

  get latency(): number {
    return this.rtt;
  }

  setLatency(rtt: number) {
    this.rtt = rtt;
  }
}

export const clockSync = new ClockSync();
