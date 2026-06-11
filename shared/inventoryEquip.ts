import {
    getItemStackRules,
    type EquipmentSlot,
    type ItemCatalogDocument,
    type ItemCatalogEntry,
} from '../src/game-data/itemCatalogTypes.js';
import {
    type CharacterInventoryDocument,
} from './inventory.js';
import {
    addToSequentialBags,
    cloneBags,
    findSlotRowInBag,
    firstSequentialFreeSlot,
} from './inventoryBags.js';

export type InventoryEquipErrorCode =
    | 'UNKNOWN_ITEM'
    | 'NOT_EQUIPABLE'
    | 'NOT_IMPLEMENTED'
    | 'BACKPACK_SLOT_EMPTY'
    | 'BACKPACK_SLOT_INVALID'
    | 'BAG_LOCKED'
    | 'EQUIPMENT_SLOT_EMPTY'
    | 'BACKPACK_FULL';

export interface InventoryEquipResult {
    ok: true;
    inventory: CharacterInventoryDocument;
}

export interface InventoryEquipError {
    ok: false;
    code: InventoryEquipErrorCode;
    message: string;
}

export type InventoryEquipOutcome = InventoryEquipResult | InventoryEquipError;

function cloneInventory(inv: CharacterInventoryDocument): CharacterInventoryDocument {
    return {
        equipment: { ...inv.equipment },
        bags: cloneBags(inv.bags),
        unlockedBagSlots: inv.unlockedBagSlots,
    };
}

function catalogEntry(
    catalog: ItemCatalogDocument,
    itemId: string
): ItemCatalogEntry | undefined {
    return catalog.items.find((i) => i.id === itemId.trim());
}

export function canEquipItem(
    itemId: string,
    catalog: ItemCatalogDocument
): { ok: true; slot: EquipmentSlot } | InventoryEquipError {
    const entry = catalogEntry(catalog, itemId);
    if (!entry) {
        return { ok: false, code: 'UNKNOWN_ITEM', message: 'Item desconhecido.' };
    }
    if (entry.category !== 'equipment' || !entry.slot) {
        return { ok: false, code: 'NOT_EQUIPABLE', message: 'Este item não pode ser equipado.' };
    }
    if (entry.implemented === false) {
        return { ok: false, code: 'NOT_IMPLEMENTED', message: 'Item ainda não disponível no jogo.' };
    }
    return { ok: true, slot: entry.slot };
}

export function describeItemStats(entry: ItemCatalogEntry): string[] {
    const parts: string[] = [];
    if (entry.attackBonus) parts.push(`Ataque +${entry.attackBonus}`);
    if (entry.defenseBonus) parts.push(`Defesa +${entry.defenseBonus}`);
    if (entry.speedBonus) parts.push(`Velocidade +${entry.speedBonus}`);
    return parts;
}

/** Equipa 1 unidade de um stack de uma bolsa liberada. Item anterior no slot volta à bolsa (sequencial). */
export function equipFromBackpack(
    inventory: CharacterInventoryDocument,
    bagIndex: number,
    backpackSlotIndex: number,
    catalog: ItemCatalogDocument
): InventoryEquipOutcome {
    if (bagIndex < 0 || bagIndex >= inventory.unlockedBagSlots) {
        return {
            ok: false,
            code: 'BAG_LOCKED',
            message: 'Esta bolsa ainda não está desbloqueada.',
        };
    }

    const bag = inventory.bags[bagIndex] ?? [];
    const rowIndex = findSlotRowInBag(bag, backpackSlotIndex);
    if (rowIndex < 0) {
        return {
            ok: false,
            code: 'BACKPACK_SLOT_EMPTY',
            message: 'Slot da mochila vazio.',
        };
    }

    const row = bag[rowIndex];
    const check = canEquipItem(row.itemId, catalog);
    if (!check.ok) return check;

    const next = cloneInventory(inventory);
    const targetSlot = check.slot;
    const displaced = next.equipment[targetSlot];
    const equippingSameItem = displaced === row.itemId;

    if (displaced && !equippingSameItem) {
        const displacedEntry = catalogEntry(catalog, displaced);
        if (!displacedEntry) {
            return { ok: false, code: 'UNKNOWN_ITEM', message: 'Item desconhecido.' };
        }
        const displacedRules = getItemStackRules(displacedEntry);
        const displacedAdd = addToSequentialBags(
            next.bags,
            displaced,
            1,
            next.unlockedBagSlots,
            displacedRules
        );
        if (!displacedAdd) {
            return {
                ok: false,
                code: 'BACKPACK_FULL',
                message: 'Mochila cheia — não foi possível guardar o item equipado.',
            };
        }
    }

    next.equipment[targetSlot] = row.itemId;

    const nextBag = next.bags[bagIndex];
    if (row.quantity <= 1) {
        nextBag.splice(rowIndex, 1);
    } else {
        nextBag[rowIndex] = { ...row, quantity: row.quantity - 1 };
    }

    return { ok: true, inventory: next };
}

/** Desequipa item para o primeiro slot livre nas bolsas liberadas (ordem 1→N). */
export function unequipToBackpack(
    inventory: CharacterInventoryDocument,
    slot: EquipmentSlot,
    catalog: ItemCatalogDocument
): InventoryEquipOutcome {
    const itemId = inventory.equipment[slot];
    if (!itemId) {
        return {
            ok: false,
            code: 'EQUIPMENT_SLOT_EMPTY',
            message: 'Nenhum item neste slot.',
        };
    }

    const entry = catalogEntry(catalog, itemId);
    if (!entry) {
        return { ok: false, code: 'UNKNOWN_ITEM', message: 'Item desconhecido.' };
    }

    const next = cloneInventory(inventory);
    if (!firstSequentialFreeSlot(next.bags, next.unlockedBagSlots)) {
        return {
            ok: false,
            code: 'BACKPACK_FULL',
            message: 'Mochila cheia — não foi possível desequipar.',
        };
    }
    const rules = getItemStackRules(entry);
    if (!addToSequentialBags(next.bags, itemId, 1, next.unlockedBagSlots, rules)) {
        return {
            ok: false,
            code: 'BACKPACK_FULL',
            message: 'Mochila cheia — não foi possível desequipar.',
        };
    }

    next.equipment[slot] = null;
    return { ok: true, inventory: next };
}
