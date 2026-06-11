import type { SpellCatalogDocument, SpellDefinition } from '../src/game-data/spellCatalogTypes.js';

export function spellAppliesToVocation(spell: SpellDefinition, vocationId: string): boolean {
    if (spell.vocations.length === 0) return true;
    return spell.vocations.includes(vocationId.toLowerCase());
}

/** Critério de desbloqueio automático (level + vocação) até existir trainer/NPC. */
export function isSpellEligibleForCharacter(
    spell: SpellDefinition,
    vocationId: string,
    level: number
): boolean {
    if (!spell.implemented) return false;
    if (level < spell.minLevel) return false;
    return spellAppliesToVocation(spell, vocationId);
}

export function computeEligibleSpellIds(
    catalog: SpellCatalogDocument,
    vocationId: string,
    level: number
): string[] {
    const out: string[] = [];
    for (const spell of catalog.spells) {
        if (isSpellEligibleForCharacter(spell, vocationId, level)) {
            out.push(spell.id);
        }
    }
    return out;
}

export function isSpellLearned(spellId: string, learnedSpellIds: readonly string[]): boolean {
    return learnedSpellIds.includes(spellId);
}

export function parseLearnedSpellIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const entry of raw) {
        if (typeof entry !== 'string') continue;
        const id = entry.trim().slice(0, 64);
        if (id.length > 0 && !out.includes(id)) out.push(id);
    }
    return out;
}
