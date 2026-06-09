import { fetchCharacterLearnedSpells } from './characterSpellsApi';
import { computeEligibleSpellIds } from '../../shared/characterSpells';
import { getSpellCatalogEntries } from '../game-data/spellCatalog';
import type { SpellCatalogDocument } from '../game-data/spellCatalogTypes';

let learnedSpellIds: string[] = [];
let fallbackVocation: string | undefined;
let fallbackLevel = 1;

export function initPlayLearnedSpells(vocation?: string, level = 1): void {
    learnedSpellIds = [];
    fallbackVocation = vocation;
    fallbackLevel = level;
}

export async function loadPlayLearnedSpellsFromServer(
    characterId: string,
    vocation?: string,
    level = 1
): Promise<void> {
    fallbackVocation = vocation;
    fallbackLevel = level;
    try {
        learnedSpellIds = await fetchCharacterLearnedSpells(characterId);
    } catch (err) {
        console.warn('[playLearnedSpells] fallback local por falha no servidor:', err);
        applyLocalEligibleFallback(vocation, level);
    }
}

export function refreshPlayLearnedSpellsFallback(level: number, vocation?: string): void {
    fallbackLevel = level;
    if (vocation) fallbackVocation = vocation;
    if (learnedSpellIds.length === 0) {
        applyLocalEligibleFallback(vocation, level);
    }
}

function applyLocalEligibleFallback(vocation?: string, level = 1): void {
    const catalog: SpellCatalogDocument = { spells: [...getSpellCatalogEntries()] };
    learnedSpellIds = computeEligibleSpellIds(catalog, vocation || 'knight', level);
}

export function getPlayLearnedSpellIds(): readonly string[] {
    return learnedSpellIds;
}

export function isPlaySpellLearned(spellId: string): boolean {
    if (learnedSpellIds.length === 0) {
        applyLocalEligibleFallback(fallbackVocation, fallbackLevel);
    }
    return learnedSpellIds.includes(spellId);
}
