-- Slots F1–F3 de magias por personagem (autoritativo no servidor)

create table if not exists character_spell_slots (
  character_id uuid not null references characters(id) on delete cascade,
  slot_index smallint not null
    check (slot_index >= 0 and slot_index < 3),
  spell_id text not null,
  updated_at timestamptz not null default now(),
  primary key (character_id, slot_index)
);

create index if not exists character_spell_slots_character_id_idx
  on character_spell_slots (character_id);
