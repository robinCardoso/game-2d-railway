import type { CharacterInventoryDocument } from '../../../shared/inventory.js';
import { createEmptyInventory } from '../../../shared/inventory.js';

/** Dev sem PostgreSQL — chave só por characterId (mock auth não alinha accountId HTTP vs WS). */
const store = new Map<string, CharacterInventoryDocument>();

export function getDevCharacterInventory(characterId: string): CharacterInventoryDocument {
    const existing = store.get(characterId);
    if (!existing) return createEmptyInventory();
    return {
        equipment: { ...existing.equipment },
        backpack: existing.backpack.map((row) => ({ ...row })),
    };
}

export function setDevCharacterInventory(
    characterId: string,
    inventory: CharacterInventoryDocument
): CharacterInventoryDocument {
    const snapshot: CharacterInventoryDocument = {
        equipment: { ...inventory.equipment },
        backpack: inventory.backpack.map((row) => ({ ...row })),
    };
    store.set(characterId, snapshot);
    return snapshot;
}
