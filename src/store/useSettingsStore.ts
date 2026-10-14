'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BoardThemeId, PieceSetId } from '@/lib/chess/themes';
import { DEFAULT_BOARD_THEME, DEFAULT_PIECE_SET } from '@/lib/chess/themes';

export interface SettingsState {
  /* Board */
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  /** Which side the board is drawn from: 'auto' follows your colour. */
  boardOrientation: 'auto' | 'white' | 'black';
  showCoordinates: boolean;
  showLegalMoves: boolean;
  animatePieces: boolean;
  animationMs: number;
  highlightLastMove: boolean;
  showEvalBar: boolean;
  /** Number of engine candidate lines rendered as arrows in practice mode. */
  multiPv: number;
  /** Review search depth (higher = slower + stronger). */
  reviewDepth: number;
  autoQueen: boolean;

  /* Audio */
  soundEnabled: boolean;
  volume: number;
  /** Tick + urgency sounds when a clock drops under 10 seconds. */
  lowTimeWarning: boolean;

  /* Interface */
  confirmResign: boolean;
  chatEnabled: boolean;
  /** Auto-offer a rematch when the game ends. */
  preferRematch: boolean;
  showMoveList: boolean;

  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void;
  reset(): void;
}

const DEFAULTS = {
  boardTheme: DEFAULT_BOARD_THEME,
  pieceSet: DEFAULT_PIECE_SET,
  boardOrientation: 'auto' as const,
  showCoordinates: true,
  showLegalMoves: true,
  animatePieces: true,
  animationMs: 170,
  highlightLastMove: true,
  showEvalBar: true,
  multiPv: 3,
  reviewDepth: 14,
  autoQueen: false,
  soundEnabled: true,
  volume: 0.7,
  lowTimeWarning: true,
  confirmResign: true,
  chatEnabled: true,
  preferRematch: false,
  showMoveList: true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'chess-arena:settings',
      version: 1,
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([key]) => key !== 'set' && key !== 'reset'),
        ) as SettingsState,
    },
  ),
);

export const DEFAULT_SETTINGS = DEFAULTS;
