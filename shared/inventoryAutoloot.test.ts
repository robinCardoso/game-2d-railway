import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import { createEmptyInventory, BACKPACK_SLOT_COUNT } from './inventory';
import { applyAutolootGrants } from './inventoryAutoloot';

const catalog: ItemCatalogDocument = {
    items: [
        {
            id: 'gold_coin',
            name: 'Gold Coin',
            category: 'loot',
            implemented: true,
        },
        {
            id: 'health_potion',
            name: 'Health Potion',
            category: 'loot',
            implemented: true,
        },
        {
            id: 'draft_item',
            name: 'Draft',
            category: 'loot',
            implemented: false,
        },
    ],
};

describe('applyAutolootGrants', () => {
    it('empilha item existente na mochila', () => {
        const base = createEmptyInventory();
        base.backpack = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 3 }];

        const result = applyAutolootGrants(
            base,
            [{ itemId: 'gold_coin', quantity: 12 }],
            catalog
        );

        expect(result.granted).toEqual([{ itemId: 'gold_coin', quantity: 12 }]);
        expect(result.inventory.backpack).toEqual([
            { slotIndex: 0, itemId: 'gold_coin', quantity: 15 },
        ]);
    });

    it('ocupa novo slot quando item ainda não está na mochila', () => {
        const result = applyAutolootGrants(
            createEmptyInventory(),
            [{ itemId: 'health_potion', quantity: 1 }],
            catalog
        );

        expect(result.inventory.backpack).toEqual([
            { slotIndex: 0, itemId: 'health_potion', quantity: 1 },
        ]);
    });

    it('ignora itens não implementados', () => {
        const result = applyAutolootGrants(
            createEmptyInventory(),
            [{ itemId: 'draft_item', quantity: 1 }],
            catalog
        );

        expect(result.granted).toEqual([]);
        expect(result.inventory.backpack).toEqual([]);
    });

    it('reporta overflow quando mochila está cheia', () => {
        const base = createEmptyInventory();
        for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
            base.backpack.push({ slotIndex: i, itemId: `item_${i}`, quantity: 1 });
        }

        const result = applyAutolootGrants(
            base,
            [{ itemId: 'gold_coin', quantity: 9 }],
            catalog
        );

        expect(result.granted).toEqual([]);
        expect(result.overflow).toEqual([{ itemId: 'gold_coin', quantity: 9 }]);
    });
});
