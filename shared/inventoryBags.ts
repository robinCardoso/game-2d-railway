import type { ItemStackRules } from '../src/game-data/itemCatalogTypes.js';
import {
    BACKPACK_SLOT_COUNT,
    INVENTORY_BAG_COUNT,
    type BackpackSlotRow,
} from './inventory.js';

export type { ItemStackRules };

export function isBagUnlocked(bagIndex: number, unlockedBagSlots: number): boolean {
    return bagIndex >= 0 && bagIndex < unlockedBagSlots && bagIndex < INVENTORY_BAG_COUNT;
}

export function iterateUnlockedBagIndices(unlockedBagSlots: number): number[] {
    const count = Math.min(Math.max(1, Math.floor(unlockedBagSlots)), INVENTORY_BAG_COUNT);
    return Array.from({ length: count }, (_, i) => i);
}

export function cloneBags(bags: BackpackSlotRow[][]): BackpackSlotRow[][] {
    return bags.map((bag) => bag.map((row) => ({ ...row })));
}

export function createEmptyBags(): BackpackSlotRow[][] {
    return Array.from({ length: INVENTORY_BAG_COUNT }, () => []);
}

export function firstFreeSlotInBag(bag: BackpackSlotRow[]): number | null {
    const used = new Set(bag.map((row) => row.slotIndex));
    for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
        if (!used.has(i)) return i;
    }
    return null;
}

export function findItemRowInBag(bag: BackpackSlotRow[], itemId: string): number {
    return bag.findIndex((row) => row.itemId === itemId);
}

export function findSlotRowInBag(bag: BackpackSlotRow[], slotIndex: number): number {
    return bag.findIndex((row) => row.slotIndex === slotIndex);
}

export function occupiedInBag(bag: BackpackSlotRow[]): number {
    return bag.length;
}

export function totalOccupiedSlots(bags: BackpackSlotRow[][]): number {
    return bags.reduce((sum, bag) => sum + bag.length, 0);
}

export function totalOccupiedInUnlockedBags(
    bags: BackpackSlotRow[][],
    unlockedBagSlots: number
): number {
    let sum = 0;
    for (const bagIndex of iterateUnlockedBagIndices(unlockedBagSlots)) {
        sum += occupiedInBag(bags[bagIndex] ?? []);
    }
    return sum;
}

export type SequentialSlotTarget =
    | { bagIndex: number; rowIndex: number; kind: 'stack' }
    | { bagIndex: number; slotIndex: number; kind: 'new' };

/** Pilha parcial ou primeiro slot livre nas bolsas liberadas (ordem 1→N). */
export function findSequentialSlot(
    bags: BackpackSlotRow[][],
    itemId: string,
    unlockedBagSlots: number,
    rules: ItemStackRules
): SequentialSlotTarget | null {
    if (rules.stackable) {
        for (const bagIndex of iterateUnlockedBagIndices(unlockedBagSlots)) {
            const bag = bags[bagIndex] ?? [];
            for (let rowIndex = 0; rowIndex < bag.length; rowIndex++) {
                const row = bag[rowIndex];
                if (row.itemId === itemId && row.quantity < rules.maxStack) {
                    return { bagIndex, rowIndex, kind: 'stack' };
                }
            }
        }
    }
    for (const bagIndex of iterateUnlockedBagIndices(unlockedBagSlots)) {
        const slotIndex = firstFreeSlotInBag(bags[bagIndex] ?? []);
        if (slotIndex !== null) return { bagIndex, slotIndex, kind: 'new' };
    }
    return null;
}

export function firstSequentialFreeSlot(
    bags: BackpackSlotRow[][],
    unlockedBagSlots: number
): { bagIndex: number; slotIndex: number } | null {
    for (const bagIndex of iterateUnlockedBagIndices(unlockedBagSlots)) {
        const slotIndex = firstFreeSlotInBag(bags[bagIndex] ?? []);
        if (slotIndex !== null) return { bagIndex, slotIndex };
    }
    return null;
}

/** Adiciona quantidade respeitando pilha máxima; retorna unidades que não couberam. */
export function addQuantityToBags(
    bags: BackpackSlotRow[][],
    itemId: string,
    quantity: number,
    unlockedBagSlots: number,
    rules: ItemStackRules
): { added: number; overflow: number } {
    let remaining = Math.max(0, Math.floor(quantity));
    let added = 0;

    while (remaining > 0) {
        const target = findSequentialSlot(bags, itemId, unlockedBagSlots, rules);
        if (!target) break;

        if (target.kind === 'stack') {
            const bag = bags[target.bagIndex];
            const row = bag[target.rowIndex];
            const space = rules.maxStack - row.quantity;
            const chunk = Math.min(remaining, space);
            if (chunk <= 0) break;
            row.quantity += chunk;
            added += chunk;
            remaining -= chunk;
        } else {
            const chunk = rules.stackable
                ? Math.min(remaining, rules.maxStack)
                : Math.min(remaining, 1);
            const bag = bags[target.bagIndex] ?? [];
            bag.push({ slotIndex: target.slotIndex, itemId, quantity: chunk });
            bag.sort((a, b) => a.slotIndex - b.slotIndex);
            bags[target.bagIndex] = bag;
            added += chunk;
            remaining -= chunk;
        }
    }

    return { added, overflow: remaining };
}

export function addToSequentialBags(
    bags: BackpackSlotRow[][],
    itemId: string,
    quantity: number,
    unlockedBagSlots: number,
    rules: ItemStackRules
): boolean {
    const result = addQuantityToBags(bags, itemId, quantity, unlockedBagSlots, rules);
    return result.added > 0 && result.overflow === 0;
}

export function countGoldInBags(bags: BackpackSlotRow[][], unlockedBagSlots: number): number {
    let total = 0;
    for (const bagIndex of iterateUnlockedBagIndices(unlockedBagSlots)) {
        for (const row of bags[bagIndex] ?? []) {
            if (row.itemId === 'gold_coin') total += row.quantity;
        }
    }
    return total;
}
