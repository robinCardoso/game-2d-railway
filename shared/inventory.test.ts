import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import {
    BACKPACK_SLOT_COUNT,
    createEmptyInventory,
    DEFAULT_UNLOCKED_BAG_SLOTS,
    INVENTORY_BAG_COUNT,
    normalizeInventoryDocument,
    repairInventoryState,
    sanitizeInventoryStackRules,
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
            id: 'leather_armor',
            name: 'Leather Armor',
            category: 'equipment',
            slot: 'body',
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

    it('sanitiza equipamento legado com quantity > 1 em slots separados', () => {
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
        expect(result.ok).toBe(true);
        if (result.ok) {
            const helmets = result.value.bags.flat().filter((r) => r.itemId === 'iron_helmet');
            expect(helmets).toHaveLength(2);
            expect(helmets.every((r) => r.quantity === 1)).toBe(true);
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

    it('sanitiza pilha de loot acima do maxStack', () => {
        const bags = createEmptyInventory().bags;
        bags[0] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 150 }];
        const result = validateCharacterInventory(
            {
                equipment: createEmptyInventory().equipment,
                bags,
                unlockedBagSlots: 3,
            },
            catalog
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            const coins = result.value.bags.flat().filter((r) => r.itemId === 'gold_coin');
            expect(coins.reduce((sum, r) => sum + r.quantity, 0)).toBe(150);
            expect(coins.every((r) => r.quantity <= 100)).toBe(true);
        }
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

function fillBagSlots(
    bag: { slotIndex: number; itemId: string; quantity: number }[],
    count: number,
    itemId = 'gold_coin'
): void {
    for (let i = 0; i < count; i++) {
        bag.push({ slotIndex: i, itemId, quantity: 1 });
    }
}

describe('repairInventoryState', () => {
    it('remove da bolsa itens já equipados', () => {
        const inventory = createEmptyInventory();
        inventory.equipment.body = 'leather_armor';
        inventory.bags[0] = [{ slotIndex: 0, itemId: 'leather_armor', quantity: 1 }];
        const { inventory: repaired, repaired: changed } = repairInventoryState(inventory);
        expect(changed).toBe(true);
        expect(repaired.equipment.body).toBe('leather_armor');
        expect(repaired.bags[0]).toHaveLength(0);
    });

    it('esvazia bolsas espelhando a bolsa 1', () => {
        const inventory = createEmptyInventory();
        inventory.bags[0] = [
            { slotIndex: 0, itemId: 'gold_coin', quantity: 5 },
            { slotIndex: 1, itemId: 'iron_helmet', quantity: 1 },
        ];
        inventory.bags[1] = [...inventory.bags[0].map((row) => ({ ...row }))];
        inventory.bags[2] = [...inventory.bags[0].map((row) => ({ ...row }))];
        const { inventory: repaired, repaired: changed } = repairInventoryState(inventory);
        expect(changed).toBe(true);
        expect(repaired.bags[0]).toHaveLength(2);
        expect(repaired.bags[1]).toEqual([]);
        expect(repaired.bags[2]).toEqual([]);
    });

    it('permite equipar após reparar estado fantasma', () => {
        const ghost = createEmptyInventory();
        ghost.equipment.body = 'leather_armor';
        ghost.bags[0] = [{ slotIndex: 0, itemId: 'leather_armor', quantity: 1 }];
        const { inventory: repaired } = repairInventoryState(ghost);
        const result = validateCharacterInventory(repaired, catalog);
        expect(result.ok).toBe(true);
    });
});

describe('sanitizeInventoryStackRules', () => {
    it('divide leather_armor qty 24 em 24 slots com qty 1', () => {
        const inventory = createEmptyInventory();
        inventory.bags[0] = [{ slotIndex: 0, itemId: 'leather_armor', quantity: 24 }];
        const { inventory: sanitized, overflow } = sanitizeInventoryStackRules(inventory, catalog);
        const armors = sanitized.bags.flat().filter((r) => r.itemId === 'leather_armor');
        expect(armors).toHaveLength(24);
        expect(armors.every((r) => r.quantity === 1)).toBe(true);
        expect(overflow.size).toBe(0);
    });

    it('com bolsa quase cheia mantém 1 + slots livres e descarta o resto', () => {
        const inventory = createEmptyInventory();
        inventory.unlockedBagSlots = 1;
        fillBagSlots(inventory.bags[0], BACKPACK_SLOT_COUNT - 6);
        inventory.bags[0].push({ slotIndex: BACKPACK_SLOT_COUNT - 6, itemId: 'leather_armor', quantity: 24 });
        const { inventory: sanitized, overflow } = sanitizeInventoryStackRules(inventory, catalog);
        const armors = sanitized.bags[0].filter((r) => r.itemId === 'leather_armor');
        expect(armors).toHaveLength(6);
        expect(armors.every((r) => r.quantity === 1)).toBe(true);
        expect(overflow.get('leather_armor')).toBe(18);
    });

    it('divide gold_coin qty 150 em pilhas de até 100', () => {
        const inventory = createEmptyInventory();
        inventory.bags[0] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 150 }];
        const { inventory: sanitized, overflow } = sanitizeInventoryStackRules(inventory, catalog);
        const coins = sanitized.bags.flat().filter((r) => r.itemId === 'gold_coin');
        expect(coins.reduce((sum, r) => sum + r.quantity, 0)).toBe(150);
        expect(coins.every((r) => r.quantity <= 100)).toBe(true);
        expect(overflow.size).toBe(0);
    });
});
