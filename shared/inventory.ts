import {
    EQUIPMENT_SLOTS,
    getItemStackRules,
    type EquipmentSlot,
    type ItemCatalogDocument,
    type ItemCatalogEntry,
} from '../src/game-data/itemCatalogTypes.js';
import {
    addQuantityToBags,
    cloneBags,
    createEmptyBags,
    firstSequentialFreeSlot,
    iterateUnlockedBagIndices,
} from './inventoryBags.js';

/** Número total de storages de bolsa por personagem. */
export const INVENTORY_BAG_COUNT = 5;

/** Bolsas liberadas por padrão (1, 2, 3). */
export const DEFAULT_UNLOCKED_BAG_SLOTS = 3;

/** Slots por bolsa (grid do painel de inventário). */
export const BACKPACK_SLOT_COUNT = 50;

export interface BackpackSlotRow {
    slotIndex: number;
    itemId: string;
    quantity: number;
}

export type CharacterEquipmentState = Record<EquipmentSlot, string | null>;

export interface CharacterInventoryDocument {
    equipment: CharacterEquipmentState;
    /** 5 bolsas independentes; cada uma com até BACKPACK_SLOT_COUNT células ocupadas. */
    bags: BackpackSlotRow[][];
    /** Quantas bolsas o personagem pode usar (1–5). Padrão 3; 4–5 via compra futura. */
    unlockedBagSlots: number;
}

export interface ValidateInventoryOptions {
    previous?: CharacterInventoryDocument;
    /** Teto autoritativo do servidor — PUT não pode subir unlockedBagSlots acima disto. */
    serverUnlockedBagSlots?: number;
}

export function createEmptyEquipment(): CharacterEquipmentState {
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

export function createEmptyInventory(): CharacterInventoryDocument {
    return {
        equipment: createEmptyEquipment(),
        bags: createEmptyBags(),
        unlockedBagSlots: DEFAULT_UNLOCKED_BAG_SLOTS,
    };
}

function catalogById(catalog: ItemCatalogDocument): Map<string, ItemCatalogEntry> {
    return new Map(catalog.items.map((item) => [item.id, item]));
}

function parseBackpackRows(
    backpackRaw: unknown[],
    bagLabel: string,
    byId: Map<string, ItemCatalogEntry>,
    errors: string[]
): BackpackSlotRow[] {
    const seenSlots = new Set<number>();
    const rows: BackpackSlotRow[] = [];

    for (let i = 0; i < backpackRaw.length; i++) {
        const row = backpackRaw[i];
        if (!row || typeof row !== 'object') {
            errors.push(`${bagLabel}[${i}] inválido.`);
            continue;
        }
        const slotRow = row as Record<string, unknown>;
        const slotIndex = Number(slotRow.slotIndex);
        const itemId = typeof slotRow.itemId === 'string' ? slotRow.itemId.trim() : '';
        const quantity = Number(slotRow.quantity ?? 1);

        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= BACKPACK_SLOT_COUNT) {
            errors.push(
                `${bagLabel}[${i}].slotIndex fora do intervalo 0..${BACKPACK_SLOT_COUNT - 1}.`
            );
            continue;
        }
        if (seenSlots.has(slotIndex)) {
            errors.push(`${bagLabel}: slotIndex ${slotIndex} duplicado.`);
            continue;
        }
        if (!itemId) {
            errors.push(`${bagLabel}[${i}].itemId obrigatório.`);
            continue;
        }
        if (!Number.isInteger(quantity) || quantity < 1) {
            errors.push(`${bagLabel}[${i}].quantity deve ser inteiro >= 1.`);
            continue;
        }
        if (!byId.has(itemId)) {
            errors.push(`Item desconhecido na bolsa: ${itemId}`);
            continue;
        }
        const entry = byId.get(itemId);
        if (entry?.implemented === false) {
            errors.push(`Item ${itemId} não está disponível no jogo.`);
            continue;
        }
        seenSlots.add(slotIndex);
        rows.push({ slotIndex, itemId, quantity });
    }

    rows.sort((a, b) => a.slotIndex - b.slotIndex);
    return rows;
}

/** Migra `backpack` legado → `bags[0]` e garante shape canônico. */
export function normalizeInventoryDocument(raw: unknown): CharacterInventoryDocument {
    const empty = createEmptyInventory();
    if (!raw || typeof raw !== 'object') return empty;

    const body = raw as Record<string, unknown>;
    const equipment =
        body.equipment && typeof body.equipment === 'object'
            ? { ...createEmptyEquipment(), ...(body.equipment as CharacterEquipmentState) }
            : createEmptyEquipment();

    const bags = createEmptyBags();

    if (Array.isArray(body.bags)) {
        for (let i = 0; i < INVENTORY_BAG_COUNT; i++) {
            const bagRaw = body.bags[i];
            if (Array.isArray(bagRaw)) {
                bags[i] = bagRaw
                    .filter((row) => row && typeof row === 'object')
                    .map((row) => {
                        const r = row as Record<string, unknown>;
                        return {
                            slotIndex: Number(r.slotIndex),
                            itemId: String(r.itemId ?? '').trim(),
                            quantity: Math.max(1, Math.floor(Number(r.quantity ?? 1))),
                        };
                    })
                    .filter((row) => row.itemId);
                bags[i].sort((a, b) => a.slotIndex - b.slotIndex);
            }
        }
    } else if (Array.isArray(body.backpack)) {
        bags[0] = body.backpack
            .filter((row) => row && typeof row === 'object')
            .map((row) => {
                const r = row as Record<string, unknown>;
                return {
                    slotIndex: Number(r.slotIndex),
                    itemId: String(r.itemId ?? '').trim(),
                    quantity: Math.max(1, Math.floor(Number(r.quantity ?? 1))),
                };
            })
            .filter((row) => row.itemId);
        bags[0].sort((a, b) => a.slotIndex - b.slotIndex);
    }

    let unlockedBagSlots = Number(body.unlockedBagSlots ?? DEFAULT_UNLOCKED_BAG_SLOTS);
    if (!Number.isInteger(unlockedBagSlots) || unlockedBagSlots < 1 || unlockedBagSlots > INVENTORY_BAG_COUNT) {
        unlockedBagSlots = DEFAULT_UNLOCKED_BAG_SLOTS;
    }

    return { equipment, bags, unlockedBagSlots };
}

export interface SanitizeStackRulesResult {
    inventory: CharacterInventoryDocument;
    /** Unidades descartadas por falta de espaço nas bolsas liberadas. */
    overflow: Map<string, number>;
    warnings: string[];
}

/**
 * Corrige pilhas legadas (ex.: equipamento com quantity > 1) dividindo em slots válidos.
 * Excesso sem espaço é descartado com aviso em console.
 */
export function sanitizeInventoryStackRules(
    inventory: CharacterInventoryDocument,
    catalog: ItemCatalogDocument
): SanitizeStackRulesResult {
    const byId = catalogById(catalog);
    const bags = cloneBags(inventory.bags);
    const overflow = new Map<string, number>();
    const warnings: string[] = [];
    const unlocked = inventory.unlockedBagSlots;

    const addOverflow = (itemId: string, qty: number) => {
        if (qty <= 0) return;
        overflow.set(itemId, (overflow.get(itemId) ?? 0) + qty);
        warnings.push(`${qty}x ${itemId} descartado(s) — sem espaço na bolsa.`);
    };

    for (let bagIndex = 0; bagIndex < unlocked; bagIndex++) {
        const bag = bags[bagIndex] ?? [];
        for (let rowIndex = 0; rowIndex < bag.length; rowIndex++) {
            const row = bag[rowIndex];
            const entry = byId.get(row.itemId);
            if (!entry || entry.implemented === false) continue;

            const rules = getItemStackRules(entry);

            if (!rules.stackable && row.quantity > 1) {
                const extra = row.quantity - 1;
                row.quantity = 1;
                for (let unit = 0; unit < extra; unit++) {
                    const free = firstSequentialFreeSlot(bags, unlocked);
                    if (free === null) {
                        addOverflow(row.itemId, extra - unit);
                        break;
                    }
                    const targetBag = bags[free.bagIndex] ?? [];
                    targetBag.push({
                        slotIndex: free.slotIndex,
                        itemId: row.itemId,
                        quantity: 1,
                    });
                    targetBag.sort((a, b) => a.slotIndex - b.slotIndex);
                    bags[free.bagIndex] = targetBag;
                }
            } else if (rules.stackable && row.quantity > rules.maxStack) {
                const excess = row.quantity - rules.maxStack;
                row.quantity = rules.maxStack;
                const { overflow: remaining } = addQuantityToBags(
                    bags,
                    row.itemId,
                    excess,
                    unlocked,
                    rules
                );
                if (remaining > 0) addOverflow(row.itemId, remaining);
            }
        }
    }

    if (warnings.length > 0) {
        console.warn('[inventory] sanitizeInventoryStackRules:', warnings.join(' '));
    }

    return {
        inventory: { equipment: inventory.equipment, bags, unlockedBagSlots: unlocked },
        overflow,
        warnings,
    };
}

export interface RepairInventoryResult {
    inventory: CharacterInventoryDocument;
    repaired: boolean;
}

/**
 * Corrige estado inválido comum após migração:
 * - itens equipados ainda presentes na bolsa (bloqueia equip/desequip);
 * - bolsas 2–3 espelhando a bolsa 1 (corrupção de dados).
 */
export function repairInventoryState(
    inventory: CharacterInventoryDocument
): RepairInventoryResult {
    const equipment = { ...inventory.equipment };
    const bags = cloneBags(inventory.bags);
    const unlocked = inventory.unlockedBagSlots;
    let repaired = false;

    const equippedCounts = new Map<string, number>();
    for (const slot of EQUIPMENT_SLOTS) {
        const itemId = equipment[slot];
        if (!itemId) continue;
        equippedCounts.set(itemId, (equippedCounts.get(itemId) ?? 0) + 1);
    }

    for (const [itemId, removeCount] of equippedCounts) {
        let remaining = removeCount;
        for (const bagIndex of iterateUnlockedBagIndices(unlocked)) {
            const bag = bags[bagIndex] ?? [];
            for (let rowIndex = bag.length - 1; rowIndex >= 0 && remaining > 0; rowIndex--) {
                const row = bag[rowIndex];
                if (row.itemId !== itemId) continue;
                if (row.quantity <= remaining) {
                    remaining -= row.quantity;
                    bag.splice(rowIndex, 1);
                    repaired = true;
                } else {
                    row.quantity -= remaining;
                    remaining = 0;
                    repaired = true;
                }
            }
        }
    }

    const bagFingerprint = (bag: BackpackSlotRow[]) =>
        JSON.stringify(bag.map((row) => ({ ...row })));
    const bag0Key = bagFingerprint(bags[0] ?? []);
    if (bag0Key !== '[]') {
        for (let bagIndex = 1; bagIndex < unlocked; bagIndex++) {
            if (bagFingerprint(bags[bagIndex] ?? []) === bag0Key) {
                bags[bagIndex] = [];
                repaired = true;
            }
        }
    }

    return {
        inventory: { equipment, bags, unlockedBagSlots: unlocked },
        repaired,
    };
}

/** Normaliza documento bruto, pilhas e repara estado fantasma (migração automática). */
export function normalizeInventoryForStackRules(
    raw: unknown,
    catalog: ItemCatalogDocument
): SanitizeStackRulesResult {
    const sanitized = sanitizeInventoryStackRules(normalizeInventoryDocument(raw), catalog);
    const { inventory, repaired } = repairInventoryState(sanitized.inventory);
    return {
        inventory,
        overflow: sanitized.overflow,
        warnings: repaired
            ? [...sanitized.warnings, 'repairInventoryState aplicado.']
            : sanitized.warnings,
    };
}

function assertValidStackRules(
    bags: BackpackSlotRow[][],
    unlockedBagSlots: number,
    byId: Map<string, ItemCatalogEntry>,
    errors: string[]
): void {
    for (let bagIndex = 0; bagIndex < unlockedBagSlots; bagIndex++) {
        const bagLabel = `bags[${bagIndex}]`;
        for (let i = 0; i < (bags[bagIndex] ?? []).length; i++) {
            const row = bags[bagIndex][i];
            const entry = byId.get(row.itemId);
            if (!entry) continue;
            const rules = getItemStackRules(entry);
            if (!rules.stackable && row.quantity > 1) {
                errors.push(
                    `${bagLabel}[${i}].quantity: ${row.itemId} não empilha (máx 1 por slot).`
                );
            }
            if (row.quantity > rules.maxStack) {
                errors.push(
                    `${bagLabel}[${i}].quantity: ${row.itemId} excede pilha máxima (${rules.maxStack}).`
                );
            }
        }
    }
}

/** Contagem total por itemId (equipamento + todas as bolsas). */
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
    for (const bag of inventory.bags) {
        for (const row of bag) {
            add(row.itemId, row.quantity);
        }
    }
    return counts;
}

export function validateCharacterInventory(
    raw: unknown,
    catalog: ItemCatalogDocument,
    options?: ValidateInventoryOptions
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

    const bags: BackpackSlotRow[][] = createEmptyBags();
    const hasBagsArray = Array.isArray(body.bags);
    const hasLegacyBackpack = Array.isArray(body.backpack);

    if (!hasBagsArray && !hasLegacyBackpack) {
        errors.push('bags deve ser um array de 5 bolsas (ou backpack legado).');
    }

    if (hasBagsArray) {
        const bagsRaw = body.bags as unknown[];
        if (bagsRaw.length !== INVENTORY_BAG_COUNT) {
            errors.push(`bags deve ter exatamente ${INVENTORY_BAG_COUNT} entradas.`);
        }
        for (let bagIndex = 0; bagIndex < INVENTORY_BAG_COUNT; bagIndex++) {
            const bagRaw = bagsRaw[bagIndex];
            if (!Array.isArray(bagRaw)) {
                errors.push(`bags[${bagIndex}] deve ser um array.`);
                continue;
            }
            bags[bagIndex] = parseBackpackRows(bagRaw, `bags[${bagIndex}]`, byId, errors);
        }
    } else if (hasLegacyBackpack) {
        bags[0] = parseBackpackRows(body.backpack as unknown[], 'backpack', byId, errors);
    }

    let unlockedBagSlots = Number(body.unlockedBagSlots ?? DEFAULT_UNLOCKED_BAG_SLOTS);
    if (!Number.isInteger(unlockedBagSlots) || unlockedBagSlots < 1 || unlockedBagSlots > INVENTORY_BAG_COUNT) {
        errors.push(`unlockedBagSlots deve ser inteiro entre 1 e ${INVENTORY_BAG_COUNT}.`);
        unlockedBagSlots = DEFAULT_UNLOCKED_BAG_SLOTS;
    }

    const maxUnlocked =
        options?.serverUnlockedBagSlots ??
        options?.previous?.unlockedBagSlots ??
        unlockedBagSlots;
    if (unlockedBagSlots > maxUnlocked) {
        errors.push(
            `unlockedBagSlots (${unlockedBagSlots}) não pode exceder o limite do personagem (${maxUnlocked}).`
        );
    }

    for (let bagIndex = unlockedBagSlots; bagIndex < INVENTORY_BAG_COUNT; bagIndex++) {
        if (bags[bagIndex].length > 0) {
            errors.push(`bags[${bagIndex}] está bloqueada — remova os itens.`);
        }
    }

    let sanitizedBags = bags;
    let sanitizedEquipment = equipment;
    if (errors.length === 0) {
        const sanitized = sanitizeInventoryStackRules(
            { equipment, bags, unlockedBagSlots },
            catalog
        );
        sanitizedBags = sanitized.inventory.bags;
        sanitizedEquipment = sanitized.inventory.equipment;
        assertValidStackRules(sanitizedBags, unlockedBagSlots, byId, errors);
    }

    if (errors.length === 0) {
        const equippedIds = new Set<string>();
        for (const slot of EQUIPMENT_SLOTS) {
            const itemId = sanitizedEquipment[slot];
            if (!itemId) continue;
            if (equippedIds.has(itemId)) {
                errors.push(`Item ${itemId} equipado em mais de um slot.`);
            }
            equippedIds.add(itemId);
        }

        const backpackItemIds = new Set<string>();
        for (let bagIndex = 0; bagIndex < unlockedBagSlots; bagIndex++) {
            for (const row of sanitizedBags[bagIndex]) {
                backpackItemIds.add(row.itemId);
            }
        }
        for (const itemId of equippedIds) {
            if (backpackItemIds.has(itemId)) {
                errors.push(
                    `Item ${itemId} não pode estar equipado e na bolsa ao mesmo tempo.`
                );
            }
        }

        if (options?.previous) {
            const prevCounts = countInventoryItems(options.previous);
            const nextCounts = countInventoryItems({
                equipment: sanitizedEquipment,
                bags: sanitizedBags,
                unlockedBagSlots,
            });
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

    const clampedUnlocked = Math.min(unlockedBagSlots, maxUnlocked);
    return {
        ok: true,
        value: {
            equipment: sanitizedEquipment,
            bags: sanitizedBags,
            unlockedBagSlots: clampedUnlocked,
        },
    };
}
