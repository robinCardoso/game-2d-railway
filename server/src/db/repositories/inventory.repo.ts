import type {
    BackpackSlotRow,
    CharacterEquipmentState,
    CharacterInventoryDocument,
} from '../../../../shared/inventory.js';
import { createEmptyEquipment, createEmptyInventory } from '../../../../shared/inventory.js';
import { EQUIPMENT_SLOTS, type EquipmentSlot } from '../../../../src/game-data/itemCatalogTypes.js';
import { getPool } from '../pool.js';
import { getCharacterForAccount } from './characters.repo.js';

interface EquipmentDbRow {
    slot: EquipmentSlot;
    item_id: string;
}

interface BackpackDbRow {
    slot_index: number;
    item_id: string;
    quantity: number;
}

export async function getCharacterInventory(
    characterId: string,
    accountId: string
): Promise<CharacterInventoryDocument | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const [equipRes, backpackRes] = await Promise.all([
        pool.query<EquipmentDbRow>(
            `select slot, item_id from character_equipment where character_id = $1`,
            [characterId]
        ),
        pool.query<BackpackDbRow>(
            `select slot_index, item_id, quantity from character_backpack_slots
             where character_id = $1 order by slot_index`,
            [characterId]
        ),
    ]);

    const equipment = createEmptyEquipment();
    for (const row of equipRes.rows) {
        if (EQUIPMENT_SLOTS.includes(row.slot)) {
            equipment[row.slot] = row.item_id;
        }
    }

    const backpack: BackpackSlotRow[] = backpackRes.rows.map((row) => ({
        slotIndex: row.slot_index,
        itemId: row.item_id,
        quantity: row.quantity,
    }));

    return { equipment, backpack };
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

        await client.query(`delete from character_equipment where character_id = $1`, [characterId]);
        await client.query(`delete from character_backpack_slots where character_id = $1`, [characterId]);

        for (const slot of EQUIPMENT_SLOTS) {
            const itemId = inventory.equipment[slot];
            if (!itemId) continue;
            await client.query(
                `insert into character_equipment (character_id, slot, item_id)
                 values ($1, $2, $3)`,
                [characterId, slot, itemId]
            );
        }

        for (const row of inventory.backpack) {
            await client.query(
                `insert into character_backpack_slots (character_id, slot_index, item_id, quantity)
                 values ($1, $2, $3, $4)`,
                [characterId, row.slotIndex, row.itemId, row.quantity]
            );
        }

        await client.query('commit');
        return inventory;
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
