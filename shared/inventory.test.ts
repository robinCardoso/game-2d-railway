import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import {
    createEmptyInventory,
    DEFAULT_UNLOCKED_BAG_SLOTS,
    INVENTORY_BAG_COUNT,
    normalizeInventoryDocument,
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
            stackable: true,
            maxStack: 100,
        },
        {
            id: 'iron_helmet',
            name: 'Iron Helmet',
            category: 'equipment',
            slot: 'head',
            implemented: true,
            stackable: false,
            maxStack: 1,
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

describe('createEmptyInventory', () => {
    it('cria 5 bolsas vazias e 3 desbloqueadas', () => {
        const inv = createEmptyInventory();
        expect(inv.bags).toHaveLength(INVENTORY_BAG_COUNT);
        expect(inv.unlockedBagSlots).toBe(DEFAULT_UNLOCKED_BAG_SLOTS);
        inv.bags.forEach((bag) => expect(bag).toEqual([]));
    });
});

describe('normalizeInventoryDocument', () => {
    it('migra backpack legado para bags[0]', () => {
        const normalized = normalizeInventoryDocument({
            equipment: createEmptyInventory().equipment,
            backpack: [{ slotIndex: 2, itemId: 'gold_coin', quantity: 5 }],
        });
        expect(normalized.bags[0]).toEqual([
            { slotIndex: 2, itemId: 'gold_coin', quantity: 5 },
        ]);
        expect(normalized.bags[1]).toEqual([]);
    });
});

describe('validateCharacterInventory', () => {
    it('aceita inventário vazio', () => {
        const result = validateCharacterInventory(createEmptyInventory(), catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.bags[0]).toEqual([]);
            expect(result.value.equipment.feet).toBeNull();
        }
    });

    it('aceita backpack legado na entrada', () => {
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                backpack: [{ slotIndex: 0, itemId: 'gold_coin', quantity: 10 }],
            },
            catalog
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.value.bags[0]).toEqual([
                { slotIndex: 0, itemId: 'gold_coin', quantity: 10 },
            ]);
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
                    weapon: null,
                    shield: null,
                },
                bags: createEmptyInventory().bags,
                unlockedBagSlots: 3,
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
                    weapon: null,
                    shield: null,
                },
                bags: createEmptyInventory().bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.includes('head'))).toBe(true);
        }
    });

    it('rejeita itens em bolsa bloqueada', () => {
        const bags = createEmptyInventory().bags;
        bags[3] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 1 }];
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(false);
    });

    it('rejeita aumentar unlockedBagSlots acima do servidor', () => {
        const result = validateCharacterInventory(
            {
                ...createEmptyInventory(),
                unlockedBagSlots: 5,
            },
            catalog,
            { serverUnlockedBagSlots: 3 }
        );
        expect(result.ok).toBe(false);
    });

    it('rejeita item equipado e na bolsa', () => {
        const bags = createEmptyInventory().bags;
        bags[0] = [{ slotIndex: 0, itemId: 'leather_boots', quantity: 1 }];
        const result = validateCharacterInventory(
            {
                equipment: {
                    ...createEmptyInventory().equipment,
                    feet: 'leather_boots',
                },
                bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(false);
    });

    it('rejeita duplicar item vs inventário anterior', () => {
        const previous = createEmptyInventory();
        previous.bags[0] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 5 }];
        const bags = createEmptyInventory().bags;
        bags[0] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 99 }];
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                bags,
                unlockedBagSlots: 3,
            },
            catalog,
            { previous }
        );
        expect(result.ok).toBe(false);
    });

    it('rejeita equipamento com quantity > 1 no mesmo slot', () => {
        const bags = createEmptyInventory().bags;
        bags[0] = [{ slotIndex: 0, itemId: 'iron_helmet', quantity: 2 }];
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.includes('iron_helmet'))).toBe(true);
        }
    });

    it('aceita loot empilhado em múltiplos slots do mesmo item', () => {
        const bags = createEmptyInventory().bags;
        bags[0] = [
            { slotIndex: 0, itemId: 'gold_coin', quantity: 100 },
            { slotIndex: 1, itemId: 'gold_coin', quantity: 50 },
        ];
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(true);
    });

    it('rejeita equipar item não implementado', () => {
        const result = validateCharacterInventory(
            {
                equipment: {
                    ...createEmptyInventory().equipment,
                    feet: 'dev_boots',
                },
                bags: createEmptyInventory().bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(false);
    });
});
