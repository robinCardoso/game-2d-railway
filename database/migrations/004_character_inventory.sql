-- Inventário autoritativo por personagem (equipamento + mochila)
-- Catálogo de itens permanece em public/item_catalog.json (volume/repo).

create table if not exists character_equipment (
  character_id uuid not null references characters(id) on delete cascade,
  slot text not null
    check (slot in ('head', 'body', 'legs', 'feet', 'ring', 'amulet')),
  item_id text not null,
  updated_at timestamptz not null default now(),
  primary key (character_id, slot)
);

create index if not exists character_equipment_character_id_idx
  on character_equipment (character_id);

create table if not exists character_backpack_slots (
  character_id uuid not null references characters(id) on delete cascade,
  slot_index smallint not null
    check (slot_index >= 0 and slot_index < 100),
  item_id text not null,
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (character_id, slot_index)
);

create index if not exists character_backpack_slots_character_id_idx
  on character_backpack_slots (character_id);
