'use client';

import { Cpu, RefreshCw, Save, ShieldCheck, Trash2, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { getSocket } from '@/lib/socket';
import { getIdentity, setUsername } from '@/lib/identity';
import { getLiveEngine } from '@/lib/engine/StockfishEngine';
import { ratingBand } from '@/lib/elo';
import { avatarGradient, initials } from '@/lib/utils';
import { sounds } from '@/lib/sounds';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { BoardSettings, GameplaySettings, SoundSettings } from '@/components/settings/SettingsPanels';

type EngineStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; source: string; bestMove: string | null; depth: number }
  | { state: 'error'; message: string };

export default function SettingsPage() {
  const player = useGameStore((s) => s.player);
  const connected = useGameStore((s) => s.connected);
  const settings = useSettingsStore();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [engine, setEngine] = useState<EngineStatus>({ state: 'idle' });
  const [installEvent, setInstallEvent] = useState<(Event & { prompt?: () => Promise<void> }) | null>(null);

  useEffect(() => {
    setName(player?.username ?? getIdentity().username);
  }, [player?.username]);

  // Capture the PWA install prompt on Android/Chrome so we can offer a button.
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as Event & { prompt?: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const saveName = () => {
    const clean = name.trim();
    if (clean.length < 2) {
      toast({ level: 'warn', title: 'Pick a name with at least 2 characters' });
      return;
    }
    setSaving(true);
    setUsername(clean);
    const socket = getSocket();
    socket.emit('user:profile', { username: clean }, (res) => {
      setSaving(false);
      if (res?.player) {
        useGameStore.getState().setPlayer({ id: res.player.id, username: res.player.username, rating: res.player.rating });
        toast({ level: 'success', title: 'Display name updated', description: res.player.username });
      } else {
        toast({ level: 'warn', title: 'Saved locally', description: 'It will sync the next time you connect.' });
      }
    });
  };

  const testEngine = async () => {
    setEngine({ state: 'loading' });
    sounds.play('click');
    try {
      const instance = getLiveEngine();
      await instance.boot();
      const evaluation = await instance.analyse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', {
        depth: 12,
        movetime: 1200,
      });
      setEngine({
        state: 'ready',
        source: instance.engineSource,
        bestMove: evaluation.lines[0]?.pv[0] ?? evaluation.bestMove,
        depth: evaluation.depth,
      });
      toast({ level: 'success', title: 'Stockfish is working', description: `Best move ${evaluation.lines[0]?.pv[0] ?? '—'}` });
    } catch (error) {
      setEngine({ state: 'error', message: (error as Error).message });
      toast({ level: 'error', title: 'Engine failed to load', description: 'Run npm run fetch:engine to bundle it locally.' });
    }
  };

  const band = ratingBand(player?.rating ?? 1200);
  const [from, to] = avatarGradient(player?.id ?? getIdentity().id);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-black tracking-tight text-arena-text">Settings</h1>
        <p className="mt-1 text-sm text-arena-muted">
          Everything is stored on this device. Board and sound changes apply instantly across every board.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="panel p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-black uppercase tracking-wider text-arena-muted">Board &amp; pieces</h2>
            <BoardSettings />
          </section>

          <section className="panel p-4 sm:p-5">
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-arena-muted">Gameplay</h2>
            <GameplaySettings />
          </section>

          <section className="panel p-4 sm:p-5">
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-arena-muted">Sound</h2>
            <SoundSettings />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-arena-muted">
              <UserRound className="h-4 w-4 text-accent" />
              Profile
            </h2>
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-black text-white/95"
                style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
                aria-hidden
              >
                {initials(name || 'Player')}
              </span>
              <div className="min-w-0">
                <p className="flex items-baseline gap-2 font-mono text-xl font-black tabular-nums text-arena-text">
                  {player?.rating ?? '—'}
                  <span className="text-[11px] font-bold" style={{ color: band.color }}>
                    {band.label}
                  </span>
                </p>
                <p className="flex items-center gap-1 text-[11px] font-semibold text-arena-dim">
                  {connected ? <Wifi className="h-3 w-3 text-accent" /> : <WifiOff className="h-3 w-3 text-danger" />}
                  {connected ? 'Connected' : 'Offline'} · {player?.id ?? '—'}
                </p>
              </div>
            </div>

            <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-arena-dim">
              Display name
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                value={name}
                maxLength={20}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && saveName()}
                className="input flex-1"
                placeholder="Your name"
              />
              <Button onClick={saveName} loading={saving} disabled={name.trim() === (player?.username ?? '')}>
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-arena-dim">
              No account required — your rating is tied to this browser. Clearing site data starts a fresh rating.
            </p>
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-wider text-arena-muted">
              <Cpu className="h-4 w-4 text-accent" />
              Stockfish engine
            </h2>
            <p className="text-[11px] leading-relaxed text-arena-muted">
              Analysis runs entirely in your browser — the server never uses CPU for it. If the engine cannot be reached from
              the CDN, bundle it locally with <code className="text-arena-text">npm run fetch:engine</code>.
            </p>
            <Button className="mt-3 w-full" variant="secondary" onClick={testEngine} loading={engine.state === 'loading'}>
              <Cpu className="h-4 w-4" />
              {engine.state === 'loading' ? 'Booting…' : 'Test the engine'}
            </Button>
            {engine.state === 'ready' && (
              <div className="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-accent">
                <p className="flex items-center gap-1.5 font-bold">
                  <ShieldCheck className="h-3.5 w-3.5" /> Working — depth {engine.depth}
                </p>
                <p className="mt-0.5 break-all text-arena-muted">Best move {engine.bestMove ?? '—'}</p>
                <p className="mt-0.5 break-all text-arena-dim">Loaded from {engine.source}</p>
              </div>
            )}
            {engine.state === 'error' && (
              <p className="mt-3 break-words rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] text-danger">
                {engine.message}
              </p>
            )}
          </section>

          {installEvent && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-arena-muted">Install app</h2>
              <p className="text-[11px] leading-relaxed text-arena-muted">
                Add Chess Arena to your home screen for a full-screen, offline-capable board.
              </p>
              <Button
                className="mt-3 w-full"
                onClick={async () => {
                  await installEvent.prompt?.();
                  setInstallEvent(null);
                }}
              >
                Add to home screen
              </Button>
            </section>
          )}

          <section className="panel p-4">
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-arena-muted">Reset</h2>
            <p className="text-[11px] leading-relaxed text-arena-muted">
              Restore the default board, sound and gameplay options. Your rating is not affected.
            </p>
            <Button variant="outline" className="mt-3 w-full" onClick={() => setConfirmReset(true)}>
              <Trash2 className="h-4 w-4" />
              Restore defaults
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => {
                sounds.play('gameStart');
                toast({ level: 'info', title: 'Sounds previewed' });
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Preview sound
            </Button>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Restore default settings?"
        description="Board theme, piece set, sounds and gameplay options will go back to their defaults."
        confirmLabel="Restore"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          settings.reset();
          setConfirmReset(false);
          toast({ level: 'success', title: 'Settings restored' });
        }}
      />
    </div>
  );
}
