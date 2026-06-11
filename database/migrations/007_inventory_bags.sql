-- 5 storages independentes por personagem (bag_index 0..4)

alter table character_backpack_slots
  add column if not exists bag_index smallint not null default 0
  check (bag_index >= 0 and bag_index < 5);

alter table character_backpack_slots drop constraint if exists character_backpack_slots_pkey;
alter table character_backpack_slots
  add primary key (character_id, bag_index, slot_index);

create index if not exists character_backpack_slots_bag_idx
  on character_backpack_slots (character_id, bag_index);
