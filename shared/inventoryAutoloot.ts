import {
    getItemStackRules,
    type ItemCatalogDocument,
} from '../src/game-data/itemCatalogTypes.js';
import { type CharacterInventoryDocument } from './inventory.js';
import { addQuantityToBags, cloneBags } from './inventoryBags.js';
import type { LootGrant } from './mobLoot.js';

export interface AutolootApplyResult {
    inventory: CharacterInventoryDocument;
    granted: LootGrant[];
    overflow: LootGrant[];
}

function isGrantableItem(
    itemId: string,
    catalog: ItemCatalogDocument
): boolean {
    const entry = catalog.items.find((i) => i.id === itemId);
    return Boolean(entry && entry.implemented !== false);
}

function sortBags(bags: CharacterInventoryDocument['bags']): void {
    for (const bag of bags) {
        bag.sort((a, b) => a.slotIndex - b.slotIndex);
    }
}

/** Adiciona loot nas bolsas liberadas (stack + slot novo, ordem 1→N). */
export function applyAutolootGrants(
    inventory: CharacterInventoryDocument,
    grants: LootGrant[],
    catalog: ItemCatalogDocument
): AutolootApplyResult {
    const next: CharacterInventoryDocument = {
        equipment: { ...inventory.equipment },
        bags: cloneBags(inventory.bags),
        unlockedBagSlots: inventory.unlockedBagSlots,
    };

    const granted: LootGrant[] = [];
    const overflow: LootGrant[] = [];

    for (const grant of grants) {
        const itemId = grant.itemId.trim();
        const quantity = Math.max(1, Math.floor(grant.quantity));
        if (!itemId || !isGrantableItem(itemId, catalog)) continue;

        const entry = catalog.items.find((i) => i.id === itemId);
        if (!entry) continue;
        const rules = getItemStackRules(entry);

        const { added, overflow: leftover } = addQuantityToBags(
            next.bags,
            itemId,
            quantity,
            next.unlockedBagSlots,
            rules
        );
        if (added > 0) granted.push({ itemId, quantity: added });
        if (leftover > 0) overflow.push({ itemId, quantity: leftover });
    }

    sortBags(next.bags);

    return { inventory: next, granted, overflow };
}
