'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { clockSync, getSocket } from '@/lib/socket';
import { getIdentity } from '@/lib/identity';
import { playMoveSound, sounds } from '@/lib/sounds';
import { useGameStore } from '@/store/useGameStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { toast } from '../ui/Toast';
import type { ChatMessage, Color } from '@/lib/types';

/**
 * Single place where the realtime session is wired into the app:
 * auth, matchmaking, live game events, presence, chat and audio side effects.
 * Rendered once from the root layout so navigation never drops the socket.
 */
export function GameSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const lastTickSecond = useRef<number>(-1);

  useEffect(() => {
    const socket = getSocket();
    const store = useGameStore;

    const onConnect = () => {
      store.getState().setConnected(true);
      const identity = getIdentity();
      socket.emit('user:hello', identity, (res) => {
        if (res?.serverTime) clockSync.sync(res.serverTime);
      });
    };
    const onDisconnect = () => {
      store.getState().setConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('user:ready', ({ player, serverTime }) => {
      clockSync.sync(serverTime);
      store.getState().setPlayer({ id: player.id, username: player.username, rating: player.rating });
      // Restore an in-progress game after a refresh / reconnect.
      const state = store.getState();
      if (state.snapshot && state.snapshot.status !== 'finished') {
        socket.emit('game:sync', { gameId: state.snapshot.id });
      }
    });

    socket.on('queue:status', (status) => {
      store.getState().setQueue(status);
    });
    socket.on('queue:left', () => {
      store.getState().setQueue(null);
    });

    socket.on('match:found', ({ snapshot, color }) => {
      clockSync.sync(snapshot.serverTime);
      store.getState().startGame(snapshot, color);
      sounds.play('gameStart');
      toast({ level: 'success', title: 'Opponent found!', description: `Game on — you play ${color === 'w' ? 'white' : 'black'}.` });
      router.push(`/game/${snapshot.id}`);
    });

    socket.on('game:state', (snapshot) => {
      clockSync.sync(snapshot.serverTime);
      const existing = store.getState().snapshot;
      if (!existing || existing.id !== snapshot.id) {
        store.getState().setSnapshot(snapshot);
      } else {
        store.getState().setSnapshot(snapshot);
      }
    });

    socket.on('game:move', ({ move, snapshot }) => {
      clockSync.sync(snapshot.serverTime);
      const myColor = store.getState().myColor;
      store.getState().applyMove(move, snapshot);
      playMoveSound({
        capture: Boolean(move.capture),
        castle: Boolean(move.castle),
        check: Boolean(move.check),
        checkmate: Boolean(move.checkmate),
        promotion: Boolean(move.promotion),
        ownMove: move.color === myColor,
      });
      if (snapshot.drawOfferBy === null && store.getState().snapshot?.drawOfferBy) {
        /* cleared automatically via snapshot */
      }
    });

    socket.on('game:clock', (sync) => {
      clockSync.sync(sync.serverTime);
      store.getState().applyClock(sync);
    });

    socket.on('game:over', ({ result, snapshot, ratings, reviewUrl }) => {
      clockSync.sync(snapshot.serverTime);
      store.getState().setSnapshot(snapshot);
      store.getState().setEnd({ result, ratings, reviewUrl });
      const myColor = store.getState().myColor;
      if (!result.winner) sounds.play('draw');
      else if (result.winner === myColor) sounds.play('gameWin');
      else sounds.play('gameLose');
    });

    socket.on('game:draw:offer', ({ snapshot }) => {
      store.getState().setSnapshot(snapshot);
      const myColor = store.getState().myColor;
      if (snapshot.drawOfferBy && snapshot.drawOfferBy !== myColor) {
        sounds.play('notify');
        toast({ level: 'info', title: 'Draw offered', description: 'Your opponent offers a draw.' });
      }
    });
    socket.on('game:draw:decline', () => {
      sounds.play('illegal');
      toast({ level: 'warn', title: 'Draw declined', description: 'Your opponent declined the draw offer.' });
      const snapshot = store.getState().snapshot;
      if (snapshot) store.getState().setSnapshot({ ...snapshot, drawOfferBy: null });
    });

    socket.on('game:rematch:offer', ({ by }) => {
      const myColor = store.getState().myColor;
      if (by !== myColor) {
        sounds.play('notify');
        toast({ level: 'info', title: 'Rematch offered' });
      }
      const snapshot = store.getState().snapshot;
      if (snapshot) store.getState().setSnapshot({ ...snapshot, rematchOfferBy: by });
    });

    socket.on('game:chat', (message: ChatMessage) => {
      store.getState().pushMessage(message);
      const myId = store.getState().player?.id;
      if (!message.system && message.from !== myId) sounds.play('notify');
    });

    socket.on('game:presence', ({ color, online, graceMsLeft }) => {
      const myColor = store.getState().myColor;
      if (color !== myColor) store.getState().setPresence(color, online, graceMsLeft);
      if (!online) {
        toast({ level: 'warn', title: 'Opponent disconnected', description: 'They have 30 seconds to reconnect.' });
      } else {
        toast({ level: 'success', title: 'Opponent reconnected' });
      }
    });

    socket.on('game:notice', (payload) => {
      store.getState().setNotice({ ...payload, at: Date.now() });
      if (payload.level !== 'info') toast({ level: payload.level === 'error' ? 'error' : 'warn', title: payload.text });
    });

    socket.on('error', (payload) => {
      if (payload.code === 'move') sounds.play('illegal');
      toast({ level: 'error', title: payload.message });
    });

    socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [router]);

  /* Audio settings + gesture unlock ------------------------------------- */
  useEffect(() => {
    const unlock = () => {
      sounds.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const apply = (state: ReturnType<typeof useSettingsStore.getState>) => {
      sounds.setMuted(!state.soundEnabled);
      sounds.setVolume(state.volume);
    };
    apply(useSettingsStore.getState());
    return useSettingsStore.subscribe(apply);
  }, []);

  /* Low-time ticking ----------------------------------------------------- */
  useEffect(() => {
    const id = window.setInterval(() => {
      const { snapshot, myColor } = useGameStore.getState();
      if (!snapshot || snapshot.status !== 'active') return;
      if (!useSettingsStore.getState().lowTimeWarning) return;
      const elapsed = Math.max(0, clockSync.now() - snapshot.serverTime);
      const active: Color = snapshot.turn;
      const remaining = (active === 'w' ? snapshot.whiteTime : snapshot.blackTime) - elapsed;
      if (remaining > 10_000 || remaining <= 0) {
        lastTickSecond.current = -1;
        return;
      }
      const second = Math.ceil(remaining / 1000);
      if (second !== lastTickSecond.current) {
        lastTickSecond.current = second;
        sounds.play('tick');
      }
      void myColor;
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  return <>{children}</>;
}
