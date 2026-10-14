'use client';

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Radio,
  Settings2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Color, PieceSymbol, Square } from '@/lib/types';
import { getSocket, clockSync } from '@/lib/socket';
import { useGameStore } from '@/store/useGameStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { getBoardTheme } from '@/lib/chess/themes';
import { cn, formatTimeControl, materialBalance, opposite, squaresFromUci } from '@/lib/utils';
import { useLiveClocks } from '@/lib/hooks/useLiveClocks';
import { useLiveEval } from '@/lib/hooks/useLiveEval';
import { sounds } from '@/lib/sounds';
import { Board, type BoardArrow } from '@/components/board/Board';
import { EvalBar } from '@/components/board/EvalBar';
import { PlayerCard, PlayerCardSkeleton } from '@/components/game/PlayerCard';
import { MoveList } from '@/components/game/MoveList';
import { GameActionBar } from '@/components/game/GameActionBar';
import { GameOverModal } from '@/components/game/GameOverModal';
import { DrawOfferDialog } from '@/components/game/DrawOfferDialog';
import { ChatPanel } from '@/components/game/ChatPanel';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { BoardSettings } from '@/components/settings/SettingsPanels';
import { toast } from '@/components/ui/Toast';

type SidePanelTab = 'moves' | 'chat';

export default function GamePage() {
  const params = useParams<{ id: string | string[] }>();
  const gameId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? '';
  const router = useRouter();

  const snapshot = useGameStore((s) => s.snapshot);
  const myColor = useGameStore((s) => s.myColor);
  const messages = useGameStore((s) => s.messages);
  const player = useGameStore((s) => s.player);
  const end = useGameStore((s) => s.end);
  const opponentOnline = useGameStore((s) => s.opponentOnline);
  const graceMsLeft = useGameStore((s) => s.graceMsLeft);
  const pendingMove = useGameStore((s) => s.pendingMove);

  const settings = useSettingsStore();

  const [notFound, setNotFound] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<SidePanelTab>('moves');
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const [resultOpen, setResultOpen] = useState(true);
  const requested = useRef<string | null>(null);

  const game = snapshot && snapshot.id === gameId ? snapshot : null;

  /* ------------------------------------------------------------------ */
  /*  Join / resume the game                                             */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!gameId || requested.current === gameId) return;
    requested.current = gameId;
    const socket = getSocket();
    const attempt = () => {
      socket.emit('game:resume', { gameId }, (res) => {
        if ('error' in res) {
          setNotFound(true);
          return;
        }
        clockSync.sync(res.snapshot.serverTime);
        useGameStore.getState().setSnapshot(res.snapshot);
        const color = res.snapshot.white.id === player?.id ? 'w' : res.snapshot.black.id === player?.id ? 'b' : null;
        if (color) useGameStore.getState().startGame(res.snapshot, color);
      });
    };
    if (socket.connected) attempt();
    else socket.once('connect', attempt);
    // Fallback if the socket never answers.
    const timeout = window.setTimeout(() => {
      if (!useGameStore.getState().snapshot) setNotFound(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Reset per-game UI state when the game changes.
  useEffect(() => {
    setViewPly(null);
    setSelectedSquare(null);
    setResultOpen(true);
  }, [gameId]);

  useEffect(() => {
    if (end) setResultOpen(true);
  }, [end]);

  useEffect(() => {
    if (end && settings.preferRematch) {
      const socket = getSocket();
      socket.emit('game:rematch:offer', { gameId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end?.result.reason, end?.result.winner]);

  /* ------------------------------------------------------------------ */
  /*  Derived state                                                      */
  /* ------------------------------------------------------------------ */

  const moves = game?.moves ?? [];
  const totalPlies = moves.length;
  const shownPly = viewPly === null ? totalPlies : Math.min(viewPly, totalPlies);
  const viewingHistory = shownPly !== totalPlies;

  const baseOrientation: Color = useMemo(() => {
    if (settings.boardOrientation === 'white') return 'w';
    if (settings.boardOrientation === 'black') return 'b';
    return myColor ?? 'w';
  }, [myColor, settings.boardOrientation]);

  const orientation: Color = flipped ? opposite(baseOrientation) : baseOrientation;
  const topColor = opposite(orientation);
  const bottomColor = orientation;

  const liveClocks = useLiveClocks({
    whiteTime: game?.whiteTime ?? 0,
    blackTime: game?.blackTime ?? 0,
    turn: game?.turn ?? 'w',
    status: game?.status ?? 'waiting',
    serverTime: game?.serverTime ?? Date.now(),
  });

  const fen = useMemo(() => {
    if (!game) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (shownPly === 0) return game.initialFen;
    return moves[shownPly - 1]?.fen ?? game.fen;
  }, [game, moves, shownPly]);

  const lastMove = useMemo(() => {
    if (settings.highlightLastMove && !viewingHistory) {
      const last = moves[totalPlies - 1];
      return last ? { from: last.from, to: last.to } : null;
    }
    const atPly = moves[shownPly - 1];
    return atPly ? { from: atPly.from, to: atPly.to } : null;
  }, [moves, settings.highlightLastMove, shownPly, totalPlies, viewingHistory]);

  const { capturedByWhite, capturedByBlack, balance } = useMemo(() => {
    const byWhite: PieceSymbol[] = [];
    const byBlack: PieceSymbol[] = [];
    for (const move of moves.slice(0, shownPly)) {
      if (!move.capture) continue;
      if (move.color === 'w') byWhite.push(move.capture);
      else byBlack.push(move.capture);
    }
    return {
      capturedByWhite: byWhite,
      capturedByBlack: byBlack,
      balance: materialBalance(byWhite, byBlack),
    };
  }, [moves, shownPly]);

  const analysisAllowed = !game?.rated || game?.status === 'finished';
  const evalFen = game && (analysisEnabled || (!game.rated && game.status === 'active')) ? fen : null;
  const liveEval = useLiveEval(evalFen, Boolean(evalFen) && analysisAllowed, {
    depth: 22,
    movetime: 900,
    multipv: 1,
  });

  const arrows: BoardArrow[] = useMemo(() => {
    if (!analysisAllowed || !analysisEnabled) return [];
    const best = liveEval.lines[0]?.pv[0];
    if (!best || best.length < 4) return [];
    const { from, to } = squaresFromUci(best);
    return [{ from, to, color: getBoardTheme(settings.boardTheme).arrows.blue, thin: true }];
  }, [analysisAllowed, analysisEnabled, liveEval.lines, settings.boardTheme]);

  const isPlayer = myColor !== null && game !== null;
  const interactive = Boolean(game && game.status === 'active' && !viewingHistory && myColor === game.turn);

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  const onMove = useCallback(
    ({ from, to, promotion }: { from: Square; to: Square; promotion?: PieceSymbol }) => {
      if (!game) return;
      const socket = getSocket();
      useGameStore.getState().setPendingMove({ from, to });
      socket.emit('game:move', { gameId: game.id, from, to, promotion, clientTime: Date.now() });
      window.setTimeout(() => {
        const stillPending = useGameStore.getState().pendingMove;
        if (stillPending && stillPending.from === from && stillPending.to === to) {
          useGameStore.getState().setPendingMove(null);
        }
      }, 2500);
    },
    [game],
  );

  const offerDraw = useCallback(() => {
    if (!game) return;
    const socket = getSocket();
    const offeredByOpponent = game.drawOfferBy && game.drawOfferBy !== myColor;
    socket.emit(offeredByOpponent ? 'game:draw:accept' : 'game:draw:offer', { gameId: game.id });
  }, [game, myColor]);

  const resign = useCallback(() => {
    if (!game) return;
    getSocket().emit('game:resign', { gameId: game.id });
  }, [game]);

  const requestRematch = useCallback(() => {
    if (!game) return;
    const socket = getSocket();
    if (game.rematchOfferBy && game.rematchOfferBy !== myColor) {
      socket.emit('game:rematch:accept', { gameId: game.id });
    } else {
      socket.emit('game:rematch:offer', { gameId: game.id });
      toast({ level: 'info', title: 'Rematch offered', description: 'Waiting for your opponent…' });
    }
  }, [game, myColor]);

  const sendChat = useCallback(
    (text: string) => {
      if (!game) return;
      getSocket().emit('game:chat', { gameId: game.id, text });
    },
    [game],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'ArrowLeft') {
        setViewPly((ply) => Math.max(0, (ply ?? totalPlies) - 1));
      } else if (event.key === 'ArrowRight') {
        setViewPly((ply) => {
          const next = (ply ?? totalPlies) + 1;
          return next >= totalPlies ? null : next;
        });
      } else if (event.key === 'f') {
        setFlipped((f) => !f);
      } else if (event.key === 'Escape') {
        setSelectedSquare(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPlies]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  if (notFound) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <h1 className="text-xl font-black text-arena-text">Game not found</h1>
        <p className="mt-2 text-sm text-arena-muted">
          This game has expired or never existed. Finished games stay available on your lobby overview.
        </p>
        <Button className="mt-5" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" />
          Back to lobby
        </Button>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-4 py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="mx-auto w-full max-w-[720px] space-y-3">
            <PlayerCardSkeleton />
            <div className="aspect-square w-full animate-pulse rounded-md bg-arena-panel" />
            <PlayerCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  const theme = getBoardTheme(settings.boardTheme);
  const whiteIsBottom = bottomColor === 'w';
  const drawOfferedByMe = game.drawOfferBy === myColor;
  const drawOfferedByOpponent = Boolean(game.drawOfferBy && game.drawOfferBy !== myColor);

  const playerFor = (color: Color) => (color === 'w' ? game.white : game.black);
  const capturedFor = (color: Color) => (color === 'w' ? capturedByWhite : capturedByBlack);
  const clockFor = (color: Color) => (color === 'w' ? liveClocks.white : liveClocks.black);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4 lg:px-6 lg:py-6">
      {!isPlayer && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs font-bold text-info">
          <Users className="h-4 w-4" />
          Spectating — you can draw arrows and follow the game, but not move pieces.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        {/* Board column */}
        <div className="mx-auto w-full max-w-[760px] space-y-3">
          <PlayerCard
            player={playerFor(topColor)}
            color={topColor}
            clockMs={clockFor(topColor)}
            clockActive={liveClocks.active === topColor}
            isYou={myColor === topColor}
            online={topColor === myColor ? true : opponentOnline}
            graceSecondsLeft={topColor === myColor ? undefined : Math.ceil(graceMsLeft / 1000)}
            captured={capturedFor(topColor)}
            advantage={topColor === 'w' ? Math.max(0, balance) : Math.max(0, -balance)}
            pieceSet={settings.pieceSet}
            ratingDelta={end?.ratings ? (topColor === 'w' ? end.ratings.white.delta : end.ratings.black.delta) : undefined}
          />

          <div className="flex gap-2">
            {settings.showEvalBar && (analysisEnabled || game.status === 'finished') && (
              <EvalBar
                cpWhite={liveEval.cpWhite}
                mateWhite={liveEval.mateWhite}
                orientation={orientation}
                thinking={liveEval.thinking}
                className="h-auto self-stretch"
              />
            )}
            <div className={cn('relative min-w-0 flex-1', whiteIsBottom ? '' : '')}>
              <Board
                fen={fen}
                orientation={orientation}
                theme={theme}
                pieceSet={settings.pieceSet}
                interactive={interactive}
                movableColor={myColor}
                lastMove={lastMove}
                selectedSquare={selectedSquare}
                onSelectSquare={setSelectedSquare}
                onMove={onMove}
                onIllegalMove={() => sounds.play('illegal')}
                arrows={arrows}
                allowDrawing
                showCoordinates={settings.showCoordinates}
                showLegalMoves={settings.showLegalMoves}
                animationMs={settings.animatePieces ? settings.animationMs : 0}
                autoQueen={settings.autoQueen}
                className="board-frame"
              />

              {viewingHistory && (
                <button
                  type="button"
                  onClick={() => setViewPly(null)}
                  className="absolute inset-x-0 bottom-3 mx-auto flex items-center gap-2 rounded-full border border-accent/50 bg-arena-panel/95 px-4 py-2 text-xs font-bold text-accent shadow-lg backdrop-blur transition-colors hover:bg-arena-panel"
                >
                  <Radio className="h-3.5 w-3.5" />
                  Viewing move {shownPly} · return to live
                </button>
              )}

              {game.status === 'waiting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-black/70 backdrop-blur-sm">
                  <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  <p className="text-sm font-bold text-arena-text">Waiting for your opponent…</p>
                  <p className="font-mono text-lg font-black tracking-[0.25em] text-accent">{game.roomCode}</p>
                  <p className="max-w-xs text-center text-xs text-arena-muted">
                    Share the room code or link. The clock starts as soon as they join.
                  </p>
                </div>
              )}
            </div>
          </div>

          <PlayerCard
            player={playerFor(bottomColor)}
            color={bottomColor}
            clockMs={clockFor(bottomColor)}
            clockActive={liveClocks.active === bottomColor}
            isYou={myColor === bottomColor}
            online={bottomColor === myColor ? true : opponentOnline}
            graceSecondsLeft={bottomColor === myColor ? undefined : Math.ceil(graceMsLeft / 1000)}
            captured={capturedFor(bottomColor)}
            advantage={bottomColor === 'w' ? Math.max(0, balance) : Math.max(0, -balance)}
            pieceSet={settings.pieceSet}
            ratingDelta={end?.ratings ? (bottomColor === 'w' ? end.ratings.white.delta : end.ratings.black.delta) : undefined}
          />

          <GameActionBar
            status={game.status}
            myColor={myColor ?? 'w'}
            canOfferDraw={game.status === 'active' && !drawOfferedByMe}
            drawOfferedByMe={drawOfferedByMe}
            drawOfferedByOpponent={drawOfferedByOpponent}
            analysisEnabled={analysisEnabled}
            onToggleAnalysis={() => {
              if (!analysisAllowed) {
                toast({ level: 'warn', title: 'Analysis disabled', description: 'Engine assistance is not allowed in rated games.' });
                return;
              }
              setAnalysisEnabled((v) => !v);
            }}
            onResign={resign}
            onOfferDraw={offerDraw}
            onFlip={() => setFlipped((f) => !f)}
            onRematch={end ? requestRematch : undefined}
            onReview={() => router.push(`/review/${game.id}`)}
            onSettings={() => setSettingsOpen(true)}
          />

          <div className="flex items-center justify-between gap-2 rounded-lg border border-arena-line/50 bg-arena-panel px-3 py-2">
            <button
              type="button"
              onClick={() => setViewPly((ply) => Math.max(0, (ply ?? totalPlies) - 1))}
              disabled={shownPly === 0}
              className="rounded p-1.5 text-arena-muted transition-colors hover:bg-arena-raised hover:text-arena-text disabled:opacity-40"
              aria-label="Previous move"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-xs font-semibold text-arena-muted">
              {game.status === 'active'
                ? `${game.turn === 'w' ? 'White' : 'Black'} to move`
                : game.status === 'finished'
                  ? 'Game over'
                  : 'Waiting for players'}
              {pendingMove && <span className="ml-2 text-accent">sending…</span>}
            </p>
            <button
              type="button"
              onClick={() =>
                setViewPly((ply) => {
                  const next = (ply ?? totalPlies) + 1;
                  return next >= totalPlies ? null : next;
                })
              }
              disabled={!viewingHistory}
              className="rounded p-1.5 text-arena-muted transition-colors hover:bg-arena-raised hover:text-arena-text disabled:opacity-40"
              aria-label="Next move"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Side panel */}
        <aside className="flex min-h-0 flex-col gap-3 lg:max-h-[calc(100vh-3rem)]">
          <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-1 border-b border-arena-line/50 p-2">
              <button
                type="button"
                onClick={() => setPanelTab('moves')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors',
                  panelTab === 'moves' ? 'bg-accent/15 text-accent' : 'text-arena-muted hover:bg-arena-raised',
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Moves
              </button>
              <button
                type="button"
                onClick={() => setPanelTab('chat')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-bold transition-colors',
                  panelTab === 'chat' ? 'bg-accent/15 text-accent' : 'text-arena-muted hover:bg-arena-raised',
                )}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                aria-label="Board settings"
                title="Board settings"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-arena-line/40 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-arena-dim">
              <span>{formatTimeControl(game.timeControl)}</span>
              <span>{game.rated ? 'Rated' : 'Casual'}</span>
              <span>{totalPlies} moves</span>
            </div>

            <div className="min-h-0 flex-1">
              {panelTab === 'moves' ? (
                <MoveList
                  moves={moves}
                  currentPly={shownPly}
                  onJump={(ply) => setViewPly(ply >= totalPlies ? null : ply)}
                  scrollable
                  emptyHint="The game starts when both players are in."
                />
              ) : (
                <ChatPanel
                  messages={messages}
                  onSend={sendChat}
                  myId={player?.id}
                  className="h-full"
                  disabled={!isPlayer}
                  placeholder={isPlayer ? 'Say something…' : 'Spectators cannot chat'}
                />
              )}
            </div>
          </div>

          {myColor && (
            <div className="panel px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-arena-dim">You are playing</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-bold text-arena-text">
                <span className={cn('h-3.5 w-3.5 rounded-sm border', myColor === 'w' ? 'border-arena-line bg-white' : 'border-white/20 bg-[#312f2c]')} />
                {myColor === 'w' ? 'White' : 'Black'}
              </p>
              <p className="mt-1 text-[11px] text-arena-muted">
                Click or drag to move. Right-click and drag to draw arrows; right-click a square to highlight it.
              </p>
            </div>
          )}
        </aside>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Board & pieces" size="md">
        <BoardSettings />
      </Modal>

      <DrawOfferDialog
        open={drawOfferedByOpponent || drawOfferedByMe}
        incoming={drawOfferedByOpponent}
        onAccept={offerDraw}
        onDecline={() => getSocket().emit('game:draw:decline', { gameId: game.id })}
        onCancel={() => getSocket().emit('game:draw:decline', { gameId: game.id })}
      />

      <GameOverModal
        open={Boolean(end) && resultOpen}
        result={end?.result ?? game.result}
        myColor={myColor}
        white={game.white}
        black={game.black}
        ratings={end?.ratings ?? null}
        onRematch={requestRematch}
        onReview={() => router.push(`/review/${game.id}`)}
        onClose={() => setResultOpen(false)}
        rematchOfferedByMe={game.rematchOfferBy === myColor}
        rematchOfferedByOpponent={Boolean(game.rematchOfferBy && game.rematchOfferBy !== myColor)}
        onAcceptRematch={requestRematch}
      />

      <div className="mt-4 text-center lg:hidden">
        <Link href="/" className="text-xs font-semibold text-arena-muted hover:text-accent">
          Leave table
        </Link>
      </div>
    </div>
  );
}
