-- Slots weapon + shield no equipamento do personagem

alter table character_equipment drop constraint if exists character_equipment_slot_check;
alter table character_equipment add constraint character_equipment_slot_check
  check (slot in ('head', 'body', 'legs', 'feet', 'ring', 'amulet', 'weapon', 'shield'));
