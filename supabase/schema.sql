-- ---------------------------------------------------------------------------
-- Chess Arena — optional Supabase schema.
--
-- The realtime layer always runs on the Node/socket.io server (free hosting on
-- Render/Koyeb/Fly). This schema is only needed if you want ratings, games and
-- the leaderboard to live in hosted Postgres instead of the local JSON files
-- (i.e. multiple server instances behind a load balancer).
--
-- Apply with:  supabase db push   (or paste into the SQL editor)
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- Players are keyed by the device-scoped UUID the browser stores locally.
create table if not exists public.players (
  id            text primary key,
  username      text not null,
  avatar_seed   text not null,
  rating        integer not null default 1200,
  best_rating   integer not null default 1200,
  games         integer not null default 0,
  wins          integer not null default 0,
  losses        integer not null default 0,
  draws         integer not null default 0,
  streak_type   text not null default 'none',
  streak_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create unique index if not exists players_username_key on public.players (lower(username));
create index if not exists players_rating_idx on public.players (rating desc, games desc);

-- One row per finished game. `snapshot` holds the full GameSnapshot JSON so the
-- review page can rebuild the position list without extra joins.
create table if not exists public.games (
  id            text primary key,
  room_code     text,
  rated         boolean not null default true,
  initial_seconds integer not null,
  increment_seconds integer not null,
  white_id      text references public.players (id) on delete set null,
  black_id      text references public.players (id) on delete set null,
  winner        text,                       -- 'w' | 'b' | null (draw)
  reason        text not null,
  white_rating_delta integer not null default 0,
  black_rating_delta integer not null default 0,
  rated_snapshot jsonb,                     -- { white: RatingSnapshot, black: RatingSnapshot } | null
  snapshot      jsonb not null,             -- full GameSnapshot
  pgn           text,
  finished_at   timestamptz not null default now()
);

create index if not exists games_finished_idx on public.games (finished_at desc);
create index if not exists games_white_idx on public.games (white_id);
create index if not exists games_black_idx on public.games (black_id);

-- Compact per-player history rows (mirrors GameSummary) for fast profile loads.
create table if not exists public.game_summaries (
  game_id       text not null references public.games (id) on delete cascade,
  player_id     text not null references public.players (id) on delete cascade,
  opponent_id   text,
  outcome       text not null check (outcome in ('win', 'loss', 'draw')),
  color         text not null check (color in ('w', 'b')),
  rating_delta  integer not null default 0,
  rating_after  integer not null default 0,
  played_at     timestamptz not null default now(),
  primary key (game_id, player_id)
);

create index if not exists game_summaries_player_idx on public.game_summaries (player_id, played_at desc);

-- Leaderboard view the REST layer can select from directly.
create or replace view public.leaderboard as
  select id, username, rating, games, wins, losses, draws, avatar_seed
  from public.players
  where games > 0
  order by rating desc, games desc, lower(username) asc;

-- ---------------------------------------------------------------------------
-- Row level security: the app talks to Postgres with the service-role key from
-- the server only, so deny everything to anon by default.
-- ---------------------------------------------------------------------------

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_summaries enable row level security;

-- Optional: allow anonymous read of the public leaderboard.
drop policy if exists "leaderboard is public" on public.players;
create policy "leaderboard is public" on public.players
  for select using (games > 0);
