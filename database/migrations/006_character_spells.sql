-- Magias aprendidas por personagem (autoritativo no servidor)

create table if not exists character_spells (
  character_id uuid not null references characters(id) on delete cascade,
  spell_id text not null,
  learned_at timestamptz not null default now(),
  primary key (character_id, spell_id)
);

create index if not exists character_spells_character_id_idx
  on character_spells (character_id);
