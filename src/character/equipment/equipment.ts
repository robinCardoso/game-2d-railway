/**
 * Estado de equipamento do personagem e cálculo de bônus derivados.
 */

import {
    getItemDefinition,
    type EquipmentSlot,
    type ItemDefinition,
} from './itemDefinitions';

export type EquipmentState = Record<EquipmentSlot, string | null>;

const EQUIPMENT_SLOTS: EquipmentSlot[] = [
    'head',
    'body',
    'legs',
    'feet',
    'ring',
    'amulet',
    'weapon',
    'shield',
];

export function createDefaultEquipment(): EquipmentState {
    return {
        head: null,
        body: null,
        legs: null,
        feet: null,
        ring: null,
        amulet: null,
        weapon: null,
        shield: null,
    };
}

export function getEquippedItem(
    state: EquipmentState,
    slot: EquipmentSlot
): ItemDefinition | null {
    const id = state[slot];
    if (!id) return null;
    return getItemDefinition(id) ?? null;
}

export function equipItem(
    state: EquipmentState,
    itemId: string
): { ok: true } | { ok: false; reason: string } {
    const def = getItemDefinition(itemId);
    if (!def) {
        return { ok: false, reason: `Item desconhecido: ${itemId}` };
    }
    state[def.slot] = itemId;
    return { ok: true };
}

export function unequipSlot(
    state: EquipmentState,
    slot: EquipmentSlot
): void {
    state[slot] = null;
}

/** Soma `speedBonus` de todos os slots equipados. */
export function calculateEquipmentSpeedBonus(state: EquipmentState): number {
    let total = 0;
    for (const slot of EQUIPMENT_SLOTS) {
        const item = getEquippedItem(state, slot);
        if (item?.speedBonus) {
            total += item.speedBonus;
        }
    }
    return total;
}

/** Lista legível para UI (ex.: "Botas da Pressa (pés)"). */
export function describeEquipment(state: EquipmentState): string[] {
    const lines: string[] = [];
    for (const slot of EQUIPMENT_SLOTS) {
        const item = getEquippedItem(state, slot);
        if (item) {
            lines.push(`${item.name} (${slot})`);
        }
    }
    return lines;
}
