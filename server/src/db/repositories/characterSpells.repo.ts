import type { SpellCatalogDocument } from '../../../../src/game-data/spellCatalogTypes.js';
import { computeEligibleSpellIds } from '../../../../shared/characterSpells.js';
import { getPool } from '../pool.js';
import { getCharacterForAccount } from './characters.repo.js';

interface LearnedSpellDbRow {
    spell_id: string;
}

export async function getCharacterLearnedSpellIds(
    characterId: string,
    accountId: string
): Promise<string[] | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;

    const pool = getPool();
    const { rows } = await pool.query<LearnedSpellDbRow>(
        `select spell_id from character_spells
         where character_id = $1 order by spell_id`,
        [characterId]
    );
    return rows.map((row) => row.spell_id);
}

export async function addCharacterLearnedSpells(
    characterId: string,
    accountId: string,
    spellIds: string[]
): Promise<string[] | null> {
    const character = await getCharacterForAccount(characterId, accountId);
    if (!character) return null;
    if (spellIds.length === 0) {
        return getCharacterLearnedSpellIds(characterId, accountId);
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('begin');
        for (const spellId of spellIds) {
            await client.query(
                `insert into character_spells (character_id, spell_id)
                 values ($1, $2)
                 on conflict (character_id, spell_id) do nothing`,
                [characterId, spellId]
            );
        }
        await client.query('commit');
    } catch (err) {
        await client.query('rollback');
        throw err;
    } finally {
        client.release();
    }

    return getCharacterLearnedSpellIds(characterId, accountId);
}

/** Garante linhas para magias elegíveis pelo level/vocação atuais. */
export async function syncEligibleLearnedSpells(
    characterId: string,
    accountId: string,
    vocationId: string,
    level: number,
    catalog: SpellCatalogDocument
): Promise<string[] | null> {
    const existing = (await getCharacterLearnedSpellIds(characterId, accountId)) ?? [];
    const eligible = computeEligibleSpellIds(catalog, vocationId, level);
    const missing = eligible.filter((id) => !existing.includes(id));
    if (missing.length === 0) return existing;
    return addCharacterLearnedSpells(characterId, accountId, missing);
}
