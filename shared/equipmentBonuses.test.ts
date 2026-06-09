import { describe, expect, it } from 'vitest';
import type { ItemCatalogDocument } from '../src/game-data/itemCatalogTypes';
import { createEmptyEquipment } from './inventory';
import {
    calculateEquipmentAttackBonus,
    calculateEquipmentDefenseBonus,
    calculateEquipmentSpeedBonus,
} from './equipmentBonuses';

const catalog: ItemCatalogDocument = {
    items: [
        {
            id: 'boots_of_haste',
            name: 'Boots of Haste',
            category: 'equipment',
            slot: 'feet',
            speedBonus: 20,
            implemented: true,
        },
        {
            id: 'warrior_ring',
            name: 'Warrior Ring',
            category: 'equipment',
            slot: 'ring',
            attackBonus: 2,
            implemented: true,
        },
        {
            id: 'leather_armor',
            name: 'Leather Armor',
            category: 'equipment',
            slot: 'body',
            defenseBonus: 3,
            implemented: true,
        },
    ],
};

describe('equipmentBonuses', () => {
    it('soma bônus de speed, ataque e defesa', () => {
        const equipment = createEmptyEquipment();
        equipment.feet = 'boots_of_haste';
        equipment.ring = 'warrior_ring';
        equipment.body = 'leather_armor';

        expect(calculateEquipmentSpeedBonus(equipment, catalog)).toBe(20);
        expect(calculateEquipmentAttackBonus(equipment, catalog)).toBe(2);
        expect(calculateEquipmentDefenseBonus(equipment, catalog)).toBe(3);
    });
});
