'use client';

import { Crown, Flame, Medal, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useLeaderboard } from '@/lib/hooks/usePlayerProfile';
import { ratingBand } from '@/lib/elo';
import { avatarGradient, cn, initials, pluralize } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

const LIMITS = [25, 50, 100];

export default function LeaderboardPage() {
  const player = useGameStore((s) => s.player);
  const [limit, setLimit] = useState(25);
  const [refreshKey, setRefreshKey] = useState(0);
  const { entries, loading } = useLeaderboard(limit, refreshKey);

  const myRank = useMemo(() => {
    const index = entries.findIndex((entry) => entry.id === player?.id);
    return index === -1 ? null : index + 1;
  }, [entries, player?.id]);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 lg:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-arena-text">
            <Trophy className="h-6 w-6 text-accent" />
            Leaderboard
          </h1>
          <p className="mt-1 text-sm text-arena-muted">
            The strongest rated humans on this server. Ratings update after every rated game.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {LIMITS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={limit === value ? 'primary' : 'secondary'}
              onClick={() => setLimit(value)}
            >
              Top {value}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)} aria-label="Refresh">
            Refresh
          </Button>
        </div>
      </header>

      {player && myRank === null && (
        <div className="mb-4 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-xs font-semibold text-info">
          You are not in the top {limit} yet — play a rated game to climb.
        </div>
      )}

      <div className="panel overflow-hidden">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_66px_60px_60px] items-center gap-2 border-b border-arena-line/50 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-arena-dim sm:grid-cols-[52px_minmax(0,1fr)_80px_70px_70px_70px]">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Rating</span>
          <span className="hidden text-right sm:block">Games</span>
          <span className="text-right">Wins</span>
          <span className="hidden text-right sm:block">Win %</span>
        </div>

        {loading && entries.length === 0 && (
          <div className="space-y-1 p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-arena-raised/40" />
            ))}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-arena-dim">
            No rated games yet. Be the first name on the board.
          </p>
        )}

        <ol className="divide-y divide-arena-line/30">
          {entries.map((entry, index) => {
            const rank = index + 1;
            const band = ratingBand(entry.rating);
            const [from, to] = avatarGradient(entry.avatarSeed || entry.id);
            const winRate = entry.games > 0 ? Math.round((entry.wins / entry.games) * 100) : 0;
            const isMe = entry.id === player?.id;
            return (
              <li
                key={entry.id}
                className={cn(
                  'grid grid-cols-[44px_minmax(0,1fr)_66px_60px_60px] items-center gap-2 px-3 py-2.5 sm:grid-cols-[52px_minmax(0,1fr)_80px_70px_70px_70px]',
                  isMe && 'bg-accent/10',
                )}
              >
                <span className="flex items-center gap-1 font-mono text-sm font-black tabular-nums text-arena-muted">
                  {rank === 1 ? (
                    <Crown className="h-4 w-4 text-[#e5c122]" />
                  ) : rank === 2 ? (
                    <Medal className="h-4 w-4 text-[#c0c4cc]" />
                  ) : rank === 3 ? (
                    <Medal className="h-4 w-4 text-[#c98a4b]" />
                  ) : (
                    rank
                  )}
                </span>

                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-black text-white/95"
                    style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
                    aria-hidden
                  >
                    {initials(entry.username)}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-bold text-arena-text">{entry.username}</span>
                      {isMe && (
                        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-accent">
                          You
                        </span>
                      )}
                      {entry.wins >= 5 && entry.wins > entry.losses * 2 && (
                        <Flame className="h-3.5 w-3.5 text-warn" aria-label="On a hot streak" />
                      )}
                    </span>
                    <span className="text-[10px] font-semibold" style={{ color: band.color }}>
                      {band.label}
                    </span>
                  </span>
                </span>

                <span className="text-right font-mono text-sm font-black tabular-nums text-arena-text">{entry.rating}</span>
                <span className="hidden text-right font-mono text-xs tabular-nums text-arena-muted sm:block">
                  {entry.games}
                </span>
                <span className="text-right font-mono text-xs tabular-nums text-arena-muted">{entry.wins}</span>
                <span className="hidden text-right font-mono text-xs tabular-nums text-arena-muted sm:block">
                  {winRate}%
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-4 text-center text-[11px] text-arena-dim">
        {entries.length > 0 ? `${pluralize(entries.length, 'player')} listed` : 'Leaderboard is empty'} · updated live
      </p>

      <div className="mt-4 text-center">
        <Link href="/" className="link text-sm font-bold">
          Back to the board
        </Link>
      </div>
    </div>
  );
}
