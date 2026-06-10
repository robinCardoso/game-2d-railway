import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes.js';
import { type CharacterInventoryDocument } from './inventory.js';
import { cloneBags, findSequentialSlot } from './inventoryBags.js';
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

        let remaining = quantity;

        while (remaining > 0) {
            const target = findSequentialSlot(next.bags, itemId, next.unlockedBagSlots);
            if (!target) {
                overflow.push({ itemId, quantity: remaining });
                break;
            }

            if (target.kind === 'stack') {
                const bag = next.bags[target.bagIndex];
                bag[target.rowIndex].quantity += remaining;
                granted.push({ itemId, quantity: remaining });
                remaining = 0;
            } else {
                const stackQty = remaining;
                next.bags[target.bagIndex].push({
                    slotIndex: target.slotIndex,
                    itemId,
                    quantity: stackQty,
                });
                granted.push({ itemId, quantity: stackQty });
                remaining = 0;
            }
        }
    }

    sortBags(next.bags);

    return { inventory: next, granted, overflow };
}
