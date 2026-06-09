import { EQUIPMENT_SLOTS, type ItemCatalogDocument } from '../src/game-data/itemCatalogTypes.js';
import type { CharacterEquipmentState } from './inventory.js';

function sumEquipmentBonus(
    equipment: CharacterEquipmentState,
    catalog: ItemCatalogDocument,
    field: 'speedBonus' | 'attackBonus' | 'defenseBonus'
): number {
    const byId = new Map(catalog.items.map((item) => [item.id, item]));
    let total = 0;
    for (const slot of EQUIPMENT_SLOTS) {
        const itemId = equipment[slot];
        if (!itemId) continue;
        const item = byId.get(itemId);
        const bonus = item?.[field];
        if (bonus) {
            total += bonus;
        }
    }
    return total;
}

/** Soma `speedBonus` dos itens equipados conforme o catálogo. */
export function calculateEquipmentSpeedBonus(
    equipment: CharacterEquipmentState,
    catalog: ItemCatalogDocument
): number {
    return sumEquipmentBonus(equipment, catalog, 'speedBonus');
}

/** Soma `attackBonus` dos itens equipados conforme o catálogo. */
export function calculateEquipmentAttackBonus(
    equipment: CharacterEquipmentState,
    catalog: ItemCatalogDocument
): number {
    return sumEquipmentBonus(equipment, catalog, 'attackBonus');
}

/** Soma `defenseBonus` dos itens equipados conforme o catálogo. */
export function calculateEquipmentDefenseBonus(
    equipment: CharacterEquipmentState,
    catalog: ItemCatalogDocument
): number {
    return sumEquipmentBonus(equipment, catalog, 'defenseBonus');
}
