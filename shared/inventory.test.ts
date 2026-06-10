import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import {
    createEmptyInventory,
    validateCharacterInventory,
} from './inventory';

const catalog: ItemCatalogDocument = {
    items: [
        {
            id: 'leather_boots',
            name: 'Leather Boots',
            category: 'equipment',
            slot: 'feet',
            speedBonus: 0,
            implemented: true,
        },
        {
            id: 'gold_coin',
            name: 'Gold Coin',
            category: 'loot',
            implemented: true,
        },
        {
            id: 'dev_boots',
            name: 'Dev Boots',
            category: 'equipment',
            slot: 'feet',
            implemented: false,
        },
    ],
};

describe('validateCharacterInventory', () => {
    it('aceita inventário vazio', () => {
        const result = validateCharacterInventory(createEmptyInventory(), catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.backpack).toEqual([]);
            expect(result.value.equipment.feet).toBeNull();
        }
    });

    it('valida slot de equipamento', () => {
        const result = validateCharacterInventory(
            {
                equipment: {
                    head: null,
                    body: null,
                    legs: null,
                    feet: 'leather_boots',
                    ring: null,
                    amulet: null,
                },
                backpack: [],
            },
            catalog
        );
        expect(result.ok).toBe(true);
    });

    it('rejeita item em slot errado', () => {
        const result = validateCharacterInventory(
            {
                equipment: {
                    head: 'leather_boots',
                    body: null,
                    legs: null,
                    feet: null,
                    ring: null,
                    amulet: null,
                },
                backpack: [],
            },
            catalog
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.includes('head'))).toBe(true);
        }
    });

    it('valida mochila com loot', () => {
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                backpack: [{ slotIndex: 0, itemId: 'gold_coin', quantity: 10 }],
            },
            catalog
        );
        expect(result.ok).toBe(true);
    });

    it('rejeita item equipado e na mochila', () => {
        const result = validateCharacterInventory(
            {
                equipment: {
                    ...createEmptyInventory().equipment,
                    feet: 'leather_boots',
                },
                backpack: [{ slotIndex: 0, itemId: 'leather_boots', quantity: 1 }],
            },
            catalog
        );
        expect(result.ok).toBe(false);
    });

    it('rejeita duplicar item vs inventário anterior', () => {
        const previous = {
            equipment: createEmptyInventory().equipment,
            backpack: [{ slotIndex: 0, itemId: 'gold_coin', quantity: 5 }],
        };
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                backpack: [{ slotIndex: 0, itemId: 'gold_coin', quantity: 99 }],
            },
            catalog,
            { previous }
        );
        expect(result.ok).toBe(false);
    });

    it('rejeita equipar item não implementado', () => {
        const result = validateCharacterInventory(
            {
                equipment: {
                    ...createEmptyInventory().equipment,
                    feet: 'dev_boots',
                },
                backpack: [],
            },
            catalog
        );
        expect(result.ok).toBe(false);
    });
});
