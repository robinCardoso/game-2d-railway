import {
    BACKPACK_SLOT_COUNT,
    INVENTORY_BAG_COUNT,
    type BackpackSlotRow,
} from './inventory.js';

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

/** Stack existente ou primeiro slot livre nas bolsas liberadas (ordem 1→N). */
export function findSequentialSlot(
    bags: BackpackSlotRow[][],
    itemId: string,
    unlockedBagSlots: number
): SequentialSlotTarget | null {
    for (const bagIndex of iterateUnlockedBagIndices(unlockedBagSlots)) {
        const rowIndex = findItemRowInBag(bags[bagIndex] ?? [], itemId);
        if (rowIndex >= 0) return { bagIndex, rowIndex, kind: 'stack' };
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

export function addToSequentialBags(
    bags: BackpackSlotRow[][],
    itemId: string,
    quantity: number,
    unlockedBagSlots: number
): boolean {
    const slot = firstSequentialFreeSlot(bags, unlockedBagSlots);
    if (!slot) return false;
    const bag = bags[slot.bagIndex] ?? [];
    bag.push({ slotIndex: slot.slotIndex, itemId, quantity });
    bag.sort((a, b) => a.slotIndex - b.slotIndex);
    bags[slot.bagIndex] = bag;
    return true;
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
