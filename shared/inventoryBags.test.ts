import { describe, expect, it } from 'vitest';
import { BACKPACK_SLOT_COUNT, createEmptyInventory } from './inventory';
import {
    addQuantityToBags,
    findSequentialSlot,
    firstSequentialFreeSlot,
    isBagUnlocked,
    iterateUnlockedBagIndices,
    totalOccupiedInUnlockedBags,
} from './inventoryBags';

const stackableLoot = { stackable: true, maxStack: 100 };
const nonStackable = { stackable: false, maxStack: 1 };

describe('inventoryBags', () => {
    it('isBagUnlocked respeita unlockedBagSlots', () => {
        expect(isBagUnlocked(0, 3)).toBe(true);
        expect(isBagUnlocked(2, 3)).toBe(true);
        expect(isBagUnlocked(3, 3)).toBe(false);
    });

    it('iterateUnlockedBagIndices retorna ordem 0..N-1', () => {
        expect(iterateUnlockedBagIndices(3)).toEqual([0, 1, 2]);
    });

    it('findSequentialSlot empilha na bolsa 1 antes de abrir bolsa 2', () => {
        const inv = createEmptyInventory();
        inv.bags[0] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 1 }];

        const target = findSequentialSlot(inv.bags, 'gold_coin', 3, stackableLoot);
        expect(target).toEqual({ bagIndex: 0, rowIndex: 0, kind: 'stack' });
    });

    it('findSequentialSlot usa bolsa 2 quando bolsa 1 cheia', () => {
        const inv = createEmptyInventory();
        for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
            inv.bags[0].push({ slotIndex: i, itemId: `item_${i}`, quantity: 1 });
        }

        const target = findSequentialSlot(inv.bags, 'gold_coin', 3, stackableLoot);
        expect(target).toEqual({ bagIndex: 1, slotIndex: 0, kind: 'new' });
    });

    it('addQuantityToBags divide pilha no maxStack', () => {
        const inv = createEmptyInventory();
        const rules = { stackable: true, maxStack: 100 };
        const result = addQuantityToBags(inv.bags, 'gold_coin', 150, 3, rules);
        expect(result).toEqual({ added: 150, overflow: 0 });
        expect(inv.bags[0]).toEqual([
            { slotIndex: 0, itemId: 'gold_coin', quantity: 100 },
            { slotIndex: 1, itemId: 'gold_coin', quantity: 50 },
        ]);
    });

    it('addQuantityToBags não empilha equipamento — um slot por unidade', () => {
        const inv = createEmptyInventory();
        addQuantityToBags(inv.bags, 'iron_sword', 2, 3, nonStackable);
        expect(inv.bags[0]).toEqual([
            { slotIndex: 0, itemId: 'iron_sword', quantity: 1 },
            { slotIndex: 1, itemId: 'iron_sword', quantity: 1 },
        ]);
    });

    it('firstSequentialFreeSlot ignora bolsas bloqueadas', () => {
        const inv = createEmptyInventory();
        for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
            inv.bags[0].push({ slotIndex: i, itemId: `item_${i}`, quantity: 1 });
        }
        for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
            inv.bags[1].push({ slotIndex: i, itemId: `extra_${i}`, quantity: 1 });
        }
        for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
            inv.bags[2].push({ slotIndex: i, itemId: `third_${i}`, quantity: 1 });
        }

        expect(firstSequentialFreeSlot(inv.bags, 3)).toBeNull();
        expect(firstSequentialFreeSlot(inv.bags, 4)?.bagIndex).toBe(3);
    });

    it('totalOccupiedInUnlockedBags soma só bolsas liberadas', () => {
        const inv = createEmptyInventory();
        inv.bags[0] = [{ slotIndex: 0, itemId: 'a', quantity: 1 }];
        inv.bags[3] = [{ slotIndex: 0, itemId: 'b', quantity: 1 }];
        expect(totalOccupiedInUnlockedBags(inv.bags, 3)).toBe(1);
    });
});
