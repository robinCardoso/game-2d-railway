import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import { createEmptyInventory, BACKPACK_SLOT_COUNT } from './inventory';
import { equipFromBackpack, unequipToBackpack } from './inventoryEquip';

const catalog: ItemCatalogDocument = {
    items: [
        {
            id: 'leather_armor',
            name: 'Leather Armor',
            category: 'equipment',
            slot: 'body',
            defenseBonus: 3,
            implemented: true,
        },
        {
            id: 'wooden_shield',
            name: 'Wooden Shield',
            category: 'equipment',
            slot: 'shield',
            defenseBonus: 1,
            implemented: true,
        },
        {
            id: 'iron_sword',
            name: 'Iron Sword',
            category: 'equipment',
            slot: 'weapon',
            attackBonus: 3,
            implemented: true,
        },
        {
            id: 'gold_coin',
            name: 'Gold Coin',
            category: 'loot',
            implemented: true,
        },
    ],
};

describe('equipFromBackpack', () => {
    it('equipa item em slot vazio', () => {
        const inv = createEmptyInventory();
        inv.bags[0] = [{ slotIndex: 0, itemId: 'iron_sword', quantity: 1 }];
        const result = equipFromBackpack(inv, 0, 0, catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.equipment.weapon).toBe('iron_sword');
            expect(result.inventory.bags[0]).toHaveLength(0);
        }
    });

    it('equipa de bolsa 2 liberada', () => {
        const inv = createEmptyInventory();
        inv.bags[1] = [{ slotIndex: 0, itemId: 'iron_sword', quantity: 1 }];
        const result = equipFromBackpack(inv, 1, 0, catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.equipment.weapon).toBe('iron_sword');
        }
    });

    it('rejeita bolsa bloqueada', () => {
        const inv = createEmptyInventory();
        inv.bags[3] = [{ slotIndex: 0, itemId: 'iron_sword', quantity: 1 }];
        const result = equipFromBackpack(inv, 3, 0, catalog);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('BAG_LOCKED');
    });

    it('troca item no slot ocupado — anterior volta à bolsa', () => {
        const inv = createEmptyInventory();
        inv.equipment.weapon = 'iron_sword';
        inv.bags[0] = [{ slotIndex: 0, itemId: 'iron_sword', quantity: 1 }];
        const result = equipFromBackpack(inv, 0, 0, catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.equipment.weapon).toBe('iron_sword');
            expect(result.inventory.bags[0]).toHaveLength(1);
            expect(result.inventory.bags[0][0].itemId).toBe('iron_sword');
        }
    });

    it('rejeita loot não equipável', () => {
        const inv = createEmptyInventory();
        inv.bags[0] = [{ slotIndex: 0, itemId: 'gold_coin', quantity: 5 }];
        const result = equipFromBackpack(inv, 0, 0, catalog);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('NOT_EQUIPABLE');
    });

    it('equipa de slot separado quando há duas espadas (não empilhável)', () => {
        const inv = createEmptyInventory();
        inv.bags[0] = [
            { slotIndex: 0, itemId: 'iron_sword', quantity: 1 },
            { slotIndex: 1, itemId: 'iron_sword', quantity: 1 },
        ];
        const result = equipFromBackpack(inv, 0, 0, catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.equipment.weapon).toBe('iron_sword');
            expect(result.inventory.bags[0]).toEqual([
                { slotIndex: 1, itemId: 'iron_sword', quantity: 1 },
            ]);
        }
    });

    it('equipa escudo em slot shield', () => {
        const inv = createEmptyInventory();
        inv.bags[0] = [{ slotIndex: 0, itemId: 'wooden_shield', quantity: 1 }];
        const result = equipFromBackpack(inv, 0, 0, catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.equipment.shield).toBe('wooden_shield');
        }
    });
});

describe('unequipToBackpack', () => {
    it('move equipado para bolsa 1', () => {
        const inv = createEmptyInventory();
        inv.equipment.weapon = 'iron_sword';
        const result = unequipToBackpack(inv, 'weapon', catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.equipment.weapon).toBeNull();
            expect(result.inventory.bags[0][0].itemId).toBe('iron_sword');
        }
    });

    it('desequipa na bolsa 2 quando bolsa 1 cheia', () => {
        const inv = createEmptyInventory();
        inv.equipment.weapon = 'iron_sword';
        for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
            inv.bags[0].push({ slotIndex: i, itemId: 'gold_coin', quantity: 1 });
        }
        const result = unequipToBackpack(inv, 'weapon', catalog);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.inventory.bags[1][0].itemId).toBe('iron_sword');
        }
    });

    it('falha se bolsas liberadas cheias', () => {
        const inv = createEmptyInventory();
        inv.equipment.weapon = 'iron_sword';
        for (let bag = 0; bag < 3; bag++) {
            for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
                inv.bags[bag].push({ slotIndex: i, itemId: 'gold_coin', quantity: 1 });
            }
        }
        const result = unequipToBackpack(inv, 'weapon', catalog);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe('BACKPACK_FULL');
    });
});
