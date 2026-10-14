'use client';

import { ArrowRight, BarChart3, Bot, CircleDot, Clock, RefreshCw, Swords, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Color, GameSummary, TimeControl } from '@/lib/types';
import { useGameStore, loadDraftTimeControl, saveDraftTimeControl } from '@/store/useGameStore';
import { getSocket } from '@/lib/socket';
import { cn, formatTimeControl, relativeTime } from '@/lib/utils';
import { ratingBand } from '@/lib/elo';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { QuickPlayGrid } from '@/components/lobby/QuickPlayGrid';
import { CustomTimeControl, RatedToggle } from '@/components/lobby/CustomTimeControl';
import { PrivateMatchPanel } from '@/components/lobby/PrivateMatchPanel';
import { MatchmakingOverlay } from '@/components/lobby/MatchmakingOverlay';
import { usePlayerProfile } from '@/lib/hooks/usePlayerProfile';

const OUTCOME_STYLE: Record<GameSummary['outcome'], string> = {
  win: 'bg-accent/20 text-accent',
  loss: 'bg-danger/20 text-danger',
  draw: 'bg-arena-raised text-arena-muted',
};

export default function LobbyPage() {
  const router = useRouter();
  const player = useGameStore((s) => s.player);
  const queue = useGameStore((s) => s.queue);
  const searchingSince = useGameStore((s) => s.searchingSince);
  const roomCode = useGameStore((s) => s.roomCode);
  const snapshot = useGameStore((s) => s.snapshot);
  const draft = useGameStore((s) => s.timeControlDraft);
  const setDraft = useGameStore((s) => s.setTimeControlDraft);
  const setRoomCode = useGameStore((s) => s.setRoomCode);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: profile } = usePlayerProfile(player?.id, refreshKey);

  // Restore the last used time control.
  useEffect(() => {
    const stored = loadDraftTimeControl();
    if (stored) setDraft(stored);
  }, [setDraft]);

  useEffect(() => {
    saveDraftTimeControl(draft);
  }, [draft]);

  // Refresh stats whenever a game finishes.
  useEffect(() => {
    const socket = getSocket();
    const onOver = () => setRefreshKey((k) => k + 1);
    socket.on('game:over', onOver);
    return () => {
      socket.off('game:over', onOver);
    };
  }, []);

  const searching = Boolean(queue) || Boolean(roomCode);

  const startSearch = (timeControl: TimeControl) => {
    if (searching) return;
    const socket = getSocket();
    setDraft({ initial: timeControl.initial, increment: timeControl.increment });
    setRoomCode(null);
    socket.emit('queue:join', { timeControl, rated: draft.rated, color: 'random' });
  };

  const cancelSearch = () => {
    const socket = getSocket();
    socket.emit('queue:leave');
    useGameStore.getState().setQueue(null);
    setRoomCode(null);
    setJoinUrl(null);
  };

  const createRoom = (options: { timeControl: TimeControl; rated: boolean; color: Color | 'random' }) => {
    const socket = getSocket();
    setJoinError(null);
    setDraft({ initial: options.timeControl.initial, increment: options.timeControl.increment, rated: options.rated });
    socket.emit(
      'room:create',
      { ...options, visibility: 'private' },
      (res: { roomCode: string; joinUrl: string }) => {
        if (!res?.roomCode) {
          toast({ level: 'error', title: 'Could not create the room', description: 'Please try again.' });
          return;
        }
        setRoomCode(res.roomCode);
        setJoinUrl(res.joinUrl);
      },
    );
  };

  const joinRoom = (code: string) => {
    const socket = getSocket();
    setJoinError(null);
    socket.emit('room:join', { roomCode: code }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setJoinError(res?.error ?? 'Room not found');
    });
  };

  // Private invite links (`/?room=ABC-DEF`) join the room on arrival.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('room');
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    window.history.replaceState({}, '', window.location.pathname);
    const socket = getSocket();
    let cancelled = false;
    let joined = false;
    const attempt = () => {
      if (cancelled || joined) return;
      socket.emit('room:join', { roomCode: cleanCode }, (res: { ok: boolean; error?: string }) => {
        joined = true;
        if (res?.ok) {
          toast({ level: 'success', title: 'Joined the private game' });
        } else {
          const message = res?.error ?? 'Room not found';
          setJoinError(message);
          toast({ level: 'error', title: 'Could not join the room', description: message });
        }
      });
    };
    // Wait for the session handshake so the server knows who we are.
    const onReady = () => attempt();
    socket.on('user:ready', onReady);
    if (socket.connected) attempt();
    return () => {
      cancelled = true;
      socket.off('user:ready', onReady);
    };
  }, []);

  const band = ratingBand(player?.rating ?? 1200);
  const winRate = useMemo(() => {
    const p = profile?.player;
    if (!p || p.games === 0) return 0;
    return Math.round((p.wins / p.games) * 100);
  }, [profile]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-6">
      {/* Hero */}
      <section className="mb-6 overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-arena-panel via-arena-panel to-arena-panel2 p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-accent">
              <Users className="h-3.5 w-3.5" /> Human vs human only
            </span>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-tight text-arena-text sm:text-4xl">
              Play real-time chess with real people
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-arena-muted">
              Pick a time control and you are matched with a human opponent in seconds. Every game is recorded, and
              Stockfish-powered review grades each move so you always know what to fix next.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="stat-chip">
                <Clock className="h-3.5 w-3.5" /> Server-authoritative clocks
              </span>
              <span className="stat-chip">
                <BarChart3 className="h-3.5 w-3.5" /> Move-by-move review
              </span>
              <span className="stat-chip">
                <Bot className="h-3.5 w-3.5" /> No AI opponents
              </span>
            </div>
          </div>

          <div className="min-w-[210px] flex-1 rounded-xl border border-arena-line/50 bg-arena-panel2 p-4 sm:max-w-[260px]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-arena-dim">Your rating</p>
            <p className="mt-1 flex items-baseline gap-2 font-mono text-3xl font-black tabular-nums text-arena-text">
              {player?.rating ?? '—'}
              <span className="text-xs font-bold" style={{ color: band.color }}>
                {band.label}
              </span>
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniStat label="Games" value={profile?.player.games ?? 0} />
              <MiniStat label="Won" value={profile?.player.wins ?? 0} />
              <MiniStat label="Win %" value={winRate} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-arena-muted">
              <TrendingUp className="h-3.5 w-3.5" />
              Best {profile?.bestRating ?? player?.rating ?? '—'}
            </p>
          </div>
        </div>
      </section>

      {snapshot && snapshot.status !== 'finished' && (
        <button
          type="button"
          onClick={() => router.push(`/game/${snapshot.id}`)}
          className="mb-5 flex w-full items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-left transition-colors hover:bg-accent/15"
        >
          <CircleDot className="h-5 w-5 shrink-0 animate-pulse text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-arena-text">You have a game in progress</p>
            <p className="text-xs text-arena-muted">
              {snapshot.white.username} vs {snapshot.black.username} · {formatTimeControl(snapshot.timeControl)}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-accent" />
        </button>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="panel p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-arena-text">Quick play</h2>
                <p className="text-xs text-arena-muted">Tap a format to enter matchmaking instantly.</p>
              </div>
              <div className="w-full sm:w-[260px]">
                <RatedToggle rated={draft.rated} onChange={(rated) => setDraft({ rated })} />
              </div>
            </div>
            <QuickPlayGrid onPlay={(tc) => startSearch(tc)} disabled={searching} playing={searching} />
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section className="panel p-4 sm:p-5">
              <CustomTimeControl
                value={{ initial: draft.initial, increment: draft.increment }}
                onChange={(tc) => setDraft({ initial: tc.initial, increment: tc.increment })}
                onPlay={(tc) => startSearch(tc)}
                rated={draft.rated}
                onRatedChange={(rated) => setDraft({ rated })}
                disabled={searching}
              />
            </section>

            <section className="panel p-4 sm:p-5">
              <PrivateMatchPanel
                timeControl={{ initial: draft.initial, increment: draft.increment }}
                rated={draft.rated}
                onCreate={createRoom}
                onJoin={joinRoom}
                disabled={searching}
                error={joinError}
              />
            </section>
          </div>
        </div>

        {/* Right column */}
        <aside className="space-y-5">
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">Recent games</span>
              <Button variant="ghost" size="sm" onClick={() => setRefreshKey((k) => k + 1)} aria-label="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="divide-y divide-arena-line/30">
              {(profile?.recent ?? []).length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-arena-dim">
                  No games yet. Your results will show up here.
                </p>
              )}
              {(profile?.recent ?? []).slice(0, 8).map((game) => (
                <Link
                  key={game.id}
                  href={`/review/${game.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-arena-raised/60"
                >
                  <span
                    className={cn(
                      'w-10 shrink-0 rounded py-0.5 text-center text-[10px] font-black uppercase',
                      OUTCOME_STYLE[game.outcome],
                    )}
                  >
                    {game.outcome}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-arena-text">
                      {game.opponent?.username ?? 'Unknown'}
                      <span className="ml-1.5 text-xs font-semibold text-arena-muted">{game.opponent?.rating}</span>
                    </p>
                    <p className="text-[11px] text-arena-muted">
                      {formatTimeControl(game.timeControl)} · {game.outcome === 'draw' ? '' : game.ratingDelta >= 0 ? '+' : ''}
                      {game.outcome === 'draw' ? game.reason.replace(/-/g, ' ') : game.ratingDelta} · {relativeTime(game.playedAt)}
                    </p>
                  </div>
                  <Swords className="h-3.5 w-3.5 shrink-0 text-arena-dim" />
                </Link>
              ))}
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="text-sm font-black text-arena-text">How matchmaking works</h2>
            <ol className="mt-3 space-y-3 text-xs leading-relaxed text-arena-muted">
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-arena-raised text-[10px] font-black text-accent">
                  1
                </span>
                Choose a format. You join a queue for that exact time control and rating window.
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-arena-raised text-[10px] font-black text-accent">
                  2
                </span>
                The server pairs you with the closest-rated waiting human and assigns colours.
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-arena-raised text-[10px] font-black text-accent">
                  3
                </span>
                Clocks run on the server. Move history, captures and chat sync live to both players.
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-arena-raised text-[10px] font-black text-accent">
                  4
                </span>
                After the game, review every move with Stockfish and retry your blunders.
              </li>
            </ol>
          </section>
        </aside>
      </div>

      <MatchmakingOverlay
        open={searching}
        status={queue}
        startedAt={searchingSince}
        onCancel={cancelSearch}
        roomCode={roomCode}
        joinUrl={joinUrl}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-arena-raised/70 px-2 py-1.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-arena-dim">{label}</p>
      <p className="font-mono text-sm font-bold tabular-nums text-arena-text">{value}</p>
    </div>
  );
}
