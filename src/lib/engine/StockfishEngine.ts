'use client';

/**
 * Stockfish.js wrapper.
 *
 * The engine runs in a Web Worker fully client-side (no server CPU used for
 * analysis). Loading is intentionally over-engineered because Stockfish in the
 * browser has a few sharp edges:
 *
 *  1. Cross-origin worker scripts cannot be passed to `new Worker()` directly,
 *     so remote builds are fetched and re-injected as a Blob worker.
 *  2. Multi-file builds (`stockfish.js` → `stockfish.wasm.js` → `stockfish.wasm`)
 *     resolve relative asset paths against the worker's base URL, which is the
 *     page origin for Blob workers. We therefore (a) rewrite known asset
 *     references to absolute URLs and (b) inject a `Module.locateFile` shim.
 *  3. If a candidate fails to complete the UCI handshake we transparently move
 *     to the next one.
 *
 * Candidates are tried in order: explicit env override → bundled build in
 * `public/engine` (fetch it with `npm run fetch:engine`) → jsDelivr → unpkg →
 * self-contained asm.js fallback.
 */

export interface RawEngineLine {
  multipv: number;
  depth: number;
  /** Centipawns from the side to move. */
  cp: number;
  /** Mate distance in plies from the side to move, or null. */
  mate: number | null;
  pv: string[];
}

export interface EngineEvaluation {
  lines: RawEngineLine[];
  bestMove: string | null;
  depth: number;
  /** Centipawns from White's point of view (mates folded into ±100000 scale). */
  cpWhite: number;
  /** Mate distance in plies from White's point of view, or null. */
  mateWhite: number | null;
  /** True when the search was interrupted before reaching the target depth. */
  partial: boolean;
  elapsedMs: number;
  nodes: number;
  source: string;
}

export interface AnalyseOptions {
  /** Target search depth (defaults to 14). */
  depth?: number;
  /** Hard time cap in milliseconds — takes priority over depth when reached. */
  movetime?: number;
  /** Number of principal variations (1-5). */
  multipv?: number;
  /** Called on every `info` update for streaming UIs (eval bar, arrows). */
  onUpdate?: (evaluation: EngineEvaluation) => void;
  /** Abort signal support. */
  signal?: AbortSignal;
}

export interface SearchHandle {
  stop: () => void;
  done: Promise<EngineEvaluation>;
}

const DEFAULT_DEPTH = Number(process.env.NEXT_PUBLIC_REVIEW_DEPTH ?? 14) || 14;

export const MATE_CP = 100000;

/** Folds a mate score into the centipawn scale so movers can be compared. */
export function mateToCp(mate: number | null, cp: number): number {
  if (mate === null) return cp;
  const sign = mate === 0 ? 1 : Math.sign(mate);
  return sign * (MATE_CP - Math.min(Math.abs(mate), 100) * 100);
}

const LOCAL_ASSET_RE = /(["'])((?:\.\.?\/)?stockfish[\w.\-]*(?:\.wasm\.js|\.asm\.js|\.wasm|\.data|\.js|\.worker\.js))\1/g;

function candidateUrls(): string[] {
  const urls: string[] = [];
  const override = process.env.NEXT_PUBLIC_STOCKFISH_URL;
  if (override) urls.push(override);
  urls.push(
    '/engine/stockfish.js',
    'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js',
    'https://unpkg.com/stockfish.js@10.0.2/stockfish.js',
    'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.asm.js',
  );
  return Array.from(new Set(urls));
}

function isSameOrigin(url: string): boolean {
  if (url.startsWith('/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Builds a Blob worker from a remote engine build, rewriting internal asset
 * references so multi-file builds still resolve after being inlined.
 */
async function createRemoteWorker(url: string, signal?: AbortSignal): Promise<Worker> {
  const absolute = new URL(url, window.location.href).href;
  const res = await fetch(absolute, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let code = await res.text();
  if (code.length < 500) throw new Error('Engine payload too small — not a worker build');

  const preamble =
    `/* injected by chess-arena: resolve engine assets against the CDN */\n` +
    `self.Module = Object.assign({}, self.Module || {}, {\n` +
    `  locateFile: function (path) { try { return new URL(path, ${JSON.stringify(absolute)}).href; } catch (e) { return path; } }\n` +
    `});\n`;
  code = code.replace(LOCAL_ASSET_RE, (_match, quote: string, path: string) => {
    const href = new URL(path, absolute).href;
    return `${quote}${href}${quote}`;
  });

  // The engine build may itself call importScripts with relative paths.
  code = code.replace(/importScripts\(\s*(["'])([^"']+)\1\s*\)/g, (_m, quote: string, path: string) => {
    if (/^https?:|^\/\//.test(path) || path.startsWith('blob:') || path.startsWith('data:')) return _m;
    return `importScripts(${quote}${new URL(path, absolute).href}${quote})`;
  });

  const blob = new Blob([preamble + code], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const worker = new Worker(blobUrl);
  // The blob URL stays referenced by the worker for its lifetime.
  return worker;
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                     */
/* -------------------------------------------------------------------------- */

interface ActiveSearch {
  id: number;
  lines: Map<number, RawEngineLine>;
  bestMove: string | null;
  depth: number;
  nodes: number;
  startedAt: number;
  targetDepth: number;
  turn: 'w' | 'b';
  onUpdate?: (e: EngineEvaluation) => void;
  resolve: (e: EngineEvaluation) => void;
  partial: boolean;
}

export class StockfishEngine {
  private worker: Worker | null = null;
  private bootPromise: Promise<void> | null = null;
  private ready = false;
  private disposed = false;
  private searchId = 0;
  private active: ActiveSearch | null = null;
  private discardNextBestMove = false;
  private buffered = '';
  private source = 'none';
  private lastError: string | null = null;

  get isReady() {
    return this.ready;
  }

  get engineSource() {
    return this.source;
  }

  get lastFailure() {
    return this.lastError;
  }

  /** Boots the engine, trying each candidate URL until one completes the UCI handshake. */
  boot(signal?: AbortSignal): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = (async () => {
      const errors: string[] = [];
      for (const url of candidateUrls()) {
        if (this.disposed) throw new Error('Engine disposed');
        try {
          await this.bootFrom(url, signal);
          this.ready = true;
          this.source = url;
          return;
        } catch (error) {
          errors.push(`${url}: ${(error as Error).message}`);
          this.teardownWorker();
        }
      }
      this.lastError = errors.join(' | ');
      throw new Error(`Stockfish could not be loaded. ${this.lastError}`);
    })();
    return this.bootPromise;
  }

  private async bootFrom(url: string, signal?: AbortSignal) {
    const worker = isSameOrigin(url)
      ? new Worker(url.startsWith('/') ? url : new URL(url).pathname)
      : await createRemoteWorker(url, signal);

    const handshake = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('handshake timeout')), 25000);
      let sawUciOk = false;
      const listener = (event: MessageEvent) => {
        const text = String(event.data ?? '');
        if (text.includes('uciok')) sawUciOk = true;
        if (sawUciOk && text.includes('readyok')) {
          window.clearTimeout(timeout);
          worker.removeEventListener('message', listener);
          worker.removeEventListener('error', onError);
          resolve();
        }
      };
      const onError = (event: ErrorEvent) => {
        window.clearTimeout(timeout);
        worker.removeEventListener('message', listener);
        reject(new Error(event.message || 'worker error'));
      };
      worker.addEventListener('message', listener);
      worker.addEventListener('error', onError);
    });

    worker.onmessage = (event: MessageEvent) => this.onMessage(String(event.data ?? ''));
    worker.postMessage('uci');
    worker.postMessage('setoption name Hash value 32');
    worker.postMessage('setoption name Threads value 1');
    worker.postMessage('isready');
    this.worker = worker;
    await handshake;
  }

  private teardownWorker() {
    if (this.worker) {
      try {
        this.worker.postMessage('quit');
      } catch {
        /* ignore */
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.buffered = '';
  }

  private onMessage(text: string) {
    this.buffered += text;
    const lines = this.buffered.split('\n');
    this.buffered = lines.pop() ?? '';
    for (const line of lines) this.handleLine(line.trim());
  }

  private handleLine(line: string) {
    if (!line) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      this.handleInfo(line);
      return;
    }
    if (line.startsWith('info') && this.active) {
      // Depth-only / currmove updates still bump the reported depth.
      const depth = / depth (\d+)/.exec(line)?.[1];
      if (depth) this.active.depth = Math.max(this.active.depth, Number(depth));
      return;
    }
    if (line.startsWith('bestmove')) {
      const move = line.split(/\s+/)[1] ?? null;
      if (this.discardNextBestMove) {
        this.discardNextBestMove = false;
        return;
      }
      const active = this.active;
      if (!active) return;
      this.active = null;
      active.bestMove = move;
      active.resolve(this.buildEvaluation(active, false));
    }
  }

  private handleInfo(line: string) {
    const active = this.active;
    if (!active) return;
    const depth = Number(/ depth (\d+)/.exec(line)?.[1] ?? active.depth);
    const multipv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 1);
    const pvMatch = / pv (.+)$/.exec(line);
    const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];
    const cpMatch = / score cp (-?\d+)/.exec(line);
    const mateMatch = / score mate (-?\d+)/.exec(line);
    const nodes = Number(/ nodes (\d+)/.exec(line)?.[1] ?? active.nodes);
    // Ignore bound-only info lines (they are not authoritative evals).
    if (/ (lowerbound|upperbound)( |$)/.test(line)) return;

    active.nodes = nodes;
    active.depth = Math.max(active.depth, depth);
    active.lines.set(multipv, {
      multipv,
      depth,
      cp: cpMatch ? Number(cpMatch[1]) : 0,
      mate: mateMatch ? Number(mateMatch[1]) : null,
      pv,
    });
    if (active.onUpdate) active.onUpdate(this.buildEvaluation(active, true));
  }

  private buildEvaluation(active: ActiveSearch, partial: boolean): EngineEvaluation {
    const lines = Array.from(active.lines.values()).sort((a, b) => a.multipv - b.multipv);
    const primary = lines[0];
    const flip = active.turn === 'b' ? -1 : 1;
    const cp = primary ? primary.cp * flip : 0;
    const mate = primary && primary.mate !== null ? primary.mate * flip : null;
    return {
      lines,
      bestMove: active.bestMove ?? primary?.pv[0] ?? null,
      depth: active.depth,
      cpWhite: mateToCp(mate, cp),
      mateWhite: mate,
      partial,
      elapsedMs: Date.now() - active.startedAt,
      nodes: active.nodes,
      source: this.source,
    };
  }

  /**
   * Runs a search, cancelling whatever was running before. Only one consumer per
   * instance (see `getLiveEngine` / `createReviewEngine`), which keeps this simple.
   */
  async analyse(fen: string, options: AnalyseOptions = {}): Promise<EngineEvaluation> {
    if (this.disposed) throw new Error('Engine disposed');
    await this.boot(options.signal);
    this.interrupt();
    const worker = this.worker;
    if (!worker) throw new Error('Engine worker unavailable');

    const depth = options.depth ?? DEFAULT_DEPTH;
    const multipv = Math.min(5, Math.max(1, options.multipv ?? 1));
    const turn = (fen.split(' ')[1] as 'w' | 'b') ?? 'w';

    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    return new Promise<EngineEvaluation>((resolve) => {
      const id = ++this.searchId;
      this.active = {
        id,
        lines: new Map(),
        bestMove: null,
        depth: 0,
        nodes: 0,
        startedAt: Date.now(),
        targetDepth: depth,
        turn,
        onUpdate: options.onUpdate,
        resolve,
        partial: false,
      };
      const onAbort = () => {
        this.interrupt();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });

      worker.postMessage(`setoption name MultiPV value ${multipv}`);
      worker.postMessage(`position fen ${fen}`);
      if (options.movetime) {
        worker.postMessage(`go movetime ${Math.round(options.movetime)}`);
      } else {
        worker.postMessage(`go depth ${depth}`);
      }
    });
  }

  /** Streaming variant returning a handle (used by the eval bar and practice board). */
  search(fen: string, options: AnalyseOptions = {}): SearchHandle {
    let stopped = false;
    const done = this.analyse(fen, { ...options, signal: options.signal }).catch((error: unknown) => {
      stopped = true;
      throw error;
    });
    return {
      stop: () => {
        if (!stopped) {
          stopped = true;
          this.interrupt();
        }
      },
      done,
    };
  }

  /** Stops the current search, resolving it with the best evaluation so far. */
  interrupt() {
    const active = this.active;
    if (!active || !this.worker) return;
    this.active = null;
    this.discardNextBestMove = true;
    try {
      this.worker.postMessage('stop');
    } catch {
      /* ignore */
    }
    active.partial = true;
    active.resolve(this.buildEvaluation(active, true));
  }

  dispose() {
    this.disposed = true;
    this.interrupt();
    this.teardownWorker();
    this.ready = false;
    this.bootPromise = null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Shared instances                                                           */
/* -------------------------------------------------------------------------- */

let liveEngine: StockfishEngine | null = null;

/** Long-lived instance for the eval bar / practice arrows. */
export function getLiveEngine(): StockfishEngine {
  if (!liveEngine || liveEngine['disposed']) liveEngine = new StockfishEngine();
  return liveEngine;
}

/**
 * Review analysis needs a dedicated worker so stepping through moves never
 * fights with the live eval bar. Dispose it when finished.
 */
export function createReviewEngine(): StockfishEngine {
  return new StockfishEngine();
}

/** Warms the engine up in the background (called on app boot, errors ignored). */
export function preloadEngine() {
  void getLiveEngine()
    .boot()
    .catch(() => {
      /* handled by the UI when analysis is requested */
    });
}
