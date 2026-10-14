'use client';

import {
  ArrowLeft,
  BrainCircuit,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  RefreshCw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArchivedGame, ReviewReport } from '@/lib/types';
import { createReviewEngine } from '@/lib/engine/StockfishEngine';
import { analyseGame, cpToMate, formatEvalFromCp } from '@/lib/engine/analysis';
import { getBoardTheme } from '@/lib/chess/themes';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useLiveEval } from '@/lib/hooks/useLiveEval';
import { cn, formatTimeControl, squaresFromUci } from '@/lib/utils';
import { sounds } from '@/lib/sounds';
import { Board, type BoardArrow } from '@/components/board/Board';
import { EvalBar } from '@/components/board/EvalBar';
import { MoveList } from '@/components/game/MoveList';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { AnalysisProgress } from '@/components/analysis/AnalysisProgress';
import { AccuracyCards, RatingChange } from '@/components/analysis/AccuracySummary';
import { KeyMoments } from '@/components/analysis/KeyMoments';
import { EngineLines } from '@/components/analysis/EngineLines';
import { RetryDialog } from '@/components/analysis/RetryDialog';

type Tab = 'summary' | 'moves' | 'moments';

/** Reports are expensive; keep them for the session so tab switches are instant. */
const reportCache = new Map<string, ReviewReport>();

const REASON_LABEL: Record<string, string> = {
  checkmate: 'Checkmate',
  timeout: 'Win on time',
  resignation: 'Resignation',
  stalemate: 'Stalemate',
  'insufficient-material': 'Insufficient material',
  'threefold-repetition': 'Threefold repetition',
  'fifty-move-rule': 'Fifty-move rule',
  agreement: 'Draw agreed',
  abandoned: 'Abandoned',
  aborted: 'Aborted',
};

export default function ReviewPage() {
  const params = useParams<{ id: string | string[] }>();
  const gameId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? '';
  const router = useRouter();
  const settings = useSettingsStore();

  const [game, setGame] = useState<ArchivedGame | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [ply, setPly] = useState(0);
  const [tab, setTab] = useState<Tab>('summary');
  const [explore, setExplore] = useState(false);
  const [retryIndex, setRetryIndex] = useState<number | null>(null);
  const [runKey, setRunKey] = useState(0);
  const engineRef = useRef(createReviewEngine());

  /* ---------------- load the archived game ---------------- */
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    fetch(`/api/games/${encodeURIComponent(gameId)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Game not found' : `HTTP ${res.status}`);
        return (await res.json()) as ArchivedGame;
      })
      .then((data) => {
        if (cancelled) return;
        setGame(data);
        setPly(data.snapshot.moves.length);
      })
      .catch((error: Error) => !cancelled && setLoadError(error.message));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  /* ---------------- run Stockfish analysis ---------------- */
  useEffect(() => {
    if (!game) return;
    const snapshot = game.snapshot;
    const cacheKey = `${gameId}:${settings.reviewDepth}`;
    const cached = reportCache.get(cacheKey);
    if (cached) {
      setReport(cached);
      setProgress(100);
      setPhase('done');
      return;
    }
    if (snapshot.moves.length === 0) {
      setPhase('idle');
      return;
    }

    let cancelled = false;
    const engine = engineRef.current;
    setPhase('running');
    setProgress(0);

    void analyseGame({
      gameId,
      initialFen: snapshot.initialFen,
      moves: snapshot.moves.map((move) => ({
        san: move.san,
        from: move.from,
        to: move.to,
        promotion: move.promotion,
        color: move.color,
        fen: move.fen,
      })),
      engine,
      depth: settings.reviewDepth,
      onProgress: ({ done, total, engineUsed }) => {
        if (cancelled) return;
        setProgress(Math.min(100, Math.round((done / Math.max(1, total)) * 100)));
        if (!engineUsed) setPhase('done');
      },
    })
      .then((result) => {
        if (cancelled) return;
        reportCache.set(cacheKey, result);
        setReport(result);
        setProgress(100);
        setPhase('done');
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('error');
      });

    return () => {
      cancelled = true;
    };
  }, [game, gameId, settings.reviewDepth, runKey]);

  // Dispose the dedicated worker when leaving the page.
  useEffect(() => {
    const engine = engineRef.current;
    return () => engine.dispose();
  }, []);

  /* ---------------- derived ---------------- */
  const snapshot = game?.snapshot ?? null;
  const moves = snapshot?.moves ?? [];
  const totalPlies = moves.length;
  const shownPly = Math.min(Math.max(0, ply), totalPlies);
  const currentMove = shownPly > 0 ? moves[shownPly - 1] : null;
  const analysis = currentMove && report ? report.moves[shownPly - 1] : null;

  const fen = useMemo(() => {
    if (!snapshot) return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (shownPly === 0) return snapshot.initialFen;
    return moves[shownPly - 1]?.fen ?? snapshot.fen;
  }, [moves, shownPly, snapshot]);

  const evalAtPly = useMemo(() => {
    if (!report || report.moves.length === 0) return 0;
    if (shownPly === 0) return report.moves[0].evalBefore;
    return report.moves[Math.min(shownPly, report.moves.length) - 1].evalAfter;
  }, [report, shownPly]);

  const lastMove = currentMove ? { from: currentMove.from, to: currentMove.to } : null;

  const exploreEval = useLiveEval(explore ? fen : null, explore, { depth: 20, movetime: 700, multipv: 3 });

  const arrows: BoardArrow[] = useMemo(() => {
    if (!explore) return [];
    const best = exploreEval.lines[0]?.pv[0];
    if (!best || best.length < 4) return [];
    const { from, to } = squaresFromUci(best);
    return [{ from, to, color: getBoardTheme(settings.boardTheme).arrows.blue }];
  }, [explore, exploreEval.lines, settings.boardTheme]);

  const orientation = settings.boardOrientation === 'black' ? 'b' : 'w';
  const theme = getBoardTheme(settings.boardTheme);

  const copyPgn = useCallback(async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.pgn);
      toast({ level: 'success', title: 'PGN copied', description: 'Paste it into the practice board to explore.' });
    } catch {
      toast({ level: 'error', title: 'Could not copy the PGN' });
    }
  }, [snapshot]);

  /* ---------------- keyboard navigation ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || retryIndex !== null) return;
      if (event.key === 'ArrowLeft') setPly((p) => Math.max(0, p - 1));
      if (event.key === 'ArrowRight') setPly((p) => Math.min(totalPlies, p + 1));
      if (event.key === 'Home') setPly(0);
      if (event.key === 'End') setPly(totalPlies);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [retryIndex, totalPlies]);

  const retryContext = useMemo(() => {
    if (retryIndex === null || !report || !snapshot) return null;
    const move = report.moves[retryIndex];
    if (!move) return null;
    const fenBefore = retryIndex === 0 ? snapshot.initialFen : moves[retryIndex - 1].fen;
    return { move, fenBefore };
  }, [moves, report, retryIndex, snapshot]);

  /* ---------------- render ---------------- */

  if (loadError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <h1 className="text-xl font-black text-arena-text">{loadError}</h1>
        <p className="mt-2 text-sm text-arena-muted">
          Archived games live in server memory, so very old games may have been recycled.
        </p>
        <Button className="mt-5" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4" />
          Back to lobby
        </Button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-arena-line border-t-accent" />
        <p className="text-sm text-arena-muted">Loading the game…</p>
      </div>
    );
  }

  const result = snapshot.result;
  const whiteWon = result?.winner === 'w';
  const blackWon = result?.winner === 'b';

  return (
    <div className="mx-auto w-full max-w-[1400px] px-3 py-4 lg:px-6 lg:py-6">
      {/* Header */}
      <div className="panel mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Trophy className={cn('h-5 w-5', result?.winner ? 'text-accent' : 'text-arena-muted')} />
              <h1 className="truncate text-lg font-black text-arena-text">
                {result?.winner
                  ? `${result.winner === 'w' ? snapshot.white.username : snapshot.black.username} won`
                  : 'Draw'}
                <span className="ml-2 text-sm font-semibold text-arena-muted">
                  {REASON_LABEL[result?.reason ?? ''] ?? ''}
                </span>
              </h1>
            </div>
            <p className="mt-1 text-xs text-arena-muted">
              {snapshot.white.username} ({snapshot.white.rating}) vs {snapshot.black.username} ({snapshot.black.rating}) ·{' '}
              {formatTimeControl(snapshot.timeControl)} · {totalPlies} moves
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {game?.ratings && (
              <RatingChange
                delta={game.ratings.white.delta}
                before={game.ratings.white.rating}
                after={game.ratings.white.after ?? game.ratings.white.rating + game.ratings.white.delta}
              />
            )}
            <Button variant="secondary" size="sm" onClick={copyPgn}>
              <Copy className="h-3.5 w-3.5" />
              PGN
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              <ArrowLeft className="h-3.5 w-3.5" />
              Lobby
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        {/* Board column */}
        <div className="mx-auto w-full max-w-[720px] space-y-3">
          <div className="flex gap-2">
            {settings.showEvalBar && (
              <EvalBar
                cpWhite={evalAtPly}
                mateWhite={cpToMate(evalAtPly)}
                orientation={orientation}
                thinking={explore && exploreEval.thinking}
                className="h-auto self-stretch"
              />
            )}
            <div className="relative min-w-0 flex-1">
              <Board
                fen={fen}
                orientation={orientation}
                theme={theme}
                pieceSet={settings.pieceSet}
                interactive={false}
                lastMove={settings.highlightLastMove ? lastMove : null}
                arrows={arrows}
                allowDrawing
                showCoordinates={settings.showCoordinates}
                animationMs={settings.animatePieces ? settings.animationMs : 0}
                className="board-frame"
              />
              {analysis && analysis.classification && shownPly > 0 && (
                <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-2 rounded-md bg-black/65 px-2 py-1 backdrop-blur">
                  <span className="font-mono text-sm font-bold text-white">
                    {Math.ceil(shownPly / 2)}
                    {shownPly % 2 === 1 ? '.' : '...'} {analysis.san}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Step controls */}
          <div className="flex items-center gap-2 rounded-lg border border-arena-line/50 bg-arena-panel px-2 py-1.5">
            <NavButton label="First move" onClick={() => setPly(0)} disabled={shownPly === 0}>
              <ChevronFirst className="h-4 w-4" />
            </NavButton>
            <NavButton label="Previous move" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={shownPly === 0}>
              <ChevronLeft className="h-4 w-4" />
            </NavButton>
            <span className="flex-1 text-center text-xs font-bold text-arena-muted">
              {shownPly === 0 ? 'Starting position' : `Move ${Math.ceil(shownPly / 2)} — ${currentMove?.san}`}
            </span>
            <NavButton label="Next move" onClick={() => setPly((p) => Math.min(totalPlies, p + 1))} disabled={shownPly >= totalPlies}>
              <ChevronRight className="h-4 w-4" />
            </NavButton>
            <NavButton label="Last move" onClick={() => setPly(totalPlies)} disabled={shownPly >= totalPlies}>
              <ChevronLast className="h-4 w-4" />
            </NavButton>
          </div>

          {analysis && (
            <div className="rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2.5">
              <p className="font-mono text-sm font-bold text-arena-text">
                {Math.ceil(shownPly / 2)}
                {shownPly % 2 === 1 ? '.' : '...'} {analysis.san}
              </p>
              <p className="mt-0.5 text-[11px] text-arena-muted">{analysis.comment}</p>
              {analysis.bestMoveSan && analysis.classification !== 'best' && (
                <p className="mt-1 text-[11px] font-bold text-accent">
                  Engine prefers {analysis.bestMoveSan} · eval {formatEvalFromCp(analysis.bestEval)}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              variant={explore ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                sounds.play('click');
                setExplore((v) => !v);
              }}
            >
              <Cpu className="h-3.5 w-3.5" />
              {explore ? 'Exploring' : 'Explore position'}
            </Button>
            <span className="text-[11px] text-arena-dim">← → step · Home/End jump</span>
          </div>
        </div>

        {/* Analysis column */}
        <aside className="space-y-3">
          {phase === 'running' && (
            <AnalysisProgress
              value={progress}
              label="Analysing every move"
              detail={`Depth ${settings.reviewDepth} · Stockfish is grading each position on this device.`}
            />
          )}
          {phase === 'error' && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-xs font-semibold text-danger">
              Analysis failed. Try a lower review depth in Settings.
            </div>
          )}
          {phase === 'done' && report && !report.engineUsed && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-3 text-xs font-semibold text-warn">
              Stockfish could not be loaded, so this review uses tactical heuristics only.
            </div>
          )}

          <div className="panel overflow-hidden">
            <div className="flex items-center gap-1 border-b border-arena-line/50 p-2">
              {(
                [
                  ['summary', 'Summary'],
                  ['moves', 'Moves'],
                  ['moments', `Key moments${report?.keyMoments.length ? ` (${report.keyMoments.length})` : ''}`],
                ] as Array<[Tab, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-2 text-xs font-bold transition-colors',
                    tab === id ? 'bg-accent/15 text-accent' : 'text-arena-muted hover:bg-arena-raised',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="max-h-[calc(100vh-16rem)] min-h-[320px] overflow-y-auto p-3">
              {tab === 'summary' && report && (
                <div className="space-y-3">
                  <AccuracyCards
                    accuracy={report.accuracy}
                    counts={report.counts}
                    white={snapshot.white}
                    black={snapshot.black}
                    engineUsed={report.engineUsed}
                  />
                  <div className="flex items-center gap-2 rounded-lg border border-arena-line/50 bg-arena-panel2 px-3 py-2 text-[11px] text-arena-muted">
                    <BrainCircuit className="h-3.5 w-3.5 text-accent" />
                    Analysed at depth {report.depth || '—'} on this device.
                  </div>
                </div>
              )}

              {tab === 'summary' && !report && (
                <p className="px-2 py-6 text-center text-xs text-arena-dim">
                  {phase === 'running' ? 'Grading moves…' : 'No analysis available.'}
                </p>
              )}

              {tab === 'moves' && (
                <MoveList
                  moves={report?.moves ?? moves}
                  currentPly={shownPly}
                  onJump={setPly}
                  showBadges={Boolean(report)}
                  emptyHint="No moves in this game."
                />
              )}

              {tab === 'moments' && report && (
                <KeyMoments
                  moves={report.moves}
                  keyMoments={report.keyMoments}
                  onJump={(index) => setPly(index + 1)}
                  onRetry={(index) => setRetryIndex(index)}
                />
              )}

              {tab === 'moments' && !report && (
                <p className="px-2 py-6 text-center text-xs text-arena-dim">Key moments appear after the analysis.</p>
              )}
            </div>
          </div>

          {explore && (
            <div className="panel p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-arena-muted">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Top lines here
              </p>
              <EngineLines
                lines={exploreEval.lines}
                available={exploreEval.available}
                error={exploreEval.error}
                depth={exploreEval.depth}
              />
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => {
              reportCache.delete(`${gameId}:${settings.reviewDepth}`);
              setReport(null);
              setPhase('idle');
              setRunKey((k) => k + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run analysis
          </Button>
        </aside>
      </div>

      <RetryDialog
        open={retryIndex !== null}
        fen={retryContext?.fenBefore ?? null}
        sideToMove={retryContext?.move.color ?? 'w'}
        bestUci={retryContext?.move.bestMoveUci ?? null}
        bestSan={retryContext?.move.bestMoveSan ?? null}
        notation={retryContext ? `${Math.ceil((retryIndex! + 1) / 2)}. ${retryContext.move.san}` : ''}
        classificationLabel={retryContext?.move.classification ?? ''}
        onClose={() => setRetryIndex(null)}
      />
    </div>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-md p-2 text-arena-muted transition-colors hover:bg-arena-raised hover:text-arena-text disabled:opacity-35"
    >
      {children}
    </button>
  );
}
