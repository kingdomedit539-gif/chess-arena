/**
 * Chess Arena — combined Next.js + Socket.io server.
 *
 * One Node process serves:
 *   • the Next app (SSR + static assets)
 *   • the realtime layer on the same origin under `/socket.io`
 *   • a tiny REST surface used by the leaderboard / review pages
 *
 * Keeping everything on one origin means no CORS, no extra config and a single
 * free-tier deploy target (Render / Koyeb / Fly / any Docker host).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { Server as SocketServer } from 'socket.io';
import { GameManager } from './lib/manager.mjs';
import { store } from './lib/store.mjs';
import { cleanId, cleanUsername, normaliseTimeControl } from './lib/util.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/* -------------------------------------------------------------------------- */
/*  Minimal .env loader (no dependency)                                        */
/* -------------------------------------------------------------------------- */

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(projectRoot, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1];
      if (process.env[key] !== undefined) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();

const dev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

/* -------------------------------------------------------------------------- */
/*  Next                                                                       */
/* -------------------------------------------------------------------------- */

const app = next({ dev, dir: projectRoot, hostname, port });
const handle = app.getRequestHandler();
await app.prepare();

/* -------------------------------------------------------------------------- */
/*  Realtime                                                                   */
/* -------------------------------------------------------------------------- */

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim())
  : true;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url, io, manager);
      return;
    }
    await handle(req, res);
  } catch (error) {
    console.error('[http] request failed:', error);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

const io = new SocketServer(server, {
  path: '/socket.io',
  cors: { origin: corsOrigin, credentials: true },
  maxHttpBufferSize: 1e6,
  pingTimeout: 20000,
  pingInterval: 10000,
});

const manager = new GameManager(io, store);
if (process.env.PUBLIC_URL) manager.setPublicUrl(process.env.PUBLIC_URL);

/* -------------------------------------------------------------------------- */
/*  Socket handlers                                                            */
/* -------------------------------------------------------------------------- */

io.on('connection', (socket) => {
  socket.on('user:hello', async (payload, ack) => {
    const rawId = cleanId(payload?.id);
    const id = rawId ?? `u_${Math.random().toString(36).slice(2, 14)}`;
    const username = cleanUsername(payload?.username, `Player${Math.floor(Math.random() * 9000 + 1000)}`);
    const player = store.ensurePlayer(id, username);
    store.setOnline(player.id, true);

    await manager.attachSocket(socket, player);

    const publicPlayer = store.toPublic(player);
    const serverTime = Date.now();
    socket.emit('user:ready', { player: publicPlayer, serverTime });
    if (typeof ack === 'function') ack({ player: publicPlayer, serverTime });
  });

  socket.on('user:profile', (payload, ack) => {
    const playerId = socket.data.playerId;
    if (!playerId) {
      if (typeof ack === 'function') ack({ player: null });
      return;
    }
    const username = cleanUsername(payload?.username, store.getPlayer(playerId)?.username ?? 'Player');
    const player = store.rename(playerId, username);
    if (typeof ack === 'function') ack({ player: player ? store.toPublic(player) : null });
  });

  /* ------------------------------ matchmaking ---------------------- */

  socket.on('queue:join', (payload) => {
    const player = requirePlayer(socket);
    if (!player) return;
    const request = {
      timeControl: normaliseTimeControl(payload?.timeControl),
      rated: Boolean(payload?.rated),
      color: payload?.color === 'w' || payload?.color === 'b' ? payload.color : 'random',
    };
    manager.enqueue(socket, player, request);
  });

  socket.on('queue:leave', () => {
    const playerId = socket.data.playerId;
    if (!playerId) return;
    manager.dequeue(playerId);
    socket.emit('queue:left');
  });

  /* ------------------------------ private rooms -------------------- */

  socket.on('room:create', (payload, ack) => {
    const player = requirePlayer(socket);
    if (!player) {
      if (typeof ack === 'function') ack({ roomCode: '', joinUrl: '' });
      return;
    }
    const request = {
      timeControl: normaliseTimeControl(payload?.timeControl),
      rated: Boolean(payload?.rated),
      color: payload?.color === 'w' || payload?.color === 'b' ? payload.color : 'random',
    };
    const game = manager.createRoom(socket, player, request);
    const joinUrl = manager.buildJoinUrl(socket, game.roomCode);
    // The creator sees the waiting board immediately.
    socket.emit('game:state', game.snapshot());
    if (typeof ack === 'function') ack({ roomCode: game.roomCode, joinUrl });
  });

  socket.on('room:join', (payload, ack) => {
    const player = requirePlayer(socket);
    if (!player) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Connecting… try again in a moment.' });
      return;
    }
    const result = manager.joinRoom(socket, player, payload?.roomCode);
    if (typeof ack === 'function') ack(result);
  });

  socket.on('room:spectate', (payload) => {
    manager.joinAsSpectator(socket, payload?.roomCode);
  });

  /* ------------------------------ game actions --------------------- */

  socket.on('game:move', (payload) => manager.applyMove(socket, payload));
  socket.on('game:resign', (payload) => manager.resign(socket, payload?.gameId));
  socket.on('game:abort', (payload) => manager.abort(socket, payload?.gameId));
  socket.on('game:draw:offer', (payload) => manager.offerDraw(socket, payload?.gameId));
  socket.on('game:draw:accept', (payload) => manager.acceptDraw(socket, payload?.gameId));
  socket.on('game:draw:decline', (payload) => manager.declineDraw(socket, payload?.gameId));
  socket.on('game:rematch:offer', (payload) => manager.offerRematch(socket, payload?.gameId));
  socket.on('game:rematch:accept', (payload) => manager.acceptRematch(socket, payload?.gameId));
  socket.on('game:chat', (payload) => manager.chat(socket, payload?.gameId, payload?.text));

  socket.on('game:sync', (payload) => {
    const playerId = socket.data.playerId;
    const gameId = payload?.gameId;
    if (!playerId || !gameId) return;
    const game = manager.games.get(gameId);
    if (game) {
      if (manager.socketGames.has(socket.id)) manager.socketGames.get(socket.id).add(gameId);
      socket.join(manager.room(gameId));
      socket.emit('game:state', game.snapshot());
    }
  });

  socket.on('game:resume', (payload, ack) => {
    const gameId = payload?.gameId;
    const playerId = socket.data.playerId;
    const respond = (value) => {
      if (typeof ack === 'function') ack(value);
    };
    if (!gameId) {
      respond({ error: 'Missing game id.' });
      return;
    }

    const game = manager.games.get(gameId);
    if (game) {
      if (playerId) {
        const color = game.colorOf(playerId);
        if (color) {
          manager.clearGrace(game.id, color);
          manager.emitToGame(game.id, 'game:presence', { color, online: true, graceMsLeft: 0 });
        }
      }
      socket.join(manager.room(game.id));
      manager.socketGames.get(socket.id)?.add(game.id);
      respond({ snapshot: game.snapshot() });
      return;
    }

    const archived = store.getArchivedGame(gameId);
    if (archived) {
      respond({ snapshot: archived.snapshot });
      return;
    }
    respond({ error: 'Game not found.' });
  });

  socket.on('disconnect', () => {
    manager.handleDisconnect(socket);
  });
});

function requirePlayer(socket) {
  const playerId = socket.data.playerId;
  if (!playerId) {
    socket.emit('error', { code: 'auth', message: 'Still connecting — please retry.' });
    return null;
  }
  const player = store.getPlayer(playerId);
  if (!player) {
    socket.emit('error', { code: 'auth', message: 'Unknown player.' });
    return null;
  }
  return player;
}

/* -------------------------------------------------------------------------- */
/*  REST                                                                       */
/* -------------------------------------------------------------------------- */

async function handleApi(req, res, url, _io, gameManager) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  const send = (status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };

  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const [, resource, id] = parts;

  if (resource === 'health') {
    send(200, {
      ok: true,
      uptime: Math.round(process.uptime()),
      serverTime: Date.now(),
      games: gameManager.games.size,
      ...store.stats(),
    });
    return;
  }

  if (resource === 'leaderboard') {
    const limit = Number(url.searchParams.get('limit') ?? 25);
    send(200, { entries: store.leaderboard(limit) });
    return;
  }

  if (resource === 'players' && id) {
    const profile = store.profile(decodeURIComponent(id));
    if (!profile) {
      send(404, { error: 'Player not found' });
      return;
    }
    send(200, profile);
    return;
  }

  if (resource === 'games' && id) {
    const archived = store.getArchivedGame(decodeURIComponent(id));
    if (archived) {
      send(200, archived);
      return;
    }
    // A game still in memory has no ratings yet, but the review page can still
    // open it (useful for the second player during the final seconds).
    const live = gameManager.games.get(decodeURIComponent(id));
    if (live) {
      send(200, { snapshot: live.snapshot(), ratings: null, finishedAt: Date.now() });
      return;
    }
    send(404, { error: 'Game not found' });
    return;
  }

  send(404, { error: 'Not found' });
}

/* -------------------------------------------------------------------------- */
/*  Boot                                                                       */
/* -------------------------------------------------------------------------- */

manager.startSweeper();

server.listen(port, hostname, () => {
  const label = hostname === '0.0.0.0' ? 'localhost' : hostname;
  console.log(`\n  ♞  Chess Arena ready on http://${label}:${port}  (${dev ? 'development' : 'production'})\n`);
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down`);
  manager.stopSweeper();
  try {
    store.persist();
  } catch {
    /* ignore */
  }
  io.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 3000).unref?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});
