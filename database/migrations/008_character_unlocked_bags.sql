-- Bolsas desbloqueadas por personagem (padrão 3; 4–5 via compra futura)

alter table characters
  add column if not exists unlocked_bag_slots smallint not null default 3
  check (unlocked_bag_slots >= 1 and unlocked_bag_slots <= 5);
