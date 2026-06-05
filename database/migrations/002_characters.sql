-- Fase B: personagens com colunas de posição (fonte principal no servidor)
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  name text not null,
  vocation_id text not null,
  gender text not null check (gender in ('male', 'female')),
  outfit_id text not null,
  sprite_sheet_url text not null,
  level integer not null default 1,
  experience bigint not null default 0,
  map_id text not null default 'rookgaard',
  position_x integer not null default 100,
  position_y integer not null default 100,
  position_z integer not null default 7,
  direction text not null default 'south'
    check (direction in ('north', 'south', 'east', 'west')),
  outfit_config jsonb not null default '{}'::jsonb,
  spawn_map_id text not null default 'rookgaard',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_played_at timestamptz
);

create unique index if not exists characters_name_unique
  on characters (lower(name))
  where deleted_at is null;

create index if not exists characters_account_id_idx
  on characters(account_id)
  where deleted_at is null;
