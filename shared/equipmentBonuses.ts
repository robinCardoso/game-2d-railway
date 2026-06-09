import { EQUIPMENT_SLOTS, type ItemCatalogDocument } from '../src/game-data/itemCatalogTypes.js';
import type { CharacterEquipmentState } from './inventory.js';

/** Soma `speedBonus` dos itens equipados conforme o catálogo. */
export function calculateEquipmentSpeedBonus(
    equipment: CharacterEquipmentState,
    catalog: ItemCatalogDocument
): number {
    const byId = new Map(catalog.items.map((item) => [item.id, item]));
    let total = 0;
    for (const slot of EQUIPMENT_SLOTS) {
        const itemId = equipment[slot];
        if (!itemId) continue;
        const item = byId.get(itemId);
        if (item?.speedBonus) {
            total += item.speedBonus;
        }
    }
    return total;
}
