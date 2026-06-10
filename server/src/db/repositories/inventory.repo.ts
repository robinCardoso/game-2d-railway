import type {
    BackpackSlotRow,
    CharacterEquipmentState,
    CharacterInventoryDocument,
} from '../../../../shared/inventory.js';
import {
    createEmptyBags,
    createEmptyEquipment,
    createEmptyInventory,
    DEFAULT_UNLOCKED_BAG_SLOTS,
    INVENTORY_BAG_COUNT,
} from '../../../../shared/inventory.js';
import { EQUIPMENT_SLOTS, type EquipmentSlot } from '../../../../src/game-data/itemCatalogTypes.js';
import { getPool } from '../pool.js';
import { getCharacterForAccount } from './characters.repo.js';

interface EquipmentDbRow {
    slot: EquipmentSlot;
    item_id: string;
}

interface BackpackDbRow {
    bag_index: number;
    slot_index: number;
    item_id: string;
    quantity: number;
}

interface UnlockedBagRow {
    unlocked_bag_slots: number;
}

export async function getCharacterUnlockedBagSlots(
    characterId: string,
    accountId: string
): Promise<number | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const { rows } = await pool.query<UnlockedBagRow>(
        `select unlocked_bag_slots from characters where id = $1`,
        [characterId]
    );
    const value = rows[0]?.unlocked_bag_slots;
    if (typeof value === 'number' && value >= 1 && value <= INVENTORY_BAG_COUNT) {
        return value;
    }
    return DEFAULT_UNLOCKED_BAG_SLOTS;
}

export async function getCharacterInventory(
    characterId: string,
    accountId: string
): Promise<CharacterInventoryDocument | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const [equipRes, backpackRes, unlockedRes] = await Promise.all([
        pool.query<EquipmentDbRow>(
            `select slot, item_id from character_equipment where character_id = $1`,
            [characterId]
        ),
        pool.query<BackpackDbRow>(
            `select bag_index, slot_index, item_id, quantity from character_backpack_slots
             where character_id = $1 order by bag_index, slot_index`,
            [characterId]
        ),
        pool.query<UnlockedBagRow>(
            `select unlocked_bag_slots from characters where id = $1`,
            [characterId]
        ),
    ]);

    const equipment = createEmptyEquipment();
    for (const row of equipRes.rows) {
        if (EQUIPMENT_SLOTS.includes(row.slot)) {
            equipment[row.slot] = row.item_id;
        }
    }

    const bags = createEmptyBags();
    for (const row of backpackRes.rows) {
        const bagIndex = row.bag_index;
        if (bagIndex < 0 || bagIndex >= INVENTORY_BAG_COUNT) continue;
        bags[bagIndex].push({
            slotIndex: row.slot_index,
            itemId: row.item_id,
            quantity: row.quantity,
        });
    }

    let unlockedBagSlots = unlockedRes.rows[0]?.unlocked_bag_slots ?? DEFAULT_UNLOCKED_BAG_SLOTS;
    if (!Number.isInteger(unlockedBagSlots) || unlockedBagSlots < 1 || unlockedBagSlots > INVENTORY_BAG_COUNT) {
        unlockedBagSlots = DEFAULT_UNLOCKED_BAG_SLOTS;
    }

    return { equipment, bags, unlockedBagSlots };
}

export async function replaceCharacterInventory(
    characterId: string,
    accountId: string,
    inventory: CharacterInventoryDocument
): Promise<CharacterInventoryDocument | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('begin');

        const { rows: unlockedRows } = await client.query<UnlockedBagRow>(
            `select unlocked_bag_slots from characters where id = $1 for update`,
            [characterId]
        );
        let serverUnlocked =
            unlockedRows[0]?.unlocked_bag_slots ?? DEFAULT_UNLOCKED_BAG_SLOTS;
        if (!Number.isInteger(serverUnlocked) || serverUnlocked < 1 || serverUnlocked > INVENTORY_BAG_COUNT) {
            serverUnlocked = DEFAULT_UNLOCKED_BAG_SLOTS;
        }

        const persisted: CharacterInventoryDocument = {
            equipment: inventory.equipment,
            bags: inventory.bags.map((bag) => bag.map((row) => ({ ...row }))),
            unlockedBagSlots: serverUnlocked,
        };

        await client.query(`delete from character_equipment where character_id = $1`, [characterId]);
        await client.query(`delete from character_backpack_slots where character_id = $1`, [characterId]);

        for (const slot of EQUIPMENT_SLOTS) {
            const itemId = persisted.equipment[slot];
            if (!itemId) continue;
            await client.query(
                `insert into character_equipment (character_id, slot, item_id)
                 values ($1, $2, $3)`,
                [characterId, slot, itemId]
            );
        }

        for (let bagIndex = 0; bagIndex < serverUnlocked; bagIndex++) {
            for (const row of persisted.bags[bagIndex] ?? []) {
                await client.query(
                    `insert into character_backpack_slots (character_id, bag_index, slot_index, item_id, quantity)
                     values ($1, $2, $3, $4, $5)`,
                    [characterId, bagIndex, row.slotIndex, row.itemId, row.quantity]
                );
            }
        }

        await client.query('commit');
        return persisted;
    } catch (err) {
        await client.query('rollback');
        throw err;
    } finally {
        client.release();
    }
}

/** Inventário vazio quando personagem existe mas ainda sem linhas nas tabelas. */
export async function getCharacterInventoryOrEmpty(
    characterId: string,
    accountId: string
): Promise<CharacterInventoryDocument | null> {
    return (await getCharacterInventory(characterId, accountId)) ?? null;
}

export function emptyInventoryDocument(): CharacterInventoryDocument {
    return createEmptyInventory();
}
