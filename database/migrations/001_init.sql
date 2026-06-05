-- Fase B: contas próprias (substitui Supabase auth.users + profiles)
create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  role text not null default 'player'
    check (role in ('player', 'gm', 'admin')),
  can_access_studio boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounts_email_lower_idx on accounts (lower(email));
