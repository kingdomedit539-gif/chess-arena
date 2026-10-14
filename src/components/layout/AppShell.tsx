'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Crown,
  Menu,
  Play,
  Settings,
  Trophy,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useGameStore } from '@/store/useGameStore';
import { cn, initials } from '@/lib/utils';
import { ratingBand } from '@/lib/elo';
import { getSocket } from '@/lib/socket';
import { getIdentity } from '@/lib/identity';
import { sounds } from '@/lib/sounds';
import { Button } from '../ui/Button';

const NAV = [
  { href: '/', label: 'Play', icon: Play },
  { href: '/analysis', label: 'Practice', icon: BarChart3 },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const player = useGameStore((s) => s.player);
  const connected = useGameStore((s) => s.connected);

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-black/40 bg-arena-panel/60 p-4 lg:flex">
        <Brand />
        <NavLinks pathname={pathname} />
        <div className="mt-auto space-y-3">
          <ConnectionChip connected={connected} />
          <UserCard />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-black/40 bg-arena-panel/80 px-3 py-2.5 lg:hidden">
          <button
            type="button"
            onClick={() => {
              sounds.play('click');
              setDrawerOpen(true);
            }}
            aria-label="Open navigation"
            className="rounded-md p-2 text-arena-muted hover:bg-arena-raised hover:text-arena-text"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-accent" />
            <span className="text-sm font-black tracking-tight">CHESS ARENA</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ConnectionChip connected={connected} compact />
            {player && (
              <span className="rounded bg-arena-raised px-2 py-1 text-xs font-bold tabular-nums text-arena-muted">
                {player.rating}
              </span>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[264px] flex-col border-r border-black/50 bg-arena-panel p-4">
            <div className="mb-4 flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="rounded-md p-1.5 text-arena-muted hover:bg-arena-raised"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            <div className="mt-auto space-y-3">
              <UserCard />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="mb-6 flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-deep text-black shadow-[0_2px_0_0_rgba(0,0,0,0.4)]">
        <Crown className="h-5 w-5" />
      </span>
      <span className="text-base font-black leading-none tracking-tight">
        CHESS
        <br />
        <span className="text-accent">ARENA</span>
      </span>
    </Link>
  );
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => {
              sounds.play('click');
              onNavigate?.();
            }}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors',
              active ? 'bg-accent/15 text-accent' : 'text-arena-muted hover:bg-arena-raised hover:text-arena-text',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ConnectionChip({ connected, compact }: { connected: boolean; compact?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold',
        compact && 'px-1.5',
        connected ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger',
      )}
      title={connected ? 'Connected to the realtime server' : 'Reconnecting…'}
    >
      {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3 animate-pulse" />}
      {!compact && (connected ? 'Online' : 'Reconnecting…')}
    </span>
  );
}

function UserCard() {
  const player = useGameStore((s) => s.player);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const band = ratingBand(player?.rating ?? 1200);

  const save = () => {
    const name = draft.trim();
    setEditing(false);
    if (name.length < 2) return;
    const socket = getSocket();
    socket.emit('user:profile', { username: name }, (res) => {
      if (res?.player) useGameStore.getState().setPlayer({ id: res.player.id, username: res.player.username, rating: res.player.rating });
    });
    // Keep the local identity in sync for the next connection.
    window.localStorage.setItem('chess-arena:username', name);
  };

  if (!player) {
    return (
      <div className="rounded-lg border border-arena-line/50 bg-arena-panel2 p-3">
        <div className="h-3 w-24 animate-pulse rounded bg-arena-raised" />
        <p className="mt-2 text-[11px] text-arena-dim">Connecting to the server…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-arena-line/50 bg-arena-panel2 p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-accent to-accent-deep text-xs font-black text-black"
          aria-hidden
        >
          {initials(player.username)}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={draft}
              maxLength={20}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
                if (event.key === 'Escape') setEditing(false);
              }}
              className="h-7 w-full rounded border border-accent/60 bg-arena-bg px-2 text-sm font-bold focus:outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(player.username);
                setEditing(true);
              }}
              className="block max-w-full truncate text-left text-sm font-bold hover:text-accent"
              title="Change your display name"
            >
              {player.username}
            </button>
          )}
          <p className="text-[11px] font-semibold" style={{ color: band.color }}>
            {player.rating} · {band.label}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 w-full"
        onClick={() => {
          setDraft(player.username);
          setEditing(true);
        }}
      >
        Edit name
      </Button>
    </div>
  );
}
