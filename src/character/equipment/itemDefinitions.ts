/**
 * Definições estáticas de itens (dados de design).
 * Inventário / loot / servidor podem referenciar os mesmos ids no futuro.
 */

export type EquipmentSlot =
    | 'head'
    | 'body'
    | 'legs'
    | 'feet'
    | 'ring'
    | 'amulet';

export interface ItemDefinition {
    id: string;
    name: string;
    slot: EquipmentSlot;
    /** Bônus aditivo ao stat SPEED quando equipado. */
    speedBonus?: number;
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
    leather_boots: {
        id: 'leather_boots',
        name: 'Botas de Couro',
        slot: 'feet',
        speedBonus: 0,
    },
    boots_of_haste: {
        id: 'boots_of_haste',
        name: 'Botas da Pressa',
        slot: 'feet',
        speedBonus: 25,
    },
    leather_legs: {
        id: 'leather_legs',
        name: 'Calças de Couro',
        slot: 'legs',
        speedBonus: 0,
    },
    speed_ring: {
        id: 'speed_ring',
        name: 'Anel da Agilidade',
        slot: 'ring',
        speedBonus: 8,
    },
};

export function getItemDefinition(itemId: string): ItemDefinition | undefined {
    return ITEM_DEFINITIONS[itemId];
}
