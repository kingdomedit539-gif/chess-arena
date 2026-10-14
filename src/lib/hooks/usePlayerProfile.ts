'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlayerProfile } from '@/lib/types';

/**
 * Thin fetch hook for the small REST surface the realtime server exposes
 * (`GET /api/players/:id`). Returns `null` until the first successful load.
 */
export function usePlayerProfile(playerId: string | undefined, refreshKey = 0) {
  const [data, setData] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/players/${encodeURIComponent(playerId)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PlayerProfile);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [playerId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { data, loading, error, reload: load };
}

export function useLeaderboard(limit = 25, refreshKey = 0) {
  const [entries, setEntries] = useState<PlayerProfile['player'][]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leaderboard?limit=${limit}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((json: { entries: PlayerProfile['player'][] }) => {
        if (!cancelled) setEntries(json.entries ?? []);
      })
      .catch(() => undefined)
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [limit, refreshKey]);

  return { entries, loading };
}
