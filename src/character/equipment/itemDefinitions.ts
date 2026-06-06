/**
 * Ponte para equipamento / loot — dados vêm de `item_catalog.json`.
 */
import {
    applyItemCatalogDocument,
    getItemCatalogEntry,
    getItemCatalogEntries,
    itemExistsInCatalog,
    loadItemCatalog,
} from '../../game-data/itemCatalog';
import type { EquipmentSlot, ItemCatalogEntry } from '../../game-data/itemCatalogTypes';

export type { EquipmentSlot };

export interface ItemDefinition {
    id: string;
    name: string;
    slot: EquipmentSlot;
    speedBonus?: number;
    description?: string;
    implemented: boolean;
}

function toDefinition(entry: ItemCatalogEntry): ItemDefinition | null {
    if (entry.category !== 'equipment' || !entry.slot) return null;
    return {
        id: entry.id,
        name: entry.name,
        slot: entry.slot,
        speedBonus: entry.speedBonus,
        description: entry.description,
        implemented: entry.implemented,
    };
}

export function getItemDefinition(itemId: string): ItemDefinition | undefined {
    const entry = getItemCatalogEntry(itemId);
    if (!entry) return undefined;
    return toDefinition(entry) ?? undefined;
}

export {
    applyItemCatalogDocument,
    getItemCatalogEntry,
    getItemCatalogEntries,
    itemExistsInCatalog,
    loadItemCatalog,
};
