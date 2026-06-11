import type { CharacterInventoryDocument } from '../../../shared/inventory.js';
import { createEmptyInventory } from '../../../shared/inventory.js';
import { cloneBags } from '../../../shared/inventoryBags.js';

/** Dev sem PostgreSQL — chave só por characterId (mock auth não alinha accountId HTTP vs WS). */
const store = new Map<string, CharacterInventoryDocument>();

function snapshotInventory(inventory: CharacterInventoryDocument): CharacterInventoryDocument {
    return {
        equipment: { ...inventory.equipment },
        bags: cloneBags(inventory.bags),
        unlockedBagSlots: inventory.unlockedBagSlots,
    };
}

export function getDevCharacterInventory(characterId: string): CharacterInventoryDocument {
    const existing = store.get(characterId);
    if (!existing) return createEmptyInventory();
    return snapshotInventory(existing);
}

export function getDevCharacterUnlockedBagSlots(characterId: string): number {
    return getDevCharacterInventory(characterId).unlockedBagSlots;
}

export function setDevCharacterInventory(
    characterId: string,
    inventory: CharacterInventoryDocument
): CharacterInventoryDocument {
    const saved = snapshotInventory(inventory);
    store.set(characterId, saved);
    return saved;
}
