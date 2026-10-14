# ♞ Chess Arena

A production-ready Chess.com clone: real-time **human vs human** matchmaking, live play with
server-authoritative clocks, and Stockfish-powered game review. No bots, no accounts — just chess.

Built with **Next.js 15 (App Router) · TypeScript · Tailwind · chess.js · Socket.io**, running on a
single Node process you can host for free.

---

## Features

| | |
|---|---|
| ⚡ | Quick play: 1+0, 3+0, 5+0, 10+0 and custom increments (3+2, 5+5, 15+10, …) |
| 🔗 | Private rooms with shareable codes/links (`/?room=ABC-DEF`) |
| 🕐 | Server-authoritative millisecond clocks with client smoothing |
| 📊 | Elo ratings with dynamic K-factor (provisional → established) |
| 🔁 | Resign / draw / rematch flows with color swap |
| 🔍 | Post-game Stockfish review: move classification, accuracy %, key moments, retry-your-mistakes |
| 🧪 | Free analysis board with FEN/PGN load, live engine eval + multi-PV lines |
| 🎨 | 6 board themes × 4 piece sets, eval bar, captured pieces, move history with jump-to-move |
| 📱 | PWA + safe-area support — works great on Android phones and desktop |
| 🔊 | Synthesized Web Audio sounds (zero audio files) |

---

## Quick start

```bash
npm install
npm run dev          # node server/index.mjs --dev
```

Open <http://localhost:3000>.

### Production

```bash
npm run build
npm start            # node server/index.mjs
```

### Bundle Stockfish locally (recommended)

The engine runs 100% in the browser (a Web Worker — the server never uses CPU for it).
By default it loads from a CDN with a self-contained asm.js fallback. To vendor it so the
app works fully offline:

```bash
npm run fetch:engine
```

This downloads the builds into `public/engine/` (git-ignored).

---

## Configuration

Copy `.env.example` → `.env.local` / `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | Bind address |
| `RECONNECT_GRACE_MS` | `30000` | Time a disconnected player has to reconnect |
| `PUBLIC_URL` | — | Public URL, used to build private-room invite links |
| `NEXT_PUBLIC_SOCKET_URL` | — | Point the frontend at a separate realtime host |
| `NEXT_PUBLIC_STOCKFISH_URL` | — | Custom engine URL tried first |
| `NEXT_PUBLIC_REVIEW_DEPTH` | `14` | Post-game search depth |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | — | Persist ratings/games to Supabase instead of local JSON |

---

## Free hosting

### Render (blueprint — recommended)

1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo (it reads `render.yaml`).
3. Done — Socket.io runs on the same origin, no extra config.

The free tier sleeps when idle; the first request wakes it in a few seconds. Ratings persist to
`data/` for the life of the instance.

### Docker / Fly.io / Koyeb

```bash
docker build -t chess-arena .
docker run -p 3000:3000 chess-arena
```

- `fly.toml` — `fly launch --no-deploy && fly deploy`
- Koyeb — deploy the Docker image, health check on `/api/health`

### Split hosting (Vercel frontend + Render socket)

Set `NEXT_PUBLIC_SOCKET_URL=https://your-socket-app.onrender.com` on the Vercel side and
`CORS_ORIGIN=https://your-frontend.vercel.app` on the socket side.

---

## How it works

```
src/app            Next.js App Router pages (lobby, game, review, practice, …)
src/components     Board (custom SVG/DOM), game HUD, analysis UI, lobby
src/lib            chess.js helpers, Elo, sounds, Stockfish engine, Socket.io client
src/store          Zustand stores (settings, live game)
server/             Node + Socket.io authoritative server (ESM, no build step)
  index.mjs          Next + Socket.io + REST on one origin
  lib/game.mjs       Authoritative Game: legality, clocks, results
  lib/manager.mjs    Matchmaking, presence, rematch, clock sweeper
  lib/matchmaking.mjs  Rating-windowed queues per time control
  lib/elo.mjs        Elo maths (mirrors src/lib/elo.ts)
  lib/store.mjs      In-memory + JSON persistence (swap for Supabase if needed)
supabase/schema.sql Optional hosted Postgres schema
scripts/fetch-engine.mjs  Vendor Stockfish into public/engine/
```

### Anti-cheat

- The **server** owns chess.js and the clocks. The browser sends intent (`{from,to,promotion}`);
  the server validates, applies and broadcasts the result. Moves are impossible to forge.
- Live engine analysis is **disabled during rated games** and enabled for casual/finished/practice.
- Reconnects keep the game alive for `RECONNECT_GRACE_MS`; abandoning a live game loses on time.

### Analysis

Stockfish runs in a browser Web Worker. The loading chain is deliberately multi-candidate:
env override → bundled `public/engine/` → jsDelivr → unpkg → asm.js fallback, with remote
builds fetched and re-injected as Blob workers (plus `Module.locateFile` rewriting) so the
handshake works cross-origin.

---

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | Uptime + counts |
| `GET /api/leaderboard?limit=25` | Top rated players |
| `GET /api/players/:id` | Profile + recent games |
| `GET /api/games/:id` | Archived game (snapshot, PGN, ratings) |

Socket events are typed in `src/lib/types.ts` (mirrored by `server/`).

---

## Notes

- No tutorial popups or onboarding tours, by design.
- All sounds are synthesized with the Web Audio API — drop real samples into `public/sounds/`
  with a `manifest.json` to override (see `src/lib/sounds.ts`).
- `data/*.json` holds ratings + game history; it's git-ignored and safe to delete.
