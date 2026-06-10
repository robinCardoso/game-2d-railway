import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes.js';
import { BACKPACK_SLOT_COUNT, type CharacterInventoryDocument } from './inventory.js';
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

function findBackpackRow(
    backpack: CharacterInventoryDocument['backpack'],
    itemId: string
): number {
    return backpack.findIndex((row) => row.itemId === itemId);
}

function nextFreeSlotIndex(backpack: CharacterInventoryDocument['backpack']): number | null {
    const used = new Set(backpack.map((row) => row.slotIndex));
    for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
        if (!used.has(i)) return i;
    }
    return null;
}

/** Adiciona loot à mochila (stack por itemId; equipamento não auto-equipa). */
export function applyAutolootGrants(
    inventory: CharacterInventoryDocument,
    grants: LootGrant[],
    catalog: ItemCatalogDocument
): AutolootApplyResult {
    const next: CharacterInventoryDocument = {
        equipment: { ...inventory.equipment },
        backpack: inventory.backpack.map((row) => ({ ...row })),
    };

    const granted: LootGrant[] = [];
    const overflow: LootGrant[] = [];

    for (const grant of grants) {
        const itemId = grant.itemId.trim();
        const quantity = Math.max(1, Math.floor(grant.quantity));
        if (!itemId || !isGrantableItem(itemId, catalog)) continue;

        let remaining = quantity;

        const existingIndex = findBackpackRow(next.backpack, itemId);
        if (existingIndex >= 0) {
            next.backpack[existingIndex].quantity += remaining;
            granted.push({ itemId, quantity: remaining });
            remaining = 0;
        }

        while (remaining > 0) {
            const slotIndex = nextFreeSlotIndex(next.backpack);
            if (slotIndex === null) {
                overflow.push({ itemId, quantity: remaining });
                break;
            }
            const stackQty = remaining;
            next.backpack.push({ slotIndex, itemId, quantity: stackQty });
            granted.push({ itemId, quantity: stackQty });
            remaining = 0;
        }
    }

    next.backpack.sort((a, b) => a.slotIndex - b.slotIndex);

    return { inventory: next, granted, overflow };
}
