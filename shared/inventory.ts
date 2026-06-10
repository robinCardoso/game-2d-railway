import {
    EQUIPMENT_SLOTS,
    type EquipmentSlot,
    type ItemCatalogDocument,
    type ItemCatalogEntry,
} from '../src/game-data/itemCatalogTypes.js';

/** Slots da mochila (grid do painel de inventário). */
export const BACKPACK_SLOT_COUNT = 20;

export interface BackpackSlotRow {
    slotIndex: number;
    itemId: string;
    quantity: number;
}

export type CharacterEquipmentState = Record<EquipmentSlot, string | null>;

export interface CharacterInventoryDocument {
    equipment: CharacterEquipmentState;
    backpack: BackpackSlotRow[];
}

export function createEmptyEquipment(): CharacterEquipmentState {
    return {
        head: null,
        body: null,
        legs: null,
        feet: null,
        ring: null,
        amulet: null,
    };
}

export function createEmptyInventory(): CharacterInventoryDocument {
    return {
        equipment: createEmptyEquipment(),
        backpack: [],
    };
}

function catalogById(catalog: ItemCatalogDocument): Map<string, ItemCatalogEntry> {
    return new Map(catalog.items.map((item) => [item.id, item]));
}

/** Contagem total por itemId (equipamento + mochila). */
export function countInventoryItems(
    inventory: CharacterInventoryDocument
): Map<string, number> {
    const counts = new Map<string, number>();
    const add = (itemId: string, qty: number) => {
        counts.set(itemId, (counts.get(itemId) ?? 0) + qty);
    };
    for (const slot of EQUIPMENT_SLOTS) {
        const itemId = inventory.equipment[slot];
        if (itemId) add(itemId, 1);
    }
    for (const row of inventory.backpack) {
        add(row.itemId, row.quantity);
    }
    return counts;
}

export function validateCharacterInventory(
    raw: unknown,
    catalog: ItemCatalogDocument,
    options?: { previous?: CharacterInventoryDocument }
): { ok: true; value: CharacterInventoryDocument } | { ok: false; errors: string[] } {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object') {
        return { ok: false, errors: ['Corpo inválido.'] };
    }

    const body = raw as Record<string, unknown>;
    const byId = catalogById(catalog);

    const equipmentRaw = body.equipment;
    if (!equipmentRaw || typeof equipmentRaw !== 'object') {
        errors.push('equipment é obrigatório.');
    }

    const equipment = createEmptyEquipment();
    if (equipmentRaw && typeof equipmentRaw === 'object') {
        const equipObj = equipmentRaw as Record<string, unknown>;
        for (const slot of EQUIPMENT_SLOTS) {
            const value = equipObj[slot];
            if (value === null || value === undefined || value === '') {
                equipment[slot] = null;
                continue;
            }
            if (typeof value !== 'string') {
                errors.push(`equipment.${slot} deve ser string ou null.`);
                continue;
            }
            const itemId = value.trim();
            const entry = byId.get(itemId);
            if (!entry) {
                errors.push(`Item desconhecido em equipment.${slot}: ${itemId}`);
                continue;
            }
            if (entry.category !== 'equipment' || !entry.slot) {
                errors.push(`Item ${itemId} não é equipável.`);
                continue;
            }
            if (entry.slot !== slot) {
                errors.push(`Item ${itemId} não cabe no slot ${slot} (esperado ${entry.slot}).`);
                continue;
            }
            if (entry.implemented === false) {
                errors.push(`Item ${itemId} não está disponível no jogo.`);
                continue;
            }
            equipment[slot] = itemId;
        }
    }

    const backpackRaw = body.backpack;
    if (!Array.isArray(backpackRaw)) {
        errors.push('backpack deve ser um array.');
        return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { equipment, backpack: [] } };
    }

    const seenSlots = new Set<number>();
    const backpack: BackpackSlotRow[] = [];

    for (let i = 0; i < backpackRaw.length; i++) {
        const row = backpackRaw[i];
        if (!row || typeof row !== 'object') {
            errors.push(`backpack[${i}] inválido.`);
            continue;
        }
        const slotRow = row as Record<string, unknown>;
        const slotIndex = Number(slotRow.slotIndex);
        const itemId = typeof slotRow.itemId === 'string' ? slotRow.itemId.trim() : '';
        const quantity = Number(slotRow.quantity ?? 1);

        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= BACKPACK_SLOT_COUNT) {
            errors.push(`backpack[${i}].slotIndex fora do intervalo 0..${BACKPACK_SLOT_COUNT - 1}.`);
            continue;
        }
        if (seenSlots.has(slotIndex)) {
            errors.push(`backpack: slotIndex ${slotIndex} duplicado.`);
            continue;
        }
        if (!itemId) {
            errors.push(`backpack[${i}].itemId obrigatório.`);
            continue;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            errors.push(`backpack[${i}].quantity deve ser inteiro >= 1.`);
            continue;
        }
        if (!byId.has(itemId)) {
            errors.push(`Item desconhecido na mochila: ${itemId}`);
            continue;
        }
        const backpackEntry = byId.get(itemId);
        if (backpackEntry?.implemented === false) {
            errors.push(`Item ${itemId} não está disponível no jogo.`);
            continue;
        }

        seenSlots.add(slotIndex);
        backpack.push({ slotIndex, itemId, quantity });
    }

    backpack.sort((a, b) => a.slotIndex - b.slotIndex);

    if (errors.length === 0) {
        const equippedIds = new Set<string>();
        for (const slot of EQUIPMENT_SLOTS) {
            const itemId = equipment[slot];
            if (!itemId) continue;
            if (equippedIds.has(itemId)) {
                errors.push(`Item ${itemId} equipado em mais de um slot.`);
            }
            equippedIds.add(itemId);
        }

        const backpackIds = new Set(backpack.map((row) => row.itemId));
        for (const itemId of equippedIds) {
            if (backpackIds.has(itemId)) {
                errors.push(
                    `Item ${itemId} não pode estar equipado e na mochila ao mesmo tempo.`
                );
            }
        }

        if (options?.previous) {
            const prevCounts = countInventoryItems(options.previous);
            const nextCounts = countInventoryItems({ equipment, backpack });
            for (const [itemId, nextQty] of nextCounts) {
                const prevQty = prevCounts.get(itemId) ?? 0;
                if (nextQty > prevQty) {
                    errors.push(
                        `Item ${itemId}: quantidade inválida (${nextQty} > ${prevQty} possuídos).`
                    );
                }
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, value: { equipment, backpack } };
}
