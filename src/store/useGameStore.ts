'use client';

import { create } from 'zustand';
import type {
  ChatMessage,
  ClockSync,
  Color,
  EngineLine,
  GamePhase,
  GameResult,
  GameSnapshot,
  MoveRecord,
  QueueStatus,
  RatingSnapshot,
} from '@/lib/types';

export interface EndSummary {
  result: GameResult;
  ratings: { white: RatingSnapshot; black: RatingSnapshot } | null;
  reviewUrl: string;
}

export interface LiveEval {
  cpWhite: number;
  mateWhite: number | null;
  depth: number;
  /** True while the engine is still refining the value. */
  thinking: boolean;
  /** Top engine lines, used to draw best-move arrows. */
  lines: EngineLine[];
}

interface GameStoreState {
  /* session */
  connected: boolean;
  phase: GamePhase;
  myColor: Color | null;
  player: { id: string; username: string; rating: number } | null;

  /* matchmaking */
  queue: QueueStatus | null;
  searchingSince: number | null;
  timeControlDraft: { initial: number; increment: number; rated: boolean };
  roomCode: string | null;

  /* live game */
  snapshot: GameSnapshot | null;
  lastMove: MoveRecord | null;
  /** Set when the opponent's clock is the one counting down. */
  activeClock: Color | null;
  clockDrift: number;
  messages: ChatMessage[];
  end: EndSummary | null;
  notice: { level: 'info' | 'warn' | 'error'; text: string; at: number } | null;
  opponentOnline: boolean;
  graceMsLeft: number;
  /** client-side pre-move while waiting for the server round trip */
  pendingMove: { from: string; to: string } | null;

  /* analysis */
  liveEval: LiveEval | null;

  /* actions */
  setConnected(connected: boolean): void;
  setPlayer(player: GameStoreState['player']): void;
  setPhase(phase: GamePhase): void;
  setQueue(queue: QueueStatus | null): void;
  setTimeControlDraft(tc: Partial<GameStoreState['timeControlDraft']>): void;
  setRoomCode(code: string | null): void;
  startGame(snapshot: GameSnapshot, color: Color): void;
  setSnapshot(snapshot: GameSnapshot): void;
  applyMove(move: MoveRecord, snapshot: GameSnapshot): void;
  applyClock(sync: ClockSync): void;
  setMessages(messages: ChatMessage[]): void;
  pushMessage(message: ChatMessage): void;
  setEnd(end: EndSummary | null): void;
  setNotice(notice: GameStoreState['notice']): void;
  setPresence(color: Color, online: boolean, graceMsLeft: number): void;
  setPendingMove(move: GameStoreState['pendingMove']): void;
  setLiveEval(evalState: LiveEval | null): void;
  clearGame(): void;
  reset(): void;
}

const DRAFT_KEY = 'chess-arena:last-time-control';

export const useGameStore = create<GameStoreState>()((set, get) => ({
  connected: false,
  phase: 'LOBBY',
  myColor: null,
  player: null,

  queue: null,
  searchingSince: null,
  timeControlDraft: { initial: 300, increment: 0, rated: true },
  roomCode: null,

  snapshot: null,
  lastMove: null,
  activeClock: null,
  clockDrift: 0,
  messages: [],
  end: null,
  notice: null,
  opponentOnline: true,
  graceMsLeft: 0,
  pendingMove: null,

  liveEval: null,

  setConnected: (connected) => set({ connected }),
  setPlayer: (player) => set({ player }),
  setPhase: (phase) => set({ phase }),
  setQueue: (queue) => set({ queue, searchingSince: queue ? get().searchingSince ?? Date.now() : null }),
  setTimeControlDraft: (tc) => set({ timeControlDraft: { ...get().timeControlDraft, ...tc } }),
  setRoomCode: (roomCode) => set({ roomCode }),

  startGame: (snapshot, color) =>
    set({
      snapshot,
      myColor: color,
      phase: 'IN_GAME',
      queue: null,
      searchingSince: null,
      end: null,
      messages: [],
      lastMove: snapshot.lastMove ? (snapshot.moves.at(-1) ?? null) : null,
      activeClock: snapshot.status === 'active' ? snapshot.turn : null,
      liveEval: null,
      pendingMove: null,
      opponentOnline: true,
      graceMsLeft: 0,
    }),

  setSnapshot: (snapshot) =>
    set((state) => ({
      snapshot,
      lastMove: snapshot.moves.at(-1) ?? state.lastMove,
      activeClock: snapshot.status === 'active' ? snapshot.turn : null,
      phase: snapshot.status === 'finished' ? 'POST_GAME_REVIEW' : 'IN_GAME',
    })),

  applyMove: (move, snapshot) =>
    set({
      snapshot,
      lastMove: move,
      activeClock: snapshot.turn,
      pendingMove: null,
    }),

  applyClock: (sync) =>
    set((state) => ({
      clockDrift: sync.serverTime,
      activeClock: sync.status === 'active' ? sync.turn : null,
      snapshot: state.snapshot
        ? {
            ...state.snapshot,
            whiteTime: sync.whiteTime,
            blackTime: sync.blackTime,
            turn: sync.turn,
            serverTime: sync.serverTime,
            status: sync.status,
          }
        : null,
    })),

  setMessages: (messages) => set({ messages }),
  pushMessage: (message) => set((state) => ({ messages: [...state.messages.slice(-199), message] })),
  setEnd: (end) => set({ end, phase: end ? 'POST_GAME_REVIEW' : get().phase }),
  setNotice: (notice) => set({ notice }),
  setPresence: (color, online, graceMsLeft) => set({ opponentOnline: online, graceMsLeft }),
  setPendingMove: (pendingMove) => set({ pendingMove }),
  setLiveEval: (liveEval) => set({ liveEval }),

  clearGame: () =>
    set({
      snapshot: null,
      myColor: null,
      lastMove: null,
      activeClock: null,
      messages: [],
      end: null,
      liveEval: null,
      pendingMove: null,
      opponentOnline: true,
      graceMsLeft: 0,
      roomCode: null,
    }),

  reset: () =>
    set({
      phase: 'LOBBY',
      myColor: null,
      queue: null,
      searchingSince: null,
      roomCode: null,
      snapshot: null,
      lastMove: null,
      activeClock: null,
      messages: [],
      end: null,
      notice: null,
      liveEval: null,
      pendingMove: null,
    }),
}));

/* -------------------------------------------------------------------------- */
/*  Persisted time control preference                                          */
/* -------------------------------------------------------------------------- */

export function loadDraftTimeControl() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameStoreState['timeControlDraft'];
    if (typeof parsed?.initial !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraftTimeControl(tc: GameStoreState['timeControlDraft']) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(tc));
  } catch {
    /* ignore */
  }
}
