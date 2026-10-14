'use client';

import { useEffect, useState } from 'react';
import { getLiveEngine } from '@/lib/engine/StockfishEngine';
import { toEngineLines } from '@/lib/engine/analysis';
import type { EngineLine } from '@/lib/types';
import { useGameStore } from '@/store/useGameStore';

export interface LiveEvalResult {
  cpWhite: number;
  mateWhite: number | null;
  depth: number;
  thinking: boolean;
  lines: EngineLine[];
  available: boolean;
  error: string | null;
}

const IDLE: LiveEvalResult = {
  cpWhite: 0,
  mateWhite: null,
  depth: 0,
  thinking: false,
  lines: [],
  available: true,
  error: null,
};

export interface LiveEvalOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
  /** Debounce before searching (keeps fast steppers responsive). */
  debounceMs?: number;
}

/**
 * Streams a continuous engine evaluation for the given position.
 *
 * Uses the shared "live" engine instance, which cancels its previous search on
 * each new request — exactly what we want when the user steps through moves or
 * plays on the board.
 */
export function useLiveEval(fen: string | null, enabled: boolean, options: LiveEvalOptions = {}): LiveEvalResult {
  const { depth = 22, movetime = 800, multipv = 1, debounceMs = 90 } = options;
  const [result, setResult] = useState<LiveEvalResult>(IDLE);
  const setLiveEval = useGameStore((s) => s.setLiveEval);

  useEffect(() => {
    if (!enabled || !fen) {
      setResult(IDLE);
      setLiveEval(null);
      return;
    }
    let cancelled = false;
    const engine = getLiveEngine();
    const timer = window.setTimeout(() => {
      void engine
        .analyse(fen, {
          depth,
          movetime,
          multipv,
          onUpdate: (evaluation) => {
            if (cancelled) return;
            const lines = toEngineLines(evaluation, fen, multipv);
            setResult({
              cpWhite: evaluation.cpWhite,
              mateWhite: evaluation.mateWhite,
              depth: evaluation.depth,
              thinking: true,
              lines,
              available: true,
              error: null,
            });
          },
        })
        .then((evaluation) => {
          if (cancelled) return;
          const lines = toEngineLines(evaluation, fen, multipv);
          const next: LiveEvalResult = {
            cpWhite: evaluation.cpWhite,
            mateWhite: evaluation.mateWhite,
            depth: evaluation.depth,
            thinking: false,
            lines,
            available: true,
            error: null,
          };
          setResult(next);
          setLiveEval({ ...next, lines });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setResult({ ...IDLE, available: false, error: (error as Error).message });
          setLiveEval(null);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      engine.interrupt();
    };
  }, [fen, enabled, depth, movetime, multipv, debounceMs, setLiveEval]);

  return result;
}
