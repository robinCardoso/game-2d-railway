import type { SpellBarState } from '../../../../shared/spellBar.js';
import { getPool } from '../pool.js';
import { getCharacterForAccount } from './characters.repo.js';

interface SpellSlotDbRow {
    slot_index: number;
    spell_id: string;
}

function rowToBar(rows: SpellSlotDbRow[]): SpellBarState {
    const bar: SpellBarState = {};
    for (const row of rows) {
        if (row.slot_index === 0) bar.slot1 = row.spell_id;
        else if (row.slot_index === 1) bar.slot2 = row.spell_id;
        else if (row.slot_index === 2) bar.slot3 = row.spell_id;
    }
    return bar;
}

export async function getCharacterSpellSlots(
    characterId: string,
    accountId: string
): Promise<SpellBarState | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const { rows } = await pool.query<SpellSlotDbRow>(
        `select slot_index, spell_id from character_spell_slots
         where character_id = $1 order by slot_index`,
        [characterId]
    );
    return rowToBar(rows);
}

export async function replaceCharacterSpellSlots(
    characterId: string,
    accountId: string,
    bar: SpellBarState
): Promise<SpellBarState | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query(`delete from character_spell_slots where character_id = $1`, [characterId]);

        const entries: Array<[number, string]> = [];
        if (bar.slot1) entries.push([0, bar.slot1]);
        if (bar.slot2) entries.push([1, bar.slot2]);
        if (bar.slot3) entries.push([2, bar.slot3]);

        for (const [slotIndex, spellId] of entries) {
            await client.query(
                `insert into character_spell_slots (character_id, slot_index, spell_id)
                 values ($1, $2, $3)`,
                [characterId, slotIndex, spellId]
            );
        }

        await client.query('commit');
        return bar;
    } catch (err) {
        await client.query('rollback');
        throw err;
    } finally {
        client.release();
    }
}

export async function getCharacterSpellSlotsOrEmpty(
    characterId: string,
    accountId: string
): Promise<SpellBarState | null> {
    return getCharacterSpellSlots(characterId, accountId);
}
